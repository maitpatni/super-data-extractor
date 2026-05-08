'use strict';

const { KeyPool, asPool } = require('../lib/key-pool');

describe('KeyPool: round-robin distribution', () => {
  it('rotates across keys evenly', () => {
    const pool = new KeyPool([
      { id: 'a', key: 'KEY_A', ceilingInr: 100 },
      { id: 'b', key: 'KEY_B', ceilingInr: 100 },
      { id: 'c', key: 'KEY_C', ceilingInr: 100 },
    ]);
    const ids = [];
    for (let i = 0; i < 9; i += 1) ids.push(pool.pick().id);
    expect(ids).toEqual(['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c']);
  });

  it('skips cooled-down keys but keeps rotating', () => {
    const pool = new KeyPool([
      { id: 'a', key: 'A' },
      { id: 'b', key: 'B' },
      { id: 'c', key: 'C' },
    ]);
    pool.pick(); // a
    pool.cooldown('b', 60_000);
    expect(pool.pick().id).toBe('c');
    expect(pool.pick().id).toBe('a');
    expect(pool.pick().id).toBe('c');
  });

  it('returns null when every key is cooled-down', () => {
    const pool = new KeyPool([
      { id: 'a', key: 'A' },
      { id: 'b', key: 'B' },
    ]);
    pool.cooldown('a', 60_000);
    pool.cooldown('b', 60_000);
    expect(pool.pick()).toBeNull();
  });
});

describe('KeyPool: ceiling enforcement', () => {
  it('skips keys that hit their ceiling', () => {
    const pool = new KeyPool([
      { id: 'a', key: 'A', ceilingInr: 10 },
      { id: 'b', key: 'B', ceilingInr: 100 },
    ]);
    pool.pick(); // a
    pool.charge('a', 9.5, 1);
    expect(pool.pick().id).toBe('b');
    pool.charge('a', 5, 1); // pushes a over ceiling
    expect(pool.pick().id).toBe('b');
    expect(pool.pick().id).toBe('b');
  });

  it('infinity ceiling means unlimited', () => {
    const pool = new KeyPool([{ id: 'a', key: 'A' }]);
    for (let i = 0; i < 10; i += 1) pool.charge('a', 1_000, 1);
    expect(pool.pick().id).toBe('a'); // never blocked
  });
});

describe('KeyPool: charge invokes onCharge callback', () => {
  it('passes (keyId, costInr, calls)', () => {
    const calls = [];
    const pool = new KeyPool([{ id: 'a', key: 'A' }], {
      onCharge: (keyId, costInr, count) => calls.push({ keyId, costInr, count }),
    });
    pool.charge('a', 0.05, 1);
    pool.charge('a', 0.1, 1);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ keyId: 'a', costInr: 0.05, count: 1 });
  });
});

describe('KeyPool: stats snapshot', () => {
  it('reports calls, spent, cooldown', () => {
    const pool = new KeyPool([
      { id: 'a', key: 'A', ceilingInr: 50 },
      { id: 'b', key: 'B', ceilingInr: 50 },
    ]);
    pool.pick();
    pool.pick();
    pool.charge('a', 12.34, 1);
    pool.cooldown('b', 5_000);
    const s = pool.stats();
    expect(s).toHaveLength(2);
    expect(s[0].calls).toBe(1);
    expect(s[0].spentTodayInr).toBeCloseTo(12.34, 2);
    expect(s[1].cooledDown).toBe(true);
  });
});

describe('asPool', () => {
  it('wraps a string key in a 1-key pool', () => {
    const pool = asPool('legacy-key');
    expect(pool.size()).toBe(1);
    expect(pool.pick().key).toBe('legacy-key');
  });

  it('passes through an existing KeyPool', () => {
    const original = new KeyPool([{ id: 'a', key: 'A' }]);
    expect(asPool(original)).toBe(original);
  });

  it('returns null for empty/invalid input', () => {
    expect(asPool('')).toBeNull();
    expect(asPool(null)).toBeNull();
    expect(asPool({})).toBeNull();
  });
});
