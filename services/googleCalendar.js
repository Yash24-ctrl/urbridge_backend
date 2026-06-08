import { OAuth2Client } from 'google-auth-library';
import { isValidEmail, normalizeEmailValue } from '../utils/emailValidation.js';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const COUNSELLOR_NAME = 'Ravi Shah';
const COUNSELLOR_TITLE = 'AI Expert Counsellor';
const SESSION_DURATION_MINUTES = 60;

function getCounselorEmail(requestedEmail) {
  const selectedEmail = normalizeEmailValue(requestedEmail);

  if (isValidEmail(selectedEmail)) {
    return selectedEmail;
  }

  const configuredEmail = normalizeEmailValue(
    process.env.COUNSELOR_EMAIL?.trim()
    || process.env.COUNSELLOR_EMAIL?.trim()
    || process.env.COUNSELOR_MAIL?.trim()
    || process.env.COUNSELLOR_MAIL?.trim()
    || ''
  );

  return isValidEmail(configuredEmail) ? configuredEmail : '';
}

function getGoogleCalendarConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID?.trim() || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || '',
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN?.trim() || '',
    calendarId: process.env.GOOGLE_CALENDAR_ID?.trim() || 'primary',
  };
}

function getMissingGoogleCalendarKeys(config) {
  const missing = [];

  if (!config.clientId) missing.push('GOOGLE_CLIENT_ID');
  if (!config.clientSecret) missing.push('GOOGLE_CLIENT_SECRET');
  if (!config.refreshToken) missing.push('GOOGLE_REFRESH_TOKEN');
  if (!config.calendarId) missing.push('GOOGLE_CALENDAR_ID');

  return missing;
}

function assertGoogleCalendarConfig(config = getGoogleCalendarConfig()) {
  const missing = getMissingGoogleCalendarKeys(config);

  if (missing.length > 0) {
    throw new Error(`Google Calendar is not configured. Missing: ${missing.join(', ')}`);
  }

  return config;
}

function parseTimeSlot(timeSlot) {
  const match = String(timeSlot || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!match) {
    throw new Error('Invalid time slot format');
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

  return { hours, minutes };
}

function toCalendarDateTime(date, hours, minutes) {
  return `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

function getSessionDateTimeRange(date, timeSlot) {
  const start = parseTimeSlot(timeSlot);
  const startMinutes = start.hours * 60 + start.minutes;
  const endMinutes = startMinutes + SESSION_DURATION_MINUTES;
  const endHours = Math.floor(endMinutes / 60);
  const endOnlyMinutes = endMinutes % 60;

  return {
    startDateTime: toCalendarDateTime(date, start.hours, start.minutes),
    endDateTime: toCalendarDateTime(date, endHours, endOnlyMinutes),
  };
}

function createOAuthClient(config) {
  const safeConfig = assertGoogleCalendarConfig(config);
  const client = new OAuth2Client(safeConfig.clientId, safeConfig.clientSecret);

  client.setCredentials({
    refresh_token: safeConfig.refreshToken,
  });

  return { client, calendarId: safeConfig.calendarId };
}

function extractMeetDetails(event) {
  const entryPoint =
    event?.conferenceData?.entryPoints?.find((item) => item.entryPointType === 'video')
    || event?.conferenceData?.entryPoints?.[0];
  const meetLink = entryPoint?.uri || event?.hangoutLink || '';
  const meetingCode =
    entryPoint?.accessCode
    || meetLink.split('/').filter(Boolean).pop()
    || '';

  if (!meetLink || !meetingCode) {
    throw new Error('Google Meet link was not created');
  }

  return { meetLink, meetingCode };
}

function getFallbackMeetLink() {
  return (
    process.env.COUNSELOR_MEET_LINK?.trim()
    || process.env.COUNSELLOR_MEET_LINK?.trim()
    || process.env.GOOGLE_MEET_LINK?.trim()
    || process.env.COUNSELOR_GOOGLE_MEET_LINK?.trim()
    || ''
  );
}

function buildFallbackMeetBooking(bookingDetails, reason) {
  const meetLink = getFallbackMeetLink();

  if (!meetLink) {
    throw new Error(reason);
  }

  const meetingCode = meetLink.split('/').filter(Boolean).pop() || 'configured-meet';
  const calendarEventId = [
    'configured-meet',
    bookingDetails.date,
    String(bookingDetails.timeSlot || '').replace(/\W+/g, '-').toLowerCase(),
    Date.now(),
  ].filter(Boolean).join('-');

  console.warn('[Google Calendar] Using configured fallback Meet link:', reason);

  return {
    meetLink,
    meetingCode,
    eventId: calendarEventId,
    calendarEventId,
    calendarLink: '',
    fallback: true,
  };
}

function buildEventAttendees(bookingDetails, counselorEmail) {
  const attendeeEmails = [
    normalizeEmailValue(bookingDetails.userEmail),
    normalizeEmailValue(counselorEmail),
  ].filter((email) => isValidEmail(email));

  return [...new Set(attendeeEmails)].map((email) => ({ email }));
}

function buildCalendarTargets(calendarId, counselorEmail) {
  const targets = [];

  if (isValidEmail(counselorEmail)) {
    targets.push({
      calendarId: counselorEmail,
      hostType: 'selected-counsellor',
    });
  }

  targets.push({
    calendarId,
    hostType: 'configured-calendar',
  });

  const seenCalendarIds = new Set();
  return targets.filter((target) => {
    const normalizedCalendarId = String(target.calendarId || '').trim().toLowerCase();

    if (!normalizedCalendarId || seenCalendarIds.has(normalizedCalendarId)) {
      return false;
    }

    seenCalendarIds.add(normalizedCalendarId);
    return true;
  });
}

function buildCalendarEventBody({
  attendees,
  bookingDetails,
  counselorName,
  counselorTitle,
  endDateTime,
  startDateTime,
  timezone,
}) {
  return {
    summary: 'AI Counselling Session',
    description: [
      'Counselling session booked through AI Counselling Portal',
      `Counsellor: ${counselorName}, ${counselorTitle}`,
      `Student: ${bookingDetails.userName}`,
      `Email: ${bookingDetails.userEmail}`,
      `Phone: ${bookingDetails.userPhone || 'Not provided'}`,
      `Help needed: ${bookingDetails.helpWith || 'Not provided'}`,
    ].join('\n'),
    start: {
      dateTime: startDateTime,
      timeZone: timezone,
    },
    end: {
      dateTime: endDateTime,
      timeZone: timezone,
    },
    attendees,
    guestsCanInviteOthers: false,
    guestsCanModify: false,
    guestsCanSeeOtherGuests: true,
    conferenceData: {
      createRequest: {
        requestId: `counseling-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        conferenceSolutionKey: {
          type: 'hangoutsMeet',
        },
      },
    },
  };
}

export async function createGoogleMeetBooking(bookingDetails) {
  const config = getGoogleCalendarConfig();
  const missingConfig = getMissingGoogleCalendarKeys(config);

  if (missingConfig.length > 0) {
    return buildFallbackMeetBooking(
      bookingDetails,
      `Missing Google Calendar configuration: ${missingConfig.join(', ')}`
    );
  }

  const { client, calendarId } = createOAuthClient(config);
  const timezone = bookingDetails.timezone || 'Asia/Calcutta';
  const { startDateTime, endDateTime } = getSessionDateTimeRange(
    bookingDetails.date,
    bookingDetails.timeSlot
  );
  const counselorEmail = getCounselorEmail(bookingDetails.counsellorEmail || bookingDetails.counselorEmail);
  const counselorName = bookingDetails.counsellorName || bookingDetails.counselorName || COUNSELLOR_NAME;
  const counselorTitle = bookingDetails.counsellorTitle || bookingDetails.counselorTitle || COUNSELLOR_TITLE;
  const attendees = buildEventAttendees(bookingDetails, counselorEmail);
  const calendarTargets = buildCalendarTargets(calendarId, counselorEmail);

  let insertResponse;
  let selectedCalendarTarget;
  let lastInsertError;

  for (const calendarTarget of calendarTargets) {
    const eventBody = buildCalendarEventBody({
      attendees,
      bookingDetails,
      counselorName,
      counselorTitle,
      endDateTime,
      startDateTime,
      timezone,
    });
    const encodedCalendarId = encodeURIComponent(calendarTarget.calendarId);

    try {
      console.info('[Google Calendar] POST /events', {
        calendarIdConfigured: Boolean(calendarTarget.calendarId),
        date: bookingDetails.date,
        timeSlot: bookingDetails.timeSlot,
        attendeeCount: eventBody.attendees.length,
        counselorInvited: isValidEmail(counselorEmail),
        hostType: calendarTarget.hostType,
      });

      insertResponse = await client.request({
        url: `${CALENDAR_API_BASE}/calendars/${encodedCalendarId}/events?conferenceDataVersion=1&sendUpdates=all`,
        method: 'POST',
        data: eventBody,
      });
      selectedCalendarTarget = calendarTarget;
      break;
    } catch (error) {
      lastInsertError = error;
      console.warn('[Google Calendar] Event creation target failed', {
        hostType: calendarTarget.hostType,
        message: error.message,
      });
    }
  }

  if (!insertResponse || !selectedCalendarTarget) {
    return buildFallbackMeetBooking(
      bookingDetails,
      `Google Calendar event creation failed: ${lastInsertError?.message || 'No calendar target accepted the event'}`
    );
  }

  const eventId = insertResponse.data?.id;

  if (!eventId) {
    throw new Error('Google Calendar event was not created');
  }

  let getResponse;
  const encodedSelectedCalendarId = encodeURIComponent(selectedCalendarTarget.calendarId);

  try {
    console.info('[Google Calendar] GET /events/:eventId', {
      calendarIdConfigured: Boolean(selectedCalendarTarget.calendarId),
      eventId,
      hostType: selectedCalendarTarget.hostType,
    });

    getResponse = await client.request({
      url: `${CALENDAR_API_BASE}/calendars/${encodedSelectedCalendarId}/events/${encodeURIComponent(eventId)}?conferenceDataVersion=1`,
      method: 'GET',
    });
  } catch (error) {
    return buildFallbackMeetBooking(
      bookingDetails,
      `Google Calendar event lookup failed: ${error.message}`
    );
  }

  const meetDetails = extractMeetDetails(getResponse.data);

  return {
    ...meetDetails,
    eventId,
    calendarEventId: eventId,
    calendarLink: getResponse.data?.htmlLink || '',
    calendarOrganizerEmail: getResponse.data?.organizer?.email || '',
    hostCalendarId: selectedCalendarTarget.calendarId,
    hostType: selectedCalendarTarget.hostType,
  };
}
