import CounselingBooking from '../models/CounselingBooking.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import { createGoogleMeetBooking } from '../services/googleCalendar.js';
import { sendBookingConfirmationEmail } from '../services/emailService.js';
import { isValidEmail, normalizeEmailValue } from '../utils/emailValidation.js';

const TIMEZONE = 'Asia/Calcutta';
const TIME_SLOTS = ['10:00 AM', '12:00 PM', '02:00 PM', '04:00 PM', '06:00 PM'];
const MAX_BOOKINGS_PER_SLOT = 1;
const SESSION_DURATION_MINUTES = 60;
const COUNSELLOR_NAME = 'Ravi Shah';
const COUNSELLOR_TITLE = 'AI Expert Counsellor';

function getTimeZoneParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function formatDateString(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return formatDateString(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate()
  );
}

function toDisplayDate(dateString) {
  const [year, month, day] = dateString.split('-');
  return `${day}-${month}-${year}`;
}

function normalizeDateInput(value) {
  const rawValue = String(value || '').trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return rawValue;
  }

  const displayMatch = rawValue.match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (displayMatch) {
    return `${displayMatch[3]}-${displayMatch[2]}-${displayMatch[1]}`;
  }

  return '';
}

function normalizeStoredDate(value) {
  if (!value) {
    return '';
  }

  if (value instanceof Date) {
    return formatDateString(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate()
    );
  }

  const rawValue = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(rawValue)) {
    return rawValue.slice(0, 10);
  }

  return normalizeDateInput(rawValue);
}

function normalizeStoredTimeSlot(value) {
  const rawValue = String(value || '').trim();

  if (!rawValue) {
    return '';
  }

  if (TIME_SLOTS.includes(rawValue)) {
    return rawValue;
  }

  const match = rawValue.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return rawValue;
  }

  const hours24 = Number(match[1]);
  const minutes = match[2];
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;

  return `${String(hours12).padStart(2, '0')}:${minutes} ${meridiem}`;
}

function extractMeetingCode(meetLink) {
  return String(meetLink || '').split('/').filter(Boolean).pop() || '';
}

function getBookingDateValue(booking) {
  return normalizeStoredDate(
    booking.date
    || booking.booking_date
    || booking.preferredDate
  );
}

function getBookingTimeSlotValue(booking) {
  return normalizeStoredTimeSlot(
    booking.timeSlot
    || booking.time_slot
    || booking.preferredTime
  );
}

function getBookingMeetLinkValue(booking) {
  return (
    booking.meetLink
    || booking.googleMeetLink
    || booking.google_meet_link
    || booking.meetingLink
    || booking.meeting_link
    || ''
  );
}

function getAllowedDateOptions() {
  const parts = getTimeZoneParts();
  const today = formatDateString(parts.year, parts.month, parts.day);

  return [
    { label: 'Today', date: today, displayDate: toDisplayDate(today) },
    { label: 'Tomorrow', date: addDays(today, 1), displayDate: toDisplayDate(addDays(today, 1)) },
    { label: 'Day After Tomorrow', date: addDays(today, 2), displayDate: toDisplayDate(addDays(today, 2)) },
  ];
}

function parseTimeSlot(timeSlot) {
  const match = String(timeSlot || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3].toUpperCase();

  if (meridiem === 'PM' && hours !== 12) {
    hours += 12;
  }

  if (meridiem === 'AM' && hours === 12) {
    hours = 0;
  }

  return hours * 60 + minutes;
}

function getCurrentMinutes() {
  const parts = getTimeZoneParts();

  return Number(parts.hour) * 60 + Number(parts.minute);
}

function isSlotPassed(date, timeSlot, useEndTime = false) {
  const today = getAllowedDateOptions()[0].date;

  if (date !== today) {
    return false;
  }

  const slotMinutes = parseTimeSlot(timeSlot);

  if (slotMinutes === null) {
    return true;
  }

  const comparisonMinutes = useEndTime
    ? slotMinutes + SESSION_DURATION_MINUTES
    : slotMinutes;

  return getCurrentMinutes() >= comparisonMinutes;
}

function normalizePhoneNumber(value) {
  const trimmed = String(value || '').trim().replace(/\s+/g, '');

  if (/^\+91[6-9]\d{9}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^[6-9]\d{9}$/.test(trimmed)) {
    return `+91${trimmed}`;
  }

  return '';
}

function getReadableDate(dateString) {
  const normalizedDate = normalizeStoredDate(dateString);

  if (!normalizedDate) {
    return '';
  }

  const [year, month, day] = normalizedDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(date);
  const monthName = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
  const suffix =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
        ? 'nd'
        : day % 10 === 3 && day !== 13
          ? 'rd'
          : 'th';

  return `${weekday}, ${day}${suffix} ${monthName} ${year}`;
}

function buildBookingPayload(booking) {
  const date = getBookingDateValue(booking);
  const timeSlot = getBookingTimeSlotValue(booking);
  const meetLink = getBookingMeetLinkValue(booking);
  const meetingCode = booking.meetingCode || extractMeetingCode(meetLink);
  const helpWith = booking.helpWith || booking.message || booking.notes || '';

  return {
    id: booking._id,
    bookingId: booking._id,
    userId: booking.userId,
    user_id: booking.userId,
    userName: booking.userName || booking.fullName || '',
    userEmail: booking.userEmail || booking.email || '',
    userPhone: booking.userPhone || booking.phone || '',
    timezone: booking.timezone,
    date,
    booking_date: date,
    readableDate: getReadableDate(date),
    timeSlot,
    time_slot: timeSlot,
    helpWith,
    message: booking.message || booking.helpWith || booking.notes || '',
    meetLink,
    googleMeetLink: meetLink,
    google_meet_link: meetLink,
    meetingCode,
    calendarEventId: booking.calendarEventId || booking.eventId || '',
    calendar_event_id: booking.calendarEventId || booking.eventId || '',
    counsellorName: booking.counsellorName || COUNSELLOR_NAME,
    counsellorEmail: booking.counsellorEmail || '',
    counsellorTitle: booking.counsellorTitle || COUNSELLOR_TITLE,
    status: booking.status,
    createdAt: booking.createdAt,
    created_at: booking.createdAt,
  };
}

async function getSlotCounts(dateOptions) {
  const dates = dateOptions.map((option) => option.date);
  const counts = await CounselingBooking.aggregate([
    {
      $match: {
        date: { $in: dates },
        timeSlot: { $in: TIME_SLOTS },
      },
    },
    {
      $group: {
        _id: {
          date: '$date',
          timeSlot: '$timeSlot',
        },
        count: { $sum: 1 },
      },
    },
  ]);

  return counts.reduce((map, item) => {
    map.set(`${item._id.date}:${item._id.timeSlot}`, item.count);
    return map;
  }, new Map());
}

function buildSlotResponse(dateOptions, slotCounts) {
  return dateOptions.map((option) => ({
    ...option,
    readableDate: getReadableDate(option.date),
    slots: TIME_SLOTS.map((timeSlot) => {
      const bookedCount = slotCounts.get(`${option.date}:${timeSlot}`) || 0;
      const isFull = bookedCount >= MAX_BOOKINGS_PER_SLOT;
      const isPassed = isSlotPassed(option.date, timeSlot);
      const status = isPassed ? 'passed' : isFull ? 'booked' : 'available';

      return {
        time: timeSlot,
        timeSlot,
        status,
        label: isPassed ? 'Time Passed' : isFull ? 'Booked' : 'Available',
        bookedCount,
        remaining: Math.max(MAX_BOOKINGS_PER_SLOT - bookedCount, 0),
        isFull,
        isPassed,
        available: !isFull && !isPassed,
      };
    }),
  }));
}

function computeBookingStatus(booking) {
  const today = getAllowedDateOptions()[0].date;
  const date = getBookingDateValue(booking);
  const timeSlot = getBookingTimeSlotValue(booking);

  if (!date || !timeSlot) {
    return booking.status === 'completed' ? 'completed' : 'upcoming';
  }

  if (date < today) {
    return 'completed';
  }

  if (date > today) {
    return 'upcoming';
  }

  return isSlotPassed(date, timeSlot, true)
    ? 'completed'
    : 'upcoming';
}

export async function createCounselingBooking(req, res) {
  const bookingLogId = `counselling-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const bodyUserId = String(req.body.userId || '').trim();
    const authenticatedUserId = req.user?._id?.toString() || '';
    const userId = authenticatedUserId || bodyUserId || null;
    const persistedUser = !req.user && mongoose.Types.ObjectId.isValid(bodyUserId)
      ? await User.findById(bodyUserId).select('username email').lean()
      : null;
    const userName = String(
      req.body.userName
      || req.body.fullName
      || req.user?.username
      || persistedUser?.username
      || ''
    ).trim();
    const userEmail = normalizeEmailValue(
      req.body.userEmail
      || req.body.email
      || req.user?.email
      || persistedUser?.email
    );
    const userPhone = normalizePhoneNumber(req.body.userPhone || req.body.phone);
    const timezone = String(req.body.timezone || TIMEZONE).trim();
    const date = normalizeDateInput(req.body.date);
    const timeSlot = String(req.body.timeSlot || '').trim();
    const helpWith = String(req.body.helpWith || req.body.message || '').trim();
    const counsellorName = String(req.body.counsellorName || req.body.counselorName || COUNSELLOR_NAME).trim() || COUNSELLOR_NAME;
    const requestedCounsellorEmail = normalizeEmailValue(req.body.counsellorEmail || req.body.counselorEmail || '');
    const counsellorEmail = isValidEmail(requestedCounsellorEmail) ? requestedCounsellorEmail : '';
    const counsellorTitle = String(req.body.counsellorTitle || req.body.counselorTitle || COUNSELLOR_TITLE).trim() || COUNSELLOR_TITLE;

    console.info(`[${bookingLogId}] Booking request received`, {
      route: req.originalUrl,
      hasAuthenticatedUser: Boolean(req.user),
      hasBodyUserId: Boolean(bodyUserId),
      date,
      timeSlot,
      hasMessage: Boolean(helpWith),
    });

    if (!userName || !userEmail || !timezone || !date || !timeSlot) {
      console.warn(`[${bookingLogId}] Booking validation failed: missing fields`);
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields',
      });
    }

    if (!isValidEmail(userEmail)) {
      console.warn(`[${bookingLogId}] Booking validation failed: invalid email`);
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
    }

    if (!TIME_SLOTS.includes(timeSlot)) {
      console.warn(`[${bookingLogId}] Booking validation failed: invalid slot`, { timeSlot });
      return res.status(400).json({
        success: false,
        message: 'Please select a valid time slot',
      });
    }

    const allowedDates = getAllowedDateOptions().map((option) => option.date);

    if (!allowedDates.includes(date)) {
      console.warn(`[${bookingLogId}] Booking validation failed: invalid date`, { date });
      return res.status(400).json({
        success: false,
        message: 'Bookings are only available for the next 3 days.',
      });
    }

    if (isSlotPassed(date, timeSlot)) {
      console.warn(`[${bookingLogId}] Booking validation failed: passed slot`, { date, timeSlot });
      return res.status(400).json({
        success: false,
        message: 'Selected time slot has already passed.',
      });
    }

    const existingCount = await CounselingBooking.countDocuments({ date, timeSlot });
    console.info(`[${bookingLogId}] Slot capacity checked`, {
      date,
      timeSlot,
      existingCount,
      maxBookingsPerSlot: MAX_BOOKINGS_PER_SLOT,
    });

    if (existingCount >= MAX_BOOKINGS_PER_SLOT) {
      console.warn(`[${bookingLogId}] Booking rejected: slot fully booked`, { date, timeSlot });
      return res.status(409).json({
        success: false,
        message: 'This slot is already booked.',
      });
    }

    console.info(`[${bookingLogId}] Creating Google Meet booking`);
    let calendarBooking;
    try {
      calendarBooking = await createGoogleMeetBooking({
        userName,
        userEmail,
        userPhone,
        timezone,
        date,
        timeSlot,
        helpWith,
        counsellorName,
        counsellorEmail,
        counsellorTitle,
      });
      console.info(`[${bookingLogId}] Google Meet booking ready`, {
        hasMeetLink: Boolean(calendarBooking.meetLink),
        calendarEventId: calendarBooking.calendarEventId || calendarBooking.eventId || '',
        usedFallbackMeetLink: Boolean(calendarBooking.fallback),
        meetLinkPending: Boolean(calendarBooking.meetLinkPending),
      });
    } catch (calendarError) {
      console.warn(`[${bookingLogId}] Google Calendar/Meet failed, proceeding without meet link:`, calendarError.message);
      calendarBooking = {
        meetLink: '',
        meetingCode: '',
        calendarEventId: '',
        calendarLink: '',
        fallback: true,
        meetLinkPending: true,
      };
    }

    const booking = await CounselingBooking.create({
      userId,
      userName,
      userEmail,
      userPhone,
      timezone,
      date,
      timeSlot,
      helpWith,
      message: helpWith,
      meetLink: calendarBooking.meetLink,
      meetingCode: calendarBooking.meetingCode,
      calendarEventId: calendarBooking.calendarEventId || calendarBooking.eventId || '',
      counsellorName,
      counsellorEmail,
      counsellorTitle,
      status: 'upcoming',
    });
    console.info(`[${bookingLogId}] Booking stored in MongoDB`, {
      bookingId: booking._id?.toString(),
      collection: 'counseling_bookings',
    });

    const bookingPayload = {
      ...buildBookingPayload(booking),
      calendarLink: calendarBooking.calendarLink,
    };

    try {
      const emailResult = await sendBookingConfirmationEmail(bookingPayload);
      console.info(`[${bookingLogId}] Confirmation emails sent`, {
        userAccepted: emailResult.userInfo?.accepted || [],
        counsellorAccepted: emailResult.counselorInfo?.accepted || [],
        userRejected: emailResult.userInfo?.rejected || [],
        counsellorRejected: emailResult.counselorInfo?.rejected || [],
      });
    } catch (error) {
      console.error(`[${bookingLogId}] Counseling confirmation email error:`, error);
    }

    const meetLinkPending = Boolean(calendarBooking.meetLinkPending) || !calendarBooking.meetLink;
    const successMessage = meetLinkPending
      ? 'Session booked! Your counsellor will share the meeting link shortly.'
      : 'Counselling session booked successfully.';

    return res.status(201).json({
      success: true,
      message: successMessage,
      bookingId: bookingPayload.bookingId,
      meetLink: bookingPayload.meetLink,
      meetLinkPending,
      calendarEventId: bookingPayload.calendarEventId,
      booking: bookingPayload,
    });
  } catch (error) {
    console.error('BOOKING ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to book session. Please try again.',
      detail: error.message || 'Unknown error',
    });
  }
}

export async function getAvailableSlots(req, res) {
  try {
    const dateOptions = getAllowedDateOptions();
    const slotCounts = await getSlotCounts(dateOptions);
    const requestedDate = normalizeDateInput(req.query.date);

    if (req.query.date) {
      const selectedDate = dateOptions.find((option) => option.date === requestedDate);

      if (!selectedDate) {
        return res.status(400).json({
          success: false,
          message: 'Bookings are only available for the next 3 days.',
        });
      }

      const [slotResponse] = buildSlotResponse([selectedDate], slotCounts);

      return res.status(200).json({
        success: true,
        date: slotResponse.displayDate,
        isoDate: slotResponse.date,
        label: slotResponse.label,
        readableDate: slotResponse.readableDate,
        slots: slotResponse.slots,
        maxBookingsPerSlot: MAX_BOOKINGS_PER_SLOT,
        timezone: TIMEZONE,
      });
    }

    return res.status(200).json({
      success: true,
      dates: buildSlotResponse(dateOptions, slotCounts),
      timeSlots: TIME_SLOTS,
      maxBookingsPerSlot: MAX_BOOKINGS_PER_SLOT,
      timezone: TIMEZONE,
    });
  } catch (error) {
    console.error('Get available slots error:', error);
    return res.status(500).json({ message: 'Server error while fetching available slots' });
  }
}

export async function getUserBookingHistory(req, res) {
  try {
    const userId = req.user?._id?.toString();

    if (!userId) {
      return res.status(200).json({
        success: true,
        bookings: [],
      });
    }

    const bookings = await CounselingBooking.find({ userId })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    const statusUpdates = [];
    const history = bookings.map((booking) => {
      const status = computeBookingStatus(booking);

      if (booking.status !== status) {
        statusUpdates.push({
          updateOne: {
            filter: { _id: booking._id, userId },
            update: { $set: { status } },
          },
        });
      }

      return buildBookingPayload({ ...booking, status });
    });

    if (statusUpdates.length > 0) {
      await CounselingBooking.bulkWrite(statusUpdates);
    }

    return res.status(200).json({
      success: true,
      bookings: history,
    });
  } catch (error) {
    console.error('Get counseling history error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching booking history',
      error: error.message,
    });
  }
}
