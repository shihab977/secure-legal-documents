const rateLimit = require('express-rate-limit');

const isDev = process.env.NODE_ENV !== 'production';

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: isDev ? 100 : 30, // 100 requests per 15m in dev, 30 in production
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts from this IP. Please try again after 15 minutes.'
  }
});

module.exports = { authRateLimiter };
