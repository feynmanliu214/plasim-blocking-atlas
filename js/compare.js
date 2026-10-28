// (B) Side-by-side comparison (owner O8): 2-4 events on one timeline and playback with the shared colour scales; each
// column in its own centre-relative frame (plan R13).
import { el, fmtRP, groupLabel } from './ui.js';
import { Player } from './player.js';
import { PanelSet } from './panels.js';
import { timeline } from './timeline.js';
import { compareHref, eventHref } from './router.js';

function trayBar(app) {
  const ids = app.tray;
  return el('div', { class: 'bar' },
    ids.length ? ids.map((id) => el('span', { class: 'chip' }, id, ' ',
      el('button', { class: 'link', type: 'button', 'aria-label': `Remove ${id}`,
        onclick: () => { app.toggleTray(id); location.hash = compareHref(app.tray); } }, '×')))
      : el('span', { class: 'meta' }, 'No events chosen yet.'),
    ids.length >= 2 ? el('a', { class: 'btn small', href: compareHref(ids) }, 'Compare these') : null,
    el('a', { class: 'btn small', href: '#/' }, 'Back to the gallery'));
}

export function renderCompare(root, app, route) {
  const ids = (route.ids.length ? route.ids : app.tray).filter((id) => app.byId.has(id)).slice(0, 4);
  root.append(el('h2', {}, 'Compare'), trayBar(app));
  if (ids.length < 2) { root.append(el('p', {}, 'Choose 2–4 events with “+ Compare” in the gallery or on an event page.')); return {}; }
  const status = el('p', { class: 'status' }, 'Loading…');
  root.append(status);
  let alive = true, cleanup = [];
  Promise.all(ids.map((id) => app.events.get(id))).then((datas) => {
    if (!alive) return;
    status.remove();
    const player = new Player(app.idx.frames.t);
    const tl = timeline(player);
    const cols = el('div', { class: `compare n${ids.length}` });
    root.append(el('p', { class: 'meta' }, 'Each column is centred on its own event (± 120°); all share the timeline, the frame times and the colour scales.'), tl.root, cols);
    const sets = datas.map((d) => {
      const e = d.meta;
      const col = el('section', { class: 'ccol' }, el('h3', {}, el('a', { href: eventHref(e.id) }, e.id),
        ` · ${groupLabel(app.idx, e.group)} · RP ${fmtRP(e.rp)} · s* ${e.date}`));
      cols.append(col);
      return new PanelSet(col, app.idx, d, { z5: app.thumbs.z5(d.meta.thumb), region: app.thumbs.region(d.meta.thumb) });
    });
    const off = player.on((k) => { for (const s of sets) s.draw(k); });
    for (const s of sets) s.draw(0);
    cleanup = [off, () => player.pause(), tl.destroy, ...sets.map((s) => () => s.destroy())];
  }).catch((e) => { status.textContent = `Could not load: ${e.message}`; });
  return { destroy: () => { alive = false; for (const f of cleanup) f(); } };
}
