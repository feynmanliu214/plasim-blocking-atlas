import test from 'node:test';
import assert from 'node:assert/strict';
import { rowCoord, rowLat, bilinear, lonLabel, frameDate, domainOf, wrap180, colIndex } from '../js/geo.js';

test('rowCoord interpolates Gaussian rows and clamps', () => {
  const rows = [20, 25, 32, 40];
  assert.equal(rowCoord(28.5, rows), 1.5);
  assert.equal(rowCoord(36, rows), 2.5);
  assert.equal(rowCoord(10, rows), 0);
  assert.equal(rowCoord(90, rows), 3);
  for (const i of [0, 0.3, 1.5, 2.9, 3]) assert.ok(Math.abs(rowCoord(rowLat(i, rows), rows) - i) < 1e-12);
});

test('bilinear interpolates the four corners', () => {
  const vals = Float32Array.from({ length: 12 }, (_, q) => 2 * Math.floor(q / 4) + 3 * (q % 4));
  assert.equal(bilinear(vals, 3, 4, 1, 2), 8);
  assert.ok(Math.abs(bilinear(vals, 3, 4, 1.25, 2.5) - 10) < 1e-9);
  assert.equal(bilinear(vals, 3, 4, 2, 3), 13);
});

test('lonLabel and frameDate', () => {
  assert.equal(lonLabel(330), '30°W'); assert.equal(lonLabel(380), '20°E'); assert.equal(lonLabel(360), '0°');
  assert.equal(lonLabel(180), '180°'); assert.equal(lonLabel(-90), '90°W');
  assert.equal(frameDate('0723-01-05', -15), '0722-12-21 00 UTC');
  assert.equal(frameDate('0723-01-05', 4.75), '0723-01-09 18 UTC');
  assert.equal(frameDate('0460-02-25', 4.75), '0460-02-29 18 UTC');       // proleptic Gregorian leap day
  assert.equal(frameDate('0007-12-01', -0.25), '0007-11-30 18 UTC');      // years below 100 stay literal
});

test('domainOf, wrap180 and colIndex (NaN outside the window, any unwrapping)', () => {
  assert.deepEqual(domainOf({ centre: [60, 330] }, { half_width_deg: 120, lat_min_display: 20 }), { lonC: 330, half: 120, latS: 20 });
  assert.deepEqual(domainOf({ centre: [60, 330] }, { half_width_deg: 120, lat_min_display: 20 }, 300).lonC, 300);
  assert.equal(wrap180(190), -170); assert.equal(wrap180(-190), 170); assert.equal(wrap180(540), -180);
  assert.equal(colIndex(194.0625, 194.0625, 2.8125, 89), 0);
  assert.ok(Math.abs(colIndex(194.0625 + 360 + 5.625, 194.0625, 2.8125, 89) - 2) < 1e-9);
  assert.equal(colIndex(194.0625 + 88 * 2.8125, 194.0625, 2.8125, 89), 88);
  assert.ok(Number.isNaN(colIndex(194.0625 - 1, 194.0625, 2.8125, 89)) && Number.isNaN(colIndex(194.0625 + 89 * 2.8125, 194.0625, 2.8125, 89)));
});
