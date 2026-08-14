import express from 'express';
import { createRealInterviewBooking, getRealInterviewAvailability, getRealInterviewHistory } from '../controllers/realInterviewController.js';
import { optionalProtect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/book', optionalProtect, createRealInterviewBooking);
router.get('/availability', getRealInterviewAvailability);
router.get('/history', optionalProtect, getRealInterviewHistory);

export default router;


