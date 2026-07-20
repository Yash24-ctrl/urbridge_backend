import mongoose from 'mongoose';

const InterviewReportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MockInterviewSession',
      required: true,
      unique: true, // one report per session
    },

    // Mirrors the config so history cards don't need to populate session every time
    role: { type: String },
    experienceLevel: { type: String },
    focus: { type: String },
    durationMinutes: { type: Number },

    overallScore: { type: Number, min: 0, max: 100, required: true },

    subScores: {
      communication: { type: Number, min: 0, max: 100 },
      technical: { type: Number, min: 0, max: 100 },
      confidence: { type: Number, min: 0, max: 100 },
      problemSolving: { type: Number, min: 0, max: 100 },
      projectExplanation: { type: Number, min: 0, max: 100 },
    },

    strengths: [{ type: String }],
    weakAreas: [{ type: String }],
    recommendedTopics: [{ type: String }],

    summary: { type: String }, // short AI-written overall narrative, e.g. "7/10 questions answered well..."

    questionsCount: { type: Number },
    questionsAnsweredWell: { type: Number },

    interviewTurns: [
      {
        question: { type: String },
        answer: { type: String },
        topic: { type: String },
        focusArea: { type: String },
        score: { type: Number, min: 0, max: 100 },
        feedback: { type: String },
      },
    ],

    // Reuse existing report/PDF generation pattern (same as ResumeAnalysis snapshot style)
    pdfUrl: { type: String },
    pdfGeneratedAt: { type: Date },
  },
  { timestamps: true }
);

InterviewReportSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('InterviewReport', InterviewReportSchema);