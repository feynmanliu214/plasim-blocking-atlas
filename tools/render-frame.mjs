// Render one event at one frame to a PNG with the page's own drawing code (js/draw.js) on a software raster
// (tools/raster.mjs): the five maps in 3 × 2 tiles (Z500 anomaly, 250 hPa wind, SLP isobars / LWA, five-day mean, an
// empty tile in the page background), each 720 × 540, over the page's light canvas background; text labels are not
// drawn.
// Usage: node tools/render-frame.mjs <data dir> <event id> <frame index> <out.png>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { validateIndex, decodeEvent, loadThumbs } from '../js/data.js';
import { aspect, pixelMap } from '../js/render.js';
import { PANELS, drawPanel, frameFields } from '../js/draw.js';
import { Raster } from './raster.mjs';
import { encodePNG } from './png.mjs';

const BACKGROUND = '#dedad2';                      // css/style.css --line (light scheme): the canvas background
const [dir, id, kArg, outPath] = process.argv.slice(2);
if (!outPath) { console.error('usage: node tools/render-frame.mjs <data dir> <event id> <frame index> <out.png>'); process.exit(2); }
const idx = validateIndex(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')));
const ev = idx.events.find((e) => e.id === id);
if (!ev) { console.error(`no event ${id}`); process.exit(2); }
const k = Number(kArg);
if (!(Number.isInteger(k) && k >= 0 && k < idx.frames.t.length)) { console.error(`frame ${kArg} is outside 0..${idx.frames.t.length - 1}`); process.exit(2); }
const buf = (p) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const vars = { ...decodeEvent(buf(join(dir, ev.file)), idx), ...decodeEvent(buf(join(dir, ev.lwa_file)), idx, idx.lwa.vars) };
const thumbs = await loadThumbs(idx, `${dir}/`, async (p) => ({ ok: true, arrayBuffer: async () => buf(p) }));
const g = idx.grid, W = 720, H = Math.round(W / aspect(g)), map = pixelMap(g, ev, W, H), COLS = 3, ROWS = Math.ceil(PANELS.length / COLS);
const f = frameFields(idx, vars, k, { z5: thumbs.z5(ev.thumb), region: thumbs.region(ev.thumb) });
const out = new Uint8ClampedArray(COLS * W * ROWS * H * 4), bg = [1, 3, 5].map((q) => parseInt(BACKGROUND.slice(q, q + 2), 16));
for (let q = 0; q < out.length; q += 4) { out[q] = bg[0]; out[q + 1] = bg[1]; out[q + 2] = bg[2]; out[q + 3] = 255; }
PANELS.forEach((p, m) => {
  const R = new Raster(W, H);
  drawPanel(R, map, idx, ev, f, p.key, 1);
  const px = R.flatten(BACKGROUND), ox = (m % COLS) * W, oy = Math.floor(m / COLS) * H;
  for (let y = 0; y < H; y++) out.set(px.subarray(4 * y * W, 4 * (y + 1) * W), 4 * ((oy + y) * COLS * W + ox));
});
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, encodePNG(COLS * W, ROWS * H, out));
console.log(JSON.stringify({ event: id, frame: k, t: idx.frames.t[k], png: outPath, width: COLS * W, height: ROWS * H }));
