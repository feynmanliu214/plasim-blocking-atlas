// (A) The gallery (owner O8): filter by RP group, sort, one card per event with its five-day-mean map, its metadata and
// a compare toggle. Thumbnails are drawn as the cards scroll into view.
import { el, fmt, fmtRP, groupLabel } from './ui.js';
import { drawReference } from './panels.js';
import { eventHref } from './router.js';
import { lonLabel } from './geo.js';

const SORTS = [['rank', 'RP, highest first'], ['date', 'Model date of s*'], ['centre', 'Centre longitude']];

export function renderGallery(root, app, route) {
  const { idx } = app;
  const group = idx.groups.some((g) => g.key === route.params.group) ? route.params.group : '';
  const sort = SORTS.some(([k]) => k === route.params.sort) ? route.params.sort : 'rank';
  const href = (g, s) => `#/?${new URLSearchParams({ ...(g ? { group: g } : {}), sort: s })}`;
  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by RP group' },
    [{ key: '', label: `All (${idx.events.length})` }, ...idx.groups.map((g) => ({ key: g.key, label: `${g.label} (${g.n})` }))]
      .map((g) => el('a', { class: `chip${g.key === group ? ' on' : ''}`, href: href(g.key, sort) }, g.label)));
  const sorter = el('select', { 'aria-label': 'Sort events', onchange: (e) => { location.hash = href(group, e.target.value); } },
    SORTS.map(([k, label]) => el('option', { value: k, selected: k === sort }, label)));
  const key = { rank: (e) => e.rank, date: (e) => e.date, centre: (e) => e.centre[1] }[sort];
  const evs = idx.events.filter((e) => !group || e.group === group)
    .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a.rank - b.rank));
  const cards = el('div', { class: 'cards' });
  root.append(el('h2', {}, 'Events'), el('div', { class: 'bar' }, chips, sorter), cards);
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const e = app.byId.get(en.target.dataset.id);
      drawReference(en.target, idx, e, app.thumbs.z5(e.thumb), app.thumbs.region(e.thumb), 0.5);
      io.unobserve(en.target);
    }
  }, { rootMargin: '300px' });
  for (const e of evs) {
    const thumb = el('canvas', { class: 'thumb', width: 412, height: 120, 'data-id': e.id, role: 'img',
      'aria-label': `Five-day-mean Z500 anomaly from s*, ${e.id}` });
    const add = el('button', { class: 'btn small', type: 'button' });
    const paint = () => {
      const on = app.tray.includes(e.id);
      add.textContent = on ? 'In compare ✓' : '+ Compare';
      add.setAttribute('aria-pressed', on ? 'true' : 'false');
    };
    add.addEventListener('click', () => { app.toggleTray(e.id); paint(); });
    paint();
    const nn = app.notes.list({ event: e.id }).length;
    cards.append(el('article', { class: 'card' },
      el('a', { href: eventHref(e.id), 'aria-label': `Open ${e.id}` }, thumb),
      el('p', { class: 'meta' }, el('a', { class: 'id', href: eventHref(e.id) }, e.id),
        el('span', { class: `tag g-${e.group}` }, groupLabel(idx, e.group))),
      el('p', { class: 'meta' }, `RP ${fmtRP(e.rp)} · M ${fmt(e.M_y)} m · s* ${e.date}`),
      el('p', { class: 'meta' }, `centre ${fmt(e.centre[0])}°N ${lonLabel(e.centre[1])}${nn ? ` · ${nn} note${nn > 1 ? 's' : ''}` : ''}`),
      add));
    io.observe(thumb);
  }
  return { destroy: () => io.disconnect() };
}
