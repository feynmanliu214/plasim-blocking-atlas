// Panel pixels (plan R13): per-pixel fractional grid coordinates for one event and panel size, shading through a
// colormap LUT, contour segments in pixel space, and the overlays. The draw* functions take a 2-D canvas context; the
// rest is pure (the tools render PNGs with it in Node).
import { bilinear, colCoord, colIndex, domainOf, extentOf, lonLabel, projector, rowCoord, rowLat, wrap180 } from './geo.js';
import { aspectOf, projector as polar } from './proj.js';
import { contourSegments } from './contour.js';

export const ASPECT = 240 / 70;

export function panelMap(grid, ev, w, h) {
  const ext = extentOf(ev, grid), P = projector(ext, w, h);
  const rows = new Float64Array(h), cols = new Float64Array(w);
  for (let y = 0; y < h; y++) rows[y] = rowCoord(P.lat(y + 0.5), grid.lat);
  for (let x = 0; x < w; x++) cols[x] = colCoord(P.lon(x + 0.5), ev.lon0, grid.dlon, grid.ncol);
  return { w, h, rows, cols, ext, P };
}

export function shade(vals, map, grid, lut, lim, out = new Uint8ClampedArray(map.w * map.h * 4)) {
  const n = lut.length, lo = lim[0], span = lim[1] - lim[0];
  for (let y = 0; y < map.h; y++) {
    const i = map.rows[y];
    for (let x = 0; x < map.w; x++) {
      const v = bilinear(vals, grid.nrow, grid.ncol, i, map.cols[x]), p = 4 * (y * map.w + x);
      if (!Number.isFinite(v)) { out[p + 3] = 0; continue; }
      let k = Math.round(((v - lo) / span) * (n - 1));
      k = k < 0 ? 0 : k > n - 1 ? n - 1 : k;
      const c = lut[k];
      out[p] = c[0]; out[p + 1] = c[1]; out[p + 2] = c[2]; out[p + 3] = 255;
    }
  }
  return out;
}

export function toPixels(segs, map, grid, ev) {
  const out = new Float64Array(segs.length);
  for (let k = 0; k < segs.length; k += 2) {
    out[k] = map.P.x(ev.lon0 + segs[k + 1] * grid.dlon);
    out[k + 1] = map.P.y(rowLat(segs[k], grid.lat));
  }
  return out;
}

export function lsmWindow(idx, ev) {
  const { nrow, ncol, nlon } = idx.grid, out = new Float32Array(nrow * ncol);
  for (let i = 0; i < nrow; i++) for (let j = 0; j < ncol; j++) out[i * ncol + j] = idx.lsm[i][(ev.col0 + j) % nlon] === '1' ? 1 : 0;
  return out;
}

export function strokeSegments(ctx, px, { color = '#000', width = 1, dash = null } = {}) {
  if (!px.length) return;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
  ctx.beginPath();
  for (let k = 0; k < px.length; k += 4) { ctx.moveTo(px[k], px[k + 1]); ctx.lineTo(px[k + 2], px[k + 3]); }
  ctx.stroke();
  ctx.restore();
}

export function drawField(ctx, map, grid, vals, style, lut) {
  const img = ctx.createImageData(map.w, map.h);
  shade(vals, map, grid, lut, style.lim, img.data);
  ctx.putImageData(img, 0, 0);
}

export function drawContours(ctx, map, grid, ev, vals, levels, { color = '#111', width = 1, dashNegative = false, scale = 1 } = {}) {
  for (const lv of levels) {
    const px = toPixels(contourSegments(vals, grid.nrow, grid.ncol, lv), map, grid, ev);
    strokeSegments(ctx, px, { color, width: width * scale, dash: dashNegative && lv < 0 ? [4 * scale, 3 * scale] : null });
  }
}

export function drawFrame(ctx, map, s = 1) {
  const { P, ext, w, h } = map;
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = s; ctx.setLineDash([2 * s, 3 * s]);
  ctx.font = `${Math.round(11 * s)}px system-ui, sans-serif`; ctx.fillStyle = 'rgba(0,0,0,0.78)';
  for (let lon = Math.ceil(ext.lonW / 30) * 30; lon <= ext.lonE; lon += 30) {
    const x = P.x(lon);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    ctx.fillText(lonLabel(lon), x + 2 * s, h - 3 * s);
  }
  for (const lat of [30, 45, 60, 75]) {
    const y = P.y(lat);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    ctx.fillText(`${lat}°N`, 3 * s, y - 2 * s);
  }
  ctx.restore();
}

export function drawMarker(ctx, map, ev, s = 1) {
  const x = map.P.x(ev.centre[1]), y = map.P.y(ev.centre[0]), r = 6 * s;
  ctx.save();
  ctx.lineCap = 'round';
  for (const [color, width] of [['#fff', 4 * s], ['#000', 1.8 * s]]) {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x - r, y + r); ctx.lineTo(x + r, y - r); ctx.stroke();
  }
  ctx.restore();
}

export function drawBox(ctx, map, ev, s = 1) {
  const [S, N, W, E] = ev.patch_box, x0 = map.P.x(W), x1 = map.P.x(E), y0 = map.P.y(N), y1 = map.P.y(S);
  ctx.save();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2 * s; ctx.setLineDash([5 * s, 3 * s]);
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  ctx.restore();
}

// The panel aspect of the display domain (4:3 for ± 120° from 20 N).
export const aspect = (grid) => aspectOf({ lonC: 0, half: grid.half_width_deg, latS: grid.lat_min_display });

// Per-pixel bilinear stencil of event `ev`'s window for a w × h polar-stereographic panel centred on lonC (plan R4):
// k[p] is the corner index (row i0 * ncol + col j0) of pixel p's cell, -1 outside the domain or outside the event's
// data window; fi[p], fj[p] are the fractions within the cell.
export function pixelMap(grid, ev, w, h, lonC = ev.centre[1]) {
  const dom = domainOf(ev, grid, lonC), P = polar(dom, w, h), n = w * h;
  const k = new Int32Array(n).fill(-1), fi = new Float32Array(n), fj = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [lat, lon] = P.ll(x + 0.5, y + 0.5);
      if (!P.inside(lat, lon)) continue;
      const j = colIndex(lon, ev.lon0, grid.dlon, grid.ncol);
      if (!Number.isFinite(j)) continue;
      const i = rowCoord(lat, grid.lat), i0 = Math.min(Math.floor(i), grid.nrow - 2), j0 = Math.min(Math.floor(j), grid.ncol - 2);
      const p = y * w + x;
      k[p] = i0 * grid.ncol + j0; fi[p] = i - i0; fj[p] = j - j0;
    }
  }
  return { w, h, k, fi, fj, dom, P };
}

export function samplePixel(vals, map, p, ncol) {
  const k = map.k[p], fi = map.fi[p], fj = map.fj[p];
  return (1 - fi) * ((1 - fj) * vals[k] + fj * vals[k + 1]) + fi * ((1 - fj) * vals[k + ncol] + fj * vals[k + ncol + 1]);
}

export function shadePixels(vals, map, grid, lut, lim, out = new Uint8ClampedArray(map.w * map.h * 4)) {
  const n = lut.length, lo = lim[0], span = lim[1] - lim[0];
  for (let p = 0; p < map.w * map.h; p++) {
    const q = 4 * p;
    if (map.k[p] < 0) { out[q + 3] = 0; continue; }
    const v = samplePixel(vals, map, p, grid.ncol);
    if (!Number.isFinite(v)) { out[q + 3] = 0; continue; }
    let m = Math.round(((v - lo) / span) * (n - 1));
    m = m < 0 ? 0 : m > n - 1 ? n - 1 : m;
    const c = lut[m];
    out[q] = c[0]; out[q + 1] = c[1]; out[q + 2] = c[2]; out[q + 3] = 255;
  }
  return out;
}

// Paper (the isobar panel's background, owner V2) inside the map, transparent outside.
export function fillPixels(map, rgb, out = new Uint8ClampedArray(map.w * map.h * 4)) {
  for (let p = 0; p < map.w * map.h; p++) {
    const q = 4 * p;
    if (map.k[p] < 0) { out[q + 3] = 0; continue; }
    out[q] = rgb[0]; out[q + 1] = rgb[1]; out[q + 2] = rgb[2]; out[q + 3] = 255;
  }
  return out;
}

// Liang–Barsky clip of the lat-lon segment (lat0, lon0) -> (lat1, lon1) to a domain, with longitudes taken relative
// to lonC and unwrapped along the segment: [lat0', lon0', lat1', lon1', t0, t1] (t0 > 0: the start was cut; t1 < 1:
// the end was cut), or null when no part lies inside.
export function clipLL(lat0, lon0, lat1, lon1, dom) {
  const d0 = wrap180(lon0 - dom.lonC), d1 = d0 + wrap180(lon1 - lon0), H = dom.half + 1e-9, S = dom.latS - 1e-9;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-(d1 - d0), d0 + H], [d1 - d0, H - d0], [-(lat1 - lat0), lat0 - S]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [lat0 + t0 * (lat1 - lat0), dom.lonC + d0 + t0 * (d1 - d0), lat0 + t1 * (lat1 - lat0), dom.lonC + d0 + t1 * (d1 - d0), t0, t1];
}

// Pixel paths [x, y, x, y, ...] of the lat-lon polyline pts = [[lat, lon], ...]: each segment cut into pieces at most
// `step` degrees long (the projection bends straight lat-lon segments), clipped to the map's domain; a new path starts
// wherever the line re-enters.
export function projectPolyline(pts, map, step = 1) {
  const paths = [];
  let cur = null;
  for (let q = 0; q + 1 < pts.length; q++) {
    const [la0, lo0] = pts[q], dla = pts[q + 1][0] - la0, dlo = wrap180(pts[q + 1][1] - lo0);
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dla), Math.abs(dlo)) / step));
    for (let m = 0; m < n; m++) {
      const c = clipLL(la0 + (dla * m) / n, lo0 + (dlo * m) / n, la0 + (dla * (m + 1)) / n, lo0 + (dlo * (m + 1)) / n, map.dom);
      if (!c) { cur = null; continue; }
      if (!cur || c[4] > 0) { cur = [...map.P.xy(c[0], c[1])]; paths.push(cur); }
      cur.push(...map.P.xy(c[2], c[3]));
      if (c[5] < 1) cur = null;
    }
  }
  return paths;
}

export function strokePaths(ctx, paths, { color = '#000', width = 1, dash = null } = {}) {
  if (!paths.length) return;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
  ctx.beginPath();
  for (const p of paths) {
    ctx.moveTo(p[0], p[1]);
    for (let k = 2; k + 1 < p.length; k += 2) ctx.lineTo(p[k], p[k + 1]);
  }
  ctx.stroke();
  ctx.restore();
}

// The colour bar of a shaded scale at the device pixel ratio (plan R13): the canvas is resized to its CSS width
// (320 px when it is not laid out yet) times dpr.
export function drawColorbar(canvas, lut, lim, units, dpr = 1) {
  const cssW = canvas.clientWidth || 320, cssH = canvas.clientHeight || 34;
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height, bar = Math.round(h * 0.45);
  ctx.clearRect(0, 0, w, h);
  for (let x = 0; x < w; x++) {
    const c = lut[Math.round((x / (w - 1)) * (lut.length - 1))];
    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.fillRect(x, 0, 1, bar);
  }
  ctx.fillStyle = getComputedStyle(canvas).color || '#555';
  ctx.font = `${Math.round(11 * dpr)}px system-ui, sans-serif`; ctx.textBaseline = 'top';
  ctx.textAlign = 'left'; ctx.fillText(String(lim[0]), 0, bar + 3 * dpr);
  ctx.textAlign = 'center'; ctx.fillText(units, w / 2, bar + 3 * dpr);
  ctx.textAlign = 'right'; ctx.fillText(String(lim[1]), w, bar + 3 * dpr);
}
