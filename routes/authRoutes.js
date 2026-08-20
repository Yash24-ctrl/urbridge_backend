import express from 'express';
import {
  register,
  login,
  googleLogin,
  googleRegister,
  linkedinAuth,
  linkedinCallback,
  getMe,
  verifyOtp,
  resendOtp,
  forgotPassword,
  resetPassword,
} from '../controllers/authController.js';
import {
  createCounselingBooking,
  getAvailableSlots,
  getUserBookingHistory,
} from '../controllers/counselingController.js';
import { optionalProtect, protect } from '../middleware/authMiddleware.js';
import { rateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

const registerLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many registration requests. Please try again after 15 minutes.'
});

const verifyOtpLimiter = rateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 15,
  message: 'Too many verification attempts. Please try again after 5 minutes.'
});

const resendOtpLimiter = rateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5,
  message: 'Too many resend requests. Please try again after 5 minutes.'
});

// Public routes
router.post('/register', registerLimiter, register);
router.post('/login', login);
router.post('/verify-otp', verifyOtpLimiter, verifyOtp);
router.post('/resend-otp', resendOtpLimiter, resendOtp);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.post('/google-login', googleLogin);
router.post('/google-register', googleRegister);
router.get('/linkedin', linkedinAuth);
router.get('/linkedin/callback', linkedinCallback);
router.get('/counseling/slots', getAvailableSlots);
router.get('/counselling/slots', getAvailableSlots);
router.get('/slots', getAvailableSlots);
router.post('/counseling/book', optionalProtect, createCounselingBooking);
router.post('/counselling/book', optionalProtect, createCounselingBooking);
router.post('/book', optionalProtect, createCounselingBooking);
router.get('/counseling/history', optionalProtect, getUserBookingHistory);
router.get('/counselling/history', optionalProtect, getUserBookingHistory);
router.get('/history', optionalProtect, getUserBookingHistory);

// Protected routes
router.get('/me', protect, getMe);

export default router;

