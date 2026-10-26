import test from 'node:test';
import assert from 'node:assert/strict';
import { contourSegments } from '../js/contour.js';

test('segments of a plane lie on the level line; flat fields have none; non-finite cells are skipped', () => {
  const nr = 5, nc = 6, v = Float32Array.from({ length: nr * nc }, (_, q) => Math.floor(q / nc) + 2 * (q % nc));
  const s = contourSegments(v, nr, nc, 4.3);
  assert.ok(s.length > 0 && s.length % 4 === 0);
  for (let k = 0; k < s.length; k += 2) assert.ok(Math.abs(s[k] + 2 * s[k + 1] - 4.3) < 1e-6);
  assert.equal(contourSegments(new Float32Array(nr * nc).fill(1), nr, nc, 0.5).length, 0);
  const w = Float32Array.from(v); w[0] = NaN;
  assert.equal(contourSegments(w, nr, nc, 0.5).length, 0);              // the only crossing cell has a NaN corner
});

test('saddles split by the cell mean', () => {
  const v = Float32Array.from([1, 0, 0, 1]);                            // a (0,0) 1, b (0,1) 0, d (1,0) 0, c (1,1) 1
  assert.deepEqual(contourSegments(v, 2, 2, 0.5), [0.5, 0, 0, 0.5, 0.5, 1, 1, 0.5]);   // mean not above: a, c cut off
  const s = contourSegments(v, 2, 2, 0.4).map((x) => Math.round(x * 1e6) / 1e6);         // mean above: a, c connect
  assert.deepEqual(s, [0, 0.6, 0.4, 1, 1, 0.4, 0.6, 0]);
});
