'use strict';

const database = require('../database');
const { hashToken } = require('../lib/crypto');
const { AuthError } = require('../lib/errors');

function getBearer(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  if (req.query?.token) return String(req.query.token).trim();
  return '';
}

function getApiKey(req) {
  const h = req.headers['x-api-key'];
  if (typeof h === 'string' && h) return h.trim();
  const auth = req.headers.authorization || '';
  if (auth.startsWith('ApiKey ')) return auth.slice(7).trim();
  return '';
}

function verifyBearer(req) {
  const token = getBearer(req);
  if (!token) return null;
  const session = database.getSessionByToken(token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    database.deleteSession(token);
    return null;
  }
  return { userId: session.userId, token };
}

function verifyApiKey(req) {
  const key = getApiKey(req);
  if (!key) return null;
  const row = database.apiKeys.getByHash(hashToken(key));
  if (!row || row.revokedAt) return null;
  database.apiKeys.touch(row.id);
  return { userId: row.userId, apiKeyId: row.id, scopes: String(row.scopes || '*') };
}

function requireSession(req, res, next) {
  const session = verifyBearer(req);
  if (!session) return next(new AuthError());
  req.auth = session;
  next();
}

function requireSessionOrApiKey(req, res, next) {
  const session = verifyBearer(req);
  if (session) {
    req.auth = session;
    return next();
  }
  const apiKey = verifyApiKey(req);
  if (apiKey) {
    req.auth = apiKey;
    return next();
  }
  return next(new AuthError());
}

function requireApiKey(req, res, next) {
  const apiKey = verifyApiKey(req);
  if (!apiKey) return next(new AuthError('API key required.'));
  req.auth = apiKey;
  next();
}

module.exports = { requireSession, requireSessionOrApiKey, requireApiKey, getBearer, getApiKey };
