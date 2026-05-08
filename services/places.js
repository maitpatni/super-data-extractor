'use strict';

const { logger } = require('../lib/logger');
const { UpstreamError } = require('../lib/errors');
const cache = require('../lib/cache');
const grid = require('../lib/grid');
const { calculateMapsCost, estimateMapsCost } = require('../lib/cost');
const { FIELD_MASK, RESOURCE_FIELD_MASK } = require('../lib/places-fields');

const GOOGLE_PLACES_URL = 'https://places.googleapis.com/v1';
const PAGE_DELAY_MS = 2000;
const MAX_PAGES_PER_CELL = 3;
const PER_PAGE = 20;
const CONCURRENCY = 3;
const MAX_GRID_DEPTH = 3;
const MAX_RESULTS_HARD_CAP = 500;

const PRICE_LEVEL_TO_NUMBER = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};
const NUMBER_TO_PRICE_LEVEL = {
  1: 'PRICE_LEVEL_INEXPENSIVE',
  2: 'PRICE_LEVEL_MODERATE',
  3: 'PRICE_LEVEL_EXPENSIVE',
  4: 'PRICE_LEVEL_VERY_EXPENSIVE',
};

const VALID_PLACE_TYPES = new Set([
  'accounting',
  'airport',
  'amusement_park',
  'aquarium',
  'art_gallery',
  'atm',
  'bakery',
  'bank',
  'bar',
  'beauty_salon',
  'bicycle_store',
  'book_store',
  'bowling_alley',
  'bus_station',
  'cafe',
  'campground',
  'car_dealer',
  'car_rental',
  'car_repair',
  'car_wash',
  'casino',
  'cemetery',
  'church',
  'city_hall',
  'clothing_store',
  'convenience_store',
  'courthouse',
  'dentist',
  'department_store',
  'doctor',
  'drugstore',
  'electrician',
  'electronics_store',
  'embassy',
  'fire_station',
  'florist',
  'funeral_home',
  'furniture_store',
  'gas_station',
  'gym',
  'hair_care',
  'hardware_store',
  'hindu_temple',
  'home_goods_store',
  'hospital',
  'insurance_agency',
  'jewelry_store',
  'laundry',
  'lawyer',
  'library',
  'light_rail_station',
  'liquor_store',
  'local_government_office',
  'locksmith',
  'lodging',
  'meal_delivery',
  'meal_takeaway',
  'mosque',
  'movie_rental',
  'movie_theater',
  'moving_company',
  'museum',
  'night_club',
  'painter',
  'park',
  'parking',
  'pet_store',
  'pharmacy',
  'physiotherapist',
  'plumber',
  'police',
  'post_office',
  'primary_school',
  'real_estate_agency',
  'restaurant',
  'roofing_contractor',
  'rv_park',
  'school',
  'secondary_school',
  'shoe_store',
  'shopping_mall',
  'spa',
  'stadium',
  'storage',
  'store',
  'subway_station',
  'supermarket',
  'synagogue',
  'taxi_stand',
  'tourist_attraction',
  'train_station',
  'transit_station',
  'travel_agency',
  'university',
  'veterinary_care',
  'zoo',
]);

function buildHeaders(apiKey, mask) {
  return {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': apiKey,
    'X-Goog-FieldMask': mask,
  };
}

async function callPlaces(url, init, label) {
  const response = await fetch(url, init);
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : { error: await response.text() };
  if (!response.ok) {
    const msg = data.error?.message || data.error_message || data.error || `Status ${response.status}`;
    throw new UpstreamError('Google Places', `${label || ''} ${msg}`.trim(), response.status, {
      status: response.status,
    });
  }
  return data;
}

function humanizeCategory(category) {
  return String(category || '')
    .replace(/^kw:/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveCategory(category) {
  const normalized = String(category || '').trim();
  if (!normalized) return { categoryText: '', includedType: '' };
  if (/^kw:/i.test(normalized)) return { categoryText: humanizeCategory(normalized), includedType: '' };
  if (VALID_PLACE_TYPES.has(normalized)) return { categoryText: '', includedType: normalized };
  return { categoryText: humanizeCategory(normalized), includedType: '' };
}

function normalizeMinRating(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.min(Math.ceil(parsed * 2) / 2, 5);
}

function normalizePriceLevels(priceLevels) {
  if (!Array.isArray(priceLevels) || !priceLevels.length) return undefined;
  const out = Array.from(
    new Set(
      priceLevels
        .map((level) => {
          if (typeof level === 'string' && level.startsWith('PRICE_LEVEL_')) return level;
          return NUMBER_TO_PRICE_LEVEL[Number(level)];
        })
        .filter(Boolean),
    ),
  );
  return out.length ? out : undefined;
}

function isIndiaContext(location = '', address = '', rawPhone = '') {
  if (
    String(rawPhone || '')
      .trim()
      .startsWith('+91')
  )
    return true;
  return /\b(india|mumbai|delhi|new delhi|bengaluru|bangalore|hyderabad|pune|chennai|kolkata|ahmedabad|surat|jaipur|noida|gurugram|gurgaon|lucknow|nagpur|indore|thane|kochi)\b/i.test(
    `${location} ${address}`,
  );
}

function formatIndianPhone(phone = '') {
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return { raw: '', formatted: '' };
  if (digits.startsWith('91') && digits.length >= 12) {
    const local = digits.slice(2, 12);
    return { raw: phone, formatted: `+91 ${local.slice(0, 5)} ${local.slice(5, 10)}` };
  }
  if (digits.length === 10)
    return { raw: phone, formatted: `+91 ${digits.slice(0, 5)} ${digits.slice(5, 10)}` };
  return { raw: phone, formatted: phone };
}

function normalizePhone(
  { nationalPhoneNumber, internationalPhoneNumber, formattedAddress },
  searchLocation = '',
) {
  const raw = internationalPhoneNumber || nationalPhoneNumber || '';
  if (!raw) return { rawPhone: '', formattedPhone: '' };
  if (isIndiaContext(searchLocation, formattedAddress, raw)) {
    const f = formatIndianPhone(raw);
    return { rawPhone: f.raw, formattedPhone: f.formatted };
  }
  return { rawPhone: raw, formattedPhone: raw };
}

function toResult(place, searchLocation = '') {
  const types = place.types || [];
  const weekdays = place.regularOpeningHours?.weekdayDescriptions || [];
  const location = place.location || {};
  const priceLevel = place.priceLevel || '';
  const phone = normalizePhone(place, searchLocation);
  return {
    id: place.id,
    placeId: place.id,
    name: place.displayName?.text || '',
    address: place.formattedAddress || '',
    phone: phone.formattedPhone || phone.rawPhone || '',
    rawPhone: phone.rawPhone || '',
    formattedPhone: phone.formattedPhone || phone.rawPhone || '',
    website: place.websiteUri || '',
    websiteStatus: 'unchecked',
    rating: place.rating || '',
    reviews: place.userRatingCount || '',
    category: (types[0] || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    hours: weekdays.length ? weekdays.join(' | ') : 'Not available',
    status: place.businessStatus || '',
    priceLevel,
    priceLevelValue: PRICE_LEVEL_TO_NUMBER[priceLevel] ?? '',
    latitude: location.latitude || '',
    longitude: location.longitude || '',
    emails: [],
    socials: {},
    enrichmentStatus: 'pending',
  };
}

async function geocodeLocation(textQuery, apiKey) {
  const cached = cache.getGeocode(textQuery);
  if (cached) return { ...cached, geocoded: false };
  const data = await callPlaces(
    `${GOOGLE_PLACES_URL}/places:searchText`,
    {
      method: 'POST',
      headers: buildHeaders(apiKey, 'places.location,places.formattedAddress'),
      body: JSON.stringify({ textQuery, maxResultCount: 1 }),
    },
    'geocode',
  );
  if (!data.places?.length) {
    throw new UpstreamError('Google Places', 'Unable to resolve the location.', 502);
  }
  const r = data.places[0];
  const value = { lat: r.location.latitude, lng: r.location.longitude, formattedAddress: r.formattedAddress };
  cache.setGeocode(textQuery, value);
  return { ...value, geocoded: true };
}

async function fetchAutocomplete(query, apiKey) {
  const data = await callPlaces(
    `${GOOGLE_PLACES_URL}/places:autocomplete`,
    {
      method: 'POST',
      headers: buildHeaders(
        apiKey,
        [
          'suggestions.placePrediction.text.text',
          'suggestions.placePrediction.structuredFormat.mainText.text',
          'suggestions.placePrediction.structuredFormat.secondaryText.text',
        ].join(','),
      ),
      body: JSON.stringify({
        input: query,
        includedPrimaryTypes: ['locality', 'administrative_area_level_1', 'country', 'sublocality'],
      }),
    },
    'autocomplete',
  );
  return (data.suggestions || [])
    .map((entry) => {
      const p = entry.placePrediction || {};
      const main = p.structuredFormat?.mainText?.text || '';
      const secondary = p.structuredFormat?.secondaryText?.text || '';
      const label = p.text?.text || [main, secondary].filter(Boolean).join(', ');
      if (!label) return null;
      return { label, value: label, mainText: main || label, secondaryText: secondary };
    })
    .filter(Boolean)
    .slice(0, 8);
}

async function validateApiKey(apiKey) {
  const data = await callPlaces(
    `${GOOGLE_PLACES_URL}/places:searchText`,
    {
      method: 'POST',
      headers: buildHeaders(apiKey, 'places.id,places.displayName'),
      body: JSON.stringify({ textQuery: 'coffee in New York', pageSize: 1, maxResultCount: 1 }),
    },
    'validate',
  );
  return Array.isArray(data.places) ? (data.places.length ? 'OK' : 'ZERO_RESULTS') : 'UNKNOWN';
}

function buildSearchBody({
  queryText,
  rectangle,
  pageToken,
  includedType,
  filters,
  normalizedMinRating,
  normalizedPriceLevels,
}) {
  const body = {
    textQuery: queryText,
    pageSize: PER_PAGE,
    maxResultCount: PER_PAGE,
  };
  if (rectangle) {
    body.locationRestriction = { rectangle };
  }
  if (pageToken) body.pageToken = pageToken;
  if (includedType) {
    body.includedType = includedType;
    body.strictTypeFiltering = true;
  }
  if (filters?.openNow) body.openNow = true;
  if (normalizedMinRating) body.minRating = normalizedMinRating;
  if (normalizedPriceLevels?.length) body.priceLevels = normalizedPriceLevels;
  return body;
}

async function searchOneCell({
  apiKey,
  queryText,
  cell,
  includedType,
  filters,
  normalizedMinRating,
  normalizedPriceLevels,
  accept,
}) {
  const places = [];
  let pageToken = null;
  let pages = 0;
  let textSearches = 0;
  let lastNextPageToken = null;
  while (pages < MAX_PAGES_PER_CELL) {
    const data = await callPlaces(
      `${GOOGLE_PLACES_URL}/places:searchText`,
      {
        method: 'POST',
        headers: buildHeaders(apiKey, RESOURCE_FIELD_MASK),
        body: JSON.stringify(
          buildSearchBody({
            queryText,
            rectangle: cell?.rectangle,
            pageToken,
            includedType,
            filters,
            normalizedMinRating,
            normalizedPriceLevels,
          }),
        ),
      },
      'searchText',
    );
    textSearches += 1;
    const batch = data.places || [];
    for (const p of batch) {
      if (!accept(p)) continue;
      places.push(p);
    }
    lastNextPageToken = data.nextPageToken || null;
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
    pages += 1;
    if (pages < MAX_PAGES_PER_CELL) await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
  }
  // `capped` = we exited because we exhausted MAX_PAGES_PER_CELL while Google
  // still had more pages for us. That's the true signal that this cell deserves
  // subdivision. If the loop exited because nextPageToken was missing, we
  // already saw everything Google had for the cell.
  return { places, textSearches, capped: lastNextPageToken !== null };
}

async function runWithConcurrency(items, concurrency, worker) {
  const queue = items.slice();
  const workers = new Array(Math.min(Math.max(1, concurrency || 1), Math.max(1, queue.length)))
    .fill(null)
    .map(async () => {
      while (queue.length) {
        const next = queue.shift();
        if (next === undefined) return;
        await worker(next);
      }
    });
  await Promise.all(workers);
}

/**
 * Run a Maps search.
 *
 * Key behaviors:
 *  - Uses locationRestriction (hard rectangle), not locationBias.
 *  - Density-aware: starts with 1 cell, subdivides cells that hit the per-page cap.
 *  - Per-cell error isolation via Promise.allSettled (failures don't abort the run).
 *  - Server-supplied `accept(place)` allows callers to dedupe against history etc.
 *  - Returns rich cost+stat summary.
 */
async function runMapsSearch({
  apiKey,
  searchTerm,
  location,
  radiusMeters = 5000,
  maxResults = 60,
  includedType = '',
  filters = {},
  excludePlaceIds = new Set(),
  onProgress = () => {},
  signal,
  // Mid-run spend abort: if we exceed `costCeilingInr`, set spendAborted=true
  // and let the outer loop break. The caller passes the *remaining* budget
  // (today's ceiling minus today's already-spent INR), not the gross ceiling.
  costCeilingInr = null,
}) {
  const requested = Math.min(Math.max(Number(maxResults) || 20, 1), MAX_RESULTS_HARD_CAP);
  const r = Math.min(Math.max(Number(radiusMeters) || 5000, 100), 50000);
  const normalizedMinRating = normalizeMinRating(filters.minRating);
  const normalizedPriceLevels = normalizePriceLevels(filters.priceLevels);

  let geocodings = 0;
  let center = null;
  try {
    const geo = await geocodeLocation(location, apiKey);
    if (geo.geocoded) geocodings += 1;
    center = { lat: geo.lat, lng: geo.lng };
  } catch (err) {
    logger.warn({ err: err.message }, 'geocode failed; continuing without rectangle');
  }

  const seen = new Set();
  const failed = [];
  const places = [];
  let textSearches = 0;
  let dups = 0;
  let excluded = 0;
  let spendAborted = false;

  const accept = (p) => {
    const id = p?.id;
    if (!id) return false;
    if (excludePlaceIds.has(id)) {
      excluded += 1;
      return false;
    }
    if (seen.has(id)) {
      dups += 1;
      return false;
    }
    seen.add(id);
    return true;
  };

  // Density-aware: start with one cell covering the whole radius.
  let cells = center
    ? [{ center, radiusMeters: r, rectangle: grid.rectangleAround(center, r), depth: 0, gridIndex: 0 }]
    : [{ rectangle: null, depth: 0, gridIndex: 0 }];
  const totalCellsAtStart = cells.length;
  let processedCount = 0;
  while (cells.length && places.length < requested) {
    if (signal?.aborted) break;
    const batch = cells;
    cells = [];
    const batchTotal = batch.length;
    let inBatch = 0;

    const workOne = async (cell) => {
      if (signal?.aborted) return;
      try {
        const out = await searchOneCell({
          apiKey,
          queryText: searchTerm,
          cell,
          includedType,
          filters,
          normalizedMinRating,
          normalizedPriceLevels,
          accept,
        });
        textSearches += out.textSearches;
        for (const p of out.places) {
          if (places.length >= requested) break;
          places.push(p);
        }
        if (
          places.length < requested &&
          out.places.length &&
          grid.shouldSubdivide({
            resultsInCell: out.places.length,
            capped: out.capped,
            depth: cell.depth,
            maxDepth: MAX_GRID_DEPTH,
          })
        ) {
          cells.push(...grid.subdivide(cell));
        }
      } catch (err) {
        failed.push({ depth: cell.depth || 0, error: err.message, code: err.code || 'UPSTREAM' });
        logger.warn({ err: err.message, depth: cell.depth }, 'cell failed');
      } finally {
        inBatch += 1;
        processedCount += 1;
        onProgress({
          fetched: places.length,
          total: requested,
          gridPoint: inBatch,
          totalPoints: batchTotal,
          stage: cell.depth > 0 ? `subdivide-d${cell.depth}` : 'grid',
          strategy: cell.rectangle ? 'grid' : 'single',
          duplicatesSkipped: dups,
          excludedSkipped: excluded,
          currentPlace: '',
        });
        // Mid-run spend ceiling check. If the remaining budget is exceeded,
        // signal an abort so in-flight cells stop spawning more pages.
        if (costCeilingInr != null && Number.isFinite(costCeilingInr)) {
          const running = calculateMapsCost({
            textSearchFieldMask: FIELD_MASK,
            textSearches,
            detailLookups: 0,
            geocodings,
          });
          if (running.inr > costCeilingInr) {
            spendAborted = true;
            try {
              if (signal && !signal.aborted) signal.dispatchEvent?.(new Event('abort'));
            } catch (_e) {
              /* ignore */
            }
          }
        }
      }
    };

    // Promise.allSettled-equivalent via worker pool: errors caught inside workOne above.
    await runWithConcurrency(batch, CONCURRENCY, workOne);
    if (spendAborted) break;
  }

  const placesTrimmed = places.slice(0, requested);
  const cost = calculateMapsCost({
    textSearchFieldMask: FIELD_MASK,
    textSearches,
    detailLookups: 0,
    geocodings,
  });

  return {
    rawPlaces: placesTrimmed,
    results: placesTrimmed.map((p) => toResult(p, location)),
    summary: {
      requestedResults: requested,
      returnedResults: placesTrimmed.length,
      textSearches,
      detailLookups: 0,
      geocodings,
      duplicatesSkipped: dups,
      excludedSkipped: excluded,
      failedCells: failed,
      spendAborted,
      gridDensity: { startCells: totalCellsAtStart, processedCells: processedCount },
      strategy: center ? 'grid-density-aware' : 'single',
    },
    cost,
  };
}

function applyServerFilters(results, filters = {}) {
  return results.filter((r) => {
    if (filters.hasPhone && !r.phone) return false;
    if (filters.hasWebsite && !r.website) return false;
    if (filters.hasReviews && !(Number(r.reviews) > 0)) return false;
    if (filters.minRating && !(Number(r.rating) >= Number(filters.minRating))) return false;
    if (Array.isArray(filters.priceLevels) && filters.priceLevels.length) {
      const accepted = new Set(normalizePriceLevels(filters.priceLevels) || []);
      if (accepted.size && !accepted.has(r.priceLevel)) return false;
    }
    return true;
  });
}

module.exports = {
  GOOGLE_PLACES_URL,
  CONCURRENCY,
  PAGE_DELAY_MS,
  PER_PAGE,
  MAX_RESULTS_HARD_CAP,
  resolveCategory,
  geocodeLocation,
  fetchAutocomplete,
  validateApiKey,
  runMapsSearch,
  applyServerFilters,
  estimateMapsCost,
  toResult,
  VALID_PLACE_TYPES,
};
