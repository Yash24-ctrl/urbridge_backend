import express from 'express';
import {
  register,
  login,
  googleLogin,
  googleRegister,
  linkedinAuth,
  linkedinCallback,
  forgotPassword,
  resetPassword,
  getMe,
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/google-login', googleLogin);
router.post('/google-register', googleRegister);
router.get('/linkedin', linkedinAuth);
router.get('/linkedin/callback', linkedinCallback);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes
router.get('/me', protect, getMe);

export default router;

