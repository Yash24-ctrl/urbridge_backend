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
  },
  {
    timestamps: true,
  }
);

// Index for fetching latest analysis quickly
resumeAnalysisSchema.index({ userId: 1, createdAt: -1 });

const ResumeAnalysis = mongoose.model('ResumeAnalysis', resumeAnalysisSchema);

export default ResumeAnalysis;

