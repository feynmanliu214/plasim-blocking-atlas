// Annotations (owner O8 C, interview I6): precursor tags and free-text notes per event, optionally at one frame, each an
// observation or a hypothesized mechanism; kept in browser storage, exported and imported as JSON. User text is data:
// the views render it with textContent only.
export const SCHEMA = 'blockform01-annotations/1';
export const KINDS = ['observation', 'hypothesized-mechanism'];
export const KIND_LABELS = { observation: 'Observation', 'hypothesized-mechanism': 'Hypothesized mechanism' };
export const STARTER_TAGS = ['upstream cyclone', 'upstream ridge', 'Rossby wave packet', 'jet split', 'jet diffluence/exit',
  'anticyclonic wave breaking', 'cyclonic wave breaking', 'retrogression', 'cut-off low'];
export const LIMITS = { id: 64, tag: 40, tags: 20, text: 5000 };
const KEY = 'blockform01.annotations.v1', TAG_KEY = 'blockform01.tags.v1';
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;

// The UTC instant (ms) of an ISO timestamp, or NaN. Rolled-over dates such as Feb 30 are refused (Date.parse accepts
// them), so stored timestamps are real instants; they are stored canonically (toISOString, ms) and compared as numbers.
export function instant(s) {
  if (typeof s !== 'string' || !ISO.test(s)) return NaN;
  const ms = Date.parse(s);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 19) === s.slice(0, 19) ? ms : NaN;
}

const canonical = (s) => (Number.isFinite(instant(s)) ? new Date(instant(s)).toISOString() : s);

export function memoryStorage() {
  const m = new Map();
  return { persistent: false, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}

export function safeStorage(win = globalThis) {
  try {
    const s = win.localStorage, probe = '__blockform01_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return { persistent: true, getItem: (k) => s.getItem(k), setItem: (k, v) => s.setItem(k, v), removeItem: (k) => s.removeItem(k) };
  } catch {
    return memoryStorage();
  }
}

export function validate(a, ctx) {
  if (!a || typeof a !== 'object') return 'not an object';
  if (typeof a.id !== 'string' || !a.id || a.id.length > LIMITS.id) return 'bad id';
  if (!ctx.eventIds.has(a.event)) return `unknown event ${String(a.event).slice(0, 20)}`;
  if (!(a.t === null || (typeof a.t === 'number' && ctx.times.includes(a.t)))) return 'bad frame time';
  if (!KINDS.includes(a.kind)) return 'bad kind';
  if (!Array.isArray(a.tags) || a.tags.length > LIMITS.tags
      || a.tags.some((t) => typeof t !== 'string' || !t.trim() || t.length > LIMITS.tag)) return 'bad tags';
  if (typeof a.text !== 'string' || a.text.length > LIMITS.text) return 'bad text';
  if (!a.tags.length && !a.text.trim()) return 'empty annotation';
  if (!Number.isFinite(instant(a.created)) || !Number.isFinite(instant(a.updated))) return 'bad timestamps';
  return null;
}

function clean(a) {
  return { id: a.id, event: a.event, t: a.t, kind: a.kind, tags: [...new Set(a.tags.map((t) => String(t).trim()))],
    text: a.text, created: canonical(a.created), updated: canonical(a.updated) };
}

const uuid = () => (globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID()
  : `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

export class AnnotationStore {
  constructor({ storage = safeStorage(), eventIds = [], times = [], now = () => new Date().toISOString(), newId = uuid } = {}) {
    this.storage = storage; this.ctx = { eventIds: new Set(eventIds), times: [...times] }; this.now = now; this.newId = newId;
    this.items = new Map(); this.custom = []; this.listeners = new Set(); this.saveError = null; this.loadErrors = 0;
    let raw = [];
    try { raw = JSON.parse(this.storage.getItem(KEY) || '[]'); } catch { this.loadErrors++; }
    for (const a of Array.isArray(raw) ? raw : []) {
      if (validate(a, this.ctx) === null) this.items.set(a.id, clean(a)); else this.loadErrors++;
    }
    try {
      const t = JSON.parse(this.storage.getItem(TAG_KEY) || '[]');
      this.custom = Array.isArray(t) ? t.filter((x) => typeof x === 'string' && x.trim() && x.length <= LIMITS.tag) : [];
    } catch { this.custom = []; }
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  _save() {
    try {
      this.storage.setItem(KEY, JSON.stringify([...this.items.values()]));
      this.storage.setItem(TAG_KEY, JSON.stringify(this.custom));
      this.saveError = null;
    } catch (e) { this.saveError = String(e && e.message ? e.message : e); }
    for (const fn of this.listeners) fn(this);
  }

  _learn(tags) { for (const t of tags) if (!this.tags().includes(t)) this.custom.push(t); }

  tags() { return [...STARTER_TAGS, ...this.custom.filter((t) => !STARTER_TAGS.includes(t))]; }

  addTag(tag) {
    const t = String(tag).trim();
    if (!t || t.length > LIMITS.tag) throw new Error('a tag needs 1-40 characters');
    if (!this.tags().includes(t)) { this.custom.push(t); this._save(); }
    return t;
  }

  list({ event, kind, tag } = {}) {
    return [...this.items.values()]
      .filter((a) => (!event || a.event === event) && (!kind || a.kind === kind) && (!tag || a.tags.includes(tag)))
      .sort((a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : a.id < b.id ? -1 : 1));
  }

  add({ event, t = null, kind, tags = [], text = '' }) {
    const ts = this.now();
    const a = clean({ id: this.newId(), event, t, kind, tags, text, created: ts, updated: ts });
    const err = validate(a, this.ctx);
    if (err) throw new Error(err);
    this.items.set(a.id, a);
    this._learn(a.tags);
    this._save();
    return a;
  }

  update(id, patch) {
    const old = this.items.get(id);
    if (!old) throw new Error('no such annotation');
    const a = clean({ ...old, ...patch, id: old.id, event: old.event, created: old.created, updated: this.now() });
    const err = validate(a, this.ctx);
    if (err) throw new Error(err);
    this.items.set(id, a);
    this._learn(a.tags);
    this._save();
    return a;
  }

  remove(id) { if (this.items.delete(id)) this._save(); }

  exportJSON(build) {
    return JSON.stringify({ schema: SCHEMA, site_build: build, exported: this.now(), tags: this.custom, annotations: this.list() }, null, 2);
  }

  importJSON(text, mode = 'merge') {
    const res = { added: 0, updated: 0, kept: 0, rejected: 0, errors: [] };
    let doc;
    try { doc = JSON.parse(text); } catch { res.errors.push('not JSON'); return res; }
    if (!doc || doc.schema !== SCHEMA || !Array.isArray(doc.annotations)) { res.errors.push('not a BLOCKFORM01 annotations file'); return res; }
    if (mode !== 'merge' && mode !== 'replace') throw new Error(`unknown import mode ${mode}`);
    const next = mode === 'replace' ? new Map() : new Map(this.items);
    for (const a of doc.annotations) {
      const err = validate(a, this.ctx);
      if (err) { res.rejected++; if (res.errors.length < 10) res.errors.push(err); continue; }
      const c = clean(a), cur = next.get(c.id);
      if (!cur) { next.set(c.id, c); res.added++; } else if (instant(c.updated) > instant(cur.updated)) { next.set(c.id, c); res.updated++; } else res.kept++;
    }
    this.items = next;
    for (const t of Array.isArray(doc.tags) ? doc.tags : []) {
      if (typeof t === 'string' && t.trim() && t.length <= LIMITS.tag && !this.tags().includes(t.trim())) this.custom.push(t.trim());
    }
    for (const a of this.items.values()) this._learn(a.tags);
    this._save();
    return res;
  }
}
