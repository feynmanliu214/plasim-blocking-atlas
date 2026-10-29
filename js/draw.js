// Every map of the atlas drawn into a 2-D context (plan R5, R6, R12): the shading through the colormap LUT, or white
// paper for the isobar panel; the Natural Earth coastline; the field contours on the ×4 refinement; the graticule and
// the domain edge; the peak patch and the centre. Pure apart from the context, so the page (a canvas) and
// tools/render-frame.mjs (tools/raster.mjs) draw the same thing. Widths and fonts are CSS pixels times `s`.
import { chain, contourSegments, refine } from './contour.js';
import { fillPixels, projectPolyline, shadePixels, strokePaths } from './render.js';
import { lonLabel, rowLat } from './geo.js';
import { frameSlice } from './data.js';

export const REFINE = 4;
export const PAPER = [255, 255, 255];
export const GRATICULE_LATS = [30, 45, 60, 75];
export const STYLE = {
  coast: { color: 'rgba(40,40,40,0.45)', width: 0.7 },
  grid: { color: 'rgba(0,0,0,0.2)', width: 0.6, dash: [2, 3] },
  edge: { color: 'rgba(0,0,0,0.45)', width: 0.8 },
  z: { color: '#111', width: 0.9, negDash: [4, 3] },
  jet: { color: 'rgba(15,15,15,0.5)', width: 0.75 },
  isobar: { color: '#222', width: 0.8 },
  isobar1000: { color: '#111', width: 1.5 },
  region: { color: '#000', width: 1.8 },
  box: { color: '#000', width: 1.0, dash: [5, 3] },
  lwa: { color: '#1f4e96', width: 1.1 },
};

const step = (levels) => levels[1] - levels[0];
const scaled = (dash, s) => (dash ? dash.map((d) => d * s) : null);

// The five maps in the page's order (owner O5, V2; plan R7; BLOCKFORM02 R11): three columns on wide screens, so the
// LWA map sits under the Z500 anomaly. `shade` names the colour scale; null is paper.
export const PANELS = [
  { key: 'z500a', shade: 'z500a', title: (st) => `Z500 anomaly (m); contours every ${step(st.z500a.contours)} m, negative dashed` },
  { key: 'v250', shade: 'v250', title: (st) => `250 hPa meridional wind (m s⁻¹); thin lines: wind speed ${st.spd250.contours.join(', ')} m s⁻¹` },
  { key: 'psl', shade: null, title: (st) => `Sea-level pressure: isobars every ${step(st.psl.contours)} hPa, 1000 hPa bold` },
  { key: 'lwa', shade: 'lwa_a',
    title: (st) => `250 hPa local wave activity × cos φ (m s⁻¹): anticyclonic shaded, cyclonic lines every ${st.lwa_c.step} m s⁻¹` },
  { key: 'z5', shade: 'z500a', static: true,
    title: () => 'Five-day mean s* … s*+4: Z500 anomaly; z̄ ≥ ½·M region (bold), peak patch (dashed), centre (×)' },
];

// The arrays drawPanel reads at frame k (BLOCKFORM02 R10): the event's decoded fields, the LWA map's shading (`lwa`,
// anticyclonic) and lines (`lwa_c`, cyclonic), and the five-day mean `ref` = { z5, region }.
export function frameFields(idx, vars, k, ref) {
  const g = idx.grid, s = (key) => frameSlice(vars[key], k, g.nrow, g.ncol);
  return { z500a: s('z500a'), v250: s('v250'), spd250: s('spd250'), psl: s('psl'), lwa: s('lwa_a'), lwa_c: s('lwa_c'),
    z5: ref.z5, region: ref.region };
}

export const panelTitle = (p, style) => p.title(style);

// Levels every `inc` through the finite range of `vals`, 0 left out when skipZero (plan R6): the lines follow the
// field, not only the colour scale's range.
export function levelsFor(vals, inc, { skipZero = false } = {}) {
  let lo = Infinity, hi = -Infinity;
  for (const v of vals) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const out = [];
  if (!(hi >= lo)) return out;
  for (let k = Math.ceil(lo / inc); k <= Math.floor(hi / inc); k++) if (!(skipZero && k === 0)) out.push(k * inc);
  return out;
}

// The ½·M region as a field whose `thr` level is the region's edge (plan R5): region cells at least thr + eps, every
// other cell at most thr - eps, so above-threshold cells outside the region (other blobs, diagonal-only neighbours) get
// no line. eps is half the int16 step of the z̄ thumbnails (0.1 m).
export function regionField(z5, region, thr, eps = 0.05) {
  const out = new Float32Array(z5.length);
  for (let q = 0; q < z5.length; q++) out[q] = region[q] ? Math.max(z5[q], thr + eps) : Math.min(z5[q], thr - eps);
  return out;
}

// The window with its first row repeated at lat_min_display and its last row at 90 N (plan R5): the shading repeats
// the nearest row there, so the contours do too and reach the rim and the pole instead of stopping 1–2° short.
export function padRows(vals, grid) {
  const { nrow, ncol } = grid, out = new Float32Array((nrow + 2) * ncol);
  out.set(vals.subarray(0, ncol), 0);
  out.set(vals.subarray(0, nrow * ncol), ncol);
  out.set(vals.subarray((nrow - 1) * ncol, nrow * ncol), (nrow + 1) * ncol);
  return { vals: out, nrow: nrow + 2, ncol, lat: [grid.lat_min_display, ...grid.lat, 90] };
}

function levelPaths(R, lat, ev, grid, map, level) {
  const segs = contourSegments(R.vals, R.nrow, R.ncol, level), paths = [];
  for (let q = 0; q < segs.length; q++) segs[q] /= R.f;
  for (const line of chain(segs)) {
    const pts = [];
    for (let q = 0; q < line.length; q += 2) pts.push([rowLat(line[q], lat), ev.lon0 + line[q + 1] * grid.dlon]);
    paths.push(...projectPolyline(pts, map, Infinity));
  }
  return paths;
}

function drawLevels(ctx, map, grid, ev, vals, levels, st, s) {
  if (!levels.length) return;
  const P = padRows(vals, grid), R = refine(P.vals, P.nrow, P.ncol, REFINE);
  for (const lv of levels) {
    strokePaths(ctx, levelPaths(R, P.lat, ev, grid, map, lv),
      { color: st.color, width: st.width * s, dash: lv < 0 && st.negDash ? scaled(st.negDash, s) : scaled(st.dash, s) });
  }
}

function drawCoast(ctx, map, coast, s) {
  const c = (map.cache ||= {});
  if (!c.coast) {
    c.coast = [];
    for (const line of coast.lines) {
      const pts = [];
      for (let q = 0; q + 1 < line.length; q += 2) pts.push([line[q + 1], line[q]]);
      c.coast.push(...projectPolyline(pts, map, 1));
    }
  }
  strokePaths(ctx, c.coast, { color: STYLE.coast.color, width: STYLE.coast.width * s });
}

function drawGraticule(ctx, map, s, labels) {
  const { lonC, half, latS } = map.dom, c = (map.cache ||= {}), lons = [];
  for (let lon = Math.ceil((lonC - half) / 30) * 30; lon <= lonC + half + 1e-9; lon += 30) lons.push(lon);
  if (!c.grid) {
    const arc = (lat) => { const pts = []; for (let d = -half; d <= half + 1e-9; d += 2) pts.push([lat, lonC + d]); return pts; };
    c.grid = [...lons.flatMap((lon) => projectPolyline([[latS, lon], [90, lon]], map, 1)),
      ...GRATICULE_LATS.flatMap((lat) => projectPolyline(arc(lat), map, 2))];
    c.edge = [...projectPolyline([[90, lonC - half], [latS, lonC - half]], map, 1), ...projectPolyline(arc(latS), map, 2),
      ...projectPolyline([[latS, lonC + half], [90, lonC + half]], map, 1)];
  }
  strokePaths(ctx, c.grid, { color: STYLE.grid.color, width: STYLE.grid.width * s, dash: scaled(STYLE.grid.dash, s) });
  strokePaths(ctx, c.edge, { color: STYLE.edge.color, width: STYLE.edge.width * s });
  if (!labels) return;
  ctx.save();
  ctx.font = `${Math.round(10 * s)}px system-ui, sans-serif`; ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const lon of lons) { const [x, y] = map.P.xy(latS + 3, lon); ctx.fillText(lonLabel(lon), x, y); }
  for (const lat of GRATICULE_LATS) { const [x, y] = map.P.xy(lat, lonC - half + 7); ctx.fillText(`${lat}°N`, x, y); }
  ctx.restore();
}

function drawBox(ctx, map, ev, s) {
  const [S, N, W, E] = ev.patch_box;
  strokePaths(ctx, projectPolyline([[S, W], [S, E], [N, E], [N, W], [S, W]], map, 1),
    { color: STYLE.box.color, width: STYLE.box.width * s, dash: scaled(STYLE.box.dash, s) });
}

function drawMarker(ctx, map, ev, s) {
  if (!map.P.inside(ev.centre[0], ev.centre[1])) return;
  const [x, y] = map.P.xy(ev.centre[0], ev.centre[1]), r = 6 * s, X = [[x - r, y - r, x + r, y + r], [x - r, y + r, x + r, y - r]];
  strokePaths(ctx, X, { color: '#fff', width: 3.5 * s });
  strokePaths(ctx, X, { color: '#000', width: 1.6 * s });
}

// One map: `key` is a PANELS key; `f` holds the window arrays of the frame (z500a, v250, spd250, psl, lwa, lwa_c) and
// of the five-day mean (z5, region).
export function drawPanel(ctx, map, idx, ev, f, key, s = 1, { labels = true } = {}) {
  const g = idx.grid, st = idx.style, p = PANELS.find((x) => x.key === key), img = ctx.createImageData(map.w, map.h);
  if (p.shade) shadePixels(f[key], map, g, idx.cmaps[st[p.shade].cmap], st[p.shade].lim, img.data);
  else fillPixels(map, PAPER, img.data);
  ctx.putImageData(img, 0, 0);
  drawCoast(ctx, map, idx.coast, s);
  if (key === 'z500a') drawLevels(ctx, map, g, ev, f.z500a, levelsFor(f.z500a, step(st.z500a.contours), { skipZero: true }), STYLE.z, s);
  else if (key === 'v250') drawLevels(ctx, map, g, ev, f.spd250, st.spd250.contours, STYLE.jet, s);
  else if (key === 'psl') {
    const lv = levelsFor(f.psl, step(st.psl.contours));
    drawLevels(ctx, map, g, ev, f.psl, lv.filter((x) => x !== 1000), STYLE.isobar, s);
    drawLevels(ctx, map, g, ev, f.psl, lv.filter((x) => x === 1000), STYLE.isobar1000, s);
  } else if (key === 'lwa') drawLevels(ctx, map, g, ev, f.lwa_c, levelsFor(f.lwa_c, st.lwa_c.step, { skipZero: true }), STYLE.lwa, s);
  else drawLevels(ctx, map, g, ev, regionField(f.z5, f.region, 0.5 * ev.M_y), [0.5 * ev.M_y], STYLE.region, s);
  drawGraticule(ctx, map, s, labels);
  if (key === 'z500a' || key === 'z5') drawBox(ctx, map, ev, s);
  drawMarker(ctx, map, ev, s);
}
