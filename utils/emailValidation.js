export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function extractMailboxEmail(value) {
  const trimmedValue = String(value ?? '').trim();

  if (!trimmedValue) {
    return '';
  }

  const mailboxMatch = trimmedValue.match(/<\s*([^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)\s*>/);
  if (mailboxMatch?.[1] && EMAIL_PATTERN.test(mailboxMatch[1])) {
    return mailboxMatch[1].toLowerCase();
  }

  const leadingEmailMatch = trimmedValue.match(/^([^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)\s*</);
  if (leadingEmailMatch?.[1] && EMAIL_PATTERN.test(leadingEmailMatch[1])) {
    return leadingEmailMatch[1].toLowerCase();
  }

  return '';
}

export function normalizeEmailValue(value) {
  const trimmedValue = String(value ?? '').trim();

  if (!trimmedValue) {
    return '';
  }

  if (EMAIL_PATTERN.test(trimmedValue)) {
    return trimmedValue.toLowerCase();
  }

  return extractMailboxEmail(trimmedValue) || trimmedValue.toLowerCase();
}

export function isValidEmail(value) {
  return EMAIL_PATTERN.test(normalizeEmailValue(value));
}
