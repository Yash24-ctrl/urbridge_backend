import mongoose from 'mongoose';
import { EMAIL_PATTERN, normalizeEmailValue } from '../utils/emailValidation.js';

const counselingBookingSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      default: null,
      index: true,
    },
    userName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
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
      trim: true,
      default: '',
    },
    timezone: {
      type: String,
      required: true,
      default: 'Asia/Calcutta',
      trim: true,
    },
    date: {
      type: String,
      required: true,
      index: true,
    },
    timeSlot: {
      type: String,
      required: true,
      index: true,
    },
    helpWith: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    message: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    meetLink: {
      type: String,
      required: true,
      trim: true,
    },
    meetingCode: {
      type: String,
      required: true,
      trim: true,
    },
    calendarEventId: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    counsellorName: {
      type: String,
      default: 'Ravi Shah',
    },
    counsellorEmail: {
      type: String,
      trim: true,
      lowercase: true,
      set: normalizeEmailValue,
      validate: {
        validator(value) {
          return !value || EMAIL_PATTERN.test(value);
        },
        message: 'Please provide a valid counsellor email address.',
      },
      default: '',
    },
    counsellorTitle: {
      type: String,
      default: 'AI Expert Counsellor',
    },
    status: {
      type: String,
      enum: ['upcoming', 'completed'],
      default: 'upcoming',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'counseling_bookings',
  }
);

counselingBookingSchema.index({ date: 1, timeSlot: 1 });
counselingBookingSchema.index({ userId: 1, date: -1, createdAt: -1 });

const CounselingBooking = mongoose.model(
  'CounselingBooking',
  counselingBookingSchema
);

export default CounselingBooking;
