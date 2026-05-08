'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { config } = require('./lib/config');
const { encrypt, decrypt, isCiphertext, hashToken } = require('./lib/crypto');

const dataDir = config.dataDir;
const dbPath = path.join(dataDir, 'sde.db');

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_e) {
    return fallback;
  }
}

function serializeJson(value, fallback = {}) {
  return JSON.stringify(value ?? fallback);
}

// ---------------------------------------------------------------------------
// Schema (idempotent)
// ---------------------------------------------------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    appliedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fullName TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    mobile TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    lastLoginAt TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    tokenHash TEXT NOT NULL UNIQUE,
    createdAt TEXT NOT NULL,
    expiresAt TEXT NOT NULL,
    ipAddress TEXT,
    userAgent TEXT,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS extractions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    source TEXT NOT NULL,
    keyword TEXT,
    location TEXT,
    category TEXT,
    radius INTEGER,
    maxResults INTEGER,
    resultCount INTEGER,
    costInr REAL DEFAULT 0,
    costUsd REAL DEFAULT 0,
    createdAt TEXT NOT NULL,
    paramsJson TEXT,
    summaryJson TEXT,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS extraction_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    extractionId INTEGER NOT NULL,
    placeId TEXT,
    name TEXT,
    address TEXT,
    phone TEXT,
    website TEXT,
    rating REAL,
    reviews INTEGER,
    category TEXT,
    hours TEXT,
    status TEXT,
    lat REAL,
    lng REAL,
    rawData TEXT,
    FOREIGN KEY (extractionId) REFERENCES extractions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL UNIQUE,
    googleMapsApiKey TEXT,
    linkedinApiKey TEXT,
    googleMapsEnabled INTEGER NOT NULL DEFAULT 1,
    linkedinEnabled INTEGER NOT NULL DEFAULT 1,
    enrichmentEnabled INTEGER NOT NULL DEFAULT 1,
    dailyInrCeiling REAL DEFAULT 0,
    theme TEXT NOT NULL DEFAULT 'light',
    updatedAt TEXT NOT NULL,
    validationsJson TEXT,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    createdAt TEXT NOT NULL,
    ipAddress TEXT,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS geocode_cache (
    cacheKey TEXT PRIMARY KEY,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    formattedAddress TEXT,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    name TEXT NOT NULL,
    keyHash TEXT NOT NULL UNIQUE,
    keyPreview TEXT NOT NULL,
    scopes TEXT NOT NULL DEFAULT '*',
    createdAt TEXT NOT NULL,
    lastUsedAt TEXT,
    revokedAt TEXT,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    events TEXT NOT NULL DEFAULT 'job.completed',
    enabled INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    lastDeliveryAt TEXT,
    lastStatus INTEGER,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    progressJson TEXT,
    paramsJson TEXT NOT NULL,
    resultExtractionId INTEGER,
    error TEXT,
    createdAt TEXT NOT NULL,
    startedAt TEXT,
    finishedAt TEXT,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS scheduled_searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    name TEXT NOT NULL,
    cadence TEXT NOT NULL,
    paramsJson TEXT NOT NULL,
    nextRunAt TEXT NOT NULL,
    lastRunAt TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS provider_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    provider TEXT NOT NULL,
    name TEXT NOT NULL,
    encryptedKey TEXT NOT NULL,
    keyPreview TEXT NOT NULL,
    ceilingInr REAL DEFAULT 0,
    createdAt TEXT NOT NULL,
    revokedAt TEXT,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS provider_key_usage (
    keyId INTEGER NOT NULL,
    day TEXT NOT NULL,
    costInr REAL NOT NULL DEFAULT 0,
    calls INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (keyId, day),
    FOREIGN KEY (keyId) REFERENCES provider_keys(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(tokenHash);
  CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId);
  CREATE INDEX IF NOT EXISTS idx_extractions_userId_createdAt ON extractions(userId, createdAt DESC);
  CREATE INDEX IF NOT EXISTS idx_extraction_results_extractionId ON extraction_results(extractionId);
  CREATE INDEX IF NOT EXISTS idx_extraction_results_placeId ON extraction_results(placeId);
  CREATE INDEX IF NOT EXISTS idx_activity_logs_userId_createdAt ON activity_logs(userId, createdAt DESC);
  CREATE INDEX IF NOT EXISTS idx_jobs_user_status ON jobs(userId, status);
  CREATE INDEX IF NOT EXISTS idx_api_keys_userId ON api_keys(userId);
  CREATE INDEX IF NOT EXISTS idx_provider_keys_userId_provider ON provider_keys(userId, provider, revokedAt);
`);

// ---------------------------------------------------------------------------
// One-shot migrations (idempotent, recorded in schema_migrations)
// ---------------------------------------------------------------------------

const migrations = [
  {
    name: '0001_sessions_token_to_tokenhash',
    up: () => {
      // Older versions stored sessions.token (plaintext). If present, migrate.
      const cols = db
        .prepare("PRAGMA table_info('sessions')")
        .all()
        .map((c) => c.name);
      if (cols.includes('token') && !cols.includes('tokenHash')) {
        db.exec(`ALTER TABLE sessions ADD COLUMN tokenHash TEXT`);
        const rows = db.prepare('SELECT id, token FROM sessions').all();
        const upd = db.prepare('UPDATE sessions SET tokenHash = ? WHERE id = ?');
        const tx = db.transaction(() => {
          for (const row of rows) upd.run(hashToken(row.token), row.id);
        });
        tx();
      }
    },
  },
  {
    name: '0002_encrypt_api_keys_at_rest',
    up: () => {
      if (!config.masterKey) return; // skip until operator configures key
      const rows = db.prepare('SELECT userId, googleMapsApiKey, linkedinApiKey FROM settings').all();
      const upd = db.prepare(
        'UPDATE settings SET googleMapsApiKey = ?, linkedinApiKey = ?, updatedAt = ? WHERE userId = ?',
      );
      const tx = db.transaction(() => {
        for (const r of rows) {
          const g = r.googleMapsApiKey || '';
          const l = r.linkedinApiKey || '';
          const newG = g && !isCiphertext(g) ? encrypt(g) : g;
          const newL = l && !isCiphertext(l) ? encrypt(l) : l;
          if (newG !== g || newL !== l) upd.run(newG, newL, nowIso(), r.userId);
        }
      });
      tx();
    },
  },
];

function applyMigrations() {
  const get = db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?');
  const ins = db.prepare('INSERT INTO schema_migrations (name, appliedAt) VALUES (?, ?)');
  for (const m of migrations) {
    if (get.get(m.name)) continue;
    m.up();
    ins.run(m.name, nowIso());
  }
}

applyMigrations();

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

const statements = {
  // Users
  insertUser: db.prepare(
    `INSERT INTO users (fullName, email, passwordHash, mobile, createdAt) VALUES (@fullName, @email, @passwordHash, @mobile, @createdAt)`,
  ),
  getUserByEmail: db.prepare(
    `SELECT id, fullName, email, passwordHash, mobile, createdAt, lastLoginAt FROM users WHERE email = ?`,
  ),
  getUserById: db.prepare(
    `SELECT id, fullName, email, mobile, createdAt, lastLoginAt FROM users WHERE id = ?`,
  ),
  updateUserLastLogin: db.prepare(`UPDATE users SET lastLoginAt = ? WHERE id = ?`),

  // Sessions (token stored hashed)
  insertSession: db.prepare(
    `INSERT INTO sessions (userId, tokenHash, createdAt, expiresAt, ipAddress, userAgent) VALUES (@userId, @tokenHash, @createdAt, @expiresAt, @ipAddress, @userAgent)`,
  ),
  getSessionByTokenHash: db.prepare(
    `SELECT id, userId, tokenHash, createdAt, expiresAt, ipAddress, userAgent FROM sessions WHERE tokenHash = ?`,
  ),
  deleteSessionByTokenHash: db.prepare(`DELETE FROM sessions WHERE tokenHash = ?`),
  deleteSessionsByUser: db.prepare(`DELETE FROM sessions WHERE userId = ?`),
  deleteExpiredSessions: db.prepare(`DELETE FROM sessions WHERE expiresAt <= ?`),

  // Settings
  getSettingsByUserId: db.prepare(`SELECT * FROM settings WHERE userId = ?`),
  insertSettings: db.prepare(`
    INSERT INTO settings (userId, googleMapsApiKey, linkedinApiKey, googleMapsEnabled, linkedinEnabled, enrichmentEnabled, dailyInrCeiling, theme, updatedAt, validationsJson)
    VALUES (@userId, @googleMapsApiKey, @linkedinApiKey, @googleMapsEnabled, @linkedinEnabled, @enrichmentEnabled, @dailyInrCeiling, @theme, @updatedAt, @validationsJson)
  `),
  updateSettings: db.prepare(`
    UPDATE settings SET
      googleMapsApiKey = @googleMapsApiKey,
      linkedinApiKey = @linkedinApiKey,
      googleMapsEnabled = @googleMapsEnabled,
      linkedinEnabled = @linkedinEnabled,
      enrichmentEnabled = @enrichmentEnabled,
      dailyInrCeiling = @dailyInrCeiling,
      theme = @theme,
      updatedAt = @updatedAt,
      validationsJson = @validationsJson
    WHERE userId = @userId
  `),

  // Extractions
  insertExtraction: db.prepare(`
    INSERT INTO extractions (userId, source, keyword, location, category, radius, maxResults, resultCount, costInr, costUsd, createdAt, paramsJson, summaryJson)
    VALUES (@userId, @source, @keyword, @location, @category, @radius, @maxResults, @resultCount, @costInr, @costUsd, @createdAt, @paramsJson, @summaryJson)
  `),
  insertExtractionResult: db.prepare(`
    INSERT INTO extraction_results (extractionId, placeId, name, address, phone, website, rating, reviews, category, hours, status, lat, lng, rawData)
    VALUES (@extractionId, @placeId, @name, @address, @phone, @website, @rating, @reviews, @category, @hours, @status, @lat, @lng, @rawData)
  `),
  listExtractionsByUserId: db.prepare(`
    SELECT id, source, keyword, location, category, radius, maxResults, resultCount, costInr, costUsd, createdAt, paramsJson, summaryJson
    FROM extractions WHERE userId = ? ORDER BY datetime(createdAt) DESC, id DESC LIMIT ? OFFSET ?
  `),
  countExtractionsByUserId: db.prepare(`SELECT COUNT(*) AS n FROM extractions WHERE userId = ?`),
  getExtractionById: db.prepare(`
    SELECT id, userId, source, keyword, location, category, radius, maxResults, resultCount, costInr, costUsd, createdAt, paramsJson, summaryJson
    FROM extractions WHERE id = ?
  `),
  listExtractionResultsByExtractionId: db.prepare(`
    SELECT extractionId, placeId, name, address, phone, website, rating, reviews, category, hours, status, lat, lng, rawData
    FROM extraction_results WHERE extractionId = ? ORDER BY id ASC
  `),
  deleteExtractionByIdAndUserId: db.prepare(`DELETE FROM extractions WHERE id = ? AND userId = ?`),
  listUserPlaceIds: db.prepare(`
    SELECT DISTINCT er.placeId FROM extraction_results er
    INNER JOIN extractions e ON e.id = er.extractionId
    WHERE e.userId = ? AND er.placeId IS NOT NULL AND er.placeId <> ''
  `),
  sumCostInrSince: db.prepare(
    `SELECT COALESCE(SUM(costInr), 0) AS total FROM extractions WHERE userId = ? AND createdAt >= ?`,
  ),

  // Activity
  insertActivityLog: db.prepare(
    `INSERT INTO activity_logs (userId, action, details, createdAt, ipAddress) VALUES (@userId, @action, @details, @createdAt, @ipAddress)`,
  ),
  listActivityByUserId: db.prepare(
    `SELECT id, action, details, createdAt, ipAddress FROM activity_logs WHERE userId = ? ORDER BY datetime(createdAt) DESC, id DESC LIMIT ?`,
  ),

  // Geocode cache
  geoGet: db.prepare(
    `SELECT cacheKey, lat, lng, formattedAddress, updatedAt FROM geocode_cache WHERE cacheKey = ?`,
  ),
  geoSet:
    db.prepare(`INSERT INTO geocode_cache (cacheKey, lat, lng, formattedAddress, updatedAt) VALUES (@cacheKey, @lat, @lng, @formattedAddress, @updatedAt)
                      ON CONFLICT(cacheKey) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, formattedAddress = excluded.formattedAddress, updatedAt = excluded.updatedAt`),
  geoDel: db.prepare(`DELETE FROM geocode_cache WHERE cacheKey = ?`),

  // API keys (public REST API)
  insertApiKey: db.prepare(
    `INSERT INTO api_keys (userId, name, keyHash, keyPreview, scopes, createdAt) VALUES (@userId, @name, @keyHash, @keyPreview, @scopes, @createdAt)`,
  ),
  listApiKeysByUser: db.prepare(
    `SELECT id, name, keyPreview, scopes, createdAt, lastUsedAt, revokedAt FROM api_keys WHERE userId = ? ORDER BY id DESC`,
  ),
  getApiKeyByHash: db.prepare(
    `SELECT id, userId, name, keyHash, scopes, revokedAt FROM api_keys WHERE keyHash = ?`,
  ),
  touchApiKey: db.prepare(`UPDATE api_keys SET lastUsedAt = ? WHERE id = ?`),
  revokeApiKey: db.prepare(`UPDATE api_keys SET revokedAt = ? WHERE id = ? AND userId = ?`),

  // Webhooks
  insertWebhook: db.prepare(
    `INSERT INTO webhooks (userId, url, secret, events, enabled, createdAt) VALUES (@userId, @url, @secret, @events, @enabled, @createdAt)`,
  ),
  listWebhooksByUser: db.prepare(
    `SELECT id, url, events, enabled, createdAt, lastDeliveryAt, lastStatus FROM webhooks WHERE userId = ? ORDER BY id DESC`,
  ),
  listEnabledWebhooksForEvent: db.prepare(
    `SELECT id, userId, url, secret, events FROM webhooks WHERE userId = ? AND enabled = 1`,
  ),
  updateWebhookDelivery: db.prepare(`UPDATE webhooks SET lastDeliveryAt = ?, lastStatus = ? WHERE id = ?`),
  deleteWebhook: db.prepare(`DELETE FROM webhooks WHERE id = ? AND userId = ?`),

  // Jobs
  insertJob: db.prepare(
    `INSERT INTO jobs (userId, type, status, progressJson, paramsJson, createdAt) VALUES (@userId, @type, @status, @progressJson, @paramsJson, @createdAt)`,
  ),
  getJobById: db.prepare(`SELECT * FROM jobs WHERE id = ?`),
  listJobsByUser: db.prepare(
    `SELECT id, type, status, progressJson, paramsJson, resultExtractionId, error, createdAt, startedAt, finishedAt FROM jobs WHERE userId = ? ORDER BY id DESC LIMIT ?`,
  ),
  updateJobProgress: db.prepare(
    `UPDATE jobs SET progressJson = ?, status = ?, startedAt = COALESCE(startedAt, ?) WHERE id = ?`,
  ),
  finishJob: db.prepare(
    `UPDATE jobs SET status = ?, progressJson = ?, resultExtractionId = ?, error = ?, finishedAt = ? WHERE id = ?`,
  ),
  resumableJobs: db.prepare(`SELECT * FROM jobs WHERE status IN ('queued','running') ORDER BY id ASC`),

  // Scheduled searches
  insertSchedule: db.prepare(
    `INSERT INTO scheduled_searches (userId, name, cadence, paramsJson, nextRunAt, enabled, createdAt) VALUES (@userId, @name, @cadence, @paramsJson, @nextRunAt, @enabled, @createdAt)`,
  ),
  listSchedulesByUser: db.prepare(
    `SELECT id, name, cadence, paramsJson, nextRunAt, lastRunAt, enabled, createdAt FROM scheduled_searches WHERE userId = ? ORDER BY id DESC`,
  ),
  dueSchedules: db.prepare(`SELECT * FROM scheduled_searches WHERE enabled = 1 AND nextRunAt <= ?`),
  updateSchedule: db.prepare(`UPDATE scheduled_searches SET nextRunAt = ?, lastRunAt = ? WHERE id = ?`),
  deleteSchedule: db.prepare(`DELETE FROM scheduled_searches WHERE id = ? AND userId = ?`),

  // Provider keys (multi-key load balancing for Google + Apollo)
  insertProviderKey: db.prepare(`
    INSERT INTO provider_keys (userId, provider, name, encryptedKey, keyPreview, ceilingInr, createdAt)
    VALUES (@userId, @provider, @name, @encryptedKey, @keyPreview, @ceilingInr, @createdAt)
  `),
  listProviderKeysByUser: db.prepare(`
    SELECT id, userId, provider, name, encryptedKey, keyPreview, ceilingInr, createdAt, revokedAt
    FROM provider_keys WHERE userId = ? ORDER BY id ASC
  `),
  listActiveProviderKeysForUser: db.prepare(`
    SELECT id, userId, provider, name, encryptedKey, keyPreview, ceilingInr, createdAt
    FROM provider_keys WHERE userId = ? AND provider = ? AND revokedAt IS NULL ORDER BY id ASC
  `),
  revokeProviderKey: db.prepare(`UPDATE provider_keys SET revokedAt = ? WHERE id = ? AND userId = ?`),
  upsertProviderKeyUsage: db.prepare(`
    INSERT INTO provider_key_usage (keyId, day, costInr, calls)
    VALUES (@keyId, @day, @costInr, @calls)
    ON CONFLICT(keyId, day) DO UPDATE SET costInr = costInr + excluded.costInr, calls = calls + excluded.calls
  `),
  sumProviderKeyUsageSince: db.prepare(`
    SELECT keyId, COALESCE(SUM(costInr), 0) AS costInr, COALESCE(SUM(calls), 0) AS calls
    FROM provider_key_usage WHERE day >= ? GROUP BY keyId
  `),
  todayProviderKeyUsage: db.prepare(`
    SELECT COALESCE(SUM(costInr), 0) AS costInr FROM provider_key_usage WHERE keyId = ? AND day = ?
  `),
};

// ---------------------------------------------------------------------------
// Settings helpers (transparent encryption of API keys)
// ---------------------------------------------------------------------------

function defaultSettings() {
  return {
    googleMapsApiKey: '',
    linkedinApiKey: '',
    googleMapsEnabled: true,
    linkedinEnabled: true,
    enrichmentEnabled: config.enrichment.enabled,
    dailyInrCeiling: config.defaultDailyInrCeiling || 0,
    theme: 'light',
    validations: {
      googleMaps: { status: null, lastValidatedAt: null },
      linkedin: { status: null, lastValidatedAt: null },
    },
  };
}

function decryptSetting(value) {
  if (!value) return '';
  try {
    return decrypt(value);
  } catch (_e) {
    return '';
  }
}

function rowToSettings(row) {
  if (!row) return defaultSettings();
  const validations = parseJson(row.validationsJson, defaultSettings().validations);
  return {
    googleMapsApiKey: decryptSetting(row.googleMapsApiKey),
    linkedinApiKey: decryptSetting(row.linkedinApiKey),
    googleMapsEnabled: Boolean(row.googleMapsEnabled),
    linkedinEnabled: Boolean(row.linkedinEnabled),
    enrichmentEnabled:
      row.enrichmentEnabled == null ? config.enrichment.enabled : Boolean(row.enrichmentEnabled),
    dailyInrCeiling: Number(row.dailyInrCeiling || 0),
    theme: row.theme || 'light',
    updatedAt: row.updatedAt,
    validations: {
      googleMaps: { status: null, lastValidatedAt: null, ...(validations?.googleMaps || {}) },
      linkedin: { status: null, lastValidatedAt: null, ...(validations?.linkedin || {}) },
    },
  };
}

function ensureUserSettings(userId) {
  const existing = statements.getSettingsByUserId.get(userId);
  if (existing) return rowToSettings(existing);
  const d = defaultSettings();
  statements.insertSettings.run({
    userId,
    googleMapsApiKey: '',
    linkedinApiKey: '',
    googleMapsEnabled: d.googleMapsEnabled ? 1 : 0,
    linkedinEnabled: d.linkedinEnabled ? 1 : 0,
    enrichmentEnabled: d.enrichmentEnabled ? 1 : 0,
    dailyInrCeiling: d.dailyInrCeiling,
    theme: d.theme,
    updatedAt: nowIso(),
    validationsJson: serializeJson(d.validations),
  });
  return rowToSettings(statements.getSettingsByUserId.get(userId));
}

function saveUserSettings(userId, next) {
  const current = ensureUserSettings(userId);
  const merged = {
    ...current,
    ...(next || {}),
    validations: {
      ...current.validations,
      ...(next?.validations || {}),
      googleMaps: { ...current.validations.googleMaps, ...(next?.validations?.googleMaps || {}) },
      linkedin: { ...current.validations.linkedin, ...(next?.validations?.linkedin || {}) },
    },
  };

  statements.updateSettings.run({
    userId,
    googleMapsApiKey: merged.googleMapsApiKey ? encrypt(merged.googleMapsApiKey) : '',
    linkedinApiKey: merged.linkedinApiKey ? encrypt(merged.linkedinApiKey) : '',
    googleMapsEnabled: merged.googleMapsEnabled ? 1 : 0,
    linkedinEnabled: merged.linkedinEnabled ? 1 : 0,
    enrichmentEnabled: merged.enrichmentEnabled ? 1 : 0,
    dailyInrCeiling: Number(merged.dailyInrCeiling || 0),
    theme: merged.theme || 'light',
    updatedAt: nowIso(),
    validationsJson: serializeJson(merged.validations),
  });

  return ensureUserSettings(userId);
}

function updateSettingsValidation(userId, serviceKey, status, lastValidatedAt) {
  const cur = ensureUserSettings(userId);
  return saveUserSettings(userId, {
    validations: {
      ...cur.validations,
      [serviceKey]: { status, lastValidatedAt: lastValidatedAt || nowIso() },
    },
  });
}

// ---------------------------------------------------------------------------
// Extractions
// ---------------------------------------------------------------------------

const insertExtractionTx = db.transaction((payload) => {
  const info = statements.insertExtraction.run({
    userId: payload.userId,
    source: payload.source,
    keyword: payload.keyword || '',
    location: payload.location || '',
    category: payload.category || '',
    radius: payload.radius ?? null,
    maxResults: payload.maxResults ?? null,
    resultCount: payload.resultCount ?? 0,
    costInr: Number(payload.costInr || 0),
    costUsd: Number(payload.costUsd || 0),
    createdAt: payload.createdAt || nowIso(),
    paramsJson: serializeJson(payload.params || {}),
    summaryJson: serializeJson(payload.summary || {}),
  });
  const extractionId = Number(info.lastInsertRowid);
  for (const row of Array.isArray(payload.results) ? payload.results : []) {
    statements.insertExtractionResult.run({
      extractionId,
      placeId: row.placeId || row.id || row.profileUrl || null,
      name: row.name || '',
      address: row.address || row.headline || '',
      phone: row.phone || row.company || '',
      website: row.website || row.profileUrl || '',
      rating: Number.isFinite(Number(row.rating)) ? Number(row.rating) : null,
      reviews: Number.isFinite(Number(row.reviews ?? row.followerCount))
        ? Number(row.reviews ?? row.followerCount)
        : null,
      category: row.category || row.industry || '',
      hours: row.hours || row.location || '',
      status: row.status || row.role || '',
      lat: Number.isFinite(Number(row.latitude ?? row.lat)) ? Number(row.latitude ?? row.lat) : null,
      lng: Number.isFinite(Number(row.longitude ?? row.lng)) ? Number(row.longitude ?? row.lng) : null,
      rawData: serializeJson(row, {}),
    });
  }
  return extractionId;
});

function mapStoredResult(row) {
  const raw = parseJson(row.rawData, null);
  if (raw && typeof raw === 'object') return raw;
  return {
    id: row.placeId || row.id,
    placeId: row.placeId || '',
    name: row.name || '',
    address: row.address || '',
    phone: row.phone || '',
    website: row.website || '',
    rating: row.rating ?? '',
    reviews: row.reviews ?? '',
    category: row.category || '',
    hours: row.hours || '',
    status: row.status || '',
    latitude: row.lat ?? '',
    longitude: row.lng ?? '',
  };
}

function createExtraction(payload) {
  const id = insertExtractionTx(payload);
  return getExtractionForUser(payload.userId, id);
}

function getExtractionForUser(userId, id) {
  const ex = statements.getExtractionById.get(id);
  if (!ex || ex.userId !== userId) return null;
  return {
    id: ex.id,
    timestamp: ex.createdAt,
    source: ex.source,
    count: ex.resultCount,
    status: 'completed',
    params: parseJson(ex.paramsJson, {}),
    results: statements.listExtractionResultsByExtractionId.all(ex.id).map(mapStoredResult),
    cost: { inr: Number(ex.costInr || 0), usd: Number(ex.costUsd || 0), currency: 'INR' },
    summary: parseJson(ex.summaryJson, {}),
  };
}

function getExtractionHistoryByUser(userId, { limit = 50, offset = 0 } = {}) {
  const rows = statements.listExtractionsByUserId.all(userId, limit, offset);
  return rows.map((row) => ({
    id: row.id,
    timestamp: row.createdAt,
    source: row.source,
    count: row.resultCount,
    status: 'completed',
    params: parseJson(row.paramsJson, {}),
    results: statements.listExtractionResultsByExtractionId.all(row.id).map(mapStoredResult),
    cost: { inr: Number(row.costInr || 0), usd: Number(row.costUsd || 0), currency: 'INR' },
    summary: parseJson(row.summaryJson, {}),
  }));
}

function countExtractionsForUser(userId) {
  return Number(statements.countExtractionsByUserId.get(userId).n || 0);
}

function getUserPlaceIds(userId) {
  return statements.listUserPlaceIds.all(userId).map((r) => r.placeId);
}

function spendInrSince(userId, sinceIso) {
  return Number(statements.sumCostInrSince.get(userId, sinceIso).total || 0);
}

// ---------------------------------------------------------------------------
// Users / sessions
// ---------------------------------------------------------------------------

function createUser({ fullName, email, passwordHash, mobile }) {
  const createdAt = nowIso();
  const info = statements.insertUser.run({ fullName, email, passwordHash, mobile, createdAt });
  return statements.getUserById.get(Number(info.lastInsertRowid));
}

function createSession({ userId, token, expiresAt, ipAddress, userAgent }) {
  const createdAt = nowIso();
  statements.insertSession.run({
    userId,
    tokenHash: hashToken(token),
    createdAt,
    expiresAt,
    ipAddress: ipAddress || '',
    userAgent: userAgent || '',
  });
  statements.updateUserLastLogin.run(createdAt, userId);
  return { userId, createdAt, expiresAt };
}

function getSessionByToken(token) {
  if (!token) return null;
  statements.deleteExpiredSessions.run(nowIso());
  return statements.getSessionByTokenHash.get(hashToken(token)) || null;
}

function deleteSession(token) {
  return statements.deleteSessionByTokenHash.run(hashToken(token));
}

function deleteAllSessionsForUser(userId) {
  return statements.deleteSessionsByUser.run(userId);
}

// ---------------------------------------------------------------------------
// Activity / API keys / Webhooks / Jobs / Schedules
// ---------------------------------------------------------------------------

function logActivity({ userId, action, details, ipAddress }) {
  statements.insertActivityLog.run({
    userId,
    action,
    details: serializeJson(details || {}),
    createdAt: nowIso(),
    ipAddress: ipAddress || '',
  });
}

function getActivityLogsByUser(userId, limit = 10) {
  return statements.listActivityByUserId.all(userId, limit).map((row) => ({
    id: row.id,
    action: row.action,
    details: parseJson(row.details, {}),
    createdAt: row.createdAt,
    ipAddress: row.ipAddress,
  }));
}

const apiKeys = {
  create: ({ userId, name, keyHash, keyPreview, scopes = '*' }) => {
    statements.insertApiKey.run({ userId, name, keyHash, keyPreview, scopes, createdAt: nowIso() });
  },
  listForUser: (userId) => statements.listApiKeysByUser.all(userId),
  getByHash: (keyHash) => statements.getApiKeyByHash.get(keyHash) || null,
  touch: (id) => statements.touchApiKey.run(nowIso(), id),
  revoke: (userId, id) => statements.revokeApiKey.run(nowIso(), id, userId),
};

const webhooks = {
  create: ({ userId, url, secret, events, enabled = 1 }) =>
    statements.insertWebhook.run({ userId, url, secret, events, enabled, createdAt: nowIso() }),
  listForUser: (userId) => statements.listWebhooksByUser.all(userId),
  listEnabledFor: (userId) => statements.listEnabledWebhooksForEvent.all(userId),
  recordDelivery: (id, status) => statements.updateWebhookDelivery.run(nowIso(), status, id),
  delete: (userId, id) => statements.deleteWebhook.run(id, userId),
};

const jobs = {
  create: ({ userId, type, params }) => {
    const info = statements.insertJob.run({
      userId,
      type,
      status: 'queued',
      progressJson: serializeJson({ done: 0, total: 0, message: 'Queued' }),
      paramsJson: serializeJson(params || {}),
      createdAt: nowIso(),
    });
    return Number(info.lastInsertRowid);
  },
  get: (id) => {
    const r = statements.getJobById.get(id);
    if (!r) return null;
    return { ...r, progress: parseJson(r.progressJson, {}), params: parseJson(r.paramsJson, {}) };
  },
  listForUser: (userId, limit = 50) =>
    statements.listJobsByUser.all(userId, limit).map((r) => ({
      ...r,
      progress: parseJson(r.progressJson, {}),
      params: parseJson(r.paramsJson, {}),
    })),
  updateProgress: (id, status, progress) =>
    statements.updateJobProgress.run(serializeJson(progress || {}), status, nowIso(), id),
  finish: (id, { status, progress, resultExtractionId, error }) =>
    statements.finishJob.run(
      status,
      serializeJson(progress || {}),
      resultExtractionId || null,
      error || null,
      nowIso(),
      id,
    ),
  listResumable: () =>
    statements.resumableJobs
      .all()
      .map((r) => ({ ...r, progress: parseJson(r.progressJson, {}), params: parseJson(r.paramsJson, {}) })),
};

const schedules = {
  create: ({ userId, name, cadence, params, nextRunAt, enabled = 1 }) =>
    statements.insertSchedule.run({
      userId,
      name,
      cadence,
      paramsJson: serializeJson(params || {}),
      nextRunAt,
      enabled,
      createdAt: nowIso(),
    }),
  listForUser: (userId) =>
    statements.listSchedulesByUser.all(userId).map((r) => ({ ...r, params: parseJson(r.paramsJson, {}) })),
  due: () => statements.dueSchedules.all().map((r) => ({ ...r, params: parseJson(r.paramsJson, {}) })),
  reschedule: (id, nextRunAt) => statements.updateSchedule.run(nextRunAt, nowIso(), id),
  delete: (userId, id) => statements.deleteSchedule.run(id, userId),
};

const geocodeCache = {
  get: (cacheKey) => {
    const r = statements.geoGet.get(cacheKey);
    return r
      ? { lat: r.lat, lng: r.lng, formattedAddress: r.formattedAddress, updatedAt: r.updatedAt }
      : null;
  },
  set: (cacheKey, value) => {
    statements.geoSet.run({
      cacheKey,
      lat: Number(value.lat),
      lng: Number(value.lng),
      formattedAddress: value.formattedAddress || '',
      updatedAt: nowIso(),
    });
  },
  del: (cacheKey) => statements.geoDel.run(cacheKey),
};

const providerKeys = {
  /**
   * Add a new provider key. The plaintext key is encrypted before insert.
   * Returns the new row id.
   */
  create: ({ userId, provider, name, key, ceilingInr = 0 }) => {
    const enc = encrypt(String(key));
    const preview = key.length <= 8 ? '****' : `${key.slice(0, 4)}…${key.slice(-4)}`;
    const info = statements.insertProviderKey.run({
      userId,
      provider,
      name: name || `${provider} key ${Date.now()}`,
      encryptedKey: enc,
      keyPreview: preview,
      ceilingInr: Number(ceilingInr || 0),
      createdAt: nowIso(),
    });
    return Number(info.lastInsertRowid);
  },
  /** All keys (active + revoked) for a user — used by the settings UI. */
  listForUser: (userId) =>
    statements.listProviderKeysByUser.all(userId).map((r) => ({
      id: r.id,
      provider: r.provider,
      name: r.name,
      keyPreview: r.keyPreview,
      ceilingInr: Number(r.ceilingInr || 0),
      createdAt: r.createdAt,
      revokedAt: r.revokedAt,
    })),
  /**
   * Active keys for a user+provider, with plaintext decrypted. Returns [] when
   * none exist; the caller is expected to fall back to the legacy single-key
   * field on settings (back-compat).
   */
  activeForUserProvider: (userId, provider) => {
    return statements.listActiveProviderKeysForUser.all(userId, provider).map((r) => {
      let plaintext = '';
      try {
        plaintext = decrypt(r.encryptedKey);
      } catch (_e) {
        plaintext = '';
      }
      return {
        id: r.id,
        provider: r.provider,
        name: r.name,
        key: plaintext,
        keyPreview: r.keyPreview,
        ceilingInr: Number(r.ceilingInr || 0),
        createdAt: r.createdAt,
      };
    });
  },
  revoke: (userId, id) => statements.revokeProviderKey.run(nowIso(), id, userId),
  /** Charge cost against a key for today. */
  recordUsage: (keyId, costInr, calls = 1) => {
    statements.upsertProviderKeyUsage.run({
      keyId,
      day: new Date().toISOString().slice(0, 10),
      costInr: Number(costInr || 0),
      calls: Number(calls || 0),
    });
  },
  /** Today's spend for one key (for ceiling enforcement). */
  todayCostInr: (keyId) =>
    Number(statements.todayProviderKeyUsage.get(keyId, new Date().toISOString().slice(0, 10)).costInr || 0),
  /** Aggregate usage rows since a given day (YYYY-MM-DD) for analytics. */
  usageSince: (sinceDay) => statements.sumProviderKeyUsageSince.all(sinceDay),
};

function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    mobile: row.mobile,
    createdAt: row.createdAt,
    lastLoginAt: row.lastLoginAt,
  };
}

module.exports = {
  db,
  nowIso,
  // users / sessions
  createUser,
  getUserByEmail(email) {
    return statements.getUserByEmail.get(String(email || '').toLowerCase()) || null;
  },
  getUserById(userId) {
    return toPublicUser(statements.getUserById.get(userId));
  },
  toPublicUser,
  createSession,
  getSessionByToken,
  deleteSession,
  deleteAllSessionsForUser,
  // settings
  defaultSettings,
  ensureUserSettings,
  saveUserSettings,
  updateSettingsValidation,
  // extractions
  createExtraction,
  getExtractionHistoryByUser,
  countExtractionsForUser,
  getExtractionForUser,
  deleteExtraction(userId, id) {
    return statements.deleteExtractionByIdAndUserId.run(id, userId);
  },
  getUserPlaceIds,
  spendInrSince,
  // activity
  logActivity,
  getActivityLogsByUser,
  // public API + automation
  apiKeys,
  webhooks,
  jobs,
  schedules,
  geocodeCache,
  providerKeys,
};
