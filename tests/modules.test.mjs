import test from 'node:test';
import assert from 'node:assert/strict';

test('every view module links (its imports resolve) and exports its entry points', async () => {
  const want = { 'ui.js': ['el', 'fmt', 'num', 'rankText', 'rpText', 'sentence', 'groupLabel', 'tLabel'], 'timeline.js': ['timeline'],
    'panels.js': ['PanelSet', 'drawThumb', 'colorbarFor', 'dprOf'], 'draw.js': ['drawPanel', 'levelsFor', 'regionField', 'panelTitle'],
    'series.js': ['seriesChart', 'seriesGeometry'], 'player.js': ['Player', 'follow'],
    'gallery.js': ['renderGallery'], 'event.js': ['renderEvent'],
    'compare.js': ['renderCompare', 'circularMean'], 'notes.js': ['renderNotes', 'notesPanel', 'noteItem'], 'about.js': ['renderAbout'] };
  for (const [file, names] of Object.entries(want)) {
    const m = await import(`../js/${file}`);
    for (const n of names) assert.equal(typeof m[n], 'function', `${file}: ${n}`);
  }
  const { PANELS } = await import('../js/draw.js');
  assert.deepEqual(PANELS.map((p) => p.key), ['z500a', 'v250', 'psl', 'z5']);
});

test('the wording helpers print rank and RP as the plan’s Public wording table', async () => {
  const { rankText, rpText, sentence } = await import('../js/ui.js');
  const idx = { pool: { n_seasons: 53820 } };
  assert.equal(rankText(idx, { rank: 4276 }), 'rank 4,276 of 53,820');
  assert.equal(rpText({ rp_display: '130' }), 'RP ≈ 130');
  assert.equal(sentence('all 53 seasons ranked 1–53 (RP > 1,000)'), 'All 53 seasons ranked 1–53 (RP > 1,000).');
  const ui = await import('../js/ui.js');
  assert.equal(ui.fmtRP, undefined);
});
