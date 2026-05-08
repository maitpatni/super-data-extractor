'use strict';

const database = require('../database');
const { KeyPool } = require('./key-pool');

/**
 * Build a KeyPool for one user+provider. Pulls every active row from
 * `provider_keys`, decrypts, pre-loads today's spend so ceilings are honored
 * across requests, and wires a charge callback that persists to
 * `provider_key_usage` after every call.
 *
 * Falls back to the legacy single-key on `settings.googleMapsApiKey` /
 * `settings.linkedinApiKey` when no provider_keys rows exist for the user
 * (back-compat — anyone who configured a key in v1/v2 keeps working).
 *
 * @returns {KeyPool|null} null when neither multi-key nor legacy is available.
 */
function buildKeyPool(userId, provider) {
  const rows = database.providerKeys.activeForUserProvider(userId, provider);
  if (rows.length) {
    const seeded = rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      ceilingInr: r.ceilingInr || Infinity,
      spentTodayInr: database.providerKeys.todayCostInr(r.id),
    }));
    return new KeyPool(seeded, {
      onCharge: (keyId, costInr, calls) => {
        database.providerKeys.recordUsage(keyId, costInr, calls);
      },
    });
  }
  // Back-compat: legacy single key on settings.
  const settings = database.ensureUserSettings(userId);
  const legacy = provider === 'google_maps' ? settings.googleMapsApiKey : settings.linkedinApiKey;
  if (!legacy) return null;
  return new KeyPool([{ id: 'legacy', key: legacy, ceilingInr: Infinity }], {
    onCharge: () => undefined, // no per-key persistence for the legacy single key
  });
}

module.exports = { buildKeyPool };
