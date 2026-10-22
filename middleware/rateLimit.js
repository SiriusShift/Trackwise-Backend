import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const build = ({ windowMs, limit, message, keyGenerator }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator,
    handler: (req, res) =>
      res.status(429).json({ success: false, message }),
  });

// Key by IP + target email so one attacker can't lock out everyone behind
// a shared IP, and can't hammer a single account by rotating nothing.
const byIpAndEmail = (req) => {
  const email = String(req.body?.email ?? "").toLowerCase();
  return `${ipKeyGenerator(req.ip)}:${email}`;
};

// Login: slow down credential stuffing / password guessing.
export const signInLimiter = build({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: "Too many sign-in attempts. Please try again in 15 minutes.",
  keyGenerator: byIpAndEmail,
});

// Endpoints that send email (OTP / reset link): prevent mail bombing.
export const emailSendLimiter = build({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: "Too many requests. Please try again later.",
  keyGenerator: byIpAndEmail,
});

// Per-IP cap across ALL target emails. emailSendLimiter keys on IP + email, so
// on its own a single client could send to unlimited distinct addresses.
export const emailIpLimiter = build({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: "Too many requests. Please try again later.",
});

// Reset-password: the code is only 6 digits, so guesses must be tightly capped.
// Keyed by email alone (not IP) so rotating IPs can't multiply the attempts.
export const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => String(req.body?.email ?? "").toLowerCase(),
  handler: (req, res) =>
    res.status(429).json({
      success: false,
      message: "Too many reset attempts. Please try again later.",
    }),
});

// Change-password: the current password is checked, so cap guesses per user.
export const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => String(req.user?.id ?? req.ip),
  handler: (req, res) =>
    res.status(429).json({
      success: false,
      message: "Too many attempts. Please try again later.",
    }),
});

// Generic cap for other unauthenticated auth endpoints.
export const authLimiter = build({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: "Too many requests. Please try again later.",
});


export const scanImageLimiter = build({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: "Too many requests. Please try again later.",
});