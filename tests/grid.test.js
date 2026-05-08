'use strict';

const grid = require('../lib/grid');

describe('grid: rectangleAround', () => {
  it('produces a symmetric rectangle around the center', () => {
    const c = { lat: 19.0, lng: 72.8 };
    const r = grid.rectangleAround(c, 1000);
    expect(r.high.lat).toBeGreaterThan(c.lat);
    expect(r.low.lat).toBeLessThan(c.lat);
    expect(r.high.lng).toBeGreaterThan(c.lng);
    expect(r.low.lng).toBeLessThan(c.lng);
    // ~ 1km north-south is ~ 0.009 deg
    expect(r.high.lat - c.lat).toBeCloseTo(0.00898, 3);
  });
});

describe('grid: buildGrid', () => {
  it('returns 1 cell at gridSize=1', () => {
    const cells = grid.buildGrid({ lat: 19, lng: 72 }, 5000, 1);
    expect(cells).toHaveLength(1);
  });
  it('returns N*N cells', () => {
    expect(grid.buildGrid({ lat: 19, lng: 72 }, 5000, 3)).toHaveLength(9);
    expect(grid.buildGrid({ lat: 19, lng: 72 }, 5000, 4)).toHaveLength(16);
  });
});

describe('grid: shouldSubdivide', () => {
  it('subdivides when cell hit cap and depth < max', () => {
    expect(grid.shouldSubdivide({ resultsInCell: 60, capped: true, depth: 0, maxDepth: 3 })).toBe(true);
  });
  it('does NOT subdivide an empty cell', () => {
    expect(grid.shouldSubdivide({ resultsInCell: 0, capped: true, depth: 0, maxDepth: 3 })).toBe(false);
  });
  it('respects maxDepth', () => {
    expect(grid.shouldSubdivide({ resultsInCell: 60, capped: true, depth: 3, maxDepth: 3 })).toBe(false);
  });
  it('does NOT subdivide when not capped', () => {
    expect(grid.shouldSubdivide({ resultsInCell: 30, capped: false, depth: 0, maxDepth: 3 })).toBe(false);
  });
});

describe('grid: subdivide', () => {
  it('splits one cell into 4 quarter-radius cells', () => {
    const cell = {
      center: { lat: 19, lng: 72 },
      radiusMeters: 1000,
      depth: 0,
      gridIndex: 0,
      rectangle: grid.rectangleAround({ lat: 19, lng: 72 }, 1000),
    };
    const sub = grid.subdivide(cell);
    expect(sub).toHaveLength(4);
    expect(sub[0].depth).toBe(1);
    expect(sub[0].radiusMeters).toBe(500);
  });
});
