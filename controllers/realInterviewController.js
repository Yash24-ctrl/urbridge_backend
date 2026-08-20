import RealInterviewBooking from '../models/RealInterviewBooking.js';
import { createGoogleMeetBooking } from '../services/googleCalendar.js';
import { sendRealInterviewBookingEmail } from '../services/emailService.js';
import { isValidEmail, normalizeEmailValue } from '../utils/emailValidation.js';
// Subscription usage tracking temporarily disabled for testing.
// import { markFeatureUsed } from '../middleware/featureAccessMiddleware.js';

const VALID_INTERVIEW_TYPES = new Set(['Technical', 'HR', 'Mixed']);
const VALID_EXPERIENCE_LEVELS = new Set(['Fresher', '1-2 Years', '3+ Years']);
const DEFAULT_TIMEZONE = 'Asia/Calcutta';
const BOOKING_NOTIFICATION_EMAIL = 'neuronetsystems01@gmail.com';
const DEFAULT_INTERVIEWER_EMAIL = BOOKING_NOTIFICATION_EMAIL;

function getRealInterviewRecipientEmail(body = {}) {
  return normalizeEmailValue(BOOKING_NOTIFICATION_EMAIL);
}

function extractMeetingCode(meetLink) {
  return String(meetLink || '').split('/').filter(Boolean).pop() || '';
}

function normalizePdfBase64(value) {
  return String(value || '').replace(/^data:application\/pdf;base64,/i, '').trim();
}

function buildBookingPayload(booking) {
  return {
    bookingId: booking._id,
    userName: booking.userName,
    userEmail: booking.userEmail,
    userPhone: booking.userPhone,
    date: booking.date,
    timeSlot: booking.timeSlot,
    timezone: booking.timezone,
    interviewType: booking.interviewType,
    experienceLevel: booking.experienceLevel,
    resumeFileName: booking.resumeFileName,
    meetLink: booking.meetLink,
    googleMeetLink: booking.meetLink,
    meetingCode: booking.meetingCode,
    calendarEventId: booking.calendarEventId,
    status: booking.status,
    createdAt: booking.createdAt,
  };
}

export async function createRealInterviewBooking(req, res) {
  try {
    const userName = String(req.body.userName || req.user?.username || req.user?.name || 'Student').trim();
    const userEmail = normalizeEmailValue(req.body.userEmail || req.user?.email || '');
    const userPhone = String(req.body.userPhone || req.body.phone || '').replace(/\D/g, '');
    const date = String(req.body.date || '').trim();
    const timeSlot = String(req.body.timeSlot || '').trim();
    const timezone = String(req.body.timezone || DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE;
    const interviewType = String(req.body.interviewType || '').trim();
    const experienceLevel = String(req.body.experienceLevel || '').trim();
    const resumeFileName = String(req.body.resumeFileName || '').trim();
    const resumePdfBase64 = normalizePdfBase64(req.body.resumePdfBase64);
    const interviewerEmail = getRealInterviewRecipientEmail(req.body);

    if (!userName || !userEmail || !userPhone || !date || !timeSlot || !interviewType || !experienceLevel || !resumeFileName || !resumePdfBase64) {
      return res.status(400).json({ message: 'Please provide name, email, 10 digit mobile number, resume PDF, interview type, experience level, date, and time slot.' });
    }

    if (!/^\d{10}$/.test(userPhone)) {
      return res.status(400).json({ message: 'Please provide a valid 10 digit mobile number.' });
    }

    if (!isValidEmail(userEmail)) {
      return res.status(400).json({ message: 'Please provide a valid email address.' });
    }

    if (!VALID_INTERVIEW_TYPES.has(interviewType)) {
      return res.status(400).json({ message: 'Please select a valid interview type.' });
    }

    if (!VALID_EXPERIENCE_LEVELS.has(experienceLevel)) {
      return res.status(400).json({ message: 'Please select a valid experience level.' });
    }

    const existingBooking = await RealInterviewBooking.findOne({ date, timeSlot, status: 'booked' }).lean();
    if (existingBooking) {
      return res.status(409).json({ message: 'This interview slot is not available. Please choose another available slot.' });
    }

    const calendarBooking = await createGoogleMeetBooking({
      userName,
      userEmail,
      userPhone,
      date,
      timeSlot,
      timezone,
      counsellorName: 'UrBridge Interviewer',
      counsellorTitle: `${interviewType} Interviewer`,
      counsellorEmail: interviewerEmail,
      calendarSummary: `UrBridgeAI Real Interview - ${interviewType}`,
      calendarRequestPrefix: 'real-interview',
      calendarDescriptionLines: [
        'Real interview session booked through UrBridgeAI',
        `Student: ${userName}`,
        `Email: ${userEmail}`,
        `Mobile: ${userPhone}`,
        `Interview type: ${interviewType}`,
        `Experience level: ${experienceLevel}`,
        `Resume file: ${resumeFileName}`,
      ],
    });

    const meetLink = calendarBooking.meetLink || '';
    const meetingCode = calendarBooking.meetingCode || extractMeetingCode(meetLink);

    if (!meetLink || !meetingCode) {
      return res.status(503).json({
        message: 'Google Meet link could not be generated right now. Please check Google Calendar configuration on the server.',
        meetLinkPending: true,
      });
    }

    const latestBooking = await RealInterviewBooking.findOne({ date, timeSlot, status: 'booked' }).lean();
    if (latestBooking) {
      return res.status(409).json({ message: 'This interview slot is not available. Please choose another available slot.' });
    }

    const booking = await RealInterviewBooking.create({
      userId: req.user?._id?.toString() || req.user?.id || null,
      userName,
      userEmail,
      userPhone,
      date,
      timeSlot,
      timezone,
      interviewType,
      experienceLevel,
      resumeFileName,
      resumePdfBase64,
      meetLink,
      meetingCode,
      calendarEventId: calendarBooking.calendarEventId || calendarBooking.eventId || '',
      interviewerEmail,
    });

    const payload = buildBookingPayload(booking);
    // Subscription usage tracking temporarily disabled for testing.
    // await markFeatureUsed(req.user?._id || req.user?.id, 'personal_interview');

    let emailResult = null;
    try {
      emailResult = await sendRealInterviewBookingEmail({
        ...payload,
        resumePdfBase64,
        interviewerEmail,
      });
    } catch (emailError) {
      console.error('Real interview email error:', emailError.message);
      return res.status(502).json({
        message: 'Real interview session was booked, but the counsellor email could not be sent. Please contact support to notify the counsellor.',
        booking: payload,
        meetLink,
        googleMeetLink: meetLink,
        meetingCode,
        calendarEventId: payload.calendarEventId,
        emailError: emailError.message,
      });
    }

    return res.status(201).json({
      message: 'Real interview session booked successfully.',
      booking: payload,
      meetLink,
      googleMeetLink: meetLink,
      meetingCode,
      calendarEventId: payload.calendarEventId,
      email: {
        studentAccepted: emailResult?.studentInfo?.accepted || [],
        counsellorAccepted: emailResult?.interviewerInfo?.accepted || [],
      },
    });
  } catch (error) {
    console.error('Create real interview booking error:', error);
    return res.status(500).json({ message: 'Server error while booking real interview session.' });
  }
}

export async function getRealInterviewAvailability(req, res) {
  try {
    const date = String(req.query?.date || '').trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: 'Please provide a valid date.' });
    }

    const bookings = await RealInterviewBooking.find({ date, status: 'booked' })
      .select('timeSlot -_id')
      .lean();

    return res.status(200).json({
      date,
      bookedSlots: bookings.map((booking) => booking.timeSlot),
    });
  } catch (error) {
    console.error('Get real interview availability error:', error);
    return res.status(500).json({ message: 'Server error while fetching interview availability.' });
  }
}

export async function getRealInterviewHistory(req, res) {
  try {
    const userId = req.user?._id?.toString() || req.user?.id || null;
    const userEmail = normalizeEmailValue(req.user?.email || req.query?.email || '');

    if (!userId && !userEmail) {
      return res.status(401).json({ message: 'Please login to view real interview history.' });
    }

    const filter = userId ? { userId } : { userEmail };
    const bookings = await RealInterviewBooking.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(30)
      .lean();

    return res.status(200).json({
      bookings: bookings.map(buildBookingPayload),
    });
  } catch (error) {
    console.error('Get real interview history error:', error);
    return res.status(500).json({ message: 'Server error while fetching real interview history.' });
  }
}




