'use strict';

const { calculateMapsCost, tierForFieldMask, estimateMapsCost } = require('../lib/cost');
const { FIELD_MASK } = require('../lib/places-fields');

describe('cost: tierForFieldMask', () => {
  it('returns ESSENTIALS for id+displayName only', () => {
    expect(tierForFieldMask('id,displayName')).toBe('ESSENTIALS');
  });
  it('returns PRO when location/types added', () => {
    expect(tierForFieldMask('id,displayName,location,types')).toBe('PRO');
  });
  it('returns ENTERPRISE when phone/website/rating added', () => {
    expect(tierForFieldMask('id,displayName,websiteUri')).toBe('ENTERPRISE');
    expect(tierForFieldMask('id,displayName,nationalPhoneNumber')).toBe('ENTERPRISE');
    expect(tierForFieldMask('id,displayName,rating')).toBe('ENTERPRISE');
  });
  it('handles places.* prefix', () => {
    expect(tierForFieldMask('places.id,places.displayName,places.websiteUri')).toBe('ENTERPRISE');
  });
});

describe('cost: calculateMapsCost (Tier 1: no doubled details)', () => {
  it('detail lookups are 0 for the standard search path', () => {
    const c = calculateMapsCost({ textSearchFieldMask: FIELD_MASK, textSearches: 5, detailLookups: 0 });
    expect(c.counts.detailLookups).toBe(0);
    expect(c.breakdown.find((l) => /Place Details/.test(l.sku))).toBeUndefined();
  });

  it('honours USD->INR rate', () => {
    const usd = calculateMapsCost(
      { textSearchFieldMask: FIELD_MASK, textSearches: 1000, detailLookups: 0 },
      80,
    ).usd;
    const inr80 = calculateMapsCost(
      { textSearchFieldMask: FIELD_MASK, textSearches: 1000, detailLookups: 0 },
      80,
    ).inr;
    const inr100 = calculateMapsCost(
      { textSearchFieldMask: FIELD_MASK, textSearches: 1000, detailLookups: 0 },
      100,
    ).inr;
    expect(inr100).toBeGreaterThan(inr80);
    expect(inr80).toBeCloseTo(usd * 80, 1);
  });

  it('estimateMapsCost uses passed search count', () => {
    const e1 = estimateMapsCost({ fieldMask: FIELD_MASK, expectedTextSearches: 1 }, 84);
    const e10 = estimateMapsCost({ fieldMask: FIELD_MASK, expectedTextSearches: 10 }, 84);
    expect(e10.inr).toBeGreaterThan(e1.inr);
  });
});
