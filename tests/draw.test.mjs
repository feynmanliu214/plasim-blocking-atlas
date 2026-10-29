import test from 'node:test';
import assert from 'node:assert/strict';
import { levelsFor, regionField, padRows, drawPanel, frameFields, PANELS, STYLE } from '../js/draw.js';
import { pixelMap } from '../js/render.js';
import { projector } from '../js/proj.js';
import { bilinear, colIndex, domainOf, rowCoord } from '../js/geo.js';
import { decodeEvent, frameSlice } from '../js/data.js';
import { Raster } from '../tools/raster.mjs';
import { makeIndex, eventBuffer } from './fixture.mjs';

function fields(idx, k = 30) {
  const g = idx.grid, n = g.nrow * g.ncol;
  const v = { ...decodeEvent(eventBuffer(idx), idx), ...decodeEvent(eventBuffer(idx, undefined, idx.lwa.vars), idx, idx.lwa.vars) };
  const z5 = Float32Array.from({ length: n }, (_, q) => 300 * Math.exp(-(((Math.floor(q / g.ncol) - 16) ** 2) + ((q % g.ncol) - 44) ** 2) / 40));
  return frameFields(idx, v, k, { z5, region: Uint8Array.from(z5, (x) => (x >= 250 ? 1 : 0)) });
}

// A Raster that records each stroke's colour, width and paths.
function recorder(W, H) {
  const R = new Raster(W, H), strokes = [], stroke = R.stroke.bind(R);
  R.stroke = () => { strokes.push({ color: R.strokeStyle, width: R.lineWidth, paths: R.paths.map((p) => [...p]) }); stroke(); };
  return { R, strokes };
}
const vertices = (strokes, st) => strokes.filter((x) => x.color === st.color && x.width === st.width)
  .flatMap((x) => x.paths.flatMap((p) => Array.from({ length: p.length >> 1 }, (_, q) => [p[2 * q], p[2 * q + 1]])));

test('levelsFor spans the field every step and can skip zero', () => {
  assert.deepEqual(levelsFor(Float32Array.from([-250, 30, 410, NaN]), 100, { skipZero: true }), [-200, -100, 100, 200, 300, 400]);
  assert.deepEqual(levelsFor(Float32Array.from([997.5, 1006]), 4), [1000, 1004]);
  assert.deepEqual(levelsFor(Float32Array.from([NaN]), 4), []);
});

test('padRows repeats the first and last rows at lat_min_display and at the pole', () => {
  const P = padRows(Float32Array.from([1, 2, 3, 4, 5, 6]), { nrow: 2, ncol: 3, lat: [30, 60], lat_min_display: 20 });
  assert.deepEqual([...P.vals], [1, 2, 3, 1, 2, 3, 4, 5, 6, 4, 5, 6]);
  assert.deepEqual([P.nrow, P.ncol, P.lat], [4, 3, [20, 30, 60, 90]]);
});

test('regionField leaves only the region at or above the threshold', () => {
  const z = Float32Array.from([300, 300, 0, 300, 0, 0, 0, 0, 300]), reg = Uint8Array.from([1, 1, 0, 1, 0, 0, 0, 0, 0]);
  const f = regionField(z, reg, 200);
  assert.deepEqual([...f].map((v) => v >= 200), [true, true, false, true, false, false, false, false, false]);   // the corner 300 is another blob
  assert.ok(Math.abs(f[8] - 199.95) < 1e-4 && f[0] === 300);
  assert.ok(regionField(Float32Array.from([199.98]), Uint8Array.from([1]), 200)[0] >= 200.05 - 1e-4);          // quantised just under ½M
});

test('the isobar panel is paper and grey lines only; the shaded panels use the colormap; × sits at the projected centre', () => {
  const idx = makeIndex(), ev = idx.events[0], W = 160, H = 120, map = pixelMap(idx.grid, ev, W, H), f = fields(idx);
  assert.deepEqual(PANELS.map((p) => p.key), ['z500a', 'v250', 'psl', 'lwa', 'z5']);
  const S = new Raster(W, H); drawPanel(S, map, idx, ev, f, 'psl', 1);
  let opaque = 0;
  for (let p = 0; p < W * H; p++) {
    const [r, g, b, a] = S.data.subarray(4 * p, 4 * p + 4);
    if (!a) continue;
    opaque++;
    assert.ok(Math.abs(r - g) <= 2 && Math.abs(g - b) <= 2, `pixel ${p}: ${r},${g},${b}`);
  }
  assert.ok(opaque > 0.6 * W * H);
  const Z = new Raster(W, H); drawPanel(Z, map, idx, ev, f, 'z500a', 1);
  let coloured = 0;
  for (let p = 0; p < W * H; p++) if (Z.data[4 * p + 3] && Math.abs(Z.data[4 * p] - Z.data[4 * p + 2]) > 20) coloured++;
  assert.ok(coloured > 0.3 * W * H);
  const [x, y] = projector(domainOf(ev, idx.grid), W, H).xy(ev.centre[0], ev.centre[1]), o = 4 * (Math.floor(y) * W + Math.floor(x));
  assert.ok(Z.data[o] < 60 && Z.data[o + 1] < 60 && Z.data[o + 2] < 60, 'centre ×');
});

test('draw order: shading, coastline, field contours, graticule, patch box', () => {
  const idx = makeIndex(), ev = idx.events[0], map = pixelMap(idx.grid, ev, 160, 120), R = new Raster(160, 120), seen = [];
  const stroke = R.stroke.bind(R);
  R.stroke = () => { seen.push(R.strokeStyle); stroke(); };
  drawPanel(R, map, idx, ev, fields(idx), 'z500a', 1);
  const at = (c) => seen.indexOf(c);
  assert.ok(at(STYLE.coast.color) >= 0 && at(STYLE.coast.color) < at(STYLE.z.color) && at(STYLE.z.color) < at(STYLE.grid.color)
    && at(STYLE.grid.color) < at(STYLE.box.color), seen.join(' | '));
});

test('every drawn Z500 anomaly contour vertex lies on the shading’s interpolant at a non-zero multiple of 100 m', () => {
  const idx = makeIndex(), ev = idx.events[0], g = idx.grid, map = pixelMap(g, ev, 320, 240), f = fields(idx);
  const { R, strokes } = recorder(320, 240);
  drawPanel(R, map, idx, ev, f, 'z500a', 1);
  let n = 0, worst = 0;
  for (const [x, y] of vertices(strokes, STYLE.z)) {
    const [lat, lon] = map.P.ll(x, y);
    if (lat > 89.99) continue;                                    // the pole: every padded-row end meets there, longitude undefined
    const val = bilinear(f.z500a, g.nrow, g.ncol, rowCoord(lat, g.lat), colIndex(lon, ev.lon0, g.dlon, g.ncol));
    const lv = Math.round(val / 100) * 100;
    assert.notEqual(lv, 0);
    worst = Math.max(worst, Math.abs(val - lv)); n++;
  }
  assert.ok(n > 200, `${n} vertices`);
  assert.ok(worst < 0.5, `worst ${worst} m`);
});

test('the ½·M outline encloses only the region, not another blob above ½·M', () => {
  const idx = makeIndex(), ev = idx.events[0], g = idx.grid, map = pixelMap(g, ev, 320, 240), n = g.nrow * g.ncol;
  const blob = (q, jc) => 400 * Math.exp(-(((Math.floor(q / g.ncol) - 16) ** 2) + ((q % g.ncol) - jc) ** 2) / 20);
  const z5 = Float32Array.from({ length: n }, (_, q) => blob(q, 30) + blob(q, 60));               // two blobs above ½·M = 250 m
  const region = Uint8Array.from(z5, (x, q) => (x >= 0.5 * ev.M_y && q % g.ncol < 45 ? 1 : 0));   // the left one is the region
  const zero = new Float32Array(n), f = { z500a: zero, v250: zero, spd250: zero, psl: zero, z5, region };
  const { R, strokes } = recorder(320, 240);
  drawPanel(R, map, idx, ev, f, 'z5', 1);
  const cols = vertices(strokes, STYLE.region).map(([x, y]) => colIndex(map.P.ll(x, y)[1], ev.lon0, g.dlon, g.ncol));
  assert.ok(cols.length > 20, `${cols.length} vertices`);
  assert.ok(cols.every((j) => j > 20 && j < 40), `outline columns ${Math.min(...cols)}..${Math.max(...cols)}`);
});

test('the LWA map shades anticyclonic LWA through its colormap and draws the cyclonic lines on that field’s levels', () => {
  const idx = makeIndex(), ev = idx.events[0], g = idx.grid, map = pixelMap(g, ev, 320, 240), f = fields(idx);
  assert.deepEqual(Object.keys(f).sort(), ['lwa', 'lwa_c', 'psl', 'region', 'spd250', 'v250', 'z5', 'z500a']);
  const lw = decodeEvent(eventBuffer(idx, undefined, idx.lwa.vars), idx, idx.lwa.vars);
  assert.deepEqual(f.lwa, frameSlice(lw.lwa_a, 30, g.nrow, g.ncol));                     // shaded: anticyclonic
  assert.deepEqual(f.lwa_c, frameSlice(lw.lwa_c, 30, g.nrow, g.ncol));                   // lines: cyclonic
  const { R, strokes } = recorder(320, 240);
  drawPanel(R, map, idx, ev, f, 'lwa', 1);
  let n = 0, worst = 0;
  for (const [x, y] of vertices(strokes, STYLE.lwa)) {
    const [lat, lon] = map.P.ll(x, y);
    if (lat > 89.99) continue;
    const val = bilinear(f.lwa_c, g.nrow, g.ncol, rowCoord(lat, g.lat), colIndex(lon, ev.lon0, g.dlon, g.ncol));
    const lv = Math.round(val / idx.style.lwa_c.step) * idx.style.lwa_c.step;
    assert.ok(lv > 0, `level ${lv}`);
    worst = Math.max(worst, Math.abs(val - lv)); n++;
  }
  assert.ok(n > 50, `${n} vertices`);
  assert.ok(worst < 0.2, `worst ${worst}`);
  const S = new Raster(320, 240); drawPanel(S, map, idx, ev, { ...f, lwa: f.lwa_c }, 'lwa', 1);
  assert.ok(R.data.some((v, i) => v !== S.data[i]), 'shading follows f.lwa, not f.lwa_c');
});
