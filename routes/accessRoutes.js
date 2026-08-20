import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getFeatureAccess, isSubscriptionActive } from '../middleware/featureAccessMiddleware.js';

const router = express.Router();

const FEATURE_ALIASES = {
  'ats-checker': 'ats_checker',
  'ats_checker': 'ats_checker',
  'ai-interview': 'ai_interview',
  'ai_interview': 'ai_interview',
  'career-guidance': 'career_guidance',
  'career_guidance': 'career_guidance',
  counselling: 'career_guidance',
  counseling: 'career_guidance',
  'personal-interview': 'personal_interview',
  'personal_interview': 'personal_interview',
  'real-interview': 'personal_interview',
};

router.get('/:feature', protect, async (req, res) => {
  try {
    const feature = FEATURE_ALIASES[req.params.feature] || req.params.feature;
    const access = await getFeatureAccess(req.user?._id, feature);
    const user = access.user;

    res.status(200).json({
      allowed: access.allowed,
      reason: access.reason,
      message: access.message,
      feature,
      subscriptionRequired: access.reason === 'subscription_required',
      subscription: {
        isActive: isSubscriptionActive(user),
        planName: user?.subscription?.planName || '',
        expiresAt: user?.subscription?.expiresAt || null,
      },
      usage: {
        atsFreeUsed: Boolean(user?.usage?.atsFreeUsed),
        atsChecksCount: Number(user?.usage?.atsChecksCount) || 0,
        aiInterviewCount: Number(user?.usage?.aiInterviewCount) || 0,
        careerGuidanceCount: Number(user?.usage?.careerGuidanceCount) || 0,
        personalInterviewCount: Number(user?.usage?.personalInterviewCount) || 0,
      },
    });
  } catch (error) {
    console.error('Access status error:', error);
    res.status(500).json({ message: 'Server error while checking feature access' });
  }
});

export default router;
