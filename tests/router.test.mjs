import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, eventHref, compareHref } from '../js/router.js';

test('routes', () => {
  assert.deepEqual(parseHash(''), { view: 'gallery', params: {} });
  assert.deepEqual(parseHash('#/?group=rp100&sort=date'), { view: 'gallery', params: { group: 'rp100', sort: 'date' } });
  assert.deepEqual(parseHash('#/event/E0001?t=-4.75'), { view: 'event', id: 'E0001', params: { t: '-4.75' } });
  assert.deepEqual(parseHash('#/compare/E0001,E0429,E4276,E0002,E0003'),
    { view: 'compare', ids: ['E0001', 'E0429', 'E4276', 'E0002'], params: {} });
  assert.deepEqual(parseHash('#/notes?kind=observation'), { view: 'notes', params: { kind: 'observation' } });
  assert.equal(parseHash('#/about').view, 'about');
  assert.equal(parseHash('#/event/%E0%A4%A').view, 'gallery');           // malformed escape
  assert.equal(parseHash('#/nowhere').view, 'gallery');
  assert.equal(eventHref('E0001', -4.75), '#/event/E0001?t=-4.75');
  assert.equal(eventHref('E0001'), '#/event/E0001');
  assert.equal(compareHref(['E0001', 'E0002']), '#/compare/E0001,E0002');
});
