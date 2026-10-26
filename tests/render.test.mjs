import test from 'node:test';
import assert from 'node:assert/strict';
import { panelMap, shade, toPixels, lsmWindow, ASPECT } from '../js/render.js';
import { makeIndex } from './fixture.mjs';

test('shade maps values through the LUT, clamps, and leaves NaN transparent', () => {
  const grid = { lat: [20, 50, 90], nrow: 3, ncol: 3, dlon: 120, half_width_deg: 120, lat_min_display: 20 };
  const map = panelMap(grid, { centre: [55, 120], lon0: 0 }, 8, 4);
  const lut = Array.from({ length: 256 }, (_, k) => [k, 0, 0]);
  const img = shade(new Float32Array(9).fill(0), map, grid, lut, [-10, 10]);
  assert.equal(img[0], 128); assert.equal(img[3], 255);                 // 0 in [-10, 10] -> LUT round(127.5) = 128
  assert.equal(shade(new Float32Array(9).fill(99), map, grid, lut, [-10, 10])[0], 255);
  assert.equal(shade(new Float32Array(9).fill(-99), map, grid, lut, [-10, 10])[0], 0);
  assert.equal(shade(new Float32Array(9).fill(NaN), map, grid, lut, [-10, 10])[3], 0);
});

test('toPixels places grid points where the projector puts their latitude and longitude', () => {
  const idx = makeIndex(), ev = idx.events[0], g = idx.grid;
  const map = panelMap(g, ev, 720, Math.round(720 / ASPECT));
  const px = toPixels([3, 10, 7.5, 44], map, g, ev);
  assert.ok(Math.abs(px[0] - map.P.x(ev.lon0 + 10 * g.dlon)) < 1e-9 && Math.abs(px[1] - map.P.y(g.lat[3])) < 1e-9);
  const mid = g.lat[7] + 0.5 * (g.lat[8] - g.lat[7]);
  assert.ok(Math.abs(px[2] - map.P.x(ev.lon0 + 44 * g.dlon)) < 1e-9 && Math.abs(px[3] - map.P.y(mid)) < 1e-9);
  assert.equal(Math.round(720 / ASPECT), 210);
});

test('lsmWindow wraps the 128-column ring from col0', () => {
  const idx = makeIndex();
  const ev = { ...idx.events[0], col0: 100 };
  const w = lsmWindow(idx, ev);
  assert.equal(w[12 * 89 + 5], 1);                                      // ring column 105, row 12: land in the fixture
  assert.equal(w[12 * 89 + 30], 0);                                     // ring column (100 + 30) % 128 = 2
});
