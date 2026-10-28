import test from 'node:test';
import assert from 'node:assert/strict';

// A minimal DOM stub: just enough for timeline() to build, for its controls to receive events, to record the slider's
// style properties and to hold the document's key listeners.
class FakeNode {}
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.attrs = {}; this.listeners = {}; this.value = ''; this.props = {}; this.style = { setProperty: (k, v) => { this.props[k] = v; } }; }
  setAttribute(k, v) { this.attrs[k] = v; if (k === 'value') this.value = v; }
  append(...c) { this.children.push(...c); }
  addEventListener(k, f) { (this.listeners[k] ||= []).push(f); }
  dispatch(k) { for (const f of this.listeners[k] || []) f({ target: this }); }
}
const keys = new Set();
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (s) => Object.assign(new FakeNode(), { text: s }),
  addEventListener: (k, f) => keys.add(f), removeEventListener: (k, f) => keys.delete(f) };
const { Player } = await import('../js/player.js');
const { timeline } = await import('../js/timeline.js');
const { tLabel } = await import('../js/ui.js');

// 50 frames: daily from t = -15 to -5, then 6-hourly to 4.75.
const times = [];
for (let d = -15; d <= -5; d++) times.push(d);
for (let q = 1; times.length < 50; q++) times.push(-5 + q * 0.25);
const frames = { window: [0, 5], daily_to: -5, step_hours: 6 };
const build = () => {
  const clock = { now: () => 0, setTimeout: () => 1, clearTimeout() {} };
  const player = new Player(times, { clock });
  const tl = timeline(player, { frames });
  return { player, tl, range: tl.root.children[3], speed: tl.root.children[5] };
};
const want = (k) => Math.round((1000 * (times[k] - times[0])) / (times[49] - times[0]));
const key = (k) => { for (const f of keys) f({ key: k, target: null, preventDefault() {} }); };

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

test('the slider shades the 5-day window and ticks the cadence change at their model times', () => {
  const { range } = build(), pc = (x) => Number(x.replace('%', ''));
  assert.ok(Math.abs(pc(range.props['--c']) - (100 * 10) / 19.75) < 1e-9, range.props['--c']);
  assert.ok(Math.abs(pc(range.props['--w0']) - (100 * 15) / 19.75) < 1e-9, range.props['--w0']);
  assert.equal(pc(range.props['--w1']), 100);                           // the window ends after the last frame: clipped
});

test('arrows pause and step one frame, space toggles, the speed menu sets the rate, destroy detaches its listeners', () => {
  keys.clear();
  const { player, tl, speed } = build();
  player.set(40); player.play();
  key('ArrowRight'); assert.deepEqual([player.playing, player.index], [false, 41]);
  key('ArrowLeft'); assert.deepEqual([player.playing, player.index], [false, 40]);
  key(' '); assert.equal(player.playing, true);
  speed.value = '4'; speed.dispatch('change'); assert.equal(player.rate, 4);
  const nl = player.listeners.size;
  tl.destroy();
  assert.equal(keys.size, 0);
  assert.equal(player.listeners.size, nl - 1);
});

test('a slider input that picks the current frame snaps the thumb back to it', () => {
  const { player, range } = build();
  player.set(10);
  range.value = '510'; range.dispatch('input');
  assert.equal(player.index, 10);
  assert.equal(range.value, '506');
});
