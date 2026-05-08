'use strict';

/**
 * KeyPool — round-robin selector across multiple API keys for the same provider
 * (Google Places, Apollo). Tracks per-key spend (against the daily INR ceiling),
 * cools off keys that return 429, and exposes per-call charging so callers can
 * persist usage to the database.
 *
 * The pool is in-memory and lives for the duration of one HTTP request /
 * one bulk-job query. Persistent per-key counters live in the
 * `provider_key_usage` table; instantiate the pool with the today-so-far
 * spend pre-loaded so ceiling checks are honored across requests.
 */
class KeyPool {
  /**
   * @param {Array<{ id: string|number, key: string, ceilingInr?: number,
   *                 spentTodayInr?: number, name?: string }>} keys
   * @param {Object} [opts]
   * @param {(keyId, costInr, calls?) => void} [opts.onCharge] called after each charge()
   * @param {number} [opts.cooldownMs] how long to cool a key off after a 429 (default 60s)
   */
  constructor(keys, opts = {}) {
    if (!Array.isArray(keys) || !keys.length) {
      throw new Error('KeyPool requires at least one key');
    }
    this.keys = keys.map((k) => ({
      id: k.id,
      key: k.key,
      name: k.name || String(k.id),
      ceilingInr: Number.isFinite(k.ceilingInr) && k.ceilingInr > 0 ? Number(k.ceilingInr) : Infinity,
      spentTodayInr: Number(k.spentTodayInr || 0),
      cooldownUntil: 0,
      calls: 0,
      lastUsedAt: 0,
    }));
    this.cursor = 0;
    this.cooldownMs = opts.cooldownMs || 60_000;
    this.onCharge = typeof opts.onCharge === 'function' ? opts.onCharge : null;
  }

  /**
   * Pick the next available key. Returns `null` when every key is either
   * cooled-down or over its ceiling (caller should surface a clear error).
   * Uses round-robin so over time traffic is distributed evenly.
   */
  pick() {
    const now = Date.now();
    for (let i = 0; i < this.keys.length; i += 1) {
      const idx = (this.cursor + i) % this.keys.length;
      const k = this.keys[idx];
      if (k.cooldownUntil > now) continue;
      if (k.spentTodayInr >= k.ceilingInr) continue;
      this.cursor = (idx + 1) % this.keys.length;
      k.calls += 1;
      k.lastUsedAt = now;
      return k;
    }
    return null;
  }

  /**
   * Mark a key as 429'd. Future picks skip it until the cooldown expires.
   */
  cooldown(keyId, durationMs = this.cooldownMs) {
    const k = this.keys.find((x) => x.id === keyId);
    if (k) k.cooldownUntil = Date.now() + durationMs;
  }

  /**
   * Charge cost against a specific key. Triggers the onCharge callback so the
   * caller can persist to DB.
   */
  charge(keyId, costInr, calls = 0) {
    const k = this.keys.find((x) => x.id === keyId);
    if (!k) return;
    k.spentTodayInr += Number(costInr || 0);
    if (this.onCharge) {
      try {
        this.onCharge(keyId, Number(costInr || 0), Number(calls || 0));
      } catch (_e) {
        /* ignore */
      }
    }
  }

  /**
   * Snapshot of every key's stats — used by /api/analytics/spend?byKey=1.
   */
  stats() {
    const now = Date.now();
    return this.keys.map((k) => ({
      id: k.id,
      name: k.name,
      calls: k.calls,
      spentTodayInr: Number(k.spentTodayInr.toFixed(4)),
      ceilingInr: Number.isFinite(k.ceilingInr) ? k.ceilingInr : null,
      cooledDown: k.cooldownUntil > now,
      cooldownUntil: k.cooldownUntil ? new Date(k.cooldownUntil).toISOString() : null,
      lastUsedAt: k.lastUsedAt ? new Date(k.lastUsedAt).toISOString() : null,
    }));
  }

  size() {
    return this.keys.length;
  }
}

/**
 * Build a KeyPool from a list of plain `{ id, key, ceilingInr, spentTodayInr }`
 * rows (typically loaded from the DB). Returns null if the list is empty,
 * letting the caller fall back to the legacy single-key flow.
 */
function fromRows(rows, opts) {
  if (!Array.isArray(rows) || !rows.length) return null;
  return new KeyPool(rows, opts);
}

/**
 * Helper: if `value` is already a KeyPool, return it; if it's a string, wrap
 * it in a 1-key pool with no ceiling. This is how services accept "either".
 */
function asPool(value, opts) {
  if (!value) return null;
  if (value instanceof KeyPool) return value;
  if (typeof value === 'string') {
    return new KeyPool([{ id: 'legacy', key: value, ceilingInr: Infinity }], opts);
  }
  return null;
}

module.exports = { KeyPool, fromRows, asPool };
