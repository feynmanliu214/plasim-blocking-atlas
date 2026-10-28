import test from 'node:test';
import assert from 'node:assert/strict';
import { rho, aspectOf, projector } from '../js/proj.js';

const dom = { lonC: 330, half: 120, latS: 20 }, near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const wrap = (x) => ((((x % 360) + 540) % 360) - 180);

test('the ±120° wedge from 20 N is a 4:3 box: centre meridian down, east right, the pole a third of the way down', () => {
  assert.ok(near(aspectOf(dom), 4 / 3, 1e-12));
  const P = projector(dom, 720, 540);
  let [x, y] = P.xy(20, 330); assert.ok(near(x, 360) && near(y, 540), `bottom centre ${x} ${y}`);
  [x, y] = P.xy(90, 123); assert.ok(near(x, 360) && near(y, 180), `pole ${x} ${y}`);
  [x, y] = P.xy(20, 420); assert.ok(near(x, 720) && near(y, 180), `90° east is the right edge ${x} ${y}`);
  [x, y] = P.xy(20, 240); assert.ok(near(x, 0), `90° west is the left edge ${x}`);
  [x, y] = P.xy(20, 210); assert.ok(near(y, 0) && x > 0 && x < 60, `the wedge's top-left tip ${x} ${y}`);
  assert.ok(P.xy(75, 330)[1] < P.xy(60, 330)[1], 'north is towards the pole');
  assert.ok(rho(90) === 0 && near(rho(0), 1, 1e-12));
});

test('ll inverts xy, and inside() is the wedge', () => {
  const P = projector(dom, 720, 540);
  for (const [lat, lon] of [[20, 330], [45.5, 250], [61.2, 333.3], [89.9, 400], [70, 449]]) {
    const [a, b] = P.ll(...P.xy(lat, lon));
    assert.ok(near(a, lat, 1e-9) && near(wrap(b - lon), 0, 1e-9), `${lat} ${lon}`);
  }
  assert.ok(P.inside(...P.ll(360, 300)) && !P.inside(...P.ll(360, 20)));         // below the pole / the blank top wedge
  assert.ok(!P.inside(19.9, 330) && P.inside(20, 450) && !P.inside(20, 450.1) && P.inside(50, -30));
});
