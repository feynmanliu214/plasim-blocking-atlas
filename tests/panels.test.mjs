import test from 'node:test';
import assert from 'node:assert/strict';
import { Raster } from '../tools/raster.mjs';
import { makeIndex, eventBuffer } from './fixture.mjs';

// A minimal DOM stub: canvases whose 2-d context is a Raster (renewed when the canvas is resized, as a browser clears
// it) and counts its putImageData calls, laid out at CSS_W px (colour bars are not laid out), with ResizeObserver,
// getComputedStyle and devicePixelRatio.
class FakeNode {}
let CSS_W = 300;
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.attrs = {}; this.listeners = {}; this._w = 300; this._h = 150; this.puts = 0; this.style = { setProperty() {} }; }
  setAttribute(k, v) { this.attrs[k] = v; if (k === 'width') this.width = Number(v); if (k === 'height') this.height = Number(v); }
  get width() { return this._w; } set width(v) { this._w = v; this.ctx = null; }
  get height() { return this._h; } set height(v) { this._h = v; this.ctx = null; }
  get clientWidth() { return this.tag === 'canvas' && this.className !== 'cbar' ? CSS_W : 0; }
  get clientHeight() { return 0; }
  append(...c) { this.children.push(...c); }
  remove() {}
  get textContent() { return this.children.map((c) => (c instanceof FakeEl ? c.textContent : c.text)).join(''); }
  addEventListener(k, f) { (this.listeners[k] ||= []).push(f); }
  getContext() {
    if (!this.ctx) {
      this.ctx = new Raster(this._w, this._h);
      const put = this.ctx.putImageData.bind(this.ctx);
      this.ctx.putImageData = (...a) => { this.puts++; put(...a); };
    }
    return this.ctx;
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: CSS_W, height: 96 }; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (s) => Object.assign(new FakeNode(), { text: s }),
  addEventListener() {}, removeEventListener() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.getComputedStyle = () => ({ color: '#555' });
globalThis.devicePixelRatio = 2;
Raster.prototype.arc = function () {}; Raster.prototype.fill = function () {};          // the strip's dots; Raster draws no fills

const { PanelSet, drawThumb, colorbarFor } = await import('../js/panels.js');
const { PANELS, drawPanel } = await import('../js/draw.js');
const { pixelMap } = await import('../js/render.js');
const { decodeEvent, frameSlice } = await import('../js/data.js');
const { seriesChart, seriesGeometry, LINE_COLORS } = await import('../js/series.js');
const { Player } = await import('../js/player.js');

const idx = makeIndex(), ev = idx.events[0], g = idx.grid, n = g.nrow * g.ncol;
const data = { meta: ev, vars: decodeEvent(eventBuffer(idx), idx) };
const ref = { z5: Float32Array.from({ length: n }, (_, q) => 300 * Math.exp(-(((Math.floor(q / g.ncol) - 16) ** 2) + ((q % g.ncol) - 44) ** 2) / 40)) };
ref.region = Uint8Array.from(ref.z5, (x) => (x >= 250 ? 1 : 0));

test('PanelSet sizes its maps at the device pixel ratio, draws each with drawPanel at s = DPR, the five-day map once, and recentres', () => {
  CSS_W = 300; globalThis.devicePixelRatio = 2;
  const ps = new PanelSet(null, idx, data, ref);
  assert.deepEqual(ps.figs.map((f) => [f.canvas.width, f.canvas.height]), Array(4).fill([600, 450]));
  ps.draw(30); ps.draw(31);
  assert.deepEqual(PANELS.map((p) => p.key), ['z500a', 'v250', 'psl', 'z5']);
  assert.deepEqual(ps.figs.map((f) => f.canvas.puts), [2, 2, 2, 1]);
  const s = (key) => frameSlice(data.vars[key], 31, g.nrow, g.ncol), want = new Raster(600, 450);
  drawPanel(want, pixelMap(g, ev, 600, 450), idx, ev, { z500a: s('z500a'), v250: s('v250'), spd250: s('spd250'), psl: s('psl'), ...ref }, 'z500a', 2);
  assert.ok(ps.figs[0].canvas.getContext().data.every((v, i) => v === want.data[i]), 'the Z500 anomaly map is drawPanel at s = 2');
  ps.setCentre(ev.centre[1] + 30);
  assert.equal(ps.map.dom.lonC, ev.centre[1] + 30);
  assert.equal(ps.figs[3].canvas.puts, 2, 'the five-day map is redrawn on the new centre');
  ps.setCentre(null);
  assert.equal(ps.map.dom.lonC, ev.centre[1]);
});

test('PanelSet re-maps at the new device pixel ratio when only the ratio changes (browser zoom: same device pixels)', () => {
  CSS_W = 300; globalThis.devicePixelRatio = 2;
  const ps = new PanelSet(null, idx, data, ref);
  CSS_W = 600; globalThis.devicePixelRatio = 1;
  assert.equal(ps.resize(), true);
  assert.equal(ps.dpr, 1);
});

test('drawThumb and the colour bar are sized at the device pixel ratio; the unshaded panel gets the isobar legend', () => {
  CSS_W = 260; globalThis.devicePixelRatio = 2;
  const c = new FakeEl('canvas');
  drawThumb(c, idx, ev, ref);
  assert.deepEqual([c.width, c.height], [520, 390]);
  assert.equal(colorbarFor(idx, PANELS[2]).node.textContent, 'Isobars every 4 hPa; 1000 hPa bold');
  const bar = colorbarFor(idx, PANELS[0]);
  bar.paint();
  assert.deepEqual([bar.node.width, bar.node.height], [640, 68]);
});

test('the series strip draws each point at its model time, not its frame index', () => {
  CSS_W = 600; globalThis.devicePixelRatio = 1;
  const t = idx.frames.t, player = new Player(t, { clock: { now: () => 0, setTimeout: () => 1, clearTimeout() {} } });
  const strip = seriesChart(idx, [ev], player), ctx = strip.root.children[1].getContext(), xs = [];
  const mt = ctx.moveTo.bind(ctx), lt = ctx.lineTo.bind(ctx);
  ctx.moveTo = (x, y) => { if (ctx.strokeStyle === LINE_COLORS[0]) xs.push(x); mt(x, y); };
  ctx.lineTo = (x, y) => { if (ctx.strokeStyle === LINE_COLORS[0]) xs.push(x); lt(x, y); };
  strip.draw();
  const G = seriesGeometry(t, idx.style.series.lim, 600, 96, { l: 40, r: 8, t: 6, b: 16 });
  assert.equal(t.length, 50);
  assert.equal(xs.length, t.length);
  xs.forEach((x, k) => assert.ok(Math.abs(x - G.x(t[k])) < 1e-9, `frame ${k}: ${x} vs ${G.x(t[k])}`));
  strip.destroy();
});
