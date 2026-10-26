import test from 'node:test';
import assert from 'node:assert/strict';
import { Player, follow } from '../js/player.js';

function fakeClock() {
  let now = 0, seq = 0, q = [];
  return {
    setTimeout(fn, ms) { const id = ++seq; q.push({ id, at: now + ms, fn }); return id; },
    clearTimeout(id) { q = q.filter((x) => x.id !== id); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        q.sort((a, b) => a.at - b.at);
        if (!q.length || q[0].at > end) break;
        const x = q.shift();
        now = x.at;
        x.fn();
      }
      now = end;
    },
  };
}
const T = [-2, -1, 0, 0.25, 0.5];

test('play advances one frame per 1/fps and loops', () => {
  const c = fakeClock(), p = new Player(T, { fps: 4, clock: c });
  p.play();
  c.advance(1000);
  assert.equal(p.index, 4);
  c.advance(250);
  assert.equal(p.index, 0);
  p.pause();
  c.advance(1000);
  assert.equal(p.index, 0);
  assert.equal(p.playing, false);
});

test('without loop, play stops at the last frame and restarts from the first', () => {
  const c = fakeClock(), p = new Player(T, { fps: 2, loop: false, clock: c });
  p.play();
  c.advance(5000);
  assert.equal(p.index, 4);
  assert.equal(p.playing, false);
  p.play();
  assert.equal(p.index, 0);
  assert.equal(p.playing, true);
});

test('set clamps and rounds; step wraps only when looping; nearest picks the closest time', () => {
  const p = new Player(T);
  p.set(9); assert.equal(p.index, 4);
  p.set(-3); assert.equal(p.index, 0);
  p.set(2.4); assert.equal(p.index, 2);
  p.step(-3); assert.equal(p.index, 4);
  p.loop = false;
  p.step(3); assert.equal(p.index, 4);
  assert.equal(p.nearest(0.3), 3);
  assert.equal(p.nearest(-10), 0);
});

test('listeners hear every change and can unsubscribe', () => {
  const p = new Player(T), seen = [];
  const off = p.on((k) => seen.push(k));
  p.set(1); p.set(1); p.step(1);
  off();
  p.set(4);
  assert.deepEqual(seen, [1, 2]);
});

test('follow stops writing before the teardown pause (a view being left never rewrites the next URL)', () => {
  const c = fakeClock(), p = new Player(T, { fps: 4, clock: c }), writes = [];
  const stop = follow(p, (k) => writes.push(k));
  p.play();
  c.advance(500);
  assert.deepEqual(writes, [0, 1, 2]);                 // play() emits frame 0, then two ticks
  stop();
  assert.equal(p.playing, false);
  assert.deepEqual(writes, [0, 1, 2]);                 // the pause's emit is not written
  c.advance(1000);
  assert.deepEqual(writes, [0, 1, 2]);
});
