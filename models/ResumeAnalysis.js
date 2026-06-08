import mongoose from 'mongoose';

const resumeAnalysisSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: ['manual', 'upload'],
      default: 'manual',
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    suggestions: {
      type: [String],
      default: [],
    },
    scoreBreakdown: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    strongPoints: {
      type: [String],
      default: [],
    },
    profileSnapshot: {
      name: {
        type: String,
        trim: true,
        default: '',
      },
      desiredJobRoles: {
        type: String,
        trim: true,
        default: '',
      },
      education: {
        type: String,
        trim: true,
        default: '',
      },
      experience: {
        type: Number,
        default: 0,
      },
      skills: {
        type: [String],
        default: [],
      },
      certifications: {
        type: [String],
        default: [],
      },
      previousJobTitle: {
        type: String,
        trim: true,
        default: '',
      },
    },
  },
  {
    timestamps: true,
  }
);

// Index for fetching latest analysis quickly
resumeAnalysisSchema.index({ userId: 1, createdAt: -1 });

const ResumeAnalysis = mongoose.model('ResumeAnalysis', resumeAnalysisSchema);

export default ResumeAnalysis;

