import test from 'node:test';
import assert from 'node:assert/strict';
import { seriesGeometry, LINE_COLORS } from '../js/series.js';

test('seriesGeometry maps model time to x and the scale to y, clamps y and inverts x', () => {
  const G = seriesGeometry([-15, -5, 4.75], [-400, 700], 1000, 100, { l: 40, r: 10, t: 5, b: 15 });
  assert.equal(G.x(-15), 40); assert.equal(G.x(4.75), 990);
  assert.ok(Math.abs(G.t(G.x(0))) < 1e-12);
  assert.ok(Math.abs(G.x(-5) - (40 + (950 * 10) / 19.75)) < 1e-9);       // an interior time: 10 / 19.75 of the way
  assert.equal(G.y(700), 5); assert.equal(G.y(-400), 85);
  assert.equal(G.y(9999), 5); assert.equal(G.y(-9999), 85);
  assert.equal(LINE_COLORS.length, 4);
});
