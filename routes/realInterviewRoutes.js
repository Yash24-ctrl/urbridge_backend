import express from 'express';
import { createRealInterviewBooking, getRealInterviewAvailability, getRealInterviewHistory } from '../controllers/realInterviewController.js';
import { optionalProtect, protect } from '../middleware/authMiddleware.js';
// Subscription lock temporarily disabled for testing.
// import { requireFeatureAccess } from '../middleware/featureAccessMiddleware.js';

const router = express.Router();

// Subscription lock temporarily disabled for testing.
// router.post('/book', protect, requireFeatureAccess('personal_interview'), createRealInterviewBooking);
router.post('/book', protect, createRealInterviewBooking);
router.get('/availability', getRealInterviewAvailability);
router.get('/history', optionalProtect, getRealInterviewHistory);

export default router;


