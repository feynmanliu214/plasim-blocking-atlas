// Site data (plan R9, R13): index.json, each event's int16 bin (fetched when first opened, kept in a small LRU) and
// the gallery thumbnails. Pure apart from `fetch`, which callers may replace (tests, tools).
export const SCHEMA = 'blockform01-site/2';
const NEEDED = ['z500a', 'v250', 'spd250', 'psl'];

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

export function validateIndex(idx) {
  if (!idx || idx.schema !== SCHEMA) throw new Error(`index.json schema ${idx && idx.schema} is not ${SCHEMA}`);
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
  return idx;
}

export async function loadIndex(base = 'data/', fetchFn = fetch) {
  const r = await fetchFn(`${base}index.json`);
  if (!r.ok) throw new Error(`index.json: HTTP ${r.status}`);
  return validateIndex(await r.json());
}

// (nvar, nframe, nrow, ncol) little-endian int16 -> {key: Float32Array(nframe * nrow * ncol)} in physical units.
export function decodeEvent(buf, idx) {
  const { nrow, ncol } = idx.grid, block = idx.frames.t.length * nrow * ncol;
  if (buf.byteLength !== idx.vars.length * block * 2) throw new Error(`event data: ${buf.byteLength} bytes`);
  const dv = new DataView(buf), out = {};
  idx.vars.forEach((v, n) => {
    const a = new Float32Array(block), base = 2 * n * block;
    for (let i = 0; i < block; i++) a[i] = dv.getInt16(base + 2 * i, true) * v.scale + v.offset;
    out[v.key] = a;
  });
  return out;
}

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
      const r = await fetchFn(`${this.base}${meta.file}?v=${meta.sha256.slice(0, 12)}`);
      if (!r.ok) throw new Error(`${meta.file}: HTTP ${r.status}`);
      const data = { meta, vars: decodeEvent(await r.arrayBuffer(), this.idx) };
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
