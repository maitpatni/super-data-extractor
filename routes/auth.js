'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const database = require('../database');
const { ValidationError, AuthError } = require('../lib/errors');
const { config } = require('../lib/config');
const { requireSession } = require('../middleware/auth');
const { loginLimiter, registerLimiter } = require('../middleware/rate-limit');

const router = express.Router();

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (Array.isArray(fwd)) return fwd[0];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || '';
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim()) && String(email || '').length <= 254;
}

function normalizeMobile(m) {
  return String(m || '').replace(/\D/g, '');
}

router.post('/register', registerLimiter, async (req, res, next) => {
  try {
    const fullName = String(req.body?.fullName || '')
      .trim()
      .slice(0, 200);
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || '');
    const mobile = normalizeMobile(req.body?.mobile);

    if (!fullName) throw new ValidationError('Full name is required.');
    if (!validateEmail(email)) throw new ValidationError('Valid email is required.');
    if (password.length < 8 || password.length > 1024)
      throw new ValidationError('Password must be 8–1024 characters.');
    if (!/^\d{10}$/.test(mobile)) throw new ValidationError('Mobile number must contain exactly 10 digits.');
    if (database.getUserByEmail(email))
      throw new ValidationError('An account with this email already exists.');

    const passwordHash = await bcrypt.hash(password, 10);
    const user = database.createUser({ fullName, email, passwordHash, mobile });
    database.ensureUserSettings(user.id);

    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000).toISOString();
    database.createSession({
      userId: user.id,
      token,
      expiresAt,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] || '',
    });
    database.logActivity({
      userId: user.id,
      action: 'register',
      details: { email },
      ipAddress: getClientIp(req),
    });
    res.json({ success: true, token, user: database.toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || '');
    const user = database.getUserByEmail(email);
    // Constant-ish time compare path even when user is missing.
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !ok) throw new AuthError('Invalid email or password.');
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000).toISOString();
    database.createSession({
      userId: user.id,
      token,
      expiresAt,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] || '',
    });
    database.logActivity({
      userId: user.id,
      action: 'login',
      details: { email },
      ipAddress: getClientIp(req),
    });
    res.json({ success: true, token, user: database.toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireSession, (req, res, next) => {
  try {
    database.deleteSession(req.auth.token);
    database.logActivity({
      userId: req.auth.userId,
      action: 'logout',
      details: {},
      ipAddress: getClientIp(req),
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/logout-all', requireSession, (req, res, next) => {
  try {
    database.deleteAllSessionsForUser(req.auth.userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireSession, (req, res, next) => {
  try {
    const user = database.getUserById(req.auth.userId);
    if (!user) throw new AuthError('Invalid session.');
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
