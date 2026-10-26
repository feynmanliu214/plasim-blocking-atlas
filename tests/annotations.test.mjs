import test from 'node:test';
import assert from 'node:assert/strict';
import { AnnotationStore, memoryStorage, safeStorage, validate, SCHEMA, STARTER_TAGS } from '../js/annotations.js';

const IDS = ['E0001', 'E0429'], TIMES = [-15, -4.75, 0, 4.75];
function mk(storage = memoryStorage()) {
  let n = 0, s = 0;
  return new AnnotationStore({ storage, eventIds: IDS, times: TIMES,
    now: () => new Date(Date.UTC(2026, 9, 25, 12, 0, s++)).toISOString(), newId: () => `n${++n}` });
}
const good = { id: 'a1', event: 'E0001', t: -4.75, kind: 'observation', tags: ['upstream cyclone'],
  text: 'a deep low south of Greenland', created: '2026-10-25T12:00:00.000Z', updated: '2026-10-25T12:00:00.000Z' };

test('validate rejects bad records', () => {
  const ctx = { eventIds: new Set(IDS), times: TIMES };
  assert.equal(validate(good, ctx), null);
  assert.equal(validate({ ...good, t: null }, ctx), null);
  for (const [patch, why] of [[{ kind: 'guess' }, /kind/], [{ event: 'E9999' }, /unknown event/], [{ t: 1.1 }, /frame/],
    [{ tags: ['x'.repeat(41)] }, /tags/], [{ tags: [], text: '  ' }, /empty/], [{ id: '' }, /id/],
    [{ updated: 'yesterday' }, /timestamps/], [{ text: 'x'.repeat(5001) }, /text/]]) {
    assert.match(validate({ ...good, ...patch }, ctx) || '', why, JSON.stringify(patch).slice(0, 40));
  }
});

test('add, update and remove persist through storage', () => {
  const storage = memoryStorage(), a = mk(storage);
  const n = a.add({ event: 'E0001', t: 0, kind: 'hypothesized-mechanism', tags: ['jet split', 'my tag'], text: 'split jet feeds the ridge' });
  assert.equal(n.id, 'n1');
  assert.deepEqual(a.list({ event: 'E0001' }).map((x) => x.id), ['n1']);
  const b = mk(storage);
  assert.deepEqual(b.list()[0].tags, ['jet split', 'my tag']);
  assert.ok(b.tags().includes('my tag'));
  b.update('n1', { text: 'revised' });
  assert.equal(mk(storage).list()[0].text, 'revised');
  assert.throws(() => b.update('n1', { kind: 'nope' }), /kind/);
  b.remove('n1');
  assert.equal(mk(storage).list().length, 0);
  assert.throws(() => b.add({ event: 'E0001', kind: 'observation', tags: [], text: '' }), /empty/);
});

test('custom tags extend the starter list and are exported', () => {
  const a = mk();
  assert.deepEqual(a.tags(), STARTER_TAGS);
  a.addTag('  Greenland ridge ');
  a.addTag('jet split');
  assert.deepEqual(a.tags(), [...STARTER_TAGS, 'Greenland ridge']);
  assert.deepEqual(JSON.parse(a.exportJSON({ attempt: 'x' })).tags, ['Greenland ridge']);
  assert.throws(() => a.addTag(''), /1-40/);
});

test('export then import into an empty store round-trips, text verbatim', () => {
  const a = mk();
  a.add({ event: 'E0001', t: -15, kind: 'observation', tags: ['upstream ridge'], text: '<b>not html</b> & "quotes"' });
  a.add({ event: 'E0429', t: null, kind: 'hypothesized-mechanism', tags: [], text: 'Pacific precursor' });
  const doc = JSON.parse(a.exportJSON({ attempt: 'attempt-1' }));
  assert.equal(doc.schema, SCHEMA);
  assert.equal(doc.annotations.length, 2);
  const b = mk();
  assert.deepEqual(b.importJSON(JSON.stringify(doc)), { added: 2, updated: 0, kept: 0, rejected: 0, errors: [] });
  assert.deepEqual(b.list(), a.list());
  assert.equal(b.list()[0].text, '<b>not html</b> & "quotes"');
});

test('merge keeps the newer copy', () => {
  const a = mk();
  const x = a.add({ event: 'E0001', t: 0, kind: 'observation', tags: [], text: 'old' });
  const older = { ...x, text: 'older', updated: '2020-01-01T00:00:00.000Z' };
  const newer = { ...x, text: 'new', updated: '2027-01-01T00:00:00.000Z' };
  assert.deepEqual(a.importJSON(JSON.stringify({ schema: SCHEMA, annotations: [older] })),
    { added: 0, updated: 0, kept: 1, rejected: 0, errors: [] });
  assert.equal(a.list()[0].text, 'old');
  assert.equal(a.importJSON(JSON.stringify({ schema: SCHEMA, annotations: [newer] })).updated, 1);
  assert.equal(a.list()[0].text, 'new');
});

test('merge compares instants, not spellings; impossible dates are refused', () => {
  const a = mk();
  const x = { ...good, id: 'm1', updated: '2026-10-25T12:00:00.100Z' };
  a.importJSON(JSON.stringify({ schema: SCHEMA, annotations: [x] }));
  const older = { ...x, text: 'older', updated: '2026-10-25T12:00:00Z' };        // sorts after .100Z as text, yet older
  assert.equal(a.importJSON(JSON.stringify({ schema: SCHEMA, annotations: [older] })).kept, 1);
  assert.equal(a.list()[0].text, good.text);
  const newer = { ...x, text: 'newer', updated: '2026-10-25T12:00:01Z' };
  assert.equal(a.importJSON(JSON.stringify({ schema: SCHEMA, annotations: [newer] })).updated, 1);
  assert.equal(a.list()[0].updated, '2026-10-25T12:00:01.000Z');                  // stored canonically
  const ctx = { eventIds: new Set(IDS), times: TIMES };
  for (const bad of ['2026-02-30T00:00:00Z', '2026-10-25T25:00:00Z', '2026-13-01T00:00:00Z']) {
    assert.match(validate({ ...good, updated: bad }, ctx) || '', /timestamps/, bad);
  }
});

test('replace drops notes the file lacks; bad files and records are refused', () => {
  const a = mk();
  a.add({ event: 'E0001', t: 0, kind: 'observation', tags: [], text: 'replaced' });
  const r = a.importJSON(JSON.stringify({ schema: SCHEMA, annotations: [good, { ...good, id: 'a2', kind: 'nope' }] }), 'replace');
  assert.deepEqual([r.added, r.rejected], [1, 1]);
  assert.deepEqual(a.list().map((x) => x.id), ['a1']);
  assert.match(a.importJSON('not json').errors[0], /not JSON/);
  assert.match(a.importJSON('{"schema":"other"}').errors[0], /not a BLOCKFORM01/);
  assert.equal(a.list().length, 1);
});

test('unavailable storage falls back to memory and says so', () => {
  const blocked = { get localStorage() { throw new Error('SecurityError'); } };
  assert.equal(safeStorage(blocked).persistent, false);
  const full = { localStorage: { setItem() { throw new Error('QuotaExceededError'); }, getItem() { return null; }, removeItem() {} } };
  assert.equal(safeStorage(full).persistent, false);
  const ok = new Map();
  const real = { localStorage: { setItem: (k, v) => ok.set(k, v), getItem: (k) => (ok.has(k) ? ok.get(k) : null), removeItem: (k) => ok.delete(k) } };
  assert.equal(safeStorage(real).persistent, true);
  const a = mk(safeStorage(blocked));
  a.add({ event: 'E0001', t: null, kind: 'observation', tags: ['retrogression'], text: '' });
  assert.equal(a.list().length, 1);
});
