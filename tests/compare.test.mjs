import test from 'node:test';
import assert from 'node:assert/strict';
import { circularMean } from '../js/compare.js';
import { wrap180 } from '../js/geo.js';

test('circularMean averages longitudes on the circle', () => {
  assert.ok(Math.abs(wrap180(circularMean([350, 10]))) < 1e-9);
  assert.ok(Math.abs(circularMean([300, 330]) - -45) < 1e-9);
  assert.ok(Math.abs(wrap180(circularMean([296.622, 357.239]) - 326.93)) < 0.01);
});
