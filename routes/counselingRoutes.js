import express from 'express';
import {
  createCounselingBooking,
  getAvailableSlots,
  getUserBookingHistory,
} from '../controllers/counselingController.js';
import { optionalProtect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/book', optionalProtect, createCounselingBooking);
router.get('/slots', getAvailableSlots);
router.get('/history', optionalProtect, getUserBookingHistory);

export default router;
