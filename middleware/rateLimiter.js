import { normalizeEmailValue } from '../utils/emailValidation.js';

const rateLimitMap = new Map();

// Periodic cleanup of expired rate limit entries to prevent memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 10 * 60 * 1000).unref(); // Clean every 10 minutes, unref so it won't keep process alive

export const rateLimiter = (options) => {
  const { windowMs, max, message } = options;
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-ip';
    const email = req.body?.email ? normalizeEmailValue(req.body.email) : '';
    
    // Track combined IP + email + path limit to block distributed and targeted attacks
    const key = `${ip}:${email}:${req.originalUrl}`;

    const now = Date.now();
    let record = rateLimitMap.get(key);

    if (!record) {
      record = {
        hits: 1,
        resetTime: now + windowMs,
      };
      rateLimitMap.set(key, record);
    } else {
      if (now > record.resetTime) {
        record.hits = 1;
        record.resetTime = now + windowMs;
      } else {
        record.hits += 1;
      }
    }

    if (record.hits > max) {
      return res.status(429).json({
        message: message || 'Too many requests. Please try again later.',
      });
    }

    next();
  };
};
