import express from 'express';
import {
  register,
  login,
  googleLogin,
  googleRegister,
  linkedinAuth,
  linkedinCallback,
  getMe,
} from '../controllers/authController.js';
import {
  createCounselingBooking,
  getAvailableSlots,
  getUserBookingHistory,
} from '../controllers/counselingController.js';
import { optionalProtect, protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
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

