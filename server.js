const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const xlsx = require('xlsx');
const database = require('./database');

const app = express();
const PORT = 3000;
const GOOGLE_PLACES_URL = 'https://places.googleapis.com/v1';
const PROXYCURL_SEARCH_URL = 'https://nubela.co/proxycurl/api/v2/search/person/';
const PROXYCURL_FALLBACK_SEARCH_URL = 'https://nubela.co/proxycurl/api/search/person';
const MAX_GOOGLE_RESULTS = 500;
const MAX_GOOGLE_PAGES = 3;
const GOOGLE_PAGE_DELAY_MS = 2000;
const GOOGLE_SEARCH_CONCURRENCY = 3;
const GEOCODE_CACHE_TTL_MS = 60 * 60 * 1000;
const MAPS_SEEN_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const URL_CHECK_TIMEOUT_MS = 5000;
const PLACES_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'rating',
  'userRatingCount',
  'types',
  'regularOpeningHours',
  'location',
  'businessStatus',
  'priceLevel',
].join(',');
const PLACE_RESOURCE_FIELD_MASK = PLACES_FIELD_MASK
  .split(',')
  .map((field) => `places.${field}`)
  .join(',');
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

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const progressSessions = new Map();
const geocodeCache = new Map();
const mapsSeenSessions = new Map();
const defaultSettings = {
  googleMapsApiKey: '',
  linkedinApiKey: '',
  theme: 'dark',
  googleMapsEnabled: true,
  linkedinEnabled: true,
  validations: {
    googleMaps: {
      status: null,
      lastValidatedAt: null,
    },
    linkedin: {
      status: null,
      lastValidatedAt: null,
    },
  },
};

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (Array.isArray(forwarded)) {
    return forwarded[0];
  }
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '';
}

function getAuthToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  if (req.query?.token) {
    return String(req.query.token).trim();
  }

  return '';
}

function verifyToken(req) {
  const token = getAuthToken(req);
  if (!token) return null;

  const session = database.getSessionByToken(token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    database.deleteSession(token);
    return null;
  }

  return session.userId;
}

function requireAuth(req, res, next) {
  const userId = verifyToken(req);
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  req.auth = {
    userId,
    token: getAuthToken(req),
  };
  return next();
}

function getUserSettings(userId) {
  return database.ensureUserSettings(userId, defaultSettings);
}

function sanitizeUser(user) {
  return database.toPublicUser ? database.toPublicUser(user) : user;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function normalizeMobile(mobile) {
  return String(mobile || '').replace(/\D/g, '');
}

function buildTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function normalizeSheetName(sheetName) {
  return (sheetName || 'Results').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Results';
}

function toTitle(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function humanizeCategory(category) {
  return String(category || '')
    .replace(/^kw:/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildProgressPayload(session) {
  return {
    sessionId: session.sessionId,
    status: session.status,
    fetched: session.fetched,
    total: session.total,
    eta: session.eta,
    currentPlace: session.currentPlace,
    message: session.message,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    completedAt: session.completedAt || null,
    error: session.error || null,
    stage: session.stage || null,
    strategy: session.strategy || null,
    gridPoint: session.gridPoint || 0,
    totalPoints: session.totalPoints || 0,
    skippedDuplicates: session.skippedDuplicates || 0,
    skippedExcluded: session.skippedExcluded || 0,
  };
}

function ensureProgressSession(sessionId, initial = {}) {
  if (!sessionId) return null;

  const existing = progressSessions.get(sessionId);
  if (existing) {
    return existing;
  }

  const session = {
    sessionId,
    clients: new Set(),
    status: 'pending',
    fetched: 0,
    total: 0,
    eta: null,
    currentPlace: '',
    message: 'Waiting to start',
    error: null,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    stage: 'pending',
    strategy: '',
    gridPoint: 0,
    totalPoints: 0,
    skippedDuplicates: 0,
    skippedExcluded: 0,
    ...initial,
  };

  progressSessions.set(sessionId, session);
  return session;
}

function emitProgress(session) {
  if (!session) return;

  const payload = buildProgressPayload(session);
  for (const client of session.clients) {
    client.write(`event: progress\n`);
    client.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}

function updateProgressSession(sessionId, patch = {}) {
  const session = ensureProgressSession(sessionId);
  if (!session) return null;

  Object.assign(session, patch, {
    updatedAt: new Date().toISOString(),
  });

  emitProgress(session);
  return session;
}

function finishProgressSession(sessionId, patch = {}) {
  const session = ensureProgressSession(sessionId);
  if (!session) return null;

  Object.assign(session, patch, {
    updatedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  });

  emitProgress(session);

  for (const client of session.clients) {
    client.write(`event: done\n`);
    client.write(`data: ${JSON.stringify(buildProgressPayload(session))}\n\n`);
    client.end();
  }

  session.clients.clear();
  setTimeout(() => {
    progressSessions.delete(sessionId);
  }, 5 * 60 * 1000);

  return session;
}

function attachProgressClient(sessionId, res) {
  const session = ensureProgressSession(sessionId);
  if (!session) return null;

  session.clients.add(res);
  res.write(`event: progress\n`);
  res.write(`data: ${JSON.stringify(buildProgressPayload(session))}\n\n`);

  return session;
}

function resolveMapsCategory(category) {
  const normalized = String(category || '').trim();
  if (!normalized) {
    return {
      categoryText: '',
      includedType: '',
    };
  }

  if (/^kw:/i.test(normalized)) {
    return {
      categoryText: humanizeCategory(normalized),
      includedType: '',
    };
  }

  if (VALID_PLACE_TYPES.has(normalized)) {
    return {
      categoryText: '',
      includedType: normalized,
    };
  }

  return {
    categoryText: humanizeCategory(normalized),
    includedType: '',
  };
}

function normalizeCacheKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 200);
}

function pruneTimedMap(store, ttlMs) {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (!entry || now - Number(entry.updatedAt || 0) > ttlMs) {
      store.delete(key);
    }
  }
}

function getMapsSeenSession(cacheKey = '') {
  pruneTimedMap(mapsSeenSessions, MAPS_SEEN_CACHE_TTL_MS);
  const normalizedKey = normalizeCacheKey(cacheKey);
  if (!normalizedKey) return null;

  const existing = mapsSeenSessions.get(normalizedKey);
  if (!existing) return null;

  return {
    cacheKey: normalizedKey,
    placeIds: Array.from(existing.placeIds),
    updatedAt: new Date(existing.updatedAt).toISOString(),
  };
}

function saveMapsSeenSession(cacheKey = '', placeIds = []) {
  pruneTimedMap(mapsSeenSessions, MAPS_SEEN_CACHE_TTL_MS);
  const normalizedKey = normalizeCacheKey(cacheKey);
  if (!normalizedKey) return null;

  const existing = mapsSeenSessions.get(normalizedKey) || {
    placeIds: new Set(),
    updatedAt: Date.now(),
  };

  for (const placeId of Array.isArray(placeIds) ? placeIds : []) {
    if (placeId) {
      existing.placeIds.add(String(placeId));
    }
  }

  existing.updatedAt = Date.now();
  mapsSeenSessions.set(normalizedKey, existing);

  return {
    cacheKey: normalizedKey,
    placeIds: Array.from(existing.placeIds),
    updatedAt: new Date(existing.updatedAt).toISOString(),
  };
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : { error: await response.text() };

  if (!response.ok) {
    throw new Error(data.error?.message || data.error_message || data.error || `Request failed with ${response.status}`);
  }

  return data;
}

function buildPlacesHeaders(apiKey, fieldMask) {
  return {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': apiKey,
    'X-Goog-FieldMask': fieldMask,
  };
}

function normalizeMinRating(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.min(Math.ceil(parsed * 2) / 2, 5);
}

function normalizePriceLevels(priceLevels) {
  if (!Array.isArray(priceLevels) || !priceLevels.length) return undefined;

  const normalized = Array.from(
    new Set(
      priceLevels
        .map((level) => {
          if (typeof level === 'string' && level.startsWith('PRICE_LEVEL_')) {
            return level;
          }

          const numericLevel = Number(level);
          return NUMBER_TO_PRICE_LEVEL[numericLevel];
        })
        .filter(Boolean),
    ),
  );

  return normalized.length ? normalized : undefined;
}

function splitFullName(name = '') {
  const parts = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return { firstName: '', lastName: '' };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function parseOccupation(occupation = '') {
  const raw = String(occupation || '').trim();
  if (!raw) {
    return { role: '', company: '' };
  }

  const match = raw.match(/^(.*?)\s+at\s+(.*)$/i);
  if (!match) {
    return { role: raw, company: '' };
  }

  return {
    role: match[1].trim(),
    company: match[2].trim(),
  };
}

function pickCurrentExperience(profile = {}) {
  const experiences = Array.isArray(profile.experiences) ? profile.experiences : [];
  return experiences.find((item) => !item?.ends_at) || experiences[0] || null;
}

function normalizeLinkedInProfile(result = {}, fallback = {}) {
  const profile = result.profile || {};
  const currentExperience = pickCurrentExperience(profile);
  const occupation = parseOccupation(profile.occupation);
  const company = currentExperience?.company || profile.current_company_name || occupation.company || fallback.company || '';
  const role = currentExperience?.title || occupation.role || fallback.role || '';
  const location = currentExperience?.location || profile.city || profile.state || profile.country_full_name || fallback.location || '';
  const industry = profile.industry || currentExperience?.company_industry || fallback.industry || '';
  const profileUrl = result.professionalsocmed_profile_url || profile.professionalsocmed_profile_url || '';
  const publicIdentifier = profile.public_identifier || profileUrl.split('/in/')[1]?.replace(/\/$/, '') || '';

  return {
    id: publicIdentifier || profileUrl || `${profile.full_name || fallback.name}-${result.last_updated || Date.now()}`,
    name: profile.full_name || [profile.first_name, profile.last_name].filter(Boolean).join(' ') || fallback.name || '',
    headline: profile.headline || role || '',
    company,
    role,
    location,
    industry,
    followerCount: profile.follower_count ?? '',
    profileUrl,
    profilePictureUrl: profile.profile_pic_url || '',
    lastUpdated: result.last_updated || '',
  };
}

async function searchLinkedInProfiles({ apiKey, firstName, lastName, company, role, location, maxResults }) {
  const requestedResults = Math.min(Math.max(Number(maxResults) || 10, 1), 10);
  const searchParams = {
    country: 'IN',
    page_size: requestedResults,
    enrich_profiles: 'enrich',
    use_cache: 'if-present',
  };

  if (firstName) searchParams.first_name = firstName;
  if (lastName) searchParams.last_name = lastName;
  if (company) searchParams.current_company_name = company;
  if (role) searchParams.current_role_title = role;
  if (location) searchParams.city = location;

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  try {
    const url = new URL(PROXYCURL_SEARCH_URL);
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value != null && value !== '') {
        url.searchParams.set(key, value);
      }
    });

    return await fetchJson(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: headers.Authorization,
      },
    });
  } catch (primaryError) {
    const fallbackBody = {
      country: 'IN',
      first_name: firstName || undefined,
      last_name: lastName || undefined,
      company_name: company || undefined,
      title: role || undefined,
      location: location || undefined,
      page_size: requestedResults,
      enrich_profiles: 'enrich',
    };

    try {
      return await fetchJson(PROXYCURL_FALLBACK_SEARCH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(fallbackBody),
      });
    } catch (fallbackError) {
      throw new Error(fallbackError.message || primaryError.message || 'LinkedIn search failed.');
    }
  }
}

async function geocodeLocation(location, apiKey) {
  pruneTimedMap(geocodeCache, GEOCODE_CACHE_TTL_MS);
  const cacheKey = normalizeCacheKey(location);
  const cached = geocodeCache.get(cacheKey);
  if (cached) {
    return cached.value;
  }

  const data = await fetchJson(`${GOOGLE_PLACES_URL}/places:searchText`, {
    method: 'POST',
    headers: buildPlacesHeaders(apiKey, 'places.location,places.formattedAddress'),
    body: JSON.stringify({
      textQuery: location,
      maxResultCount: 1,
    }),
  });

  if (!data.places?.length) {
    throw new Error('Unable to resolve the location for the Google Maps search.');
  }

  const resolved = data.places[0];
  const value = {
    formattedAddress: resolved.formattedAddress,
    lat: resolved.location.latitude,
    lng: resolved.location.longitude,
  };
  geocodeCache.set(cacheKey, {
    value,
    updatedAt: Date.now(),
  });
  return value;
}

async function fetchLocationSuggestions(query, apiKey) {
  const data = await fetchJson(`${GOOGLE_PLACES_URL}/places:autocomplete`, {
    method: 'POST',
    headers: buildPlacesHeaders(
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
  });

  const suggestions = (data.suggestions || [])
    .map((entry) => {
      const prediction = entry.placePrediction || {};
      const mainText = prediction.structuredFormat?.mainText?.text || '';
      const secondaryText = prediction.structuredFormat?.secondaryText?.text || '';
      const label = prediction.text?.text || [mainText, secondaryText].filter(Boolean).join(', ');

      if (!label) return null;

      return {
        label,
        value: label,
        mainText: mainText || label,
        secondaryText,
      };
    })
    .filter(Boolean)
    .slice(0, 8);

  return suggestions;
}

async function fetchPlaceDetails(placeId, apiKey) {
  const url = `${GOOGLE_PLACES_URL}/places/${encodeURIComponent(placeId)}`;
  return fetchJson(url, {
    headers: buildPlacesHeaders(apiKey, PLACES_FIELD_MASK),
  });
}

function formatMapsResult(place, details) {
  return formatMapsResultForLocation(place, details, '');
}

function isIndiaContext(location = '', address = '', rawPhone = '') {
  const haystack = `${location} ${address}`.toLowerCase();
  if (String(rawPhone || '').trim().startsWith('+91')) return true;

  return /\b(india|mumbai|delhi|new delhi|bengaluru|bangalore|hyderabad|pune|chennai|kolkata|ahmedabad|surat|jaipur|noida|gurugram|gurgaon|lucknow|nagpur|indore|thane|kochi|kochin)\b/i.test(
    haystack,
  );
}

function formatIndianPhoneNumber(phone = '') {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) {
    return { raw: '', formatted: '' };
  }

  if (digits.startsWith('91') && digits.length >= 12) {
    const local = digits.slice(2, 12);
    return {
      raw: phone,
      formatted: `+91 ${local.slice(0, 5)} ${local.slice(5, 10)}`.trim(),
    };
  }

  if (digits.length === 10) {
    return {
      raw: phone,
      formatted: `+91 ${digits.slice(0, 5)} ${digits.slice(5, 10)}`,
    };
  }

  return {
    raw: phone,
    formatted: phone,
  };
}

function normalizePhoneNumbers({ nationalPhoneNumber, internationalPhoneNumber, formattedAddress }, searchLocation = '') {
  const rawPhone = internationalPhoneNumber || nationalPhoneNumber || '';
  const indiaContext = isIndiaContext(searchLocation, formattedAddress, rawPhone);

  if (!rawPhone) {
    return {
      rawPhone: '',
      formattedPhone: '',
    };
  }

  if (indiaContext) {
    const normalized = formatIndianPhoneNumber(rawPhone);
    return {
      rawPhone: normalized.raw,
      formattedPhone: normalized.formatted,
    };
  }

  return {
    rawPhone,
    formattedPhone: rawPhone,
  };
}

function formatMapsResultForLocation(place, details, searchLocation = '') {
  const source = { ...place, ...details };
  const types = source.types || [];
  const weekdayDescriptions = source.regularOpeningHours?.weekdayDescriptions || [];
  const location = source.location || {};
  const priceLevel = source.priceLevel || '';
  const phone = normalizePhoneNumbers(
    {
      nationalPhoneNumber: source.nationalPhoneNumber,
      internationalPhoneNumber: source.internationalPhoneNumber,
      formattedAddress: source.formattedAddress,
    },
    searchLocation,
  );

  return {
    id: source.id || place.id,
    placeId: source.id || place.id,
    name: source.displayName?.text || '',
    address: source.formattedAddress || '',
    phone: phone.formattedPhone || phone.rawPhone || '',
    rawPhone: phone.rawPhone || '',
    formattedPhone: phone.formattedPhone || phone.rawPhone || '',
    website: source.websiteUri || '',
    websiteStatus: 'unchecked',
    rating: source.rating || '',
    reviews: source.userRatingCount || '',
    category: toTitle(types[0] || ''),
    hours: weekdayDescriptions.length ? weekdayDescriptions.join(' | ') : 'Not available',
    status: source.businessStatus || '',
    priceLevel,
    priceLevelValue: PRICE_LEVEL_TO_NUMBER[priceLevel] ?? '',
    latitude: location.latitude || '',
    longitude: location.longitude || '',
  };
}

function applyServerFilters(results, filters = {}) {
  return results.filter((result) => {
    if (filters.hasPhone && !result.phone) return false;
    if (filters.hasWebsite && !result.website) return false;
    if (filters.hasReviews && !(Number(result.reviews) > 0)) return false;
    if (filters.minRating && !(Number(result.rating) >= Number(filters.minRating))) return false;
    if (Array.isArray(filters.priceLevels) && filters.priceLevels.length) {
      const accepted = new Set(normalizePriceLevels(filters.priceLevels) || []);
      if (accepted.size && !accepted.has(result.priceLevel)) return false;
    }
    return true;
  });
}

function dedupeMapsResults(results = []) {
  const seen = new Set();
  return results.filter((result) => {
    const key = result.placeId || result.id;
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function calculateMapsCostInr(detailLookups = 0, textSearches = 1) {
  const usdToInr = 84;
  const textSearchInr = 0.017 * usdToInr;
  const detailLookupInr = 0.017 * usdToInr;
  return Number((Math.max(1, Number(textSearches) || 1) * textSearchInr + Math.max(0, Number(detailLookups) || 0) * detailLookupInr).toFixed(2));
}

function buildMapsCostMeta(detailLookups = 0, textSearches = 1) {
  return {
    inr: calculateMapsCostInr(detailLookups, textSearches),
    currency: 'INR',
    detailLookups,
    textSearches: Math.max(1, Number(textSearches) || 1),
    usdToInrRate: 84,
  };
}

function metersToLatitudeDegrees(meters) {
  return Number(meters || 0) / 111320;
}

function metersToLongitudeDegrees(meters, latitude) {
  const denominator = 111320 * Math.cos((Number(latitude || 0) * Math.PI) / 180);
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1) {
    return 0;
  }
  return Number(meters || 0) / denominator;
}

function buildSearchGridPoints(center, radius, gridSize) {
  const normalizedGridSize = Math.max(1, Number(gridSize) || 1);
  const normalizedRadius = Math.min(Math.max(Number(radius) || 5000, 100), 50000);

  if (!center || normalizedGridSize === 1) {
    return [
      {
        lat: center?.lat ?? null,
        lng: center?.lng ?? null,
        radius: normalizedRadius,
      },
    ];
  }

  const points = [];
  const stepMeters = normalizedGridSize > 1 ? (normalizedRadius * 2) / normalizedGridSize : 0;
  const innerRadius = Math.max(100, Math.round(normalizedRadius / normalizedGridSize));
  const mid = (normalizedGridSize - 1) / 2;

  for (let row = 0; row < normalizedGridSize; row += 1) {
    for (let col = 0; col < normalizedGridSize; col += 1) {
      const northSouthMeters = (mid - row) * stepMeters;
      const eastWestMeters = (col - mid) * stepMeters;
      points.push({
        lat: center.lat + metersToLatitudeDegrees(northSouthMeters),
        lng: center.lng + metersToLongitudeDegrees(eastWestMeters, center.lat),
        radius: innerRadius,
      });
    }
  }

  return points;
}

function buildMapsSearchMessage({
  strategy = '',
  stage = 'search',
  fetched = 0,
  total = 0,
  gridPoint = 0,
  totalPoints = 0,
  queryLabel = '',
  skippedExcluded = 0,
  skippedDuplicates = 0,
}) {
  const progressBits = [];
  if (strategy === 'grid' && totalPoints) {
    progressBits.push(`grid ${gridPoint}/${totalPoints}`);
  }
  if (queryLabel) {
    progressBits.push(queryLabel);
  }
  if (skippedExcluded || skippedDuplicates) {
    progressBits.push(`skipped ${skippedExcluded} seen / ${skippedDuplicates} duplicates`);
  }

  const prefix = progressBits.length ? `${progressBits.join(' • ')} — ` : '';
  return `${prefix}${stage}: ${fetched} / ${total}`;
}

function updateMapsSearchProgress(sessionId, state, patch = {}) {
  const fetched = Math.min(state.results.length, state.requestedResults);
  const elapsedSeconds = Math.max((Date.now() - state.startedAtMs) / 1000, 1);
  const eta = fetched > 0 ? Math.max(Math.round((elapsedSeconds / fetched) * (state.requestedResults - fetched)), 0) : null;
  const stage = patch.stage || state.stage || 'search';
  const strategy = patch.strategy || state.strategy || 'single';
  const gridPoint = Number.isFinite(patch.gridPoint) ? patch.gridPoint : state.gridPoint || 0;
  const totalPoints = Number.isFinite(patch.totalPoints) ? patch.totalPoints : state.totalPoints || 0;
  const queryLabel = patch.queryLabel || state.queryLabel || '';
  const currentPlace = patch.currentPlace ?? '';

  updateProgressSession(sessionId, {
    status: 'running',
    total: state.requestedResults,
    fetched,
    eta,
    currentPlace,
    stage,
    strategy,
    gridPoint,
    totalPoints,
    skippedDuplicates: state.duplicatesSkipped,
    skippedExcluded: state.excludedSkipped,
    message: buildMapsSearchMessage({
      strategy,
      stage,
      fetched,
      total: state.requestedResults,
      gridPoint,
      totalPoints,
      queryLabel,
      skippedExcluded: state.excludedSkipped,
      skippedDuplicates: state.duplicatesSkipped,
    }),
  });
}

async function runWithConcurrency(items, concurrency, worker) {
  const queue = Array.from(items);
  const workers = new Array(Math.min(Math.max(1, concurrency || 1), queue.length || 1)).fill(null).map(async () => {
    while (queue.length) {
      const next = queue.shift();
      if (!next) return;
      await worker(next.item, next.index);
    }
  });

  await Promise.all(workers);
}

function detectExpansionKey({ searchTerm = '', categoryText = '', includedType = '' }) {
  const haystack = `${includedType} ${categoryText} ${searchTerm}`.toLowerCase();
  if (/\brestaurant|cafe|eatery|dining\b/.test(haystack)) return 'restaurant';
  if (/\bhospital|clinic|medical|healthcare\b/.test(haystack)) return 'hospital';
  if (/\bhotel|lodging|resort\b/.test(haystack)) return 'lodging';
  if (/\bgym|fitness\b/.test(haystack)) return 'gym';
  return '';
}

function buildCategorySplitQueries(key, baseSearchTerm) {
  const options = {
    restaurant: ['breakfast', 'lunch', 'dinner', 'vegetarian', 'family'],
    hospital: ['emergency', 'multispeciality', 'diagnostic', '24 hour'],
    lodging: ['business hotel', 'budget hotel', 'boutique hotel'],
    gym: ['fitness center', 'crossfit', 'yoga studio'],
  }[key] || [];

  return options.map((suffix) => `${baseSearchTerm} ${suffix}`.trim());
}

function buildKeywordVariationQueries(key) {
  return {
    restaurant: ['eatery', 'dining', 'food place'],
    hospital: ['medical center', 'clinic', 'healthcare center'],
    lodging: ['hotel', 'resort', 'guest house'],
    gym: ['fitness center', 'health club', 'workout studio'],
  }[key] || [];
}

function createSearchPlanBody({
  queryText,
  location,
  point,
  pageToken,
  pageSize,
  includedType,
  filters,
  normalizedMinRating,
  normalizedPriceLevels,
}) {
  const body = {
    textQuery: `${queryText} in ${location}`,
    pageSize,
    maxResultCount: pageSize,
  };

  if (point?.lat != null && point?.lng != null) {
    body.locationBias = {
      circle: {
        center: {
          latitude: point.lat,
          longitude: point.lng,
        },
        radius: point.radius,
      },
    };
  }

  if (pageToken) {
    body.pageToken = pageToken;
  }

  if (includedType) {
    body.includedType = includedType;
    body.strictTypeFiltering = true;
  }

  if (filters.openNow) {
    body.openNow = true;
  }

  if (normalizedMinRating) {
    body.minRating = normalizedMinRating;
  }

  if (normalizedPriceLevels?.length) {
    body.priceLevels = normalizedPriceLevels;
  }

  return body;
}

async function processPlacesPage(places, state, effectiveApiKey, location, sessionId, progressMeta = {}) {
  for (const place of places || []) {
    if (state.results.length >= state.requestedResults) {
      return;
    }

    const placeId = String(place?.id || '');
    if (!placeId) {
      continue;
    }

    if (state.excludePlaceIds.has(placeId)) {
      state.excludedSkipped += 1;
      continue;
    }

    if (state.seenResultPlaceIds.has(placeId)) {
      state.duplicatesSkipped += 1;
      continue;
    }

    state.seenResultPlaceIds.add(placeId);

    try {
      const details = await fetchPlaceDetails(placeId, effectiveApiKey);
      state.detailLookups += 1;
      const result = formatMapsResultForLocation(place, details, location);
      state.results.push(result);
      updateMapsSearchProgress(sessionId, state, {
        ...progressMeta,
        stage: progressMeta.stage || 'details',
        currentPlace: details.displayName?.text || place.displayName?.text || '',
      });
    } catch (error) {
      state.seenResultPlaceIds.delete(placeId);
    }
  }
}

async function executeMapsSearchPlan(plan, context) {
  const {
    effectiveApiKey,
    filters,
    includedType,
    location,
    normalizedMinRating,
    normalizedPriceLevels,
    pageSize,
    sessionId,
    state,
  } = context;

  let nextPageToken = null;
  let page = 0;

  while (state.results.length < state.requestedResults && page < MAX_GOOGLE_PAGES) {
    const data = await fetchJson(`${GOOGLE_PLACES_URL}/places:searchText`, {
      method: 'POST',
      headers: buildPlacesHeaders(effectiveApiKey, `nextPageToken,${PLACE_RESOURCE_FIELD_MASK}`),
      body: JSON.stringify(
        createSearchPlanBody({
          queryText: plan.queryText,
          location,
          point: plan.point,
          pageToken: nextPageToken,
          pageSize,
          includedType,
          filters,
          normalizedMinRating,
          normalizedPriceLevels,
        }),
      ),
    });

    state.textSearches += 1;

    await processPlacesPage(data.places || [], state, effectiveApiKey, location, sessionId, {
      strategy: plan.strategy,
      queryLabel: plan.queryLabel,
      gridPoint: plan.gridPoint,
      totalPoints: plan.totalPoints,
      stage: plan.stage || 'search',
    });

    if (!data.nextPageToken || state.results.length >= state.requestedResults) {
      break;
    }

    nextPageToken = data.nextPageToken;
    page += 1;
    updateMapsSearchProgress(sessionId, state, {
      strategy: plan.strategy,
      queryLabel: plan.queryLabel,
      gridPoint: plan.gridPoint,
      totalPoints: plan.totalPoints,
      stage: 'page-wait',
    });
    await new Promise((resolve) => setTimeout(resolve, GOOGLE_PAGE_DELAY_MS));
  }
}

async function runSearchPlanSet(plans, context, stage) {
  let completed = 0;
  await runWithConcurrency(
    plans.map((item, index) => ({ item, index })),
    GOOGLE_SEARCH_CONCURRENCY,
    async (plan) => {
      if (context.state.results.length >= context.state.requestedResults) {
        return;
      }

      await executeMapsSearchPlan(
        {
          ...plan,
          stage,
        },
        context,
      );

      completed += 1;
      context.state.stage = stage;
      context.state.strategy = plan.strategy;
      context.state.gridPoint = completed;
      context.state.totalPoints = plans.length;
      context.state.queryLabel = plan.queryLabel || '';
      updateMapsSearchProgress(context.sessionId, context.state, {
        stage,
        strategy: plan.strategy,
        gridPoint: completed,
        totalPoints: plans.length,
        queryLabel: plan.queryLabel,
      });
    },
  );
}

function buildCsvBuffer(rows = []) {
  const worksheet = xlsx.utils.json_to_sheet(rows);
  const csv = xlsx.utils.sheet_to_csv(worksheet);
  return Buffer.from(csv, 'utf8');
}

function applyWorksheetFormatting(worksheet, rows) {
  if (!rows.length) {
    worksheet['!cols'] = [{ wch: 24 }];
    return;
  }

  const range = xlsx.utils.decode_range(worksheet['!ref']);
  const headers = Object.keys(rows[0]);
  const colWidths = headers.map((header) => {
    const maxLength = rows.reduce((length, row) => {
      return Math.max(length, String(row[header] ?? '').length);
    }, header.length);
    return { wch: Math.min(Math.max(maxLength + 3, 14), 42) };
  });

  worksheet['!cols'] = colWidths;

  for (let col = range.s.c; col <= range.e.c; col += 1) {
    const address = xlsx.utils.encode_cell({ r: 0, c: col });
    if (!worksheet[address]) continue;
    worksheet[address].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1F4E78' } },
      alignment: { vertical: 'center' },
    };
  }

  for (let row = 1; row <= range.e.r; row += 1) {
    const fill = row % 2 === 0 ? 'F7FBFF' : 'EAF2FF';
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const address = xlsx.utils.encode_cell({ r: row, c: col });
      if (!worksheet[address]) continue;
      worksheet[address].s = {
        fill: { fgColor: { rgb: fill } },
        alignment: { vertical: 'top', wrapText: true },
      };
    }
  }
}

function rememberExtraction(userId, source, results, params = {}, meta = {}) {
  return database.createExtraction({
    userId,
    source,
    keyword: params.keyword || params.query || params.name || '',
    location: params.location || '',
    category: params.category || params.industry || '',
    radius: params.radius ?? null,
    maxResults: params.maxResults ?? null,
    resultCount: results.length,
    costInr: Number(meta.cost?.inr || 0),
    params,
    results,
    summary: meta.summary || {},
  });
}

app.post('/api/auth/register', async (req, res) => {
  const fullName = String(req.body?.fullName || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const mobile = normalizeMobile(req.body?.mobile);

  if (!fullName) {
    return res.status(400).json({ error: 'Full name is required.' });
  }
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Valid email is required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (!/^\d{10}$/.test(mobile)) {
    return res.status(400).json({ error: 'Mobile number must contain exactly 10 digits.' });
  }
  if (database.getUserByEmail(email)) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = database.createUser({
    fullName,
    email,
    passwordHash,
    mobile,
  });
  database.ensureUserSettings(user.id, defaultSettings);

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString();
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

  return res.json({
    success: true,
    token,
    user: sanitizeUser(user),
  });
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = database.getUserByEmail(email);

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString();
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

  return res.json({
    success: true,
    token,
    user: sanitizeUser(user),
  });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  database.deleteSession(req.auth.token);
  database.logActivity({
    userId: req.auth.userId,
    action: 'logout',
    details: {},
    ipAddress: getClientIp(req),
  });
  return res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = database.getUserById(req.auth.userId);
  if (!user) {
    return res.status(401).json({ error: 'Invalid session.' });
  }
  return res.json({ success: true, user });
});

app.use('/api/maps', requireAuth);
app.use('/api/linkedin', requireAuth);
app.use('/api/history', requireAuth);
app.use('/api/export', requireAuth);
app.use('/api/settings', requireAuth);

app.get('/api/settings', (req, res) => {
  res.json(getUserSettings(req.auth.userId));
});

app.post('/api/settings', (req, res) => {
  const current = getUserSettings(req.auth.userId);
  const settings = database.saveUserSettings(req.auth.userId, {
    ...current,
    ...req.body,
    validations: {
      ...current.validations,
      ...(req.body?.validations || {}),
      googleMaps: {
        ...current.validations.googleMaps,
        ...(req.body?.validations?.googleMaps || {}),
      },
      linkedin: {
        ...current.validations.linkedin,
        ...(req.body?.validations?.linkedin || {}),
      },
    },
  }, defaultSettings);

  res.json({ success: true, settings });
});

app.post('/api/settings/validate-google', async (req, res) => {
  const userSettings = getUserSettings(req.auth.userId);
  const apiKey = req.body.apiKey || userSettings.googleMapsApiKey;

  if (!apiKey) {
    return res.status(400).json({ valid: false, error: 'Google Maps API key is required.' });
  }

  try {
    const data = await fetchJson(`${GOOGLE_PLACES_URL}/places:searchText`, {
      method: 'POST',
      headers: buildPlacesHeaders(apiKey, 'places.id,places.displayName'),
      body: JSON.stringify({ textQuery: 'coffee in New York', pageSize: 1, maxResultCount: 1 }),
    });

    if (Array.isArray(data.places)) {
      const validatedAt = new Date().toISOString();
      database.updateSettingsValidation(req.auth.userId, 'googleMaps', true, validatedAt, defaultSettings);

      return res.json({ valid: true, status: data.places.length ? 'OK' : 'ZERO_RESULTS', lastValidatedAt: validatedAt });
    }

    return res.json({ valid: false, error: 'Unexpected response from Places API (New).' });
  } catch (error) {
    const validatedAt = new Date().toISOString();
    database.updateSettingsValidation(req.auth.userId, 'googleMaps', false, validatedAt, defaultSettings);
    return res.status(400).json({ valid: false, error: error.message, lastValidatedAt: validatedAt });
  }
});

app.post('/api/settings/validate-linkedin', (req, res) => {
  const userSettings = getUserSettings(req.auth.userId);
  const apiKey = req.body.apiKey || userSettings.linkedinApiKey;

  if (!apiKey) {
    return res.status(400).json({ valid: false, error: 'LinkedIn API key is required.' });
  }

  searchLinkedInProfiles({
    apiKey,
    firstName: 'John',
    lastName: 'Smith',
    company: '',
    role: '',
    location: '',
    maxResults: 1,
  })
    .then(() => {
      const validatedAt = new Date().toISOString();
      database.updateSettingsValidation(req.auth.userId, 'linkedin', true, validatedAt, defaultSettings);

      return res.json({
        valid: true,
        status: 'OK',
        lastValidatedAt: validatedAt,
        message: 'The server successfully reached Proxycurl with the current LinkedIn API key.',
      });
    })
    .catch((error) => {
      const validatedAt = new Date().toISOString();
      database.updateSettingsValidation(req.auth.userId, 'linkedin', false, validatedAt, defaultSettings);

      return res.status(400).json({ valid: false, error: error.message, lastValidatedAt: validatedAt });
    });
});

async function handleMapsSearch(req, res) {
  const {
    query,
    keyword,
    location,
    radius = 5000,
    maxResults = 20,
    category = '',
    filters = {},
    apiKey,
    sessionId,
    excludePlaceIds = [],
    cacheKey = '',
  } = req.body || {};

  const userSettings = getUserSettings(req.auth.userId);
  const effectiveApiKey = apiKey || userSettings.googleMapsApiKey;
  const { categoryText, includedType } = resolveMapsCategory(category);
  const searchTerm = [categoryText, query || keyword].filter(Boolean).join(' ').trim();
  const requestedResults = Math.min(Math.max(Number(maxResults) || 20, 1), MAX_GOOGLE_RESULTS);
  const pageSize = 20;
  const normalizedRadius = Math.min(Math.max(Number(radius) || 5000, 100), 50000);
  const normalizedMinRating = normalizeMinRating(filters.minRating);
  const normalizedPriceLevels = normalizePriceLevels(filters.priceLevels);
  const startedAtMs = Date.now();
  const normalizedExcludePlaceIds = new Set((Array.isArray(excludePlaceIds) ? excludePlaceIds : []).map((value) => String(value || '')).filter(Boolean));
  const effectiveCacheKey = cacheKey || `${keyword || query || searchTerm}::${location}`;

  if (!effectiveApiKey) {
    finishProgressSession(sessionId, {
      status: 'failed',
      error: 'Google Maps API key is required.',
      message: 'Google Maps API key is required.',
    });
    return res.status(400).json({ error: 'Google Maps API key is required.' });
  }

  if (!searchTerm || !location) {
    finishProgressSession(sessionId, {
      status: 'failed',
      error: 'Both query and location are required.',
      message: 'Both query and location are required.',
    });
    return res.status(400).json({ error: 'Both query and location are required.' });
  }

  updateProgressSession(sessionId, {
    status: 'running',
    total: requestedResults,
    fetched: 0,
    eta: null,
    currentPlace: '',
    stage: requestedResults > 60 ? 'grid' : 'single',
    strategy: requestedResults > 60 ? 'grid' : 'single',
    message: `Preparing ${requestedResults > 60 ? 'grid' : 'single'} search for ${requestedResults} results`,
    startedAt: new Date(startedAtMs).toISOString(),
    error: null,
  });

  try {
    let resolvedLocation = null;
    try {
      resolvedLocation = await geocodeLocation(location, effectiveApiKey);
    } catch (error) {
      resolvedLocation = null;
    }
    const expansionKey = detectExpansionKey({ searchTerm, categoryText, includedType });
    const gridSize = requestedResults <= 60 ? 1 : Math.max(2, Math.ceil(Math.sqrt(requestedResults / 60)) + 1);
    const gridPoints = buildSearchGridPoints(resolvedLocation, normalizedRadius, gridSize);
    const state = {
      requestedResults,
      startedAtMs,
      results: [],
      seenResultPlaceIds: new Set(),
      excludePlaceIds: normalizedExcludePlaceIds,
      duplicatesSkipped: 0,
      excludedSkipped: 0,
      detailLookups: 0,
      textSearches: 0,
      stage: requestedResults > 60 ? 'grid' : 'single',
      strategy: requestedResults > 60 ? 'grid' : 'single',
      gridPoint: 0,
      totalPoints: requestedResults > 60 ? gridPoints.length : 1,
      queryLabel: searchTerm,
    };

    const context = {
      effectiveApiKey,
      filters,
      includedType,
      location,
      normalizedMinRating,
      normalizedPriceLevels,
      pageSize,
      sessionId,
      state,
    };

    if (requestedResults <= 60) {
      await runSearchPlanSet(
        [
          {
            queryText: searchTerm,
            queryLabel: searchTerm,
            point: resolvedLocation ? { lat: resolvedLocation.lat, lng: resolvedLocation.lng, radius: normalizedRadius } : null,
            strategy: 'single',
            gridPoint: 1,
            totalPoints: 1,
          },
        ],
        context,
        'single',
      );
    } else {
      const primaryGridPlans = gridPoints.map((point, index) => ({
        queryText: searchTerm,
        queryLabel: searchTerm,
        point,
        strategy: 'grid',
        gridPoint: index + 1,
        totalPoints: gridPoints.length,
      }));

      await runSearchPlanSet(primaryGridPlans, context, 'grid');
    }

    if (state.results.length < requestedResults && expansionKey) {
      const splitQueries = buildCategorySplitQueries(expansionKey, searchTerm)
        .filter((queryText) => queryText.toLowerCase() !== searchTerm.toLowerCase())
        .map((queryText) => ({
          queryText,
          queryLabel: queryText,
          point: resolvedLocation ? { lat: resolvedLocation.lat, lng: resolvedLocation.lng, radius: normalizedRadius } : null,
          strategy: 'category-split',
          gridPoint: 0,
          totalPoints: 0,
        }));

      if (splitQueries.length) {
        await runSearchPlanSet(splitQueries, context, 'category-split');
      }
    }

    if (state.results.length < requestedResults && expansionKey) {
      const keywordVariations = buildKeywordVariationQueries(expansionKey)
        .map((queryText) => ({
          queryText,
          queryLabel: queryText,
          point: resolvedLocation ? { lat: resolvedLocation.lat, lng: resolvedLocation.lng, radius: normalizedRadius } : null,
          strategy: 'keyword-variation',
          gridPoint: 0,
          totalPoints: 0,
        }));

      if (keywordVariations.length) {
        await runSearchPlanSet(keywordVariations, context, 'keyword-variation');
      }
    }

    const dedupedResults = dedupeMapsResults(state.results);
    const filteredResults = applyServerFilters(dedupedResults, filters).slice(0, requestedResults);
    const cost = buildMapsCostMeta(state.detailLookups, state.textSearches);
    const extraction = rememberExtraction(req.auth.userId, 'Google Maps', filteredResults, {
      query: keyword || query || '',
      keyword: keyword || query || '',
      location,
      radius,
      maxResults: requestedResults,
      category,
      excludePlaceIds: Array.from(normalizedExcludePlaceIds),
      cacheKey: effectiveCacheKey,
      filters,
    }, {
      cost,
      summary: {
        searchTerm,
        dedupedCount: dedupedResults.length,
        rawFetchedCount: state.results.length,
        strategy: requestedResults > 60 ? `grid-${gridSize}x${gridSize}` : 'single',
        gridSize,
        textSearches: state.textSearches,
        detailLookups: state.detailLookups,
        duplicatesSkipped: state.duplicatesSkipped,
        excludedSkipped: state.excludedSkipped,
      },
    });
    database.logActivity({
      userId: req.auth.userId,
      action: 'search',
      details: {
        source: 'Google Maps',
        keyword: keyword || query || '',
        location,
        resultCount: filteredResults.length,
      },
      ipAddress: getClientIp(req),
    });

    saveMapsSeenSession(effectiveCacheKey, filteredResults.map((result) => result.placeId || result.id));

    finishProgressSession(sessionId, {
      status: 'completed',
      fetched: filteredResults.length,
      total: requestedResults,
      eta: 0,
      currentPlace: filteredResults.at(-1)?.name || '',
      stage: state.stage,
      strategy: state.strategy,
      gridPoint: state.gridPoint,
      totalPoints: state.totalPoints,
      skippedDuplicates: state.duplicatesSkipped,
      skippedExcluded: state.excludedSkipped,
      message: buildMapsSearchMessage({
        strategy: state.strategy,
        stage: 'completed',
        fetched: filteredResults.length,
        total: requestedResults,
        gridPoint: state.gridPoint,
        totalPoints: state.totalPoints,
        queryLabel: state.queryLabel,
        skippedExcluded: state.excludedSkipped,
        skippedDuplicates: state.duplicatesSkipped,
      }),
    });

    return res.json({
      success: true,
      results: filteredResults,
      extraction,
      meta: {
        searchTerm,
        resolvedLocation,
        requestedResults,
        pageSize,
        dedupedResults: dedupedResults.length,
        rawFetchedCount: state.results.length,
        returnedResults: filteredResults.length,
        duplicatesSkipped: state.duplicatesSkipped,
        excludedSkipped: state.excludedSkipped,
        strategy: requestedResults > 60 ? 'grid' : 'single',
        strategyLabel: requestedResults > 60 ? `Using grid search (${gridSize}x${gridSize}) to find ${requestedResults}+ results` : 'Using single search strategy',
        gridSize,
        textSearches: state.textSearches,
        detailLookups: state.detailLookups,
        cacheKey: normalizeCacheKey(effectiveCacheKey),
        cost,
      },
    });
  } catch (error) {
    finishProgressSession(sessionId, {
      status: 'failed',
      error: error.message,
      message: error.message,
    });
    return res.status(500).json({ error: error.message });
  }
}

app.get('/api/maps/session/seen', (req, res) => {
  const session = getMapsSeenSession(req.query.cacheKey || '');
  if (!session) {
    return res.json({ cacheKey: normalizeCacheKey(req.query.cacheKey || ''), placeIds: [], updatedAt: null });
  }
  return res.json(session);
});

app.post('/api/maps/session/seen', (req, res) => {
  const session = saveMapsSeenSession(req.body?.cacheKey || '', req.body?.placeIds || []);
  if (!session) {
    return res.status(400).json({ error: 'cacheKey is required.' });
  }
  return res.json(session);
});

app.post('/api/maps/search', handleMapsSearch);

app.get('/api/maps/search/progress/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  attachProgressClient(sessionId, res);

  req.on('close', () => {
    const session = progressSessions.get(sessionId);
    if (!session) return;
    session.clients.delete(res);
  });
});

app.get('/api/maps/location-suggestions', async (req, res) => {
  const userSettings = getUserSettings(req.auth.userId);
  const apiKey = req.query.apiKey || userSettings.googleMapsApiKey;
  const query = String(req.query.query || '').trim();

  if (!apiKey) {
    return res.status(400).json({ error: 'Google Maps API key is required.' });
  }

  if (query.length < 2) {
    return res.json({ suggestions: [] });
  }

  try {
    const suggestions = await fetchLocationSuggestions(query, apiKey);
    return res.json({ suggestions });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/google-maps/search', requireAuth, async (req, res) => {
  req.body.query = req.body.query || [req.body.keyword, req.body.category].filter(Boolean).join(' ');
  return handleMapsSearch(req, res);
});

app.post('/api/linkedin/search', async (req, res) => {
  const {
    name = '',
    company = '',
    role = '',
    location = '',
    industry = '',
    maxResults = 10,
  } = req.body || {};

  const userSettings = getUserSettings(req.auth.userId);

  if (!userSettings.linkedinApiKey) {
    return res.status(402).json({
      error: 'LinkedIn API key not configured',
      configRequired: true,
    });
  }

  const { firstName, lastName } = splitFullName(name);

  try {
    const proxycurlResponse = await searchLinkedInProfiles({
      apiKey: userSettings.linkedinApiKey,
      firstName,
      lastName,
      company,
      role,
      location,
      maxResults,
    });

    const normalizedResults = (proxycurlResponse.results || [])
      .map((entry) => normalizeLinkedInProfile(entry, { name, company, role, location, industry }))
      .filter((profile) => {
        if (industry && !String(profile.industry || '').toLowerCase().includes(industry.toLowerCase())) {
          return false;
        }
        return Boolean(profile.name || profile.profileUrl);
      });

    const extraction = rememberExtraction(req.auth.userId, 'LinkedIn', normalizedResults, req.body || {}, {
      cost: { inr: 0, currency: 'INR' },
    });
    database.logActivity({
      userId: req.auth.userId,
      action: 'search',
      details: {
        source: 'LinkedIn',
        keyword: name || role || company || '',
        location,
        resultCount: normalizedResults.length,
      },
      ipAddress: getClientIp(req),
    });
    return res.json({
      success: true,
      results: normalizedResults,
      extraction,
      meta: {
        returnedResults: normalizedResults.length,
        totalResultCount: proxycurlResponse.total_result_count ?? normalizedResults.length,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/history', (req, res) => {
  res.json(database.getExtractionHistoryByUser(req.auth.userId));
});

app.delete('/api/history/:id', (req, res) => {
  database.deleteExtraction(req.auth.userId, Number(req.params.id));
  res.json({ success: true });
});

app.get('/api/activity', requireAuth, (req, res) => {
  res.json(database.getActivityLogsByUser(req.auth.userId, 10));
});

app.post('/api/export', (req, res) => {
  const { data = [], sheetName = 'Results', filename } = req.body || {};

  if (!Array.isArray(data) || !data.length) {
    return res.status(400).json({ error: 'Export data is required.' });
  }

  try {
    const worksheet = xlsx.utils.json_to_sheet(data);
    applyWorksheetFormatting(worksheet, data);

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, normalizeSheetName(sheetName));

    const buffer = xlsx.write(workbook, {
      bookType: 'xlsx',
      type: 'buffer',
      cellStyles: true,
    });

    const resolvedFilename = filename || `super_data_export_${buildTimestamp()}.xlsx`;
    database.logActivity({
      userId: req.auth.userId,
      action: 'export',
      details: { format: 'xlsx', rowCount: data.length, filename: resolvedFilename, sheetName },
      ipAddress: getClientIp(req),
    });
    res.setHeader('Content-Disposition', `attachment; filename="${resolvedFilename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/export/csv', (req, res) => {
  const { data = [], filename } = req.body || {};

  if (!Array.isArray(data) || !data.length) {
    return res.status(400).json({ error: 'Export data is required.' });
  }

  try {
    const buffer = buildCsvBuffer(data);
    const resolvedFilename = filename || `super_data_export_${buildTimestamp()}.csv`;
    database.logActivity({
      userId: req.auth.userId,
      action: 'export',
      details: { format: 'csv', rowCount: data.length, filename: resolvedFilename },
      ipAddress: getClientIp(req),
    });
    res.setHeader('Content-Disposition', `attachment; filename="${resolvedFilename}"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/check-url', async (req, res) => {
  const url = String(req.query.url || '').trim();

  if (!url) {
    return res.status(400).json({ error: 'url is required.' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    return res.status(400).json({ error: 'Invalid URL.' });
  }

  if (!/^https?:$/.test(parsedUrl.protocol)) {
    return res.status(400).json({ error: 'Only HTTP and HTTPS URLs are supported.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), URL_CHECK_TIMEOUT_MS);

  try {
    let response = await fetch(parsedUrl.toString(), {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    });

    if (response.status === 405 || response.status === 501) {
      response = await fetch(parsedUrl.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
      });
    }

    return res.json({
      status: response.status,
      reachable: response.ok,
    });
  } catch (error) {
    return res.json({
      status: 0,
      reachable: false,
      error: error.name === 'AbortError' ? 'Timed out' : error.message,
    });
  } finally {
    clearTimeout(timeout);
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Super Data Extractor running at http://localhost:${PORT}`);
});
