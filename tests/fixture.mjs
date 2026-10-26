// A small synthetic site in the BLOCKFORM01 format (plan R9) for the tests and tool checks.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const VARS = [
  { key: 'z500a', label: 'Z500 anomaly', units: 'm', scale: 0.1, offset: 0 },
  { key: 'v250', label: '250 hPa meridional wind', units: 'm s-1', scale: 0.01, offset: 0 },
  { key: 'spd250', label: '250 hPa wind speed', units: 'm s-1', scale: 0.01, offset: 0 },
  { key: 'psl', label: 'Sea-level pressure', units: 'hPa', scale: 0.01, offset: 1000 },
];
const LUT = Array.from({ length: 256 }, (_, k) => [k, 100, 255 - k]);

export function frameTimes() {
  return [...Array.from({ length: 11 }, (_, i) => -15 + i), ...Array.from({ length: 39 }, (_, i) => -4.75 + 0.25 * i)];
}

export function field(key, k, i, j) {          // the physical value of `key` at frame k, row i, column j
  if (key === 'z500a') return 300 * Math.sin(i / 4 + k / 10) * Math.cos(j / 9);
  if (key === 'v250') return 25 * Math.sin(j / 6 - k / 8);
  if (key === 'spd250') return 30 + 20 * Math.cos(i / 5) ** 2;
  return 1010 + 20 * Math.sin(i / 6) * Math.cos(j / 11 + k / 12);
}

export function makeIndex({ nrow = 25, ncol = 89, events = [{ id: 'E0001', group: 'rp1000', rank: 1, centre: [64.2, 318.4] }] } = {}) {
  const lat = Array.from({ length: nrow }, (_, i) => 20.93 + (i * (87.86 - 20.93)) / (nrow - 1));
  const t = frameTimes();
  const bytes = VARS.length * t.length * nrow * ncol * 2;
  const evs = events.map((e, k) => {
    const jc = Math.round(e.centre[1] / 2.8125);
    return { rp: 53821 / e.rank, M_y: 500, date: '0723-01-05', s_star: 35, peak: [65.5776, 306.5625],
      patch_box: [58.6, 71.2, 299.5, 313.6], col0: (((jc - 44) % 128) + 128) % 128, lon0: (jc - 44) * 2.8125, cells: 120,
      flags: { seed_fallback: false, multi_component: false, touches_south: false, polar_ring: false },
      file: `events/${e.id}.bin`, bytes, sha256: '', thumb: k, ...e };
  });
  return {
    schema: 'blockform01-site/1', build: { attempt: 'test', smoke: true }, pool: { n_seasons: 53820, n_pool: 5382, rp_min: 10 },
    grid: { lat, nrow, ncol, nlon: 128, dlon: 2.8125, lat_min_display: 20, half_width_deg: 120 },
    frames: { t, daily_to: -5, step_hours: 6, window: [0, 5] }, vars: VARS,
    style: { z500a: { cmap: 'RdBu_r', lim: [-400, 400], contours: [-300, -200, -100, 100, 200, 300] },
      v250: { cmap: 'PuOr_r', lim: [-40, 40] }, spd250: { contours: [30, 40, 50, 60] },
      psl: { cmap: 'viridis', lim: [980, 1040], contours: Array.from({ length: 16 }, (_, k) => 980 + 4 * k) } },
    cmaps: { RdBu_r: LUT, PuOr_r: LUT, viridis: LUT },
    lsm: Array.from({ length: nrow }, (_, i) => Array.from({ length: 128 }, (_, j) => (i > 10 && i < 16 && j > 100 && j < 110 ? '1' : '0')).join('')),
    thumbs: { z5: 'thumbs-z5.bin', region: 'thumbs-region.bin' },
    groups: [{ key: 'rp1000', label: 'RP > 1000', n: evs.length, rule: 'every pool season with RP > 1000' }],
    events: evs, limitations: ['test limitation'],
  };
}

export function eventBuffer(idx, fn = field) {
  const { nrow, ncol } = idx.grid, nf = idx.frames.t.length;
  const buf = new ArrayBuffer(idx.vars.length * nf * nrow * ncol * 2), dv = new DataView(buf);
  let p = 0;
  for (const v of idx.vars) {
    for (let k = 0; k < nf; k++) for (let i = 0; i < nrow; i++) for (let j = 0; j < ncol; j++) {
      dv.setInt16(p, Math.round((fn(v.key, k, i, j) - v.offset) / v.scale), true);
      p += 2;
    }
  }
  return buf;
}

export function writeSite(dir, opts) {
  const idx = makeIndex(opts), n = idx.grid.nrow * idx.grid.ncol, ne = idx.events.length;
  mkdirSync(join(dir, 'events'), { recursive: true });
  const files = {};
  for (const e of idx.events) {
    files[e.file] = Buffer.from(eventBuffer(idx));
    e.sha256 = createHash('sha256').update(files[e.file]).digest('hex');
  }
  const tz = Buffer.alloc(2 * n * ne), tr = Buffer.alloc(n * ne);
  for (let q = 0; q < n * ne; q++) { tz.writeInt16LE(Math.round(100 * Math.sin(q / 50)), 2 * q); tr[q] = q % 7 === 0 ? 1 : 0; }
  files[idx.thumbs.z5] = tz;
  files[idx.thumbs.region] = tr;
  files['index.json'] = Buffer.from(JSON.stringify(idx));
  const names = Object.keys(files).sort();
  for (const f of names) writeFileSync(join(dir, f), files[f]);
  writeFileSync(join(dir, 'SHA256SUMS'), names.map((f) => `${createHash('sha256').update(files[f]).digest('hex')}  ${f}\n`).join(''));
  return idx;
}
