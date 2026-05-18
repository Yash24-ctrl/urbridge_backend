import mongoose from 'mongoose';

const resumeProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      trim: true,
      default: '',
    },
    skills: {
      type: [String],
      default: [],
    },
    experience: {
      type: Number,
      default: 0,
    },
    education: {
      type: String,
      trim: true,
      default: '',
    },
    customEducation: {
      type: String,
      trim: true,
      default: '',
    },
    certifications: {
      type: [String],
      default: [],
    },
    completedProjects: {
      type: String,
      trim: true,
      default: '',
    },
    desiredJobRoles: {
      type: String,
      trim: true,
      default: '',
    },
    currentCity: {
      type: String,
      trim: true,
      default: '',
    },
    previousJobTitle: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Ensure one profile per user
resumeProfileSchema.index({ userId: 1 }, { unique: true });

const ResumeProfile = mongoose.model('ResumeProfile', resumeProfileSchema);

export default ResumeProfile;