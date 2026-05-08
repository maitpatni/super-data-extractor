'use strict';

const crypto = require('crypto');
const { ForbiddenError, NotFoundError } = require('./errors');

const sessions = new Map();
const SESSION_TTL_MS = 60 * 60 * 1000; // 1h

function newSessionId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function buildPayload(s) {
  return {
    sessionId: s.sessionId,
    status: s.status,
    fetched: s.fetched,
    total: s.total,
    eta: s.eta,
    currentPlace: s.currentPlace,
    message: s.message,
    startedAt: s.startedAt,
    updatedAt: s.updatedAt,
    completedAt: s.completedAt || null,
    error: s.error || null,
    stage: s.stage || null,
    strategy: s.strategy || null,
    gridPoint: s.gridPoint || 0,
    totalPoints: s.totalPoints || 0,
    skippedDuplicates: s.skippedDuplicates || 0,
    skippedExcluded: s.skippedExcluded || 0,
    failedCells: s.failedCells || [],
  };
}

function emit(s) {
  const payload = buildPayload(s);
  for (const client of s.clients) {
    try {
      client.write('event: progress\n');
      client.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (_e) {
      /* client gone */
    }
  }
}

/**
 * Create a brand-new progress session bound to `userId`. Returns the new session.
 */
function createSession(userId, initial = {}) {
  if (!userId) throw new Error('userId required');
  const sessionId = newSessionId();
  const session = {
    sessionId,
    userId,
    clients: new Set(),
    status: 'pending',
    fetched: 0,
    total: 0,
    eta: null,
    currentPlace: '',
    message: 'Waiting to start',
    error: null,
    startedAt: nowIso(),
    updatedAt: nowIso(),
    completedAt: null,
    stage: 'pending',
    strategy: '',
    gridPoint: 0,
    totalPoints: 0,
    skippedDuplicates: 0,
    skippedExcluded: 0,
    failedCells: [],
    ...initial,
  };
  sessions.set(sessionId, session);
  return session;
}

function getSession(sessionId, userId) {
  const s = sessions.get(sessionId);
  if (!s) throw new NotFoundError('Progress session not found.');
  if (s.userId !== userId) throw new ForbiddenError('You do not own this progress session.');
  return s;
}

function update(sessionId, userId, patch = {}) {
  const s = getSession(sessionId, userId);
  Object.assign(s, patch, { updatedAt: nowIso() });
  emit(s);
  return s;
}

function finish(sessionId, userId, patch = {}) {
  const s = getSession(sessionId, userId);
  Object.assign(s, patch, { updatedAt: nowIso(), completedAt: nowIso() });
  emit(s);
  for (const client of s.clients) {
    try {
      client.write('event: done\n');
      client.write(`data: ${JSON.stringify(buildPayload(s))}\n\n`);
      client.end();
    } catch (_e) {
      /* client gone */
    }
  }
  s.clients.clear();
  setTimeout(() => sessions.delete(sessionId), SESSION_TTL_MS);
  return s;
}

function attach(sessionId, userId, res) {
  const s = getSession(sessionId, userId);
  s.clients.add(res);
  res.write('event: progress\n');
  res.write(`data: ${JSON.stringify(buildPayload(s))}\n\n`);
  return s;
}

function detach(sessionId, res) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.clients.delete(res);
}

// Background prune of stale sessions
setInterval(
  () => {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [id, s] of sessions.entries()) {
      if (new Date(s.updatedAt).getTime() < cutoff) {
        for (const c of s.clients)
          try {
            c.end();
          } catch (_e) {
            /* noop */
          }
        sessions.delete(id);
      }
    }
  },
  5 * 60 * 1000,
).unref?.();

module.exports = { createSession, getSession, update, finish, attach, detach };
