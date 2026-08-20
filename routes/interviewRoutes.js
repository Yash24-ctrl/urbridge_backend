import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
// Subscription lock temporarily disabled for testing.
// import { requireFeatureAccess } from '../middleware/featureAccessMiddleware.js';
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
// Subscription lock temporarily disabled for testing.
// router.post('/start', protect, requireFeatureAccess('ai_interview'), startInterview);
router.post('/start', protect, startInterview);
router.post('/answer', protect, submitAnswer);
router.post('/end', protect, endInterview);
router.get('/history', protect, getHistory);
router.delete('/history/:reportId', protect, deleteHistoryReport);
router.get('/:sessionId', protect, getSession);

export default router;
