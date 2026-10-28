// The orientation strip under the timeline (plan R9): each shown event's peak-patch Z500 anomaly per frame (from
// index.json: the cos-lat-weighted mean over its fixed 5 × 5-cell peak patch) against model time, on the shared scale
// style.series.lim. It shades the 5-day window, marks the change from daily to 6-hourly frames, draws M (one event) and
// a line at the current frame. Click or drag to seek.
import { el } from './ui.js';

export const LINE_COLORS = ['#1f5f8b', '#a2561a', '#2f6f4e', '#7a3e9d'];
export const SERIES_CAPTION = 'Peak-patch Z500 anomaly (m): the cos(latitude)-weighted mean over the event’s fixed 5 × 5-cell '
  + 'peak patch at each frame. Shaded: the 5-day window, whose 20 frames average to M.';

export function seriesGeometry(times, lim, w, h, pad) {
  const t0 = times[0], t1 = times[times.length - 1], pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  return {
    pad,
    x: (t) => pad.l + ((t - t0) / (t1 - t0)) * pw,
    t: (x) => t0 + ((x - pad.l) / pw) * (t1 - t0),
    y: (v) => pad.t + ((lim[1] - Math.max(lim[0], Math.min(lim[1], v))) / (lim[1] - lim[0])) * ph,
  };
}

export function seriesChart(idx, events, player, { showM = events.length === 1 } = {}) {
  const canvas = el('canvas', { class: 'series', role: 'img', 'aria-label': `Peak-patch Z500 anomaly against model time: ${events.map((e) => e.id).join(', ')}` });
  const legend = events.length > 1
    ? el('p', { class: 'legend' }, events.map((e, n) => el('span', { style: `color: ${LINE_COLORS[n]}` }, `— ${e.id}`))) : null;
  const root = el('figure', { class: 'fig sfig' }, el('figcaption', {}, SERIES_CAPTION), canvas, legend);
  const t = player.times, fr = idx.frames, lim = idx.style.series.lim;
  let G = null;
  const draw = () => {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2), w = Math.round((canvas.clientWidth || 600) * dpr), h = Math.round(96 * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const s = dpr, ctx = canvas.getContext('2d'), fg = getComputedStyle(canvas).color || '#333';
    G = seriesGeometry(t, lim, w, h, { l: 40 * s, r: 8 * s, t: 6 * s, b: 16 * s });
    const top = G.pad.t, bottom = h - G.pad.b;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(31,95,139,0.14)';
    ctx.fillRect(G.x(fr.window[0]), top, G.x(Math.min(fr.window[1], t[t.length - 1])) - G.x(fr.window[0]), bottom - top);
    ctx.font = `${Math.round(10 * s)}px system-ui, sans-serif`; ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    for (let v = Math.ceil(lim[0] / 200) * 200; v <= lim[1]; v += 200) {
      ctx.strokeStyle = v === 0 ? 'rgba(128,128,128,0.7)' : 'rgba(128,128,128,0.25)'; ctx.lineWidth = s;
      ctx.beginPath(); ctx.moveTo(G.pad.l, G.y(v)); ctx.lineTo(w - G.pad.r, G.y(v)); ctx.stroke();
      ctx.fillText(String(v), G.pad.l - 4 * s, G.y(v));
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const x of [t[0], -10, fr.daily_to, 0, t[t.length - 1]]) ctx.fillText(`${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x)}`, G.x(x), bottom + 2 * s);
    ctx.save(); ctx.setLineDash([3 * s, 3 * s]); ctx.strokeStyle = fg; ctx.lineWidth = s;
    ctx.beginPath(); ctx.moveTo(G.x(fr.daily_to), top); ctx.lineTo(G.x(fr.daily_to), bottom); ctx.stroke(); ctx.restore();
    ctx.textBaseline = 'top'; ctx.textAlign = 'right'; ctx.fillText('daily', G.x(fr.daily_to) - 4 * s, top + 1 * s);
    ctx.textAlign = 'left'; ctx.fillText(`${fr.step_hours}-hourly`, G.x(fr.daily_to) + 4 * s, top + 1 * s);
    events.forEach((e, n) => {
      ctx.strokeStyle = LINE_COLORS[n % LINE_COLORS.length]; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      e.series.forEach((v, k) => { if (k) ctx.lineTo(G.x(t[k]), G.y(v)); else ctx.moveTo(G.x(t[k]), G.y(v)); });
      ctx.stroke();
      e.series.forEach((v, k) => { ctx.beginPath(); ctx.arc(G.x(t[k]), G.y(v), 1.6 * s, 0, 2 * Math.PI); ctx.fill(); });
    });
    if (showM) {
      const e = events[0];
      ctx.save(); ctx.setLineDash([5 * s, 3 * s]); ctx.strokeStyle = fg; ctx.lineWidth = s;
      ctx.beginPath(); ctx.moveTo(G.pad.l, G.y(e.M_y)); ctx.lineTo(w - G.pad.r, G.y(e.M_y)); ctx.stroke(); ctx.restore();
      ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('M', G.pad.l + 2 * s, G.y(e.M_y) - 1 * s);
    }
    ctx.strokeStyle = fg; ctx.lineWidth = 1.5 * s;
    ctx.beginPath(); ctx.moveTo(G.x(t[player.index]), top); ctx.lineTo(G.x(t[player.index]), bottom); ctx.stroke();
  };
  const seek = (e) => {
    const r = canvas.getBoundingClientRect();
    if (!G || !r.width) return;
    player.pause();
    player.set(player.nearest(G.t(((e.clientX - r.left) / r.width) * canvas.width)));
  };
  canvas.addEventListener('pointerdown', (e) => { seek(e); if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (e.buttons & 1) seek(e); });
  const off = player.on(draw), ro = new ResizeObserver(draw);
  ro.observe(canvas);
  draw();
  return { root, draw, destroy: () => { off(); ro.disconnect(); } };
}
