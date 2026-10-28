import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('render-frame writes a PNG of the three panels', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-'));
  try {
    writeSite(dir);
    const out = join(dir, 'qa', 'nested', 'f.png');                      // the tool creates the missing parents
    const r = node(['tools/render-frame.mjs', dir, 'E0001', '30', out]);
    assert.equal(r.status, 0, r.stderr);
    const png = readFileSync(out);
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(png.readUInt32BE(16), 720);
    assert.equal(png.readUInt32BE(20), 3 * 210);
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
