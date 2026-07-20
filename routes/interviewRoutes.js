import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  startInterview,
  submitAnswer,
  endInterview,
  getHistory,
  deleteHistoryReport,
  getSession,
} from '../controllers/interviewController.js';

const router = express.Router();

// All interview routes require a logged-in user
router.post('/start', protect, startInterview);
router.post('/answer', protect, submitAnswer);
router.post('/end', protect, endInterview);
router.get('/history', protect, getHistory);
router.delete('/history/:reportId', protect, deleteHistoryReport);
router.get('/:sessionId', protect, getSession);

export default router;