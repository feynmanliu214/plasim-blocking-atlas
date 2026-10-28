// (A) The gallery (owner O8, V3, V4): filter by group and sort. The events sit in one section per group, headed by the
// group's RP range, its rank band and how it was drawn, so gaps between the rank-based ids read as seasons that were
// not drawn. Each card has its five-day-mean map (drawn when it scrolls into view), rank, RP and metadata.
import { el, fmt, groupLabel, num, rankText, rpText, sentence } from './ui.js';
import { drawThumb } from './panels.js';
import { eventHref } from './router.js';
import { lonLabel } from './geo.js';

const SORTS = [['rank', 'Rank (highest RP first)'], ['date', 'Model date of s*'], ['centre', 'Centre longitude']];

function card(app, e, io) {
  const thumb = el('canvas', { class: 'thumb', width: 400, height: 300, 'data-id': e.id, role: 'img',
    'aria-label': `Five-day-mean Z500 anomaly from s*, ${e.id}` });
  const add = el('button', { class: 'btn small', type: 'button' });
  const paint = () => {
    const on = app.tray.includes(e.id);
    add.textContent = on ? 'In compare ✓' : '+ Compare';
    add.setAttribute('aria-pressed', on ? 'true' : 'false');
  };
  add.addEventListener('click', () => { app.toggleTray(e.id); paint(); });
  paint();
  io.observe(thumb);
  const nn = app.notes.list({ event: e.id }).length;
  return el('article', { class: 'card' },
    el('a', { href: eventHref(e.id), 'aria-label': `Open ${e.id}` }, thumb),
    el('p', { class: 'meta' }, el('a', { class: 'id', href: eventHref(e.id) }, e.id),
      el('span', { class: `tag g-${e.group}` }, groupLabel(app.idx, e.group))),
    el('p', { class: 'meta' }, `${rankText(app.idx, e)} · ${rpText(e)}`),
    el('p', { class: 'meta' }, `M ${fmt(e.M_y)} m · s* ${e.date}`),
    el('p', { class: 'meta' }, `centre ${fmt(e.centre[0])}°N ${lonLabel(e.centre[1])}${nn ? ` · ${nn} note${nn > 1 ? 's' : ''}` : ''}`),
    add);
}

export function renderGallery(root, app, route) {
  const { idx } = app;
  const group = idx.groups.some((g) => g.key === route.params.group) ? route.params.group : '';
  const sort = SORTS.some(([k]) => k === route.params.sort) ? route.params.sort : 'rank';
  const href = (g, s) => `#/?${new URLSearchParams({ ...(g ? { group: g } : {}), sort: s })}`;
  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by group' },
    [{ key: '', label: `All (${idx.events.length})` }, ...idx.groups.map((g) => ({ key: g.key, label: `${g.label} (${g.n})` }))]
      .map((g) => el('a', { class: `chip${g.key === group ? ' on' : ''}`, href: href(g.key, sort) }, g.label)));
  const sorter = el('select', { 'aria-label': 'Sort events', onchange: (e) => { location.hash = href(group, e.target.value); } },
    SORTS.map(([k, label]) => el('option', { value: k, selected: k === sort }, label)));
  const key = { rank: (e) => e.rank, date: (e) => e.date, centre: (e) => e.centre[1] }[sort];
  root.append(el('h2', {}, 'Events'), el('div', { class: 'bar' }, chips, sorter),
    el('p', { class: 'meta' }, `Event ids are E followed by the season’s rank among all ${num(idx.pool.n_seasons)} seasons, `
      + 'so gaps between ids are seasons that were not drawn.'));
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const e = app.byId.get(en.target.dataset.id);
      drawThumb(en.target, idx, e, { z5: app.thumbs.z5(e.thumb), region: app.thumbs.region(e.thumb) });
      io.unobserve(en.target);
    }
  }, { rootMargin: '300px' });
  for (const g of idx.groups.filter((x) => !group || x.key === group)) {
    const cards = el('div', { class: 'cards' });
    root.append(el('section', { class: 'gsec', 'aria-label': g.label },
      el('h3', {}, el('span', { class: `tag g-${g.key}` }, g.label), ` · ${g.n} events`), el('p', { class: 'meta' }, sentence(g.rule)), cards));
    const evs = idx.events.filter((e) => e.group === g.key)
      .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a.rank - b.rank));
    for (const e of evs) cards.append(card(app, e, io));
  }
  return { destroy: () => io.disconnect() };
}
