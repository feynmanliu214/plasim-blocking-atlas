import test from 'node:test';
import assert from 'node:assert/strict';
import { contourSegments, refine, chain } from '../js/contour.js';

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

test('refine is the bilinear interpolant on an f-times finer grid', () => {
  const nr = 5, nc = 6, v = Float32Array.from({ length: nr * nc }, (_, q) => Math.floor(q / nc) + 2 * (q % nc));
  const R = refine(v, nr, nc, 4);
  assert.deepEqual([R.nrow, R.ncol, R.f], [17, 21, 4]);
  for (let I = 0; I < R.nrow; I++) for (let J = 0; J < R.ncol; J++) assert.ok(Math.abs(R.vals[I * R.ncol + J] - (I / 4 + J / 2)) < 1e-5);
});

test('chain joins segments into one polyline per curve and closes a ring', () => {
  const n = 21, ring = Float32Array.from({ length: n * n }, (_, q) => Math.hypot(Math.floor(q / n) - 10, (q % n) - 10));
  const rings = chain(contourSegments(ring, n, n, 5.5));
  assert.equal(rings.length, 1);
  const r = rings[0];
  assert.ok(r[0] === r[r.length - 2] && r[1] === r[r.length - 1] && r.length > 40);
  const v = Float32Array.from({ length: 30 }, (_, q) => Math.floor(q / 6) + 2 * (q % 6)), segs = contourSegments(v, 5, 6, 4.3);
  const lines = chain(segs);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].length / 2, segs.length / 4 + 1);
});
