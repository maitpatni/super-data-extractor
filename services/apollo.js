'use strict';

const { UpstreamError } = require('../lib/errors');

const APOLLO_PEOPLE_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_people/search';
const APOLLO_HEALTH_CHECK_URL = 'https://api.apollo.io/api/v1/auth/health_check';
const PER_PAGE = 25;
const HARD_CAP = 200;

async function callApollo(url, body, apiKey, label) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
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
 * Apollo's mixed_people/search supports a number of filter parameters; importantly
 * we now pass `industry` ALONGSIDE name/role/etc., not as a fallback for keywords.
 * Mapping reference (current Apollo docs):
 *   q_keywords                    – free-text
 *   person_titles[]               – job titles
 *   person_locations[]            – cities/regions
 *   q_organization_name           – exact-ish org name
 *   q_organization_industry_keywords[] – industry filter (multi-token OK)
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
