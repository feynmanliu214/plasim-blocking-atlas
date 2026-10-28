// Site data (plan R9, R13; BLOCKFORM02 R9, R10): index.json, each event's int16 bins -- the four fields and, from schema
// 3, the 250 hPa local wave activity in a second file -- fetched when first opened and kept in a small LRU, and the
// gallery thumbnails. Pure apart from `fetch`, which callers may replace (tests, tools).
export const SCHEMA = 'blockform01-site/3';
const ACCEPTED = ['blockform01-site/2', SCHEMA];          // the switch (BLOCKFORM02 R10); commit 3 removes /2
const NEEDED = ['z500a', 'v250', 'spd250', 'psl'];
const NEEDED_LWA = ['lwa_a', 'lwa_c'];

// Schema 2's additions (plan R11): the coastline, the series scale, each event's series and RP text, known groups.
function validateV2(idx) {
  const nf = idx.frames.t.length, groups = new Set(idx.groups.map((g) => g.key));
  const c = idx.coast;
  if (!c || !Array.isArray(c.lines) || !c.lines.length || c.lines.some((l) => !Array.isArray(l) || l.length < 4 || l.length % 2)) {
    throw new Error('index.json coastline is missing or malformed');
  }
  if (!idx.style.series || !Array.isArray(idx.style.series.lim) || idx.style.series.lim.length !== 2) {
    throw new Error('index.json lacks the series scale');
  }
  for (const e of idx.events) {
    if (!groups.has(e.group)) throw new Error(`event ${e.id}: unknown group ${e.group}`);
    if (!Array.isArray(e.series) || e.series.length !== nf || !e.series.every(Number.isFinite)) throw new Error(`event ${e.id}: series`);
    if (typeof e.rp_display !== 'string' || !e.rp_display) throw new Error(`event ${e.id}: rp_display`);
  }
}

// Schema 3's additions (BLOCKFORM02 R9): the LWA variables, their shading scale and line step, each event's LWA file.
function validateV3(idx) {
  const l = idx.lwa, g = idx.grid, a = idx.style.lwa_a, c = idx.style.lwa_c;
  if (!l || !Array.isArray(l.vars)) throw new Error('index.json lacks the LWA variables');
  const keys = l.vars.map((v) => v.key);
  for (const k of NEEDED_LWA) if (!keys.includes(k)) throw new Error(`index.json lacks LWA variable ${k}`);
  if (!a || !Array.isArray(a.lim) || a.lim.length !== 2 || !(a.lim[1] > a.lim[0]) || !idx.cmaps[a.cmap]) {
    throw new Error('index.json lacks the LWA colour scale');
  }
  if (!c || !(c.step > 0)) throw new Error('index.json lacks the cyclonic LWA line step');
  const bytes = l.vars.length * idx.frames.t.length * g.nrow * g.ncol * 2;
  for (const e of idx.events) {
    if (typeof e.lwa_file !== 'string' || !e.lwa_file) throw new Error(`event ${e.id}: lwa_file`);
    if (e.lwa_bytes !== bytes) throw new Error(`event ${e.id}: ${e.lwa_bytes} LWA bytes, expected ${bytes}`);
  }
}

export function validateIndex(idx) {
  if (!idx || !ACCEPTED.includes(idx.schema)) throw new Error(`index.json schema ${idx && idx.schema} is not ${SCHEMA}`);
  const g = idx.grid, nf = idx.frames.t.length;
  if (g.lat.length !== g.nrow || idx.lsm.length !== g.nrow || idx.lsm.some((r) => r.length !== g.nlon)) {
    throw new Error('index.json grid or land-sea mask has the wrong shape');
  }
  const keys = idx.vars.map((v) => v.key);
  for (const k of NEEDED) if (!keys.includes(k)) throw new Error(`index.json lacks variable ${k}`);
  for (const k of ['z500a', 'v250', 'psl']) if (!idx.cmaps[idx.style[k].cmap]) throw new Error(`index.json lacks colormap for ${k}`);
  const bytes = idx.vars.length * nf * g.nrow * g.ncol * 2;
  for (const e of idx.events) if (e.bytes !== bytes) throw new Error(`event ${e.id}: ${e.bytes} bytes, expected ${bytes}`);
  validateV2(idx);
  if (idx.schema === SCHEMA) validateV3(idx);
  return idx;
}

export async function loadIndex(base = 'data/', fetchFn = fetch) {
  const r = await fetchFn(`${base}index.json`);
  if (!r.ok) throw new Error(`index.json: HTTP ${r.status}`);
  return validateIndex(await r.json());
}

// (nvar, nframe, nrow, ncol) little-endian int16 -> {key: Float32Array(nframe * nrow * ncol)} in physical units, for
// `vars` (the event file's idx.vars, or the LWA file's idx.lwa.vars).
export function decodeEvent(buf, idx, vars = idx.vars) {
  const { nrow, ncol } = idx.grid, block = idx.frames.t.length * nrow * ncol;
  if (buf.byteLength !== vars.length * block * 2) throw new Error(`event data: ${buf.byteLength} bytes`);
  const dv = new DataView(buf), out = {};
  vars.forEach((v, n) => {
    const a = new Float32Array(block), base = 2 * n * block;
    for (let i = 0; i < block; i++) a[i] = dv.getInt16(base + 2 * i, true) * v.scale + v.offset;
    out[v.key] = a;
  });
  return out;
}

// The metadata (label, units, scale, offset) of a variable in either file.
export const varMeta = (idx, key) => [...idx.vars, ...((idx.lwa && idx.lwa.vars) || [])].find((v) => v.key === key);

export function frameSlice(arr, k, nrow, ncol) {
  const n = nrow * ncol;
  return arr.subarray(k * n, (k + 1) * n);
}

export class EventStore {
  constructor(idx, base = 'data/', fetchFn = fetch, capacity = 8) {
    this.idx = idx; this.base = base; this.fetchFn = fetchFn; this.capacity = capacity;
    this.cache = new Map(); this.pending = new Map();
    this.byId = new Map(idx.events.map((e) => [e.id, e]));
  }

  async get(id) {
    if (this.cache.has(id)) {
      const hit = this.cache.get(id);
      this.cache.delete(id);
      this.cache.set(id, hit);
      return hit;
    }
    if (this.pending.has(id)) return this.pending.get(id);
    const meta = this.byId.get(id);
    if (!meta) throw new Error(`unknown event ${id}`);
    const p = (async () => {
      const fetchFn = this.fetchFn;   // bare call: browsers require fetch's receiver to be the global object
      const bin = async (file, sha) => {
        const r = await fetchFn(`${this.base}${file}?v=${sha.slice(0, 12)}`);
        if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
        return r.arrayBuffer();
      };
      const lwa = this.idx.lwa;
      const [main, lw] = await Promise.all([bin(meta.file, meta.sha256), lwa ? bin(meta.lwa_file, meta.lwa_sha256) : null]);
      const vars = decodeEvent(main, this.idx);
      if (lwa) Object.assign(vars, decodeEvent(lw, this.idx, lwa.vars));
      const data = { meta, vars };
      this.cache.set(id, data);
      while (this.cache.size > this.capacity) this.cache.delete(this.cache.keys().next().value);
      return data;
    })();
    this.pending.set(id, p);
    try { return await p; } finally { this.pending.delete(id); }
  }
}

export async function loadThumbs(idx, base = 'data/', fetchFn = fetch) {
  const n = idx.grid.nrow * idx.grid.ncol, ne = idx.events.length;
  const [rz, rr] = await Promise.all([fetchFn(base + idx.thumbs.z5), fetchFn(base + idx.thumbs.region)]);
  if (!rz.ok || !rr.ok) throw new Error('thumbnails: HTTP error');
  const z = await rz.arrayBuffer(), reg = new Uint8Array(await rr.arrayBuffer());
  if (z.byteLength !== 2 * n * ne || reg.length !== n * ne) throw new Error('thumbnail sizes differ from the index');
  const v = idx.vars.find((x) => x.key === 'z500a'), dv = new DataView(z), zf = new Float32Array(n * ne);
  for (let i = 0; i < n * ne; i++) zf[i] = dv.getInt16(2 * i, true) * v.scale + v.offset;
  return { z5: (k) => zf.subarray(k * n, (k + 1) * n), region: (k) => reg.subarray(k * n, (k + 1) * n) };
}
