import test from 'node:test';
import assert from 'node:assert/strict';

// A minimal DOM stub: just enough for timeline() to build and for its slider to receive `input` events.
class FakeNode {}
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.attrs = {}; this.listeners = {}; this.value = ''; this.style = { setProperty() {} }; }
  setAttribute(k, v) { this.attrs[k] = v; if (k === 'value') this.value = v; }
  append(...c) { this.children.push(...c); }
  addEventListener(k, f) { (this.listeners[k] ||= []).push(f); }
  dispatch(k) { for (const f of this.listeners[k] || []) f({ target: this }); }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (s) => Object.assign(new FakeNode(), { text: s }),
  addEventListener() {}, removeEventListener() {} };
const { Player } = await import('../js/player.js');
const { timeline } = await import('../js/timeline.js');
const { tLabel } = await import('../js/ui.js');

// 50 frames: daily from t = -15 to -5, then 6-hourly to 4.75.
const times = [];
for (let d = -15; d <= -5; d++) times.push(d);
for (let q = 1; times.length < 50; q++) times.push(-5 + q * 0.25);
const frames = { window: [-5, 0], daily_to: -5, step_hours: 6 };
const build = () => {
  const clock = { now: () => 0, setTimeout: () => 1, clearTimeout() {} };
  const player = new Player(times, { clock });
  const tl = timeline(player, { frames });
  return { player, range: tl.root.children[3] };
};
const want = (k) => Math.round((1000 * (times[k] - times[0])) / (times[49] - times[0]));

test('the slider position and aria-valuetext follow model time, not the frame index', () => {
  assert.equal(times.length, 50); assert.equal(times[10], -5); assert.equal(times[49], 4.75);
  const { player, range } = build();
  player.set(10);
  assert.equal(want(10), 506);
  assert.equal(range.value, '506');
  assert.equal(range.attrs['aria-valuetext'], tLabel(-5));
});

test('a slider seek while playing pauses on the picked frame (the slider is read before pause rewrites it)', () => {
  const { player, range } = build();
  player.set(40); player.play();
  assert.equal(player.playing, true);
  range.value = String(want(10));
  range.dispatch('input');
  assert.equal(player.playing, false);
  assert.equal(player.index, 10);
  assert.equal(range.value, '506');
});
