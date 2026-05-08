'use strict';

// One field mask, used by both the API request and the cost calculator.
// Adding a field here is a billing change — review against lib/cost.js tiers.
const PLACES_FIELDS = [
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
];

const FIELD_MASK = PLACES_FIELDS.join(',');
const RESOURCE_FIELD_MASK = ['nextPageToken', ...PLACES_FIELDS.map((f) => `places.${f}`)].join(',');

module.exports = { PLACES_FIELDS, FIELD_MASK, RESOURCE_FIELD_MASK };
