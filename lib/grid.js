'use strict';

const EARTH_M_PER_LAT_DEGREE = 111320;

function metersToLatDeg(m) {
  return Number(m || 0) / EARTH_M_PER_LAT_DEGREE;
}

function metersToLngDeg(m, atLat) {
  const denom = EARTH_M_PER_LAT_DEGREE * Math.cos((Number(atLat || 0) * Math.PI) / 180);
  if (!Number.isFinite(denom) || Math.abs(denom) < 1) return 0;
  return Number(m || 0) / denom;
}

/**
 * Build a rectangular bounds object centered at `center` with half-width
 * `radiusMeters`. Returns { low: {lat, lng}, high: {lat, lng} } suitable for
 * Google Places `locationRestriction.rectangle`.
 */
function rectangleAround(center, radiusMeters) {
  const dLat = metersToLatDeg(radiusMeters);
  const dLng = metersToLngDeg(radiusMeters, center.lat);
  return {
    low: { lat: center.lat - dLat, lng: center.lng - dLng },
    high: { lat: center.lat + dLat, lng: center.lng + dLng },
  };
}

/**
 * Generate an N×N grid of square cells covering a circular area of radius
 * `radiusMeters` around `center`. Each cell is itself a rectangle.
 */
function buildGrid(center, radiusMeters, gridSize) {
  const n = Math.max(1, Math.floor(Number(gridSize) || 1));
  const r = Math.min(Math.max(Number(radiusMeters) || 5000, 100), 50000);
  if (!center || n === 1) {
    return [{ center, radiusMeters: r, rectangle: rectangleAround(center, r), gridIndex: 0, depth: 0 }];
  }
  const stepM = (r * 2) / n;
  const cellHalfM = stepM / 2;
  const mid = (n - 1) / 2;
  const cells = [];
  let idx = 0;
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const northSouth = (mid - row) * stepM;
      const eastWest = (col - mid) * stepM;
      const cellCenter = {
        lat: center.lat + metersToLatDeg(northSouth),
        lng: center.lng + metersToLngDeg(eastWest, center.lat),
      };
      cells.push({
        center: cellCenter,
        radiusMeters: cellHalfM,
        rectangle: rectangleAround(cellCenter, cellHalfM),
        gridIndex: idx,
        depth: 0,
      });
      idx += 1;
    }
  }
  return cells;
}

/**
 * Subdivide a single cell into 2×2 sub-cells.
 */
function subdivide(cell) {
  const half = cell.radiusMeters / 2;
  const offsets = [
    { dLat: half, dLng: -half },
    { dLat: half, dLng: half },
    { dLat: -half, dLng: -half },
    { dLat: -half, dLng: half },
  ];
  return offsets.map((o) => {
    const center = {
      lat: cell.center.lat + metersToLatDeg(o.dLat),
      lng: cell.center.lng + metersToLngDeg(o.dLng, cell.center.lat),
    };
    return {
      center,
      radiusMeters: half,
      rectangle: rectangleAround(center, half),
      gridIndex: cell.gridIndex,
      depth: (cell.depth || 0) + 1,
    };
  });
}

/**
 * Decide whether to subdivide a cell after a search.
 *  - If the cell hit Google's per-page cap (typically 60 results) AND
 *    we still need more results, subdivide it.
 *  - Cap recursion at maxDepth.
 */
function shouldSubdivide({ resultsInCell, capped, depth, maxDepth = 3 }) {
  return Boolean(capped) && (depth || 0) < maxDepth && resultsInCell > 0;
}

module.exports = {
  metersToLatDeg,
  metersToLngDeg,
  rectangleAround,
  buildGrid,
  subdivide,
  shouldSubdivide,
};
