import User from '../models/User.js';

const FEATURE_MESSAGES = {
  ats_checker: 'Your free ATS Checker use is complete. Please subscribe to use ATS Checker again.',
  ai_interview: 'AI Interview is a premium feature. Please subscribe to continue.',
  career_guidance: 'Career Guidance is a premium feature. Please subscribe to book a counselling session.',
  personal_interview: 'Personal Interview is a premium feature. Please subscribe to book a session.',
};

const USAGE_FIELD_BY_FEATURE = {
  ats_checker: 'atsChecksCount',
  ai_interview: 'aiInterviewCount',
  career_guidance: 'careerGuidanceCount',
  personal_interview: 'personalInterviewCount',
};

function isSubscriptionActive(user) {
  if (!user?.subscription?.isActive) return false;

  const expiresAt = user.subscription.expiresAt;
  if (!expiresAt) return true;

  return new Date(expiresAt).getTime() > Date.now();
}

async function getFreshUser(userId) {
  if (!userId) return null;
  return User.findById(userId);
}

export async function getFeatureAccess(userId, featureName) {
  const user = await getFreshUser(userId);

  if (!user) {
    return {
      allowed: false,
      statusCode: 401,
      reason: 'not_authenticated',
      message: 'Please login to continue.',
    };
  }

  if (isSubscriptionActive(user)) {
    return {
      allowed: true,
      reason: 'subscription_active',
      message: 'Subscription active.',
      user,
    };
  }

  if (featureName === 'ats_checker' && !user.usage?.atsFreeUsed) {
    return {
      allowed: true,
      reason: 'free_use_available',
      message: 'Your free ATS Checker use is available.',
      user,
    };
  }

  return {
    allowed: false,
    statusCode: 402,
    reason: 'subscription_required',
    message: FEATURE_MESSAGES[featureName] || 'Subscription required to use this feature.',
    user,
  };
}

export function requireFeatureAccess(featureName) {
  return async (req, res, next) => {
    try {
      const access = await getFeatureAccess(req.user?._id, featureName);

      if (!access.allowed) {
        return res.status(access.statusCode || 402).json({
          message: access.message,
          reason: access.reason,
          feature: featureName,
          subscriptionRequired: access.reason === 'subscription_required',
        });
      }

      req.featureAccess = access;
      next();
    } catch (error) {
      console.error('Feature access error:', error);
      res.status(500).json({ message: 'Server error while checking feature access' });
    }
  };
}

export async function markFeatureUsed(userId, featureName) {
  const usageField = USAGE_FIELD_BY_FEATURE[featureName];
  if (!userId || !usageField) return null;

  const update = {
    $inc: {
      [`usage.${usageField}`]: 1,
    },
  };

  if (featureName === 'ats_checker') {
    update.$set = {
      'usage.atsFreeUsed': true,
    };
  }

  return User.findByIdAndUpdate(userId, update, { new: true });
}

export { isSubscriptionActive };
