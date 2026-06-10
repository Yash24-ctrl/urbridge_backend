import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ✅ Load .env FIRST before anything else
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import express from 'express';
import cors from 'cors';
import passport from 'passport';
import { Strategy as LinkedInStrategy } from 'passport-linkedin-oauth2';

import connectDB from './config/db.js';
import { verifyEmailConfig } from './utils/emailService.js';
import authRoutes from './routes/authRoutes.js';
import resumeRoutes from './routes/resumeRoutes.js';
import counselingRoutes from './routes/counselingRoutes.js';
import {
  createCounselingBooking,
  getAvailableSlots,
  getUserBookingHistory,
} from './controllers/counselingController.js';
import { optionalProtect } from './middleware/authMiddleware.js';

// Connect to database
connectDB();

// Verify email config
verifyEmailConfig();

const app = express();

const linkedinClientId = String(process.env.LINKEDIN_CLIENT_ID || '').trim();
const linkedinClientSecret = String(process.env.LINKEDIN_CLIENT_SECRET || '').trim();
const linkedinCallbackUrl = String(process.env.LINKEDIN_CALLBACK_URL || '').trim();

if (linkedinClientId && linkedinClientSecret && linkedinCallbackUrl) {
  passport.use(
    new LinkedInStrategy(
      {
        clientID: linkedinClientId,
        clientSecret: linkedinClientSecret,
        callbackURL: linkedinCallbackUrl,
        scope: ['openid', 'profile', 'email'],
      },
      (accessToken, refreshToken, profile, done) => {
        done(null, profile);
      }
    )
  );
} else {
  console.warn(
    'LinkedIn OAuth is not fully configured. Missing LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, or LINKEDIN_CALLBACK_URL.'
  );
}

// Upload/body size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174', 'https://urbridge.in', 'http://192.168.1.31:5173'],
  credentials: true,
}));
app.use(passport.initialize());

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'UrBridge.ai API is running',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/user', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/counseling', counselingRoutes);
app.use('/api/counselling', counselingRoutes);
app.use('/api/user/counseling', counselingRoutes);
app.use('/api/user/counselling', counselingRoutes);

app.get([
  '/api/user/counseling/slots',
  '/api/user/counselling/slots',
  '/api/auth/counseling/slots',
  '/api/auth/counselling/slots',
  '/api/counseling/slots',
  '/api/counselling/slots',
  '/api/user/slots',
  '/api/auth/slots',
], getAvailableSlots);

app.post([
  '/api/user/counseling/book',
  '/api/user/counselling/book',
  '/api/auth/counseling/book',
  '/api/auth/counselling/book',
  '/api/counseling/book',
  '/api/counselling/book',
  '/api/user/book',
  '/api/auth/book',
], optionalProtect, createCounselingBooking);

app.get([
  '/api/user/counseling/history',
  '/api/user/counselling/history',
  '/api/auth/counseling/history',
  '/api/auth/counselling/history',
  '/api/counseling/history',
  '/api/counselling/history',
  '/api/user/history',
  '/api/auth/history',
], optionalProtect, getUserBookingHistory);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`  UrBridge.ai API Server`);
  console.log(`  Running on http://localhost:${PORT}`);
});

export default app;
