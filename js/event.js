// One event (owner O3-O5, O8 A): the three panels on the shared timeline, its metadata, the five-day-mean reference map
// with the region and centre (interview I4), and its notes (O8 C).
import { el, fmt, groupLabel, rankText, rpText } from './ui.js';
import { Player, follow } from './player.js';
import { PanelSet } from './panels.js';
import { aspect } from './render.js';
import { timeline } from './timeline.js';
import { seriesChart } from './series.js';
import { frameDate, lonLabel } from './geo.js';
import { notesPanel } from './notes.js';
import { eventHref, parseHash } from './router.js';

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
    el('p', { class: 'meta' }, `${rankText(app.idx, ev)} · ${rpText(ev)} · M ${fmt(ev.M_y)} m · s* = ${ev.date} · centre `
      + `${fmt(ev.centre[0])}°N ${lonLabel(ev.centre[1])} · patch centre ${fmt(ev.peak[0])}°N ${lonLabel(ev.peak[1])} · region `
      + `${ev.cells} cells`, tray)), status);
  let alive = true, cleanup = [];
  app.events.get(ev.id).then((data) => {
    if (!alive) return;
    status.remove();
    const player = new Player(app.idx.frames.t);
    const main = el('div', { class: 'evmain' }), side = el('aside', { class: 'evside' });
    root.append(main, side);
    const tl = timeline(player, { dateOf: (t) => frameDate(ev.date, t), frames: app.idx.frames });
    const strip = seriesChart(app.idx, [ev], player);
    const bar = el('div', { class: 'sticky' }, tl.root, strip.root);
    main.append(bar);
    const panels = new PanelSet(main, app.idx, data, { z5: app.thumbs.z5(ev.thumb), region: app.thumbs.region(ev.thumb) });
    // The canvases' width cap is the viewport height left under the sticky bar, minus two rows of captions, readouts,
    // colour bars and the row gap, all measured, times the map aspect; below 900 px the grid is one column, uncapped.
    const fit = () => {
      if (innerWidth <= 900) { panels.root.style.removeProperty('--map-max-w'); return; }
      const f = panels.figs[0], extra = f.fig.getBoundingClientRect().height - f.canvas.getBoundingClientRect().height;
      const gap = parseFloat(getComputedStyle(panels.root).rowGap) || 0;
      const rowH = (innerHeight - bar.getBoundingClientRect().height - gap - 2 * extra - 8) / 2;
      panels.root.style.setProperty('--map-max-w', `${Math.max(200, Math.floor(rowH * aspect(app.idx.grid)))}px`);
    };
    addEventListener('resize', fit);
    fit();
    requestAnimationFrame(fit);                    // once more after the first layout (caption wrapping)
    const notes = notesPanel(app, ev, player);
    side.append(notes.root);
    const t = route.params.t;
    const offDraw = player.on((k) => panels.draw(k));
    // The URL follows the frame; stopUrl detaches before it pauses, so teardown never rewrites the next view's hash.
    const stopUrl = follow(player, (k) => {
      const r = parseHash(location.hash);
      if (r.view === 'event' && r.id === ev.id) history.replaceState(null, '', eventHref(ev.id, app.idx.frames.t[k]));
    });
    player.set(t !== undefined && t !== '' && Number.isFinite(Number(t)) ? player.nearest(Number(t)) : 0);
    panels.draw(player.index);
    cleanup = [stopUrl, offDraw, tl.destroy, strip.destroy, () => panels.destroy(), notes.destroy, () => removeEventListener('resize', fit)];
  }).catch((e) => { status.textContent = `Could not load ${ev.id}: ${e.message}`; });
  return { destroy: () => { alive = false; for (const f of cleanup) f(); } };
}
