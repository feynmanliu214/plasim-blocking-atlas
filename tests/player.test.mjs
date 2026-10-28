import test from 'node:test';
import assert from 'node:assert/strict';
import { Player, RATES, follow } from '../js/player.js';

function fakeClock() {
  let now = 0, seq = 0, q = [];
  return {
    now: () => now,
    spend(ms) { now += ms; },                               // a listener's drawing time
    setTimeout(fn, ms) { const id = ++seq; q.push({ id, at: now + ms, fn }); return id; },
    clearTimeout(id) { q = q.filter((x) => x.id !== id); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        q.sort((a, b) => a.at - b.at);
        if (!q.length || q[0].at > end) break;
        const x = q.shift();
        now = Math.max(now, x.at);
        x.fn();
      }
      now = Math.max(now, end);
    },
  };
}
const T = [-2, -1, 0, 0.25, 0.5];

test('play holds each frame for its model-time step at the rate, and the last frame for the last step before it loops', () => {
  const c = fakeClock(), p = new Player(T, { rate: 1, clock: c });
  p.play();
  c.advance(999); assert.equal(p.index, 0);
  c.advance(1); assert.equal(p.index, 1);                 // a 1-day step at 1 model day per second: 1000 ms
  c.advance(1000); assert.equal(p.index, 2);
  c.advance(250); assert.equal(p.index, 3);               // 6-hourly steps: 250 ms
  c.advance(250); assert.equal(p.index, 4);
  c.advance(249); assert.equal(p.index, 4);
  c.advance(1); assert.equal(p.index, 0);                 // held one last step, then the loop wraps
  p.pause(); c.advance(5000);
  assert.equal(p.index, 0); assert.equal(p.playing, false);
});

test('the rate scales every hold; setRate accepts only RATES', () => {
  const c = fakeClock(), p = new Player(T, { rate: 4, clock: c });
  p.play();
  c.advance(250); assert.equal(p.index, 1);
  c.advance(250); assert.equal(p.index, 2);
  c.advance(62.5); assert.equal(p.index, 3);
  assert.deepEqual(RATES, [0.5, 1, 2, 4]);
  p.setRate(3); assert.equal(p.rate, 1);
  p.setRate('0.5'); assert.equal(p.rate, 0.5);
  assert.equal(p.hold(0), 2000); assert.equal(p.hold(4), 500);
});

test('without loop, play stops at the last frame and restarts from the first', () => {
  const c = fakeClock(), p = new Player(T, { rate: 2, loop: false, clock: c });
  p.play();
  c.advance(5000);
  assert.equal(p.index, 4); assert.equal(p.playing, false);
  p.play();
  assert.equal(p.index, 0); assert.equal(p.playing, true);
});

test('drawing cost does not stretch the holds: each frame starts when its model time is due', () => {
  const c = fakeClock(), p = new Player(T, { rate: 1, clock: c }), shown = [];
  p.on((k) => { shown.push([k, c.now()]); c.spend(100); });       // a 100 ms draw for every frame
  p.play();
  c.advance(2600);
  assert.deepEqual(shown, [[0, 0], [1, 1000], [2, 2000], [3, 2250], [4, 2500]]);
});

test('a rate change while playing restarts the current hold at the new rate', () => {
  const c = fakeClock(), p = new Player(T, { rate: 1, clock: c });
  p.play(); c.advance(100);
  p.setRate(4);                                                   // frame 0's daily hold: 250 ms from now
  c.advance(249); assert.equal(p.index, 0);
  c.advance(1); assert.equal(p.index, 1);
  assert.equal(p.playing, true);
  p.pause(); p.setRate(2);
  c.advance(5000); assert.equal(p.index, 1);                      // paused: a rate change does not start playback
});

test('a draw that overruns its hold shows the next frame when it ends, without bursting to catch up', () => {
  const c = fakeClock(), p = new Player([0, 0.25, 0.5, 0.75], { rate: 1, clock: c }), shown = [];
  p.on((k) => { shown.push([k, c.now()]); c.spend(300); });       // 300 ms draws, 250 ms holds
  p.play();
  c.advance(600);
  assert.deepEqual(shown, [[0, 0], [1, 300], [2, 600], [3, 900]]);
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
  const c = fakeClock(), p = new Player(T, { rate: 4, clock: c }), writes = [];
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
