import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_FORBIDDEN } from '../tools/public-patterns.mjs';

const repo = new URL('..', import.meta.url).pathname;
function walk(d) {
  return readdirSync(d).flatMap((n) => (n === '.git' ? [] : statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
}

test('no app, tool, test or data text carries a private identifier', () => {
  for (const p of walk(repo).filter((f) => /\.(html|js|mjs|css|md|json|sh)$/.test(f))) {
    const text = readFileSync(p, 'utf8');
    for (const re of PUBLIC_FORBIDDEN) assert.ok(!re.test(text), `${p}: ${re}`);
  }
});

test('the patterns catch planted identifiers', () => {
  const planted = ['x__s' + 'im18__0723', 'season' + '_id', '/scr' + 'atch/x', 's' + 'im60', 'MO' + 'ST.0723', '/ho' + 'me1/u'];
  for (const s of planted) assert.ok(PUBLIC_FORBIDDEN.some((re) => re.test(s)), s);
});
