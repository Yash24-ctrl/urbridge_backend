import ResumeProfile from '../models/ResumeProfile.js';
import ResumeAnalysis from '../models/ResumeAnalysis.js';
import { sanitizeResumePayload } from '../utils/resumePayload.js';
import { analyzeResumeProfile, analyzeExperiencedProfile } from '../services/resumeAnalyzerService.js';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001/predict';

async function analyzeWithMlService(profileData) {
  const response = await fetch(ML_SERVICE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(profileData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || data?.message || 'ML service request failed');
  }

  return data;
}

// @desc    Save or update resume profile
// @route   POST /api/resume/profile
// @access  Private
export const saveProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const profileData = {
      userId,
      ...sanitizeResumePayload(req.body, req.user?.username || ''),
    };

    const profile = await ResumeProfile.findOneAndUpdate(
      { userId },
      { $set: profileData },  // FIX: use $set to avoid Mongoose cast error on arrays
      { new: true, upsert: true, runValidators: true }
    );

    res.status(200).json({
      message: 'Profile saved successfully',
      profile,
    });
  } catch (error) {
    console.error('Save profile error:', error);
    res.status(500).json({ message: 'Server error while saving profile' });
  }
};

// @desc    Analyze manual resume input, persist profile, and save analysis
// @route   POST /api/resume/analyze
// @access  Private
export const analyzeManualResume = async (req, res) => {
  try {
    const userId = req.user._id;
    const profileData = {
      userId,
      ...sanitizeResumePayload(req.body, req.user?.username || ''),
    };

    const requiredFields = [
      ['skills', profileData.skills.length > 0],
      ['education', Boolean(profileData.education)],
      ['completedProjects', Boolean(profileData.completedProjects)],
      ['desiredJobRoles', Boolean(profileData.desiredJobRoles)],
    ];

    const missingFields = requiredFields
      .filter(([, isValid]) => !isValid)
      .map(([field]) => field);

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    const profile = await ResumeProfile.findOneAndUpdate(
      { userId },
      { $set: profileData },  // FIX: use $set to avoid Mongoose cast error on arrays
      { new: true, upsert: true, runValidators: true }
    );

    // STEP 1 — DETECT EXPERIENCED vs FRESHER
    const experience = Number(profileData.experience) || 0;
    let analysisResult;

    if (experience >= 1) {
      // Route to experienced ATS scoring logic
      analysisResult = analyzeExperiencedProfile(profileData);
    } else {
      // Use fresher logic with AI suggestions (async)
      analysisResult = await analyzeResumeProfile(profileData);
    }

    const analysis = await ResumeAnalysis.create({
      userId,
      source: 'manual',
      score: analysisResult.score,
      suggestions: analysisResult.suggestions,
      scoreBreakdown: analysisResult.scoreBreakdown || {},
      strongPoints: analysisResult.strongPoints || [],
    });

    res.status(200).json({
      score: analysisResult.score,
      suggestions: analysisResult.suggestions,
      scoreBreakdown: analysisResult.scoreBreakdown || {},
      strongPoints: analysisResult.strongPoints || [],
      diagnostics: analysisResult.diagnostics,
      profile,
      analysis,
      profileType: experience >= 1 ? 'experienced' : 'fresher',
    });
  } catch (error) {
    console.error('Manual analysis error:', error);
    res.status(500).json({ message: 'Server error while analyzing resume details' });
  }
};

// @desc    Get resume profile for logged-in user
// @route   GET /api/resume/profile
// @access  Private
export const getProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const profile = await ResumeProfile.findOne({ userId });

    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    res.status(200).json({ profile });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error while fetching profile' });
  }
};

// @desc    Save resume analysis
// @route   POST /api/resume/analysis
// @access  Private
export const saveAnalysis = async (req, res) => {
  try {
    const { source, score, suggestions } = req.body;
    const userId = req.user._id;

    if (typeof score !== 'number') {
      return res.status(400).json({ message: 'Score is required and must be a number' });
    }

    const analysis = await ResumeAnalysis.create({
      userId,
      source: source || 'manual',
      score,
      suggestions: Array.isArray(suggestions) ? suggestions : [],
    });

    res.status(201).json({
      message: 'Analysis saved successfully',
      analysis,
    });
  } catch (error) {
    console.error('Save analysis error:', error);
    res.status(500).json({ message: 'Server error while saving analysis' });
  }
};

// @desc    Get latest resume analysis for logged-in user
// @route   GET /api/resume/analysis/latest
// @access  Private
export const getLatestAnalysis = async (req, res) => {
  try {
    const userId = req.user._id;
    const analysis = await ResumeAnalysis.findOne({ userId })
      .sort({ createdAt: -1 })
      .limit(1);

    if (!analysis) {
      return res.status(404).json({ message: 'No analysis found' });
    }

    res.status(200).json({ analysis });
  } catch (error) {
    console.error('Get latest analysis error:', error);
    res.status(500).json({ message: 'Server error while fetching analysis' });
  }
};