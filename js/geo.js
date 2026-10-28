// Display geometry (plan R4, R13): an event's window of the T42 grid — rows ascending in latitude, columns eastward from
// lon0 in steps of dlon — and the display domain, the event's centre ± half_width_deg × lat_min..90 N, that js/proj.js
// maps to a polar-stereographic panel.

// The display domain of an event (plan R4): its centre longitude (or Compare's common one) ± half_width_deg, from
// lat_min_display to the pole.
export function domainOf(ev, grid, lonC = ev.centre[1]) {
  return { lonC, half: grid.half_width_deg, latS: grid.lat_min_display };
}

export const wrap180 = (x) => ((((x % 360) + 540) % 360) - 180);

// Fractional column of `lon` (any unwrapping) in the window lon0, lon0 + dlon, …, lon0 + (ncol - 1) dlon; NaN outside.
export function colIndex(lon, lon0, dlon, ncol) {
  let d = (((lon - lon0) % 360) + 360) % 360;
  if (d > 360 - 1e-9) d = 0;
  const j = d / dlon;
  return j <= ncol - 1 + 1e-9 ? Math.min(j, ncol - 1) : NaN;
}

// Fractional row of `lat` on ascending, unevenly spaced (Gaussian) row latitudes, clamped to [0, n - 1].
export function rowCoord(lat, rows) {
  const n = rows.length;
  if (lat <= rows[0]) return 0;
  if (lat >= rows[n - 1]) return n - 1;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (rows[m] <= lat) lo = m; else hi = m;
  }
  return lo + (lat - rows[lo]) / (rows[hi] - rows[lo]);
}

export function rowLat(i, rows) {
  const i0 = Math.min(Math.max(Math.floor(i), 0), rows.length - 2);
  return rows[i0] + (i - i0) * (rows[i0 + 1] - rows[i0]);
}

export function bilinear(vals, nrow, ncol, i, j) {
  const i0 = Math.min(Math.floor(i), nrow - 2), j0 = Math.min(Math.floor(j), ncol - 2);
  const fi = i - i0, fj = j - j0, k = i0 * ncol + j0;
  const a = vals[k], b = vals[k + 1], c = vals[k + ncol], d = vals[k + ncol + 1];
  return (1 - fi) * ((1 - fj) * a + fj * b) + fi * ((1 - fj) * c + fj * d);
}

export function lonLabel(lon) {
  let x = ((((lon % 360) + 540) % 360) - 180);
  x = Math.round(x * 10) / 10;
  if (x === -180) x = 180;
  if (x === 0 || x === 180) return `${Math.abs(x)}°`;
  return x > 0 ? `${x}°E` : `${-x}°W`;
}

// Model date and hour of frame time t (days) for an event whose s* is the model date `sStar` (YYYY-MM-DD, 00 UTC,
// proleptic Gregorian). JS Date is proleptic Gregorian; setUTCFullYear keeps years below 100 literal.
export function frameDate(sStar, t) {
  const [y, m, d] = sStar.split('-').map(Number);
  const base = new Date(0);
  base.setUTCFullYear(y, m - 1, d);
  base.setUTCHours(0, 0, 0, 0);
  const at = new Date(base.getTime() + Math.round(t * 86400000));
  const p = (v, n) => String(v).padStart(n, '0');
  return `${p(at.getUTCFullYear(), 4)}-${p(at.getUTCMonth() + 1, 2)}-${p(at.getUTCDate(), 2)} ${p(at.getUTCHours(), 2)} UTC`;
}
