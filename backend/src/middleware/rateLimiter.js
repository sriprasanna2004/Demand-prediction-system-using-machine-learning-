/**
 * Simple in-memory rate limiter (no Redis dependency for dev).
 * In production, swap the store for ioredis + sliding window.
 *
 * Usage: app.use('/api/predict', rateLimiter({ max: 30, windowMs: 60000 }))
 */
function rateLimiter({ max = 60, windowMs = 60000, message = 'Too many requests' } = {}) {
  const store = new Map(); // ip -> { count, resetAt }

  // Periodically purge expired entries to prevent memory leak
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of store.entries()) {
      if (now > entry.resetAt) store.delete(ip);
    }
  }, windowMs);
  if (cleanup.unref) cleanup.unref(); // don't block process exit

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = store.get(ip);

    if (!entry || now > entry.resetAt) {
      store.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;

    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ success: false, error: message });
    }

    next();
  };
}

module.exports = rateLimiter;
