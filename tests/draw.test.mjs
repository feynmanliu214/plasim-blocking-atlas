import test from 'node:test';
import assert from 'node:assert/strict';
import { levelsFor, regionField, padRows, drawPanel, PANELS, STYLE } from '../js/draw.js';
import { pixelMap } from '../js/render.js';
import { projector } from '../js/proj.js';
import { domainOf } from '../js/geo.js';
import { decodeEvent, frameSlice } from '../js/data.js';
import { Raster } from '../tools/raster.mjs';
import { makeIndex, eventBuffer } from './fixture.mjs';

function fields(idx, k = 30) {
  const g = idx.grid, v = decodeEvent(eventBuffer(idx), idx), n = g.nrow * g.ncol, s = (key) => frameSlice(v[key], k, g.nrow, g.ncol);
  const z5 = Float32Array.from({ length: n }, (_, q) => 300 * Math.exp(-(((Math.floor(q / g.ncol) - 16) ** 2) + ((q % g.ncol) - 44) ** 2) / 40));
  return { z500a: s('z500a'), v250: s('v250'), spd250: s('spd250'), psl: s('psl'), z5, region: Uint8Array.from(z5, (x) => (x >= 250 ? 1 : 0)) };
}

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
  assert.deepEqual(PANELS.map((p) => p.key), ['z500a', 'v250', 'psl', 'z5']);
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
