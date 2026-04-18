const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, 'data');
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
  } catch (error) {
    return fallback;
  }
}

function serializeJson(value, fallback = {}) {
  return JSON.stringify(value ?? fallback);
}

db.exec(`
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
    token TEXT NOT NULL UNIQUE,
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
    theme TEXT NOT NULL DEFAULT 'dark',
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

  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
  CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId);
  CREATE INDEX IF NOT EXISTS idx_extractions_userId_createdAt ON extractions(userId, createdAt DESC);
  CREATE INDEX IF NOT EXISTS idx_extraction_results_extractionId ON extraction_results(extractionId);
  CREATE INDEX IF NOT EXISTS idx_activity_logs_userId_createdAt ON activity_logs(userId, createdAt DESC);
`);

const statements = {
  insertUser: db.prepare(`
    INSERT INTO users (fullName, email, passwordHash, mobile, createdAt)
    VALUES (@fullName, @email, @passwordHash, @mobile, @createdAt)
  `),
  getUserByEmail: db.prepare(`
    SELECT id, fullName, email, passwordHash, mobile, createdAt, lastLoginAt
    FROM users
    WHERE email = ?
  `),
  getUserById: db.prepare(`
    SELECT id, fullName, email, mobile, createdAt, lastLoginAt
    FROM users
    WHERE id = ?
  `),
  updateUserLastLogin: db.prepare(`
    UPDATE users
    SET lastLoginAt = ?
    WHERE id = ?
  `),
  insertSession: db.prepare(`
    INSERT INTO sessions (userId, token, createdAt, expiresAt, ipAddress, userAgent)
    VALUES (@userId, @token, @createdAt, @expiresAt, @ipAddress, @userAgent)
  `),
  getSessionByToken: db.prepare(`
    SELECT s.id, s.userId, s.token, s.createdAt, s.expiresAt, s.ipAddress, s.userAgent
    FROM sessions s
    WHERE s.token = ?
  `),
  deleteSessionByToken: db.prepare(`DELETE FROM sessions WHERE token = ?`),
  deleteExpiredSessions: db.prepare(`DELETE FROM sessions WHERE expiresAt <= ?`),
  getSettingsByUserId: db.prepare(`
    SELECT id, userId, googleMapsApiKey, linkedinApiKey, googleMapsEnabled, linkedinEnabled, theme, updatedAt, validationsJson
    FROM settings
    WHERE userId = ?
  `),
  insertSettings: db.prepare(`
    INSERT INTO settings (userId, googleMapsApiKey, linkedinApiKey, googleMapsEnabled, linkedinEnabled, theme, updatedAt, validationsJson)
    VALUES (@userId, @googleMapsApiKey, @linkedinApiKey, @googleMapsEnabled, @linkedinEnabled, @theme, @updatedAt, @validationsJson)
  `),
  updateSettings: db.prepare(`
    UPDATE settings
    SET googleMapsApiKey = @googleMapsApiKey,
        linkedinApiKey = @linkedinApiKey,
        googleMapsEnabled = @googleMapsEnabled,
        linkedinEnabled = @linkedinEnabled,
        theme = @theme,
        updatedAt = @updatedAt,
        validationsJson = @validationsJson
    WHERE userId = @userId
  `),
  insertExtraction: db.prepare(`
    INSERT INTO extractions (userId, source, keyword, location, category, radius, maxResults, resultCount, costInr, createdAt, paramsJson, summaryJson)
    VALUES (@userId, @source, @keyword, @location, @category, @radius, @maxResults, @resultCount, @costInr, @createdAt, @paramsJson, @summaryJson)
  `),
  insertExtractionResult: db.prepare(`
    INSERT INTO extraction_results (extractionId, placeId, name, address, phone, website, rating, reviews, category, hours, status, lat, lng, rawData)
    VALUES (@extractionId, @placeId, @name, @address, @phone, @website, @rating, @reviews, @category, @hours, @status, @lat, @lng, @rawData)
  `),
  listExtractionsByUserId: db.prepare(`
    SELECT id, source, keyword, location, category, radius, maxResults, resultCount, costInr, createdAt, paramsJson, summaryJson
    FROM extractions
    WHERE userId = ?
    ORDER BY datetime(createdAt) DESC, id DESC
    LIMIT ?
  `),
  getExtractionById: db.prepare(`
    SELECT id, source, keyword, location, category, radius, maxResults, resultCount, costInr, createdAt, paramsJson, summaryJson
    FROM extractions
    WHERE id = ?
  `),
  listExtractionResultsByExtractionId: db.prepare(`
    SELECT extractionId, placeId, name, address, phone, website, rating, reviews, category, hours, status, lat, lng, rawData
    FROM extraction_results
    WHERE extractionId = ?
    ORDER BY id ASC
  `),
  deleteExtractionByIdAndUserId: db.prepare(`
    DELETE FROM extractions
    WHERE id = ? AND userId = ?
  `),
  insertActivityLog: db.prepare(`
    INSERT INTO activity_logs (userId, action, details, createdAt, ipAddress)
    VALUES (@userId, @action, @details, @createdAt, @ipAddress)
  `),
  listActivityByUserId: db.prepare(`
    SELECT id, action, details, createdAt, ipAddress
    FROM activity_logs
    WHERE userId = ?
    ORDER BY datetime(createdAt) DESC, id DESC
    LIMIT ?
  `),
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

function normalizeSettingsRow(row, defaults = {}) {
  const base = {
    googleMapsApiKey: '',
    linkedinApiKey: '',
    googleMapsEnabled: true,
    linkedinEnabled: true,
    theme: 'dark',
    validations: {
      googleMaps: { status: null, lastValidatedAt: null },
      linkedin: { status: null, lastValidatedAt: null },
    },
    ...(defaults || {}),
  };

  if (!row) {
    return {
      ...base,
      validations: {
        ...base.validations,
        googleMaps: { ...base.validations.googleMaps },
        linkedin: { ...base.validations.linkedin },
      },
    };
  }

  const validations = parseJson(row.validationsJson, base.validations);
  return {
    ...base,
    googleMapsApiKey: row.googleMapsApiKey || '',
    linkedinApiKey: row.linkedinApiKey || '',
    googleMapsEnabled: Boolean(row.googleMapsEnabled),
    linkedinEnabled: Boolean(row.linkedinEnabled),
    theme: row.theme || base.theme,
    updatedAt: row.updatedAt,
    validations: {
      ...base.validations,
      ...(validations || {}),
      googleMaps: {
        ...base.validations.googleMaps,
        ...(validations?.googleMaps || {}),
      },
      linkedin: {
        ...base.validations.linkedin,
        ...(validations?.linkedin || {}),
      },
    },
  };
}

function ensureUserSettings(userId, defaults = {}) {
  const existing = statements.getSettingsByUserId.get(userId);
  if (existing) {
    return normalizeSettingsRow(existing, defaults);
  }

  const now = nowIso();
  const normalized = normalizeSettingsRow(null, defaults);
  statements.insertSettings.run({
    userId,
    googleMapsApiKey: normalized.googleMapsApiKey,
    linkedinApiKey: normalized.linkedinApiKey,
    googleMapsEnabled: normalized.googleMapsEnabled ? 1 : 0,
    linkedinEnabled: normalized.linkedinEnabled ? 1 : 0,
    theme: normalized.theme,
    updatedAt: now,
    validationsJson: serializeJson(normalized.validations),
  });

  return {
    ...normalized,
    updatedAt: now,
  };
}

function saveUserSettings(userId, nextSettings, defaults = {}) {
  const current = ensureUserSettings(userId, defaults);
  const normalized = {
    ...current,
    ...(nextSettings || {}),
    validations: {
      ...current.validations,
      ...(nextSettings?.validations || {}),
      googleMaps: {
        ...current.validations.googleMaps,
        ...(nextSettings?.validations?.googleMaps || {}),
      },
      linkedin: {
        ...current.validations.linkedin,
        ...(nextSettings?.validations?.linkedin || {}),
      },
    },
  };
  const updatedAt = nowIso();

  statements.updateSettings.run({
    userId,
    googleMapsApiKey: normalized.googleMapsApiKey || '',
    linkedinApiKey: normalized.linkedinApiKey || '',
    googleMapsEnabled: normalized.googleMapsEnabled ? 1 : 0,
    linkedinEnabled: normalized.linkedinEnabled ? 1 : 0,
    theme: normalized.theme || 'dark',
    updatedAt,
    validationsJson: serializeJson(normalized.validations),
  });

  return {
    ...normalized,
    updatedAt,
  };
}

function updateSettingsValidation(userId, serviceKey, status, lastValidatedAt, defaults = {}) {
  const current = ensureUserSettings(userId, defaults);
  const validations = {
    ...current.validations,
    [serviceKey]: {
      status,
      lastValidatedAt: lastValidatedAt || nowIso(),
    },
  };

  return saveUserSettings(userId, { validations }, defaults);
}

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
      reviews: Number.isFinite(Number(row.reviews ?? row.followerCount)) ? Number(row.reviews ?? row.followerCount) : null,
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
  if (raw && typeof raw === 'object') {
    return raw;
  }

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
  const extractionId = insertExtractionTx(payload);
  const extraction = statements.getExtractionById.get(extractionId);
  const results = statements.listExtractionResultsByExtractionId.all(extractionId).map(mapStoredResult);

  return {
    id: extractionId,
    timestamp: extraction.createdAt,
    source: extraction.source,
    count: extraction.resultCount,
    status: 'completed',
    params: parseJson(extraction.paramsJson, {}),
    results,
    cost: {
      inr: Number(extraction.costInr || 0),
      currency: 'INR',
    },
    summary: parseJson(extraction.summaryJson, {}),
  };
}

function getExtractionHistoryByUser(userId, limit = 50) {
  const extractions = statements.listExtractionsByUserId.all(userId, limit);
  return extractions.map((row) => ({
    id: row.id,
    timestamp: row.createdAt,
    source: row.source,
    count: row.resultCount,
    status: 'completed',
    params: parseJson(row.paramsJson, {}),
    results: statements.listExtractionResultsByExtractionId.all(row.id).map(mapStoredResult),
    cost: {
      inr: Number(row.costInr || 0),
      currency: 'INR',
    },
    summary: parseJson(row.summaryJson, {}),
  }));
}

function createUser({ fullName, email, passwordHash, mobile }) {
  const createdAt = nowIso();
  const info = statements.insertUser.run({
    fullName,
    email,
    passwordHash,
    mobile,
    createdAt,
  });
  return statements.getUserById.get(Number(info.lastInsertRowid));
}

function createSession({ userId, token, expiresAt, ipAddress, userAgent }) {
  const createdAt = nowIso();
  statements.insertSession.run({
    userId,
    token,
    createdAt,
    expiresAt,
    ipAddress: ipAddress || '',
    userAgent: userAgent || '',
  });
  statements.updateUserLastLogin.run(createdAt, userId);
  return statements.getSessionByToken.get(token);
}

function getSessionByToken(token) {
  if (!token) return null;
  statements.deleteExpiredSessions.run(nowIso());
  return statements.getSessionByToken.get(token) || null;
}

function deleteSession(token) {
  return statements.deleteSessionByToken.run(token);
}

function deleteExtraction(userId, extractionId) {
  return statements.deleteExtractionByIdAndUserId.run(extractionId, userId);
}

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

module.exports = {
  db,
  nowIso,
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
  ensureUserSettings,
  saveUserSettings,
  updateSettingsValidation,
  createExtraction,
  getExtractionHistoryByUser,
  deleteExtraction,
  logActivity,
  getActivityLogsByUser,
};
