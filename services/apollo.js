'use strict';

const { UpstreamError, ValidationError } = require('../lib/errors');
const { asPool } = require('../lib/key-pool');

const APOLLO_PEOPLE_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_people/search';
const APOLLO_HEALTH_CHECK_URL = 'https://api.apollo.io/api/v1/auth/health_check';
const PER_PAGE = 25;
const HARD_CAP = 200;
const MAX_RETRIES_429 = 3;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Low-level Apollo call with key-pool support. On 429, the offending key is
 * cooled off and the next available key is tried. The honored Retry-After
 * header informs the cooldown duration. Apollo doesn't bill us per call (it
 * bills credits), so we don't charge cost here — we just track usage counters.
 */
async function callApolloWithPool({ url, body, keyPool, label }) {
  if (!keyPool) throw new UpstreamError('Apollo.io', 'No API key available.', 400);
  const triedKeys = new Set();
  let lastError = null;

  while (triedKeys.size < keyPool.size()) {
    const key = keyPool.pick();
    if (!key) break;
    if (triedKeys.has(key.id)) break;
    triedKeys.add(key.id);

    for (let attempt = 0; attempt <= MAX_RETRIES_429; attempt += 1) {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': key.key,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (resp.status === 429) {
        const retryAfter = Number(resp.headers.get('retry-after')) || 2 * Math.pow(2, attempt);
        // Cool this key off; if we still have other keys, fall through to the
        // outer loop which will try the next one.
        if (keyPool.size() > 1) {
          keyPool.cooldown(key.id, retryAfter * 1000);
          break;
        }
        if (attempt < MAX_RETRIES_429) {
          await sleep(Math.min(retryAfter * 1000, 30_000));
          continue;
        }
      }
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        lastError = new UpstreamError(
          'Apollo.io',
          `${label || ''} ${data.message || data.error || `Status ${resp.status}`}`.trim(),
          resp.status,
          { keyId: key.id },
        );
        // Don't retry on hard errors; surface to caller.
        if (resp.status !== 429) throw lastError;
      } else {
        keyPool.charge(key.id, 0, 1); // count the call (cost in credits, tracked upstream)
        return data;
      }
    }
  }
  throw lastError || new UpstreamError('Apollo.io', 'All keys exhausted (rate-limited).', 429);
}

// Back-compat: callApollo(url, body, apiKey, label) — accept string or pool.
async function callApollo(url, body, apiKeyOrPool, label) {
  return callApolloWithPool({ url, body, keyPool: asPool(apiKeyOrPool), label });
}

async function validateApiKey(apiKeyOrPool) {
  const data = await callApollo(APOLLO_HEALTH_CHECK_URL, null, apiKeyOrPool, 'health');
  if (data.is_logged_in !== true) {
    throw new UpstreamError('Apollo.io', data.message || 'Invalid API key', 401);
  }
  return 'OK';
}

function normalizeProfile(result = {}, fallback = {}) {
  const location =
    [result.city, result.state, result.country].filter(Boolean).join(', ') || fallback.location || '';
  const phone = Array.isArray(result.phone_numbers)
    ? result.phone_numbers.find((entry) => entry?.sanitized_number)?.sanitized_number || ''
    : '';
  const employmentHistory = Array.isArray(result.employment_history) ? result.employment_history : [];
  const industry =
    result.organization?.industry ||
    employmentHistory.find((entry) => entry?.organization_industry)?.organization_industry ||
    fallback.industry ||
    '';

  return {
    id: result.id || result.linkedin_url || `${result.name || fallback.name}-${Date.now()}`,
    name:
      result.name || [result.first_name, result.last_name].filter(Boolean).join(' ') || fallback.name || '',
    firstName: result.first_name || '',
    lastName: result.last_name || '',
    headline: result.headline || result.title || '',
    company: result.organization?.name || fallback.company || '',
    companyWebsite: result.organization?.website_url || '',
    role: result.title || fallback.role || '',
    location,
    industry,
    email: result.email || '',
    phone,
    profileUrl: result.linkedin_url || '',
    photoUrl: result.photo_url || '',
    profilePictureUrl: result.photo_url || '',
    connectionDegree: '',
    followerCount: '',
    lastUpdated: result.updated_at || '',
  };
}

/**
 * Apollo's mixed_people/search supports a number of filter parameters. We
 * pass `industry` ALONGSIDE name/role/etc., not as a fallback for keywords.
 *
 * IMPORTANT: at least one non-empty filter is required, otherwise Apollo would
 * return its entire database paginated — that is a DB-scraping vector and a
 * massive credit spend. We hard-fail the request before sending.
 */
async function searchProfiles({
  apiKey,
  keyPool,
  name = '',
  company = '',
  role = '',
  location = '',
  industry = '',
  maxResults = 25,
}) {
  const filters = [name, company, role, location, industry]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  if (filters.length === 0) {
    throw new ValidationError('At least one of name, company, role, location, or industry is required.', {
      hint: 'Apollo would otherwise return its entire database — refusing to spend credits on an unbounded scrape.',
    });
  }

  const pool = keyPool || asPool(apiKey);
  if (!pool) throw new UpstreamError('Apollo.io', 'No Apollo API key configured.', 400);

  const want = Math.min(Math.max(Number(maxResults) || 25, 1), HARD_CAP);
  const totalPages = Math.ceil(want / PER_PAGE);
  const all = [];

  for (let page = 1; page <= totalPages && all.length < want; page += 1) {
    const body = { page, per_page: PER_PAGE };
    if (name) body.q_keywords = name;
    if (company) body.q_organization_name = company;
    if (role) body.person_titles = [role];
    if (location) body.person_locations = [location];
    if (industry) body.q_organization_industry_keywords = [industry];

    const data = await callApolloWithPool({
      url: APOLLO_PEOPLE_SEARCH_URL,
      body,
      keyPool: pool,
      label: 'people-search',
    });
    const people = Array.isArray(data.people) ? data.people : [];
    all.push(...people);

    if (!data.pagination || page >= data.pagination.total_pages) break;
  }

  return all
    .slice(0, want)
    .map((entry) => normalizeProfile(entry, { name, company, role, location, industry }));
}

module.exports = {
  APOLLO_PEOPLE_SEARCH_URL,
  APOLLO_HEALTH_CHECK_URL,
  validateApiKey,
  searchProfiles,
};
