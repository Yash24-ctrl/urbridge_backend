import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { fileURLToPath } from 'url';
import User from '../models/User.js';
import { isValidEmail, normalizeEmailValue } from '../utils/emailValidation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readEnvValue(filePath, key) {
  try {
    const envFile = fs.readFileSync(filePath, 'utf8');
    const match = envFile.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)\\s*$`, 'm'));
    return match ? String(match[1]).trim().replace(/^['"]|['"]$/g, '') : '';
  } catch {
    return '';
  }
}

function readFrontendGoogleClientId() {
  const possibleEnvFiles = [
    path.resolve(__dirname, '../../resume-analyzer-frontend/.env'),
    path.resolve(__dirname, '../resume-analyzer-frontend/.env'),
    path.resolve(__dirname, '../../.env'),
  ];

  for (const envFilePath of possibleEnvFiles) {
    const clientId = readEnvValue(envFilePath, 'VITE_GOOGLE_CLIENT_ID');
    if (clientId) return clientId;
  }

  return '';
}

function getGoogleClientIds() {
  const clientIds = [
    process.env.GOOGLE_CLIENT_ID,
    process.env.VITE_GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_IDS,
    readFrontendGoogleClientId(),
  ]
    .flatMap((value) => String(value || '').split(','))
    .map((value) => value.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);

  return [...new Set(clientIds)];
}

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

const generateGoogleToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

async function verifyGoogleCredential(credential) {
  const googleClientIds = getGoogleClientIds();

  if (googleClientIds.length === 0) {
    throw new Error('Google authentication is not configured');
  }

  console.log('[Google Auth] Verifying token against client IDs:', googleClientIds.map(id => id.substring(0, 12) + '...'));

  // Try each client ID as the OAuth2Client constructor arg
  // The token's audience must match one of the configured client IDs
  let lastError = null;
  for (const clientId of googleClientIds) {
    try {
      const googleClient = new OAuth2Client(clientId);
      const ticket = await Promise.race([
        googleClient.verifyIdToken({
          idToken: credential,
          audience: googleClientIds,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Google authentication timed out')), 8000)
        ),
      ]);
      console.log('[Google Auth] Token verified successfully with client ID:', clientId.substring(0, 12) + '...');
      return ticket;
    } catch (err) {
      lastError = err;
      console.log('[Google Auth] Verification failed with client ID:', clientId.substring(0, 12) + '...', '- Error:', err.message);
    }
  }

  throw lastError || new Error('Google token verification failed for all client IDs');
}

function getFrontendUrl(req) {
  const host = req?.get?.('host') || '';
  const isLocalHost = /^localhost(:|$)|^127\.0\.0\.1(:|$)/.test(host);

  if (isLocalHost) {
    return 'http://localhost:5173';
  }

  const configuredUrl = String(process.env.FRONTEND_URL || process.env.CLIENT_URL || '').trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, '');
  }

  return `https://${host}`;
}

function getRequestOrigin(req) {
  const host = req.get('host');
  const isLocalHost = /^localhost(:|$)|^127\.0\.0\.1(:|$)/.test(host || '');
  const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProtocol || (isLocalHost ? req.protocol || 'http' : 'https');

  return `${protocol}://${host}`;
}

function getLinkedInCallbackUrl(req) {
  const configuredCallbackUrl = String(process.env.LINKEDIN_CALLBACK_URL || '').trim();
  const host = req.get('host') || '';
  const isLiveRequest = host && !/^localhost(:|$)|^127\.0\.0\.1(:|$)/.test(host);

  if (configuredCallbackUrl && !isLiveRequest) {
    return configuredCallbackUrl;
  }

  return `${getRequestOrigin(req)}/api/user/linkedin/callback`;
}

function getLinkedInMissingConfig() {
  return ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'].filter(
    (key) => !String(process.env[key] || '').trim()
  );
}

function redirectLinkedInError(req, res, message = 'LinkedIn authentication failed') {
  const redirectUrl = new URL('/login', getFrontendUrl(req));
  redirectUrl.searchParams.set('error', message);
  return res.redirect(redirectUrl.toString());
}

function getLinkedInProfileValue(profile, keys) {
  for (const key of keys) {
    const value = key.split('.').reduce((source, part) => source?.[part], profile);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;

    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(
      normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
      '='
    );

    return JSON.parse(Buffer.from(paddedPayload, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function extractLinkedInProfile(profile) {
  const firstName = getLinkedInProfileValue(profile, [
    'name.givenName',
    '_json.given_name',
    '_json.localizedFirstName',
  ]);
  const lastName = getLinkedInProfileValue(profile, [
    'name.familyName',
    '_json.family_name',
    '_json.localizedLastName',
  ]);
  const email =
    profile?.emails?.[0]?.value ||
    getLinkedInProfileValue(profile, ['email', '_json.email', '_json.emailAddress']);
  const linkedinId = profile?.id || getLinkedInProfileValue(profile, ['_json.sub', '_json.id']);
  const avatar =
    profile?.photos?.[0]?.value ||
    getLinkedInProfileValue(profile, ['_json.picture', '_json.profilePicture.displayImage']);
  const username =
    [firstName, lastName].filter(Boolean).join(' ') ||
    getLinkedInProfileValue(profile, ['displayName', '_json.name']) ||
    normalizeEmailValue(email).split('@')[0];

  return {
    linkedinId,
    email: normalizeEmailValue(email),
    username,
    avatar,
  };
}

function extractLinkedInOpenIdProfile(userInfo = {}, idTokenPayload = {}) {
  const email = normalizeEmailValue(userInfo.email || idTokenPayload.email);
  const firstName = userInfo.given_name || idTokenPayload.given_name || '';
  const lastName = userInfo.family_name || idTokenPayload.family_name || '';
  const username =
    userInfo.name ||
    idTokenPayload.name ||
    [firstName, lastName].filter(Boolean).join(' ') ||
    email.split('@')[0];

  return {
    linkedinId: userInfo.sub || idTokenPayload.sub,
    email,
    username,
    avatar: userInfo.picture || idTokenPayload.picture || null,
  };
}

async function exchangeLinkedInCode(req, code) {
  const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getLinkedInCallbackUrl(req),
      client_id: process.env.LINKEDIN_CLIENT_ID,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET,
    }),
  });

  const tokenResponse = await response.json();

  if (!response.ok || !tokenResponse.access_token) {
    throw new Error(tokenResponse.error_description || tokenResponse.error || 'LinkedIn token exchange failed');
  }

  return tokenResponse;
}

async function fetchLinkedInUserInfo(accessToken) {
  const response = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const userInfo = await response.json();

  if (!response.ok) {
    throw new Error(userInfo.message || userInfo.error_description || userInfo.error || 'LinkedIn userinfo failed');
  }

  return userInfo;
}

async function findOrCreateLinkedInUser(linkedInUser) {
  if (!linkedInUser.email || !isValidEmail(linkedInUser.email)) {
    throw new Error('LinkedIn email was not provided');
  }

  let user = await User.findOne({ email: linkedInUser.email });

  if (user) {
    if (!user.linkedinId && linkedInUser.linkedinId) {
      user.linkedinId = linkedInUser.linkedinId;
    }
    if (!user.avatar && linkedInUser.avatar) {
      user.avatar = linkedInUser.avatar;
    }
    await user.save();
    return user;
  }

  return User.create({
    username: linkedInUser.username,
    email: linkedInUser.email,
    linkedinId: linkedInUser.linkedinId,
    avatar: linkedInUser.avatar,
  });
}

// @desc    Register new user
// @route   POST /api/user/register
// @access  Public
export const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const normalizedEmail = normalizeEmailValue(email);

    if (!username || !normalizedEmail || !password) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    // Check if user exists
    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(409).json({ message: 'User already exists with this email' });
    }

    // Create user
    const user = await User.create({
      username: username.trim(),
      email: normalizedEmail,
      password,
    });

    if (user) {
      res.status(201).json({
        message: 'Registration successful',
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          token: generateToken(user._id),
        },
      });
    }
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// @desc    Login user
// @route   POST /api/user/login
// @access  Public
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmailValue(email);

    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    // Find user by email (include password for comparison)
    const user = await User.findOne({ email: normalizedEmail }).select('+password');

    if (!user) {
      return res.status(404).json({ message: 'You are not registered. Please register first.' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    res.status(200).json({
      message: 'Login successful',
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        token: generateToken(user._id),
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// @desc    Google Login
// @route   POST /api/user/google-login
// @access  Public
export const googleLogin = async (req, res) => {
  try {
    console.log('[Google Login] ========== Google login attempt received ==========');
    const { credential } = req.body;

    console.log('[Google Login] Credential token received:', credential ? 'YES (length: ' + credential.length + ')' : 'NO');

    if (!credential) {
      return res.status(400).json({ message: 'Google credential is required' });
    }

    const clientIds = getGoogleClientIds();
    console.log('[Google Login] GOOGLE_CLIENT_ID being used:', clientIds.map(id => id.substring(0, 20) + '...').join(', '));

    if (clientIds.length === 0) {
      console.error('[Google Login] No Google client IDs configured');
      return res.status(500).json({ message: 'Google authentication is not configured' });
    }

    // Verify Google token
    const ticket = await verifyGoogleCredential(credential);
    console.log('[Google Login] Verification result: SUCCESS');

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;
    const normalizedEmail = normalizeEmailValue(email);
    console.log('[Google Login] Google profile email:', email, '| name:', name);

    // Check if user exists in database
    let user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      // Auto-create user from Google profile
      console.log('[Google Login] User not found, creating new user for:', normalizedEmail);
      user = await User.create({
        username: name,
        email: normalizedEmail,
        googleId,
        avatar: picture,
      });
      console.log('[Google Login] User created:', user.email);
    } else {
      console.log('[Google Login] User found:', user.email);
      if (!user.googleId) {
        user.googleId = googleId;
        if (picture && !user.avatar) user.avatar = picture;
        await user.save();
      }
    }

    console.log('[Google Login] Login successful for:', user.email);
    res.status(200).json({
      message: 'Google login successful',
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        token: generateToken(user._id),
      },
    });
  } catch (error) {
    console.error('[Google Login] Verification result: ERROR');
    console.error('[Google Login] Error name:', error.name);
    console.error('[Google Login] Error message:', error.message);
    console.error('[Google Login] Full error:', error);
    res.status(401).json({
      message: 'Google authentication failed',
      detail: error.message || 'Unknown error',
    });
  }
};

// @desc    Google Register (stores user in database)
// @route   POST /api/user/google-register
// @access  Public
export const googleRegister = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ message: 'Google credential is required' });
    }

    if (getGoogleClientIds().length === 0) {
      return res.status(500).json({ message: 'Google authentication is not configured' });
    }

    // Verify Google token
    const ticket = await verifyGoogleCredential(credential);

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;
    const normalizedEmail = normalizeEmailValue(email);

    // Check if user already exists
    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(409).json({ message: 'User already exists with this email' });
    }

    // Create new user with Google data
    const user = await User.create({
      username: name,
      email: normalizedEmail,
      googleId,
      avatar: picture,
    });

    res.status(201).json({
      message: 'Google registration successful',
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        token: generateToken(user._id),
      },
    });
  } catch (error) {
    console.error('Google register error:', error);
    res.status(401).json({ message: 'Google authentication failed' });
  }
};

// @desc    LinkedIn Login/Register redirect
// @route   GET /api/auth/linkedin
// @access  Public
export const linkedinAuth = (req, res, next) => {
  const missingConfig = getLinkedInMissingConfig();

  if (missingConfig.length) {
    return res.status(500).json({
      message: `LinkedIn authentication is not configured. Missing: ${missingConfig.join(', ')}`,
    });
  }

  const authorizationUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('client_id', process.env.LINKEDIN_CLIENT_ID);
  authorizationUrl.searchParams.set('redirect_uri', getLinkedInCallbackUrl(req));
  authorizationUrl.searchParams.set('scope', 'openid profile email');
  authorizationUrl.searchParams.set('state', crypto.randomBytes(16).toString('hex'));

  return res.redirect(authorizationUrl.toString());
};

// @desc    LinkedIn OAuth callback
// @route   GET /api/auth/linkedin/callback
// @access  Public
export const linkedinCallback = (req, res, next) => {
  return (async () => {
    try {
      if (req.query.error) {
        throw new Error(String(req.query.error_description || req.query.error));
      }

      const code = typeof req.query.code === 'string' ? req.query.code : '';
      if (!code) {
        throw new Error('LinkedIn authorization code is missing');
      }

      const tokenResponse = await exchangeLinkedInCode(req, code);
      const userInfo = await fetchLinkedInUserInfo(tokenResponse.access_token);
      const idTokenPayload = tokenResponse.id_token ? decodeJwtPayload(tokenResponse.id_token) : {};
      const linkedInUser = extractLinkedInOpenIdProfile(userInfo, idTokenPayload);
      const user = await findOrCreateLinkedInUser(linkedInUser);
      const token = generateToken(user._id);

      const redirectUrl = new URL('/auth/callback', getFrontendUrl(req));
      redirectUrl.searchParams.set('token', token);
      return res.redirect(redirectUrl.toString());
    } catch (callbackError) {
      console.error('LinkedIn callback error:', callbackError);
      return redirectLinkedInError(req, res, callbackError.message);
    }
  })();
};

// @desc    Get current user
// @route   GET /api/user/me
// @access  Private
export const getMe = async (req, res) => {
  try {
    if (req.user?.isGoogleUser) {
      return res.status(200).json({ user: req.user });
    }

    const user = await User.findById(req.user._id).select('-password');
    res.status(200).json({ user });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

