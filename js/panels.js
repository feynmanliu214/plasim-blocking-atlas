// The four synchronized maps of one event (owner O5, V1, V2; plan R6, R7, R13): Z500 anomaly, 250 hPa wind with the
// jet, SLP isobars and the five-day-mean reference, polar stereographic at the device pixel ratio, drawn by js/draw.js.
// `lonC` (Compare's common centre) recentres every map; null keeps the event's own centre.
import { el, fmt } from './ui.js';
import { aspect, drawColorbar, pixelMap } from './render.js';
import { PANELS, drawPanel, panelTitle } from './draw.js';
import { frameSlice } from './data.js';
import { bilinear, colIndex, lonLabel, rowCoord } from './geo.js';

export const dprOf = () => Math.min(globalThis.devicePixelRatio || 1, 2);

// Panel p's colour bar, or the isobar legend for the unshaded panel: { node, paint() }.
export function colorbarFor(idx, p) {
  if (!p.shade) {
    const d = idx.style.psl.contours[1] - idx.style.psl.contours[0];
    return { node: el('p', { class: 'legend' }, `Isobars every ${d} hPa; 1000 hPa bold`), paint() {} };
  }
  const st = idx.style[p.shade], units = idx.vars.find((v) => v.key === p.shade).units;
  const node = el('canvas', { class: 'cbar', width: 320, height: 34, 'aria-hidden': 'true' });
  return { node, paint: () => drawColorbar(node, idx.cmaps[st.cmap], st.lim, units, dprOf()) };
}

// A gallery card's five-day-mean map at the device pixel ratio, without labels.
export function drawThumb(canvas, idx, ev, ref) {
  const dpr = dprOf(), w = Math.max(160, Math.round((canvas.clientWidth || 260) * dpr)), h = Math.round(w / aspect(idx.grid));
  canvas.width = w; canvas.height = h;
  drawPanel(canvas.getContext('2d'), pixelMap(idx.grid, ev, w, h), idx, ev, ref, 'z5', dpr * 0.75, { labels: false });
}

export class PanelSet {
  constructor(parent, idx, data, ref, { colorbars = true, lonC = null } = {}) {
    this.idx = idx; this.data = data; this.ev = data.meta; this.ref = ref; this.lonC = lonC;
    this.k = 0; this.at = null; this.map = null; this.dpr = 1; this.refDrawn = false;
    this.figs = PANELS.map((p, n) => {
      const title = panelTitle(p, idx.style);
      const canvas = el('canvas', { class: 'panel', width: 720, height: 540, role: 'img', 'aria-label': `${title} — ${this.ev.id}` });
      const readout = el('div', { class: 'readout' }, ' ');
      const bar = colorbars ? colorbarFor(idx, p) : null;
      canvas.addEventListener('mousemove', (e) => this.hover(e, n, readout));
      canvas.addEventListener('mouseleave', () => { this.at = null; readout.textContent = ' '; });
      return { p, canvas, readout, bar, fig: el('figure', { class: 'fig' }, el('figcaption', {}, title), canvas, readout, bar && bar.node) };
    });
    this.root = el('div', { class: 'panels' }, this.figs.map((f) => f.fig));
    if (parent) parent.append(this.root);
    this.ro = new ResizeObserver(() => { if (this.resize()) this.draw(this.k); });
    this.ro.observe(this.figs[0].canvas);
    this.resize();
  }

  resize() {
    const dpr = dprOf(), css = this.figs[0].canvas.clientWidth || 360;
    const w = Math.max(240, Math.round(css * dpr)), h = Math.round(w / aspect(this.idx.grid));
    for (const f of this.figs) if (f.bar) f.bar.paint();
    if (this.map && this.map.w === w && this.map.h === h && this.dpr === dpr) return false;
    this.dpr = dpr;
    this.map = pixelMap(this.idx.grid, this.ev, w, h, this.lonC ?? this.ev.centre[1]);
    for (const f of this.figs) { f.canvas.width = w; f.canvas.height = h; }
    this.refDrawn = false;
    return true;
  }

  setCentre(lonC) { this.lonC = lonC; this.map = null; this.resize(); this.draw(this.k); }

  fields(k) {
    const g = this.idx.grid, v = this.data.vars, s = (key) => frameSlice(v[key], k, g.nrow, g.ncol);
    return { z500a: s('z500a'), v250: s('v250'), spd250: s('spd250'), psl: s('psl'), z5: this.ref.z5, region: this.ref.region };
  }

  draw(k) {
    this.k = k;
    const f = this.fields(k);
    for (const fig of this.figs) {
      if (fig.p.static && this.refDrawn) continue;
      drawPanel(fig.canvas.getContext('2d'), this.map, this.idx, this.ev, f, fig.p.key, this.dpr);
    }
    this.refDrawn = true;
    this.showReadout();
  }

  hover(e, n, readout) {
    const r = e.target.getBoundingClientRect();
    if (!this.map || !r.width) return;
    const [lat, lon] = this.map.P.ll(((e.clientX - r.left) / r.width) * this.map.w, ((e.clientY - r.top) / r.height) * this.map.h);
    this.at = { readout, lat, lon, n };
    this.showReadout();
  }

  showReadout() {
    if (!this.at) return;
    const { readout, lat, lon, n } = this.at, g = this.idx.grid, where = `${fmt(lat)}°N ${lonLabel(lon)}`;
    if (!this.map.P.inside(lat, lon)) { readout.textContent = 'outside the map'; return; }
    const i = rowCoord(lat, g.lat), j = colIndex(lon, this.ev.lon0, g.dlon, g.ncol);
    if (!Number.isFinite(j)) { readout.textContent = `${where} · outside this event’s data window`; return; }
    const f = this.fields(this.k), at = (a) => bilinear(a, g.nrow, g.ncol, i, j);
    readout.textContent = this.figs[n].p.static ? `${where} · z̄ ${fmt(at(f.z5), 0)} m`
      : `${where} · Z500′ ${fmt(at(f.z500a), 0)} m · v ${fmt(at(f.v250))} · |V| ${fmt(at(f.spd250))} m s⁻¹ · SLP ${fmt(at(f.psl))} hPa`;
  }

  destroy() { this.ro.disconnect(); this.root.remove(); }
}
