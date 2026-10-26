import test from 'node:test';
import assert from 'node:assert/strict';

test('every view module links (its imports resolve) and exports its entry points', async () => {
  const want = { 'ui.js': ['el', 'fmt', 'fmtRP', 'groupLabel', 'tLabel'], 'timeline.js': ['timeline'],
    'panels.js': ['PanelSet', 'drawReference'], 'gallery.js': ['renderGallery'], 'event.js': ['renderEvent'],
    'compare.js': ['renderCompare'], 'notes.js': ['renderNotes', 'notesPanel', 'noteItem'], 'about.js': ['renderAbout'] };
  for (const [file, names] of Object.entries(want)) {
    const m = await import(`../js/${file}`);
    for (const n of names) assert.equal(typeof m[n], 'function', `${file}: ${n}`);
  }
  const { PANELS } = await import('../js/panels.js');
  assert.deepEqual(PANELS.map((p) => p.shade), ['z500a', 'v250', 'psl']);
});
