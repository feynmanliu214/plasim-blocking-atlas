// Three synchronized panels for one event (owner O5, interview I3) and the static five-day-mean reference map
// (interview I4). Every panel spans the event's centre ± 120° × 20-90 N with the shared colour scales (plan R8, R13).
import { el, fmt } from './ui.js';
import { ASPECT, panelMap, drawField, drawContours, drawFrame, drawMarker, drawBox, lsmWindow, drawColorbar } from './render.js';
import { frameSlice } from './data.js';
import { bilinear, colCoord, lonLabel, rowCoord } from './geo.js';

export const PANELS = [
  { title: (st) => `Z500 anomaly (m); contours every 100 m, negative dashed`, shade: 'z500a',
    lines: [{ v: 'z500a', color: '#1a1a1a', width: 0.7, dashNegative: true }], box: true },
  { title: (st) => `250 hPa meridional wind (m s⁻¹); wind-speed contours ${st.spd250.contours.join(', ')} m s⁻¹`, shade: 'v250',
    lines: [{ v: 'spd250', color: '#000', width: 1.3 }] },
  { title: (st) => 'Sea-level pressure (hPa); contours every 4 hPa', shade: 'psl',
    lines: [{ v: 'psl', color: '#2a2a2a', width: 0.6 }] },
];

export class PanelSet {
  constructor(parent, idx, data) {
    this.idx = idx; this.data = data; this.ev = data.meta; this.k = 0; this.maps = [];
    this.lsm = lsmWindow(idx, this.ev);
    this.figs = PANELS.map((p, n) => {
      const title = p.title(idx.style);
      const canvas = el('canvas', { class: 'panel', role: 'img', 'aria-label': `${title} — ${this.ev.id}` });
      const readout = el('div', { class: 'readout' }, ' ');
      const bar = el('canvas', { class: 'cbar', width: 320, height: 34, 'aria-hidden': 'true' });
      canvas.addEventListener('mousemove', (e) => this.hover(e, n, readout));
      canvas.addEventListener('mouseleave', () => { readout.textContent = ' '; });
      return { p, canvas, bar, fig: el('figure', { class: 'fig' }, el('figcaption', {}, title), canvas, readout, bar) };
    });
    this.root = el('div', { class: 'panels' }, this.figs.map((f) => f.fig));
    parent.append(this.root);
    for (const f of this.figs) {
      const st = idx.style[f.p.shade];
      drawColorbar(f.bar, idx.cmaps[st.cmap], st.lim, idx.vars.find((v) => v.key === f.p.shade).units);
    }
    this.resize();
    this.ro = new ResizeObserver(() => { if (this.resize()) this.draw(this.k); });
    this.ro.observe(this.root);
  }

  resize() {
    let changed = false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.figs.forEach((f, n) => {
      const w = Math.max(240, Math.round((f.canvas.clientWidth || 720) * dpr)), h = Math.round(w / ASPECT);
      if (f.canvas.width !== w || f.canvas.height !== h || !this.maps[n]) {
        f.canvas.width = w; f.canvas.height = h;
        this.maps[n] = panelMap(this.idx.grid, this.ev, w, h);
        changed = true;
      }
    });
    return changed;
  }

  draw(k) {
    this.k = k;
    const { grid, style, cmaps } = this.idx;
    this.figs.forEach((f, n) => {
      const map = this.maps[n], ctx = f.canvas.getContext('2d'), st = style[f.p.shade], s = map.w / 720;
      drawField(ctx, map, grid, frameSlice(this.data.vars[f.p.shade], k, grid.nrow, grid.ncol), st, cmaps[st.cmap]);
      for (const L of f.p.lines) {
        drawContours(ctx, map, grid, this.ev, frameSlice(this.data.vars[L.v], k, grid.nrow, grid.ncol), style[L.v].contours,
          { color: L.color, width: L.width, dashNegative: L.dashNegative, scale: s });
      }
      drawContours(ctx, map, grid, this.ev, this.lsm, [0.5], { color: '#555', width: 0.9, scale: s });
      drawFrame(ctx, map, s);
      if (f.p.box) drawBox(ctx, map, this.ev, s);
      drawMarker(ctx, map, this.ev, s);
    });
  }

  hover(e, n, readout) {
    const map = this.maps[n], r = e.target.getBoundingClientRect();
    if (!map || !r.width) return;
    const lat = map.P.lat(((e.clientY - r.top) / r.height) * map.h), lon = map.P.lon(((e.clientX - r.left) / r.width) * map.w);
    const g = this.idx.grid, i = rowCoord(lat, g.lat), j = colCoord(lon, this.ev.lon0, g.dlon, g.ncol);
    const v = (key) => bilinear(frameSlice(this.data.vars[key], this.k, g.nrow, g.ncol), g.nrow, g.ncol, i, j);
    readout.textContent = `${fmt(lat)}°N ${lonLabel(lon)} · Z500′ ${fmt(v('z500a'), 0)} m · v ${fmt(v('v250'))} · `
      + `|V| ${fmt(v('spd250'))} m s⁻¹ · SLP ${fmt(v('psl'))} hPa`;
  }

  destroy() { this.ro.disconnect(); this.root.remove(); }
}

export function drawReference(canvas, idx, ev, z5, region, s = 1) {
  const g = idx.grid, map = panelMap(g, ev, canvas.width, canvas.height), ctx = canvas.getContext('2d'), st = idx.style.z500a;
  drawField(ctx, map, g, z5, st, idx.cmaps[st.cmap]);
  drawContours(ctx, map, g, ev, lsmWindow(idx, ev), [0.5], { color: '#555', width: 0.8, scale: s });
  drawContours(ctx, map, g, ev, Float32Array.from(region), [0.5], { color: '#000', width: 2, scale: s });
  drawBox(ctx, map, ev, s);
  drawMarker(ctx, map, ev, s);
}
