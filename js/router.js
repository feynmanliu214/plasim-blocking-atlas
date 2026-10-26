// Hash routes (plan R13): #/ (gallery; ?group=, ?sort=), #/event/<id>?t=<days>, #/compare/<id>,<id>..., #/notes, #/about.
export function parseHash(hash) {
  const h = String(hash || '').replace(/^#/, ''), q = h.indexOf('?');
  const path = q < 0 ? h : h.slice(0, q);
  const params = Object.fromEntries(new URLSearchParams(q < 0 ? '' : h.slice(q + 1)));
  let parts;
  try { parts = path.split('/').filter(Boolean).map(decodeURIComponent); } catch { return { view: 'gallery', params: {} }; }
  if (parts[0] === 'event' && parts[1]) return { view: 'event', id: parts[1], params };
  if (parts[0] === 'compare') return { view: 'compare', ids: (parts[1] || '').split(',').filter(Boolean).slice(0, 4), params };
  if (parts[0] === 'notes' || parts[0] === 'about') return { view: parts[0], params };
  return { view: 'gallery', params };
}

export function eventHref(id, t) {
  return `#/event/${encodeURIComponent(id)}${t === undefined || t === null ? '' : `?t=${t}`}`;
}

export function compareHref(ids) {
  return `#/compare/${ids.map(encodeURIComponent).join(',')}`;
}
