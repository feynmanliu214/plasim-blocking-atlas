import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { projector } from '../js/proj.js';
import { domainOf } from '../js/geo.js';
import { PANELS, drawPanel, frameFields } from '../js/draw.js';
import { pixelMap } from '../js/render.js';
import { decodeEvent, loadThumbs, validateIndex } from '../js/data.js';
import { Raster } from '../tools/raster.mjs';
import { writeSite } from './fixture.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const node = (args) => spawnSync(process.execPath, args, { cwd: repo, encoding: 'utf8' });

test('check-site passes a consistent site and fails a corrupted one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-'));
  try {
    writeSite(dir);
    let r = node(['tools/check-site.mjs', dir]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(JSON.parse(r.stdout).events, 1);
    const p = join(dir, 'events', 'E0001.bin'), b = readFileSync(p);
    b[10] ^= 1;
    writeFileSync(p, b);
    r = node(['tools/check-site.mjs', dir]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /E0001\.bin: sha256/);
    writeFileSync(join(dir, 'stray.txt'), 'x');
    assert.match(node(['tools/check-site.mjs', dir]).stdout, /stray file stray\.txt/);
    const L = join(dir, 'events', 'E0001.lwa.bin'), lb = readFileSync(L);
    lb[20] ^= 1;
    writeFileSync(L, lb);
    assert.match(node(['tools/check-site.mjs', dir]).stdout, /E0001\.lwa\.bin: sha256/);   // errors accumulate per file
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

function pngPixels(buf) {
  const w = buf.readUInt32BE(16), idat = [];
  for (let p = 8; p < buf.length;) {
    const len = buf.readUInt32BE(p);
    if (buf.toString('ascii', p + 4, p + 8) === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  return (x, y) => [...raw.subarray(y * (4 * w + 1) + 1 + 4 * x, y * (4 * w + 1) + 5 + 4 * x)];   // filter 0 rows (tools/png.mjs)
}

test('render-frame draws the page’s five maps in 3 × 2 tiles with js/draw.js: north towards the top, × on the centre meridian, SLP unshaded', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-'));
  try {
    const idx = writeSite(dir), ev = idx.events[0];
    const out = join(dir, 'qa', 'nested', 'f.png');                      // the tool creates the missing parents
    const r = node(['tools/render-frame.mjs', dir, 'E0001', '30', out]);
    assert.equal(r.status, 0, r.stderr);
    const png = readFileSync(out);
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(png.readUInt32BE(16), 2160);
    assert.equal(png.readUInt32BE(20), 1080);
    const px = pngPixels(png);
    assert.deepEqual(px(360, 4), [222, 218, 210, 255]);                  // above the pole, beyond ± 120°: the page background
    const [x, y] = projector(domainOf(ev, idx.grid), 720, 540).xy(ev.centre[0], ev.centre[1]);
    assert.ok(Math.abs(x - 360) < 1e-9 && y > 180 && y < 540);           // below the pole, on the centre meridian
    const c = px(Math.floor(x), Math.floor(y));
    assert.ok(c[0] < 60 && c[1] < 60 && c[2] < 60, `× pixel ${c}`);
    for (const [u, v] of [[360, 400], [300, 300], [420, 450]]) {          // tile 2 (SLP): paper or grey lines only
      const q = px(1440 + u, v);
      assert.ok(Math.abs(q[0] - q[1]) <= 2 && Math.abs(q[1] - q[2]) <= 2, `SLP pixel ${q}`);
    }
    assert.deepEqual(px(2160 - 10, 1080 - 10), [222, 218, 210, 255]); // the empty sixth tile is the background
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('every render-frame tile is drawPanel on a Raster flattened over the page background, pixel for pixel', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-'));
  try {
    writeSite(dir);
    const out = join(dir, 'f.png'), r = node(['tools/render-frame.mjs', dir, 'E0001', '30', out]);
    assert.equal(r.status, 0, r.stderr);
    const px = pngPixels(readFileSync(out));
    const idx = validateIndex(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))), ev = idx.events[0], g = idx.grid;
    const buf = (p) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
    const v = { ...decodeEvent(buf(join(dir, ev.file)), idx), ...decodeEvent(buf(join(dir, ev.lwa_file)), idx, idx.lwa.vars) };
    const th = await loadThumbs(idx, `${dir}/`, async (p) => ({ ok: true, arrayBuffer: async () => buf(p) }));
    const f = frameFields(idx, v, 30, { z5: th.z5(ev.thumb), region: th.region(ev.thumb) });
    const map = pixelMap(g, ev, 720, 540);
    PANELS.forEach((p, m) => {
      const R = new Raster(720, 540);
      drawPanel(R, map, idx, ev, f, p.key, 1);
      const want = R.flatten('#dedad2'), ox = (m % 3) * 720, oy = Math.floor(m / 3) * 540;
      let bad = 0;
      for (let y = 0; y < 540; y++) for (let x = 0; x < 720; x++) {
        const got = px(ox + x, oy + y);
        for (let c = 0; c < 4; c++) if (got[c] !== want[4 * (y * 720 + x) + c]) bad++;
      }
      assert.equal(bad, 0, `tile ${m} (${p.key})`);
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('check-site counts events per group and refuses a count the index misstates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-')), opts = { events: ['E0001', 'E0002'].map((id, k) => ({ id, group: 'rp1000', rank: k + 1, centre: [64.2, 318.4] })) };
  try {
    writeSite(join(dir, 'a'), opts);
    let r = node(['tools/check-site.mjs', join(dir, 'a')]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(JSON.parse(r.stdout).groups, { rp1000: 2 });
    writeSite(join(dir, 'b'), opts, (x) => { x.groups[0].n = 5; });
    r = node(['tools/check-site.mjs', join(dir, 'b')]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /group rp1000: 2 events, index says 5/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
