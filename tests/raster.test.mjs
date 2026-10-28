import test from 'node:test';
import assert from 'node:assert/strict';
import { Raster, parseColor } from '../tools/raster.mjs';

const px = (R, x, y) => [...R.data.subarray(4 * (y * R.width + x), 4 * (y * R.width + x) + 4)];

test('parseColor reads hex and rgb(a)', () => {
  assert.deepEqual(parseColor('#1a2b3c'), [26, 43, 60, 1]);
  assert.deepEqual(parseColor('#fff'), [255, 255, 255, 1]);
  assert.deepEqual(parseColor('rgba(40,40,40,0.45)'), [40, 40, 40, 0.45]);
  assert.deepEqual(parseColor('rgb(1, 2, 3)'), [1, 2, 3, 1]);
  assert.throws(() => parseColor('red'), /colour/);
});

test('a 2-px line covers its two rows with its alpha; nothing beyond', () => {
  const R = new Raster(20, 20);
  R.strokeStyle = 'rgba(255,0,0,0.5)'; R.lineWidth = 2;
  R.beginPath(); R.moveTo(2, 10); R.lineTo(18, 10); R.stroke();
  assert.deepEqual(px(R, 10, 9), [255, 0, 0, 128]);
  assert.deepEqual(px(R, 10, 10), [255, 0, 0, 128]);
  assert.equal(px(R, 10, 7)[3], 0); assert.equal(px(R, 10, 12)[3], 0);
});

test('dashes alternate along the path and continue across vertices; save / restore keeps the style', () => {
  const R = new Raster(24, 10);
  R.save(); R.strokeStyle = '#123456'; R.lineWidth = 1; R.setLineDash([4, 4]);
  R.beginPath(); R.moveTo(0, 5.5); R.lineTo(6, 5.5); R.lineTo(24, 5.5); R.stroke(); R.restore();
  const a = (x) => px(R, x, 5)[3];
  assert.deepEqual([a(1), a(6), a(10), a(14), a(17)], [255, 0, 255, 0, 255]);
  assert.equal(R.strokeStyle, '#000');                 // the default style is back after restore()
  assert.deepEqual(R.getLineDash(), []);
});

test('subdividing a path, plain or dashed, leaves its pixels unchanged (one composite per stroke)', () => {
  const draw = (pts, dash) => {
    const R = new Raster(26, 12);
    R.strokeStyle = 'rgba(0,0,0,0.5)'; R.lineWidth = 1.5; R.setLineDash(dash);
    R.beginPath(); R.moveTo(...pts[0]); for (const q of pts.slice(1)) R.lineTo(...q); R.stroke();
    return R.data;
  };
  const whole = [[2, 6.5], [22, 6.5]], cut = Array.from({ length: 21 }, (_, k) => [2 + k, 6.5]);
  for (const dash of [[], [3, 2]]) {
    const A = draw(whole, dash), B = draw(cut, dash);
    assert.ok(A.every((v, i) => Math.abs(v - B[i]) <= 1), `dash ${dash}`);
    assert.ok(A.some((v, i) => i % 4 === 3 && v > 0));
  }
});

test('putImageData overwrites, flatten composites over the background', () => {
  const R = new Raster(2, 1), img = R.createImageData(2, 1);
  img.data.set([10, 20, 30, 255, 0, 0, 0, 0]);
  R.putImageData(img, 0, 0);
  const f = R.flatten('#dedad2');
  assert.deepEqual([...f], [10, 20, 30, 255, 222, 218, 210, 255]);
});
