// (B) Side-by-side comparison (owner O8; plan R7, R14): 2-4 events on one timeline and series strip; one row per map
// with its caption and one colour bar, one column per event; optionally every column centred on one longitude, the
// circular mean of the events' centres (grey: outside an event's data window).
import { el, rankText, rpText } from './ui.js';
import { Player } from './player.js';
import { PanelSet, colorbarFor } from './panels.js';
import { PANELS, panelTitle } from './draw.js';
import { timeline } from './timeline.js';
import { seriesChart } from './series.js';
import { lonLabel } from './geo.js';
import { compareHref, eventHref } from './router.js';

const D2R = Math.PI / 180;

export function circularMean(lons) {
  const s = lons.reduce((a, x) => a + Math.sin(x * D2R), 0), c = lons.reduce((a, x) => a + Math.cos(x * D2R), 0);
  return Math.atan2(s, c) / D2R;
}

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
    const idx = app.idx, evs = datas.map((d) => d.meta), player = new Player(idx.frames.t);
    const tl = timeline(player, { frames: idx.frames }), strip = seriesChart(idx, evs, player);
    const common = el('input', { type: 'checkbox' }), lonBar = circularMean(evs.map((e) => e.centre[1])), note = el('p', { class: 'meta' });
    const paintNote = () => {
      note.textContent = common.checked
        ? `All columns are centred on ${lonLabel(lonBar)}, the mean of the event centres; grey is outside an event’s data window.`
        : 'Each column is centred on its own event (± 120°); all share the timeline, the frame times and the colour scales.';
    };
    const sets = datas.map((d) => new PanelSet(null, idx, d, { z5: app.thumbs.z5(d.meta.thumb), region: app.thumbs.region(d.meta.thumb) },
      { colorbars: false }));
    const grid = el('div', { class: 'cgrid', style: `--n: ${evs.length}` },
      evs.map((e) => el('h3', { class: 'chead' }, el('a', { href: eventHref(e.id) }, e.id), ` · ${rankText(idx, e)} · ${rpText(e)} · s* ${e.date}`)));
    const bars = PANELS.map((p, r) => {
      const bar = colorbarFor(idx, p);
      // Below 900 px the columns stack and the headings no longer sit above their maps: each map carries its event id.
      const figs = sets.map((s, c) => { const f = s.figs[r].fig; f.prepend(el('p', { class: 'ctag' }, evs[c].id)); return f; });
      grid.append(el('p', { class: 'crow' }, panelTitle(p, idx.style)), ...figs, el('div', { class: 'cbarrow' }, bar.node));
      return bar;
    });
    root.append(el('div', { class: 'sticky' }, tl.root, strip.root),
      el('label', { class: 'meta' }, common, ' Centre every column on one longitude'), note, grid);
    paintNote();
    for (const b of bars) b.paint();
    common.addEventListener('change', () => { for (const s of sets) s.setCentre(common.checked ? lonBar : null); paintNote(); });
    const off = player.on((k) => { for (const s of sets) s.draw(k); });
    for (const s of sets) s.draw(0);
    cleanup = [off, () => player.pause(), tl.destroy, strip.destroy, ...sets.map((s) => () => s.destroy())];
  }).catch((e) => { status.textContent = `Could not load: ${e.message}`; });
  return { destroy: () => { alive = false; for (const f of cleanup) f(); } };
}
