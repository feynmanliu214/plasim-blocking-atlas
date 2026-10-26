// One event (owner O3-O5, O8 A): the three panels on the shared timeline, its metadata, the five-day-mean reference map
// with the region and centre (interview I4), and its notes (O8 C).
import { el, fmt, fmtRP, groupLabel } from './ui.js';
import { Player, follow } from './player.js';
import { PanelSet, drawReference } from './panels.js';
import { timeline } from './timeline.js';
import { frameDate, lonLabel } from './geo.js';
import { notesPanel } from './notes.js';
import { eventHref } from './router.js';

export function renderEvent(root, app, route) {
  const ev = app.byId.get(route.id);
  if (!ev) { root.append(el('p', {}, `No event ${route.id} in this atlas.`)); return {}; }
  const status = el('p', { class: 'status' }, `Loading ${ev.id}…`);
  const tray = el('button', { class: 'btn small', type: 'button' });
  const paint = () => { tray.textContent = app.tray.includes(ev.id) ? 'In compare ✓' : '+ Compare'; };
  tray.addEventListener('click', () => { app.toggleTray(ev.id); paint(); });
  paint();
  root.append(el('header', { class: 'evhead' },
    el('h2', {}, `${ev.id} · ${groupLabel(app.idx, ev.group)}`),
    el('p', { class: 'meta' }, `RP ${fmtRP(ev.rp)} · M ${fmt(ev.M_y)} m · s* = ${ev.date} · centre ${fmt(ev.centre[0])}°N `
      + `${lonLabel(ev.centre[1])} · patch centre ${fmt(ev.peak[0])}°N ${lonLabel(ev.peak[1])} · region ${ev.cells} cells`, tray)), status);
  let alive = true, cleanup = [];
  app.events.get(ev.id).then((data) => {
    if (!alive) return;
    status.remove();
    const player = new Player(app.idx.frames.t);
    const main = el('div', { class: 'evmain' }), side = el('aside', { class: 'evside' });
    root.append(main, side);
    const tl = timeline(player, { dateOf: (t) => frameDate(ev.date, t) });
    main.append(tl.root);
    const panels = new PanelSet(main, app.idx, data);
    const ref = el('canvas', { class: 'panel', width: 720, height: 210, role: 'img', 'aria-label': `Five-day-mean Z500 anomaly from s*, ${ev.id}` });
    side.append(el('figure', { class: 'fig' },
      el('figcaption', {}, 'Five-day mean s* … s*+4: Z500 anomaly, region z̄ ≥ ½·M (bold), peak patch (dashed), centre (×)'), ref));
    drawReference(ref, app.idx, ev, app.thumbs.z5(ev.thumb), app.thumbs.region(ev.thumb));
    const notes = notesPanel(app, ev, player);
    side.append(notes.root);
    const t = route.params.t;
    const offDraw = player.on((k) => panels.draw(k));
    // The URL follows the frame; stopUrl detaches before it pauses, so teardown never rewrites the next view's hash.
    const stopUrl = follow(player, (k) => history.replaceState(null, '', eventHref(ev.id, app.idx.frames.t[k])));
    player.set(t !== undefined && t !== '' && Number.isFinite(Number(t)) ? player.nearest(Number(t)) : 0);
    panels.draw(player.index);
    cleanup = [stopUrl, offDraw, tl.destroy, () => panels.destroy(), notes.destroy];
  }).catch((e) => { status.textContent = `Could not load ${ev.id}: ${e.message}`; });
  return { destroy: () => { alive = false; for (const f of cleanup) f(); } };
}
