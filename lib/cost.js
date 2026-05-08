'use strict';

const { config } = require('./config');

// Google Places API (New) SKU prices in USD per request, as of 2026.
// These are the published prices for the Text Search SKU; field-mask determines tier.
// Reference: https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
const SKU = {
  TEXT_SEARCH_ESSENTIALS: { name: 'Text Search (Essentials)', usdPer1k: 5 },
  TEXT_SEARCH_PRO: { name: 'Text Search (Pro)', usdPer1k: 32 }, // Essentials $5 + Pro Atmosphere $27
  TEXT_SEARCH_ENTERPRISE: { name: 'Text Search (Enterprise)', usdPer1k: 35 },
  PLACE_DETAILS_ESSENTIALS: { name: 'Place Details (Essentials)', usdPer1k: 5 },
  PLACE_DETAILS_PRO: { name: 'Place Details (Pro)', usdPer1k: 17 },
  AUTOCOMPLETE: { name: 'Autocomplete', usdPer1k: 2.83 },
  // Geocoding is implemented as a Text Search call asking for `places.location` +
  // `places.formattedAddress`, which are PRO-tier fields. Bill at the PRO rate
  // — billing it at Essentials underestimated runs by ~6x.
  GEOCODING: { name: 'Geocoding (Text Search Pro)', usdPer1k: 32 },
};

// Fields that are billed at Essentials tier on Text Search
const ESSENTIALS_FIELDS = new Set(['id', 'name', 'displayName', 'attributions']);

// Fields that bump Text Search to Pro tier
const PRO_FIELDS = new Set([
  'formattedAddress',
  'addressComponents',
  'shortFormattedAddress',
  'plusCode',
  'location',
  'viewport',
  'types',
  'primaryType',
  'primaryTypeDisplayName',
  'businessStatus',
  'photos',
  'iconBackgroundColor',
  'iconMaskBaseUri',
]);

// Fields that bump Text Search to Enterprise tier
const ENTERPRISE_FIELDS = new Set([
  'rating',
  'userRatingCount',
  'priceLevel',
  'regularOpeningHours',
  'currentOpeningHours',
  'currentSecondaryOpeningHours',
  'regularSecondaryOpeningHours',
  'reviews',
  'editorialSummary',
  'paymentOptions',
  'parkingOptions',
  'subDestinations',
  'fuelOptions',
  'evChargeOptions',
  'generativeSummary',
  'reviewSummary',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'allowsDogs',
  'curbsidePickup',
  'delivery',
  'dineIn',
  'goodForChildren',
  'goodForGroups',
  'goodForWatchingSports',
  'liveMusic',
  'menuForChildren',
  'outdoorSeating',
  'reservable',
  'restroom',
  'servesBeer',
  'servesBreakfast',
  'servesBrunch',
  'servesCocktails',
  'servesCoffee',
  'servesDessert',
  'servesDinner',
  'servesLunch',
  'servesVegetarianFood',
  'servesWine',
  'takeout',
  'wheelchairAccessibleEntrance',
]);

/**
 * Determine the highest billing tier touched by a comma-separated field mask
 * in the form `id,displayName,...` (each field may be bare or `places.<field>`).
 */
function tierForFieldMask(fieldMask) {
  const fields = String(fieldMask || '')
    .split(',')
    .map((f) => f.trim().replace(/^places\./, ''))
    .filter(Boolean);
  let tier = 'ESSENTIALS';
  for (const f of fields) {
    if (ENTERPRISE_FIELDS.has(f)) return 'ENTERPRISE';
    if (PRO_FIELDS.has(f)) tier = tier === 'ENTERPRISE' ? tier : 'PRO';
    if (!ESSENTIALS_FIELDS.has(f) && !PRO_FIELDS.has(f) && !ENTERPRISE_FIELDS.has(f)) {
      // Unknown field: assume worst case.
      tier = tier === 'ENTERPRISE' ? tier : 'PRO';
    }
  }
  return tier;
}

function textSearchSkuFor(fieldMask) {
  const tier = tierForFieldMask(fieldMask);
  if (tier === 'ENTERPRISE') return SKU.TEXT_SEARCH_ENTERPRISE;
  if (tier === 'PRO') return SKU.TEXT_SEARCH_PRO;
  return SKU.TEXT_SEARCH_ESSENTIALS;
}

function placeDetailsSkuFor(fieldMask) {
  const tier = tierForFieldMask(fieldMask);
  if (tier === 'ESSENTIALS') return SKU.PLACE_DETAILS_ESSENTIALS;
  return SKU.PLACE_DETAILS_PRO;
}

function usdToInr(rate) {
  if (config.usdToInrOverride) return config.usdToInrOverride;
  if (rate && Number.isFinite(rate)) return rate;
  return 84; // fallback static rate; user should set USD_TO_INR for accuracy
}

/**
 * Compute cost for a search run.
 * @param {Object} usage Counters captured during the run.
 * @param {string} usage.textSearchFieldMask Field mask used for searchText
 * @param {number} usage.textSearches Count of searchText calls
 * @param {string} [usage.detailsFieldMask] Field mask used for place details (if any)
 * @param {number} [usage.detailLookups] Count of details calls (should be 0 after Tier 1 fix)
 * @param {number} [usage.geocodings] Count of geocode calls (each is a textSearch w/ small mask)
 * @param {number} [usage.autocompletes] Count of autocomplete calls
 * @param {number} [rate] Optional USD→INR override
 */
function calculateMapsCost(usage, rate) {
  const textSku = textSearchSkuFor(usage.textSearchFieldMask);
  const detailSku = usage.detailLookups
    ? placeDetailsSkuFor(usage.detailsFieldMask || usage.textSearchFieldMask)
    : null;
  const fx = usdToInr(rate);

  const lines = [];
  let totalUsd = 0;

  function add(sku, count) {
    if (!count) return;
    const usd = (count * sku.usdPer1k) / 1000;
    totalUsd += usd;
    lines.push({ sku: sku.name, count, usd: Number(usd.toFixed(4)), usdPer1k: sku.usdPer1k });
  }

  add(textSku, Number(usage.textSearches || 0));
  if (detailSku) add(detailSku, Number(usage.detailLookups || 0));
  add(SKU.GEOCODING, Number(usage.geocodings || 0));
  add(SKU.AUTOCOMPLETE, Number(usage.autocompletes || 0));

  return {
    currency: 'INR',
    inr: Number((totalUsd * fx).toFixed(2)),
    usd: Number(totalUsd.toFixed(4)),
    usdToInrRate: fx,
    tier: tierForFieldMask(usage.textSearchFieldMask),
    breakdown: lines,
    counts: {
      textSearches: Number(usage.textSearches || 0),
      detailLookups: Number(usage.detailLookups || 0),
      geocodings: Number(usage.geocodings || 0),
      autocompletes: Number(usage.autocompletes || 0),
    },
  };
}

/**
 * Estimate cost up-front given a plan (rough; assumes no early termination).
 */
function estimateMapsCost({ fieldMask, expectedTextSearches = 1, expectedGeocodings = 1 }, rate) {
  return calculateMapsCost(
    {
      textSearchFieldMask: fieldMask,
      textSearches: expectedTextSearches,
      detailLookups: 0,
      geocodings: expectedGeocodings,
    },
    rate,
  );
}

module.exports = {
  SKU,
  tierForFieldMask,
  textSearchSkuFor,
  placeDetailsSkuFor,
  calculateMapsCost,
  estimateMapsCost,
  usdToInr,
};
