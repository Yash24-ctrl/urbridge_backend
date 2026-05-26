import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const resolveUserFromToken = async (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  if (decoded.isGoogleUser) {
    return {
      _id: decoded.id,
      username: decoded.name,
      email: decoded.email,
      avatar: decoded.picture,
      isGoogleUser: true,
    };
  }

  return User.findById(decoded.id).select('-password');
};

function getBearerToken(req) {
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    return req.headers.authorization.split(' ')[1];
  }

  return null;
}

export const protect = async (req, res, next) => {
  const token = getBearerToken(req);

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    req.user = await resolveUserFromToken(token);

    if (!req.user) {
      return res.status(401).json({ message: 'User not found' });
    }

    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

export const optionalProtect = async (req, res, next) => {
  const token = getBearerToken(req);

  if (!token) {
    return next();
  }

  try {
    req.user = await resolveUserFromToken(token);
  } catch (error) {
    console.error('Optional auth middleware error:', error.message);
  }

  next();
};

export const authMiddleware = protect;

