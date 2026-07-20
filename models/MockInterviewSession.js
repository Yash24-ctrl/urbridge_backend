import mongoose from 'mongoose';

/**
 * One Q&A turn in the interview.
 * Stored as it happens so the session can be resumed/audited,
 * and so InterviewReport can be built from this array at the end.
 */
const TranscriptEntrySchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true }, // uuid, generated per question
    question: { type: String, required: true },
    topic: { type: String }, // e.g. "CNN architecture", "REST APIs"
    focusArea: {
      type: String,
      enum: ['technical', 'hr', 'projects', 'system_design', 'behavioral', 'communication'],
    },
    difficultyAtAsk: { type: Number, min: 0, max: 100, required: true }, // knowledgeScore snapshot when asked

    answer: { type: String, default: '' },
    answeredAt: { type: Date },
    timeTakenSeconds: { type: Number },
    skipped: { type: Boolean, default: false },

    evaluation: {
      correctness: { type: Number, min: 0, max: 100 }, // how correct/complete
      scoreDelta: { type: Number }, // +8 / -7 style delta applied to knowledgeScore
      feedback: { type: String }, // short AI feedback used internally / for report
      flags: [{ type: String }], // e.g. ["low_confidence", "incorrect_concept"]
    },
  },
  { _id: false, timestamps: false }
);

const MockInterviewSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Snapshot link to the resume used, so history stays accurate even if resume is later replaced
    resumeProfile: { type: mongoose.Schema.Types.ObjectId, ref: 'ResumeProfile', required: false },
    resumeSnapshot: { type: mongoose.Schema.Types.Mixed }, // frozen copy of parsed resume data at session start

    // From the Interview Config screen
    config: {
      role: { type: String, required: true }, // "AI Engineer", "Custom", etc.
      customRole: { type: String }, // filled if role === 'Custom'
      experienceLevel: {
        type: String,
        enum: ['fresher', '1-3', '3-5', '5+'],
        required: true,
      },
      difficultyMode: {
        type: String,
        enum: ['easy', 'medium', 'hard', 'adaptive'],
        default: 'adaptive',
      },
      durationMinutes: { type: Number, enum: [30, 45, 60], default: 30 },
      focus: {
        type: String,
        enum: ['technical', 'hr', 'mixed', 'projects', 'system_design', 'custom'],
        default: 'mixed',
      },
    },

    // Live adaptive state
    knowledgeScore: { type: Number, min: 0, max: 100, default: 50 },
    topicsCovered: [{ type: String }],
    weakTopics: [{ type: String }], // building up during the interview, used for report + next question selection

    transcript: [TranscriptEntrySchema],

    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed', 'abandoned'],
      default: 'not_started',
      index: true,
    },

    startedAt: { type: Date },
    endedAt: { type: Date },
    lastActivityAt: { type: Date }, // used to detect/expire abandoned sessions

    // Denormalized once completed, so history list queries don't need a join to InterviewReport
    reportGenerated: { type: Boolean, default: false },
    report: { type: mongoose.Schema.Types.ObjectId, ref: 'InterviewReport' },
  },
  { timestamps: true }
);

MockInterviewSessionSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('MockInterviewSession', MockInterviewSessionSchema);