// Panel pixels (plan R13): per-pixel fractional grid coordinates for one event and panel size, shading through a
// colormap LUT, contour segments in pixel space, and the overlays. The draw* functions take a 2-D canvas context; the
// rest is pure (the tools render PNGs with it in Node).
import { bilinear, colCoord, extentOf, lonLabel, projector, rowCoord, rowLat } from './geo.js';
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

export function drawColorbar(canvas, lut, lim, units) {
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height, bar = Math.round(h * 0.45);
  ctx.clearRect(0, 0, w, h);
  for (let x = 0; x < w; x++) {
    const c = lut[Math.round((x / (w - 1)) * (lut.length - 1))];
    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.fillRect(x, 0, 1, bar);
  }
  ctx.fillStyle = getComputedStyle(canvas).color || '#555';
  ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'top';
  ctx.textAlign = 'left'; ctx.fillText(String(lim[0]), 0, bar + 3);
  ctx.textAlign = 'center'; ctx.fillText(units, w / 2, bar + 3);
  ctx.textAlign = 'right'; ctx.fillText(String(lim[1]), w, bar + 3);
}
