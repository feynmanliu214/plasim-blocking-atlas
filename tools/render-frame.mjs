// Render one event's three panels at one frame to a PNG with the app's own shading and contour code (QA without a
// browser). Usage: node tools/render-frame.mjs <data dir> <event id> <frame index> <out.png>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { validateIndex, decodeEvent, frameSlice } from '../js/data.js';
import { ASPECT, panelMap, shade, toPixels, lsmWindow } from '../js/render.js';
import { contourSegments } from '../js/contour.js';
import { encodePNG } from './png.mjs';

const [dir, id, kArg, outPath] = process.argv.slice(2);
if (!outPath) { console.error('usage: node tools/render-frame.mjs <data dir> <event id> <frame index> <out.png>'); process.exit(2); }
const idx = validateIndex(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')));
const ev = idx.events.find((e) => e.id === id);
if (!ev) { console.error(`no event ${id}`); process.exit(2); }
const k = Number(kArg);
if (!(k >= 0 && k < idx.frames.t.length)) { console.error(`frame ${kArg} is outside 0..${idx.frames.t.length - 1}`); process.exit(2); }
const raw = readFileSync(join(dir, ev.file));
const vars = decodeEvent(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), idx);   // {key: Float32Array}
const g = idx.grid, W = 720, H = Math.round(W / ASPECT), map = panelMap(g, ev, W, H), lsm = lsmWindow(idx, ev);

function line(img, x0, y0, x1, y1, rgb) {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) + 1;
  for (let s = 0; s <= n; s++) {
    const x = Math.round(x0 + ((x1 - x0) * s) / n), y = Math.round(y0 + ((y1 - y0) * s) / n);
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    const p = 4 * (y * W + x);
    img[p] = rgb[0]; img[p + 1] = rgb[1]; img[p + 2] = rgb[2]; img[p + 3] = 255;
  }
}

function contours(img, vals, levels, rgb) {
  for (const lv of levels) {
    const px = toPixels(contourSegments(vals, g.nrow, g.ncol, lv), map, g, ev);
    for (let q = 0; q < px.length; q += 4) line(img, px[q], px[q + 1], px[q + 2], px[q + 3], rgb);
  }
}

const PANELS = [['z500a', 'z500a'], ['v250', 'spd250'], ['psl', 'psl']];
const out = new Uint8ClampedArray(W * H * 4 * PANELS.length);
PANELS.forEach(([sh, ln], n) => {
  const st = idx.style[sh];
  const img = shade(frameSlice(vars[sh], k, g.nrow, g.ncol), map, g, idx.cmaps[st.cmap], st.lim);
  contours(img, frameSlice(vars[ln], k, g.nrow, g.ncol), idx.style[ln].contours, [20, 20, 20]);
  contours(img, lsm, [0.5], [90, 90, 90]);
  const cx = Math.round(map.P.x(ev.centre[1])), cy = Math.round(map.P.y(ev.centre[0]));
  line(img, cx - 6, cy - 6, cx + 6, cy + 6, [0, 0, 0]);
  line(img, cx - 6, cy + 6, cx + 6, cy - 6, [0, 0, 0]);
  out.set(img, n * W * H * 4);
});
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, encodePNG(W, H * PANELS.length, out));
console.log(JSON.stringify({ event: id, frame: k, t: idx.frames.t[k], png: outPath, width: W, height: H * PANELS.length }));
