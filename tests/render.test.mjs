import test from 'node:test';
import assert from 'node:assert/strict';
import { panelMap, shade, toPixels, lsmWindow, ASPECT, pixelMap, samplePixel, shadePixels, fillPixels, clipLL, projectPolyline } from '../js/render.js';
import { rowCoord, colIndex } from '../js/geo.js';
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

test('pixelMap stencils sample the window where the projector and the row and column coordinates say', () => {
  const idx = makeIndex(), ev = idx.events[0], g = idx.grid, W = 96, H = 72, m = pixelMap(g, ev, W, H);
  const vals = Float32Array.from({ length: g.nrow * g.ncol }, (_, q) => 3 * Math.floor(q / g.ncol) + 0.5 * (q % g.ncol));
  let inside = 0;
  for (let y = 0; y < H; y += 5) for (let x = 0; x < W; x += 3) {
    const p = y * W + x, [lat, lon] = m.P.ll(x + 0.5, y + 0.5);
    if (m.k[p] < 0) { assert.ok(!m.P.inside(lat, lon) || Number.isNaN(colIndex(lon, ev.lon0, g.dlon, g.ncol))); continue; }
    inside++;
    const want = 3 * rowCoord(lat, g.lat) + 0.5 * colIndex(lon, ev.lon0, g.dlon, g.ncol);
    assert.ok(Math.abs(samplePixel(vals, m, p, g.ncol) - want) < 1e-5, `${x} ${y}`);
  }
  assert.ok(inside > 150);
});

test('shadePixels maps through the LUT and leaves outside pixels transparent; fillPixels paints paper inside', () => {
  const idx = makeIndex(), ev = idx.events[0], g = idx.grid, m = pixelMap(g, ev, 48, 36), n = g.nrow * g.ncol;
  const lut = Array.from({ length: 256 }, (_, k) => [k, 0, 0]), pIn = 35 * 48 + 24, pOut = 1 * 48 + 24;
  const img = shadePixels(new Float32Array(n).fill(0), m, g, lut, [-10, 10]);
  assert.deepEqual([...img.subarray(4 * pIn, 4 * pIn + 4)], [128, 0, 0, 255]);                 // round(127.5) = 128
  assert.equal(img[4 * pOut + 3], 0);
  assert.equal(shadePixels(new Float32Array(n).fill(99), m, g, lut, [-10, 10])[4 * pIn], 255);
  const paper = fillPixels(m, [255, 255, 255]);
  assert.deepEqual([...paper.subarray(4 * pIn, 4 * pIn + 4)], [255, 255, 255, 255]);
  assert.equal(paper[4 * pOut + 3], 0);
  const shifted = pixelMap(g, ev, 48, 36, ev.centre[1] + 100);          // a common centre 100° east: the west is outside the window
  assert.ok(shifted.k.some((k) => k < 0) && [...shifted.k].filter((k) => k >= 0).length < [...m.k].filter((k) => k >= 0).length);
});

test('clipLL cuts at the wedge edges and at latS, and refuses segments outside', () => {
  const dom = { lonC: 330, half: 120, latS: 20 };
  const c = clipLL(50, 430, 50, 470, dom);
  assert.ok(Math.abs(c[3] - 450) < 1e-6 && c[1] === 430 && c[4] === 0 && c[5] < 1);
  assert.equal(clipLL(50, 460, 50, 470, dom), null);
  const d = clipLL(10, 330, 30, 330, dom);
  assert.ok(Math.abs(d[0] - 20) < 1e-6 && d[4] > 0 && d[5] === 1);
  const e = clipLL(60, 179, 60, -179, { lonC: 180, half: 120, latS: 20 });                     // across 180°: 2° long
  assert.ok(Math.abs(e[3] - e[1] - 2) < 1e-9);
});

test('projectPolyline densifies, keeps one path while inside and splits where it leaves', () => {
  const idx = makeIndex(), ev = idx.events[0], m = pixelMap(idx.grid, ev, 96, 72), c = ev.centre[1];
  const one = projectPolyline([[50, c - 60], [50, c + 60]], m, 1);
  assert.equal(one.length, 1);
  assert.equal(one[0].length / 2, 121);                                                       // 120 one-degree pieces
  assert.equal(projectPolyline([[50, c + 100], [50, c + 140], [50, c + 100]], m, 1).length, 2);  // out at +120°, back in
  assert.equal(projectPolyline([[50, c + 150], [50, c + 170]], m, 1).length, 0);
});
