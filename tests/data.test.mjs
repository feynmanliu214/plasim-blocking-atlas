import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIndex, decodeEvent, frameSlice, EventStore, loadThumbs, loadIndex, varMeta } from '../js/data.js';
import { makeIndex, eventBuffer, field } from './fixture.mjs';

test('decodeEvent dequantises little-endian int16 per variable', () => {
  const idx = makeIndex({ nrow: 3, ncol: 4 });
  const vars = decodeEvent(eventBuffer(idx), idx);
  for (const v of idx.vars) {
    for (const [k, i, j] of [[0, 0, 0], [7, 1, 2], [49, 2, 3]]) {
      const got = frameSlice(vars[v.key], k, 3, 4)[i * 4 + j];
      assert.ok(Math.abs(got - field(v.key, k, i, j)) <= v.scale / 2 + 1e-6, `${v.key} ${k} ${i} ${j}: ${got}`);
    }
  }
  assert.equal(frameSlice(vars.psl, 1, 3, 4).length, 12);
  assert.throws(() => decodeEvent(new ArrayBuffer(10), idx), /bytes/);
});

test('validateIndex refuses another schema, a wrong event size or a wrong mask shape', () => {
  assert.ok(validateIndex(makeIndex()));
  assert.throws(() => validateIndex({ ...makeIndex(), schema: 'x' }), /schema/);
  const a = makeIndex(); a.events[0].bytes += 2;
  assert.throws(() => validateIndex(a), /bytes/);
  const b = makeIndex(); b.lsm.pop();
  assert.throws(() => validateIndex(b), /shape/);
  const c = makeIndex(); c.vars = c.vars.slice(0, 3);
  assert.throws(() => validateIndex(c), /psl/);
});

test('EventStore fetches each event once, shares a pending fetch and evicts the least recently used', async () => {
  const idx = makeIndex({ nrow: 3, ncol: 4, events: ['E0001', 'E0002', 'E0003'].map((id, k) => ({ id, group: 'rp1000', rank: k + 1, centre: [60, 330] })) });
  const calls = [];
  const fetchFn = async (url) => { calls.push(url); return { ok: true, arrayBuffer: async () => (url.includes('.lwa.bin') ? eventBuffer(idx, field, idx.lwa.vars) : eventBuffer(idx)) }; };
  const s = new EventStore(idx, 'data/', fetchFn, 2);
  const [a, b] = await Promise.all([s.get('E0001'), s.get('E0001')]);
  assert.equal(a, b);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /^data\/events\/E0001\.bin\?v=/);
  await s.get('E0002'); await s.get('E0001'); await s.get('E0003');          // E0002 is now the least recently used
  assert.equal(calls.length, 6);
  await s.get('E0001');
  assert.equal(calls.length, 6);
  await s.get('E0002');
  assert.equal(calls.length, 8);
  await assert.rejects(s.get('E9999'), /unknown event/);
});

test('loadThumbs checks sizes and dequantises z-bar', async () => {
  const idx = makeIndex({ nrow: 2, ncol: 3 });
  const z = new ArrayBuffer(12), dv = new DataView(z);
  for (let q = 0; q < 6; q++) dv.setInt16(2 * q, q * 10 - 20, true);
  const reg = new Uint8Array(6).fill(1);
  const fetchFn = async (url) => ({ ok: true, arrayBuffer: async () => (url.endsWith('z5.bin') ? z : reg.buffer) });
  const th = await loadThumbs(idx, 'data/', fetchFn);
  assert.deepEqual([...th.z5(0)].map((x) => Math.round(x * 10) / 10), [-2, -1, 0, 1, 2, 3]);
  assert.equal(th.region(0).length, 6);
  await assert.rejects(loadThumbs(idx, 'data/', async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(3) })), /sizes/);
});

test('loadIndex, EventStore, loadThumbs work with a receiver-strict fetch (browsers throw Illegal invocation on a non-global receiver)', async () => {
  const idx = makeIndex({ nrow: 2, ncol: 3 });
  const z = new ArrayBuffer(12), reg = new Uint8Array(6).fill(1);
  function strictFetch(url) {
    if (this !== undefined && this !== globalThis) throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    const body = url.includes('.lwa.bin') ? eventBuffer(idx, field, idx.lwa.vars) : url.includes('events/') ? eventBuffer(idx) : (url.endsWith('z5.bin') ? z : reg.buffer);
    return Promise.resolve({ ok: true, json: async () => idx, arrayBuffer: async () => body });
  }
  assert.equal((await loadIndex('data/', strictFetch)).schema, idx.schema);
  const id = idx.events[0].id;
  const data = await new EventStore(idx, 'data/', strictFetch).get(id);
  assert.equal(data.meta.id, id);
  assert.ok(data.vars.z500a);
  assert.ok(data.vars.lwa_a && data.vars.lwa_c);
  assert.equal((await loadThumbs(idx, 'data/', strictFetch)).region(0).length, 6);
});

test('validateIndex (schema 2) requires the coastline, the series scale, each event series and RP text, and known groups', () => {
  assert.ok(validateIndex(makeIndex()));
  const cases = [
    [(x) => { delete x.coast; }, /coast/], [(x) => { x.coast.lines.push([1, 2, 3]); }, /coast/],
    [(x) => { x.coast.lines.push([1, 2, 3, 4, 5]); }, /coast/],
    [(x) => { delete x.style.series; }, /series scale/], [(x) => { x.events[0].series.pop(); }, /series/],
    [(x) => { x.events[0].series[3] = null; }, /series/], [(x) => { x.events[0].rp_display = ''; }, /rp_display/],
    [(x) => { x.events[0].group = 'rp7'; }, /unknown group/],
  ];
  for (const [mutate, re] of cases) { const x = makeIndex(); mutate(x); assert.throws(() => validateIndex(x), re); }
});

test('validateIndex refuses schema 1', () => {
  const x = makeIndex(); x.schema = 'blockform01-site/1';
  assert.throws(() => validateIndex(x), /schema/);
});

test('validateIndex (schema 3) requires the LWA variables, their scale and line step, and each event LWA file', () => {
  assert.ok(validateIndex(makeIndex()));
  const cases = [
    [(x) => { delete x.lwa; }, /LWA variables/], [(x) => { x.lwa.vars = x.lwa.vars.slice(0, 1); }, /lwa_c/],
    [(x) => { delete x.style.lwa_a; }, /LWA colour scale/], [(x) => { x.style.lwa_a.lim = [0, 0]; }, /LWA colour scale/],
    [(x) => { delete x.cmaps.YlOrRd; }, /LWA colour scale/], [(x) => { x.style.lwa_c.step = 0; }, /line step/],
    [(x) => { delete x.events[0].lwa_file; }, /lwa_file/], [(x) => { x.events[0].lwa_bytes += 2; }, /LWA bytes/],
  ];
  for (const [mutate, re] of cases) { const x = makeIndex(); mutate(x); assert.throws(() => validateIndex(x), re); }
});

test('decodeEvent reads an LWA file with the LWA variables; EventStore merges both files; varMeta finds either', async () => {
  const idx = makeIndex({ nrow: 3, ncol: 4 }), lw = decodeEvent(eventBuffer(idx, field, idx.lwa.vars), idx, idx.lwa.vars);
  for (const v of idx.lwa.vars) for (const [k, i, j] of [[0, 0, 0], [30, 2, 3]]) {
    assert.ok(Math.abs(frameSlice(lw[v.key], k, 3, 4)[i * 4 + j] - field(v.key, k, i, j)) <= v.scale / 2 + 1e-6, v.key);
  }
  assert.throws(() => decodeEvent(eventBuffer(idx), idx, idx.lwa.vars), /bytes/);
  const calls = [];
  const fetchFn = async (url) => { calls.push(url.split('?')[0]); return { ok: true, arrayBuffer: async () => (url.includes('.lwa.bin') ? eventBuffer(idx, field, idx.lwa.vars) : eventBuffer(idx)) }; };
  const d = await new EventStore(idx, 'data/', fetchFn).get('E0001');
  assert.deepEqual(calls, ['data/events/E0001.bin', 'data/events/E0001.lwa.bin']);
  assert.deepEqual(Object.keys(d.vars).sort(), ['lwa_a', 'lwa_c', 'psl', 'spd250', 'v250', 'z500a']);
  assert.equal(varMeta(idx, 'lwa_a').units, 'm s-1');
  assert.equal(varMeta(idx, 'psl').offset, 1000);
});

test('validateIndex refuses schema 2', () => {
  const x = makeIndex(); x.schema = 'blockform01-site/2';
  assert.throws(() => validateIndex(x), /schema/);
});
