import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIndex, decodeEvent, frameSlice, EventStore, loadThumbs } from '../js/data.js';
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
  const fetchFn = async (url) => { calls.push(url); return { ok: true, arrayBuffer: async () => eventBuffer(idx) }; };
  const s = new EventStore(idx, 'data/', fetchFn, 2);
  const [a, b] = await Promise.all([s.get('E0001'), s.get('E0001')]);
  assert.equal(a, b);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^data\/events\/E0001\.bin\?v=/);
  await s.get('E0002'); await s.get('E0001'); await s.get('E0003');          // E0002 is now the least recently used
  assert.equal(calls.length, 3);
  await s.get('E0001');
  assert.equal(calls.length, 3);
  await s.get('E0002');
  assert.equal(calls.length, 4);
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
