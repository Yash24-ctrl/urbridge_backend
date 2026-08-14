import mongoose from 'mongoose';
import { EMAIL_PATTERN, normalizeEmailValue } from '../utils/emailValidation.js';

const realInterviewBookingSchema = new mongoose.Schema(
  {
    userId: { type: String, default: null, index: true },
    userName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    userEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      set: normalizeEmailValue,
      match: [EMAIL_PATTERN, 'Please provide a valid email address.'],
    },
    userPhone: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{10}$/, 'Please provide a valid 10 digit mobile number.'],
    },
    date: { type: String, required: true, index: true },
    timeSlot: { type: String, required: true, index: true },
    timezone: { type: String, required: true, default: 'Asia/Calcutta', trim: true },
    interviewType: {
      type: String,
      enum: ['Technical', 'HR', 'Mixed'],
      required: true,
    },
    experienceLevel: {
      type: String,
      enum: ['Fresher', '1-2 Years', '3+ Years'],
      required: true,
    },
    resumeFileName: { type: String, required: true, trim: true },
    resumePdfBase64: { type: String, default: '' },
    meetLink: { type: String, required: true, trim: true },
    meetingCode: { type: String, required: true, trim: true },
    calendarEventId: { type: String, trim: true, default: '', index: true },
    interviewerEmail: {
      type: String,
      trim: true,
      lowercase: true,
      set: normalizeEmailValue,
      validate: {
        validator(value) {
          return !value || EMAIL_PATTERN.test(value);
        },
        message: 'Please provide a valid interviewer email address.',
      },
      default: '',
    },
    status: {
      type: String,
      enum: ['booked', 'completed'],
      default: 'booked',
    },
    report: {
      performanceMetrics: { type: [String], default: [] },
      keyStrengths: { type: [String], default: [] },
      improvementSuggestions: { type: [String], default: [] },
      recommendedStudyTopics: { type: [String], default: [] },
      nextActionPlan: { type: [String], default: [] },
    },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'real_interview_bookings' }
);

realInterviewBookingSchema.index({ date: 1, timeSlot: 1 });
realInterviewBookingSchema.index({ userId: 1, date: -1, createdAt: -1 });

export default mongoose.model('RealInterviewBooking', realInterviewBookingSchema);

