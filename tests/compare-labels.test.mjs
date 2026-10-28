import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Raster } from '../tools/raster.mjs';
import { makeIndex, eventBuffer } from './fixture.mjs';

// The Compare grid collapses to one column at <= 900 px, where the headings no longer sit above their maps; each map
// carries its event id (class ctag), hidden in the wide layout and shown inside the max-width: 900px block.
class FakeNode {}
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.attrs = {}; this.listeners = {}; this.className = ''; this.style = { setProperty() {} }; this.ctx = null; this.width = 300; this.height = 150; }
  setAttribute(k, v) { this.attrs[k] = v; }
  get clientWidth() { return this.tag === 'canvas' && this.className !== 'cbar' ? 300 : 0; }
  get clientHeight() { return 0; }
  append(...c) { this.children.push(...c); }
  prepend(...c) { this.children.unshift(...c); }
  remove() {}
  get textContent() { return this.children.map((c) => (c instanceof FakeEl ? c.textContent : c.text)).join(''); }
  set textContent(v) { this.children = [Object.assign(new FakeNode(), { text: String(v) })]; }
  addEventListener() {}
  getContext() { return (this.ctx ||= new Raster(this.width, this.height)); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 300, height: 96 }; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (s) => Object.assign(new FakeNode(), { text: s }),
  addEventListener() {}, removeEventListener() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.getComputedStyle = () => ({ color: '#555' });
globalThis.devicePixelRatio = 1;
Raster.prototype.arc = function () {}; Raster.prototype.fill = function () {};

const { renderCompare } = await import('../js/compare.js');
const { decodeEvent } = await import('../js/data.js');
const { PANELS } = await import('../js/draw.js');

const find = (n, pred, out = []) => { if (n instanceof FakeEl) { if (pred(n)) out.push(n); n.children.forEach((c) => find(c, pred, out)); } return out; };

test('Compare labels every map with its own event id, in column order within each row', async () => {
  const ids = ['E0429', 'E0007', 'E0152'];
  const idx = makeIndex({ events: ids.map((id, k) => ({ id, group: 'rp1000', rank: k + 1, centre: [64.2, 300 + 10 * k] })) });
  const n = idx.grid.nrow * idx.grid.ncol, buf = eventBuffer(idx);
  const app = {
    idx, tray: [], byId: new Map(idx.events.map((e) => [e.id, e])), toggleTray() {},
    events: { get: async (id) => ({ meta: idx.events.find((e) => e.id === id), vars: decodeEvent(buf, idx) }) },
    thumbs: { z5: () => new Float32Array(n), region: () => new Uint8Array(n) },
  };
  const root = new FakeEl('main');
  renderCompare(root, app, { ids });
  await new Promise((r) => setTimeout(r, 50));
  const [grid] = find(root, (e) => e.className === 'cgrid');
  assert.ok(grid, 'the grid was rendered');
  const kids = grid.children, rows = kids.reduce((a, c, i) => (c.className === 'crow' ? [...a, i] : a), []);
  assert.equal(rows.length, PANELS.length);
  for (const r of rows) {
    const figs = kids.slice(r + 1, r + 1 + ids.length);
    assert.deepEqual(figs.map((f) => f.className), Array(ids.length).fill('fig'));
    assert.deepEqual(figs.map((f) => find(f, (e) => e.className === 'ctag').map((t) => t.textContent)), ids.map((id) => [id]));
  }
});

test('the label is hidden by default and shown only inside the max-width: 900px block', () => {
  const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  const m = css.match(/@media \(max-width: 900px\) \{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g).filter((b) => /\.cgrid/.test(b));
  assert.equal(m.length, 1);
  const inside = m[0], outside = css.replace(m[0], '');
  assert.match(outside, /\.ctag\s*\{[^}]*display:\s*none/);
  assert.doesNotMatch(outside, /\.ctag\s*\{[^}]*display:\s*(block|inline|flex)/);
  assert.match(inside, /\.cgrid \.ctag\s*\{[^}]*display:\s*block/);
});
