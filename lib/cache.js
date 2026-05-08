'use strict';

const database = require('../database');

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function normalizeKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 200);
}

function getGeocode(rawKey, { ttlMs = DEFAULT_TTL_MS } = {}) {
  const key = normalizeKey(rawKey);
  if (!key) return null;
  const row = database.geocodeCache.get(key);
  if (!row) return null;
  if (Date.now() - new Date(row.updatedAt).getTime() > ttlMs) {
    database.geocodeCache.del(key);
    return null;
  }
  return {
    lat: row.lat,
    lng: row.lng,
    formattedAddress: row.formattedAddress,
  };
}

function setGeocode(rawKey, value) {
  const key = normalizeKey(rawKey);
  if (!key || !value) return;
  database.geocodeCache.set(key, {
    formattedAddress: value.formattedAddress || '',
    lat: Number(value.lat),
    lng: Number(value.lng),
  });
}

module.exports = { getGeocode, setGeocode, normalizeKey };
