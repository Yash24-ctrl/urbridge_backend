import express from 'express';
import {
  createCounselingBooking,
  getAvailableSlots,
  getUserBookingHistory,
} from '../controllers/counselingController.js';
import { optionalProtect, protect } from '../middleware/authMiddleware.js';
// Subscription lock temporarily disabled for testing.
// import { requireFeatureAccess } from '../middleware/featureAccessMiddleware.js';

const router = express.Router();

// Subscription lock temporarily disabled for testing.
// router.post('/book', protect, requireFeatureAccess('career_guidance'), createCounselingBooking);
router.post('/book', protect, createCounselingBooking);
router.get('/slots', getAvailableSlots);
router.get('/history', optionalProtect, getUserBookingHistory);

export default router;
