// Validate a site data directory (default data/): the index schema, every event file's size and sha256, the
// thumbnails, SHA256SUMS (complete, matching, no stray files) and the size budget; then scan the repo's and the data's
// text files for private identifiers (tools/public-patterns.mjs). Prints a JSON summary; exits 1 on any error.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateIndex } from '../js/data.js';
import { PUBLIC_FORBIDDEN } from './public-patterns.mjs';

const BUDGET = 800 * 2 ** 20;
const TEXT = /(\.(html|js|mjs|css|md|json|txt|sh)|SHA256SUMS|\.nojekyll|\.gitignore)$/;
const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dir = resolve(process.argv[2] || join(repo, 'data'));
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const walk = (d) => readdirSync(d).flatMap((n) => (n === '.git' || n === '.execute-plan' ? [] : statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const errors = [];
let summary = {};
try {
  const idx = validateIndex(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')));
  const n = idx.grid.nrow * idx.grid.ncol, ne = idx.events.length, seen = new Set();
  for (const e of idx.events) {
    if (seen.has(e.id) || !/^E\d{4}$/.test(e.id)) errors.push(`bad or repeated id ${e.id}`);
    seen.add(e.id);
    const p = join(dir, e.file);
    let size = -1;
    try { size = statSync(p).size; } catch { errors.push(`${e.file}: missing`); continue; }
    if (size !== e.bytes) errors.push(`${e.file}: size ${size}, index says ${e.bytes}`);
    else if (sha(p) !== e.sha256) errors.push(`${e.file}: sha256`);
    if (idx.lwa) {
      const q = join(dir, e.lwa_file);
      let ls = -1;
      try { ls = statSync(q).size; } catch { errors.push(`${e.lwa_file}: missing`); continue; }
      if (ls !== e.lwa_bytes) errors.push(`${e.lwa_file}: size ${ls}, index says ${e.lwa_bytes}`);
      else if (sha(q) !== e.lwa_sha256) errors.push(`${e.lwa_file}: sha256`);
    }
  }
  for (const [name, bytes] of [[idx.thumbs.z5, 2 * n * ne], [idx.thumbs.region, n * ne]]) {
    try { if (statSync(join(dir, name)).size !== bytes) errors.push(`${name}: size`); } catch { errors.push(`${name}: missing`); }
  }
  const lines = readFileSync(join(dir, 'SHA256SUMS'), 'utf8').split('\n').filter(Boolean).map((l) => l.split('  '));
  const listed = new Set(lines.map(([, f]) => f));
  for (const [h, f] of lines) {
    try { if (sha(join(dir, f)) !== h) errors.push(`SHA256SUMS: ${f}`); } catch { errors.push(`SHA256SUMS: ${f} missing`); }
  }
  const files = walk(dir).map((p) => relative(dir, p));
  for (const f of files) if (f !== 'SHA256SUMS' && !listed.has(f)) errors.push(`stray file ${f}`);
  const bytes = files.reduce((s, f) => s + statSync(join(dir, f)).size, 0);
  if (bytes > BUDGET) errors.push(`data is ${bytes} bytes, over the ${BUDGET}-byte budget`);
  const counted = {};
  for (const e of idx.events) counted[e.group] = (counted[e.group] || 0) + 1;
  for (const g of idx.groups) if ((counted[g.key] || 0) !== g.n) errors.push(`group ${g.key}: ${counted[g.key] || 0} events, index says ${g.n}`);
  for (const k of Object.keys(counted)) if (!idx.groups.some((g) => g.key === k)) errors.push(`events in unknown group ${k}`);
  summary = { events: ne, groups: counted, bytes, build: idx.build };
} catch (e) { errors.push(`index: ${e.message}`); }
const scanned = new Set([...walk(repo), ...walk(dir)].filter((p) => TEXT.test(p)));
for (const p of scanned) {
  const text = readFileSync(p, 'utf8');
  for (const re of PUBLIC_FORBIDDEN) if (re.test(text)) errors.push(`private identifier ${re} in ${relative(repo, p)}`);
}
console.log(JSON.stringify({ dir, ...summary, scanned: scanned.size, errors }, null, 1));
process.exit(errors.length ? 1 : 0);
