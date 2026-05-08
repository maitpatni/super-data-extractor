'use strict';

const { UpstreamError, ValidationError } = require('../lib/errors');

const APOLLO_PEOPLE_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_people/search';
const APOLLO_HEALTH_CHECK_URL = 'https://api.apollo.io/api/v1/auth/health_check';
const PER_PAGE = 25;
const HARD_CAP = 200;
const MAX_RETRIES_429 = 3;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callApollo(url, body, apiKey, label) {
  for (let attempt = 0; attempt <= MAX_RETRIES_429; attempt += 1) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (resp.status === 429 && attempt < MAX_RETRIES_429) {
      const retryAfter = Number(resp.headers.get('retry-after')) || 2 * Math.pow(2, attempt);
      await sleep(Math.min(retryAfter * 1000, 30_000));
      continue;
    }
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new UpstreamError(
        'Apollo.io',
        `${label || ''} ${data.message || data.error || `Status ${resp.status}`}`.trim(),
        resp.status,
      );
    }
    return data;
  }
  throw new UpstreamError('Apollo.io', `${label || ''} Rate-limited after ${MAX_RETRIES_429} retries`, 429);
}

async function validateApiKey(apiKey) {
  const data = await callApollo(APOLLO_HEALTH_CHECK_URL, null, apiKey, 'health');
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

    const data = await callApollo(APOLLO_PEOPLE_SEARCH_URL, body, apiKey, 'people-search');
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
