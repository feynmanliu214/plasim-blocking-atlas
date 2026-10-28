// (C) Annotations (owner O8, interview I6): the form and list for one event, and the Notes page with filters and JSON
// export / import. Notes live in this browser only (annotations.js); user text is set with textContent.
import { el, tLabel } from './ui.js';
import { KINDS, KIND_LABELS } from './annotations.js';
import { eventHref } from './router.js';

export function noteItem(app, a, { onJump = null, showEvent = false } = {}) {
  const store = app.notes, when = a.t === null ? 'whole event' : tLabel(a.t);
  const head = el('div', { class: 'nhead' }, el('span', { class: `kind k-${a.kind}` }, KIND_LABELS[a.kind]),
    showEvent ? el('a', { href: eventHref(a.event, a.t) }, a.event) : null,
    a.t !== null && onJump ? el('button', { class: 'link', type: 'button', onclick: () => onJump(a.t) }, when) : el('span', {}, when));
  const tags = el('div', { class: 'ntags' }, a.tags.map((t) => el('span', { class: 'chip' }, t)));
  const body = el('p', { class: 'ntext' });
  body.textContent = a.text;
  const li = el('li', { class: 'note' });
  let foot = null;
  const edit = () => {
    const kind = el('select', { 'aria-label': 'Kind' }, KINDS.map((k) => el('option', { value: k, selected: k === a.kind }, KIND_LABELS[k])));
    const text = el('textarea', { rows: 3, maxlength: 5000, 'aria-label': 'Note text' });
    text.value = a.text;
    const msg = el('p', { class: 'msg', role: 'status' });
    const save = el('button', { class: 'btn small', type: 'button', onclick: () => {
      try { store.update(a.id, { kind: kind.value, text: text.value }); } catch (e) { msg.textContent = e.message; }
    } }, 'Save');
    const cancel = el('button', { class: 'link', type: 'button', onclick: () => li.replaceChildren(head, tags, body, foot) }, 'Cancel');
    li.replaceChildren(head, tags, kind, text, el('div', { class: 'nfoot' }, save, cancel), msg);
  };
  foot = el('div', { class: 'nfoot' }, el('time', { datetime: a.updated }, a.updated.slice(0, 16).replace('T', ' ')),
    el('button', { class: 'link', type: 'button', onclick: edit }, 'Edit'),
    el('button', { class: 'link', type: 'button', onclick: () => { if (window.confirm('Delete this note?')) store.remove(a.id); } }, 'Delete'));
  li.append(head, tags, body, foot);
  return li;
}

export function notesPanel(app, ev, player) {
  const store = app.notes, chosen = new Set();
  const kind = el('select', { 'aria-label': 'Kind' }, KINDS.map((k) => el('option', { value: k }, KIND_LABELS[k])));
  const atT = el('input', { type: 'checkbox', checked: true });
  const tagBox = el('div', { class: 'tagpick', role: 'group', 'aria-label': 'Precursor tags' });
  const newTag = el('input', { type: 'text', maxlength: 40, placeholder: 'New tag', 'aria-label': 'New tag' });
  const text = el('textarea', { rows: 3, maxlength: 5000, placeholder: 'What you see, or the mechanism you suspect', 'aria-label': 'Note text' });
  const msg = el('p', { class: 'msg', role: 'status' });
  const list = el('ul', { class: 'nlist' });
  const drawTags = () => tagBox.replaceChildren(...store.tags().map((t) => el('button', {
    type: 'button', class: `chip${chosen.has(t) ? ' on' : ''}`, 'aria-pressed': chosen.has(t) ? 'true' : 'false',
    onclick: () => { if (chosen.has(t)) chosen.delete(t); else chosen.add(t); drawTags(); } }, t)));
  const drawList = () => list.replaceChildren(...store.list({ event: ev.id })
    .map((a) => noteItem(app, a, { onJump: (t) => { player.pause(); player.set(player.nearest(t)); } })));
  const addTag = el('button', { class: 'btn small', type: 'button', onclick: () => {
    try { chosen.add(store.addTag(newTag.value)); newTag.value = ''; drawTags(); } catch (e) { msg.textContent = e.message; }
  } }, 'Add tag');
  const save = el('button', { class: 'btn', type: 'button', onclick: () => {
    try {
      store.add({ event: ev.id, t: atT.checked ? app.idx.frames.t[player.index] : null, kind: kind.value, tags: [...chosen], text: text.value });
      text.value = '';
      chosen.clear();
      drawTags();
      msg.textContent = store.saveError ? `Kept for this visit only: ${store.saveError}` : 'Saved in this browser.';
    } catch (e) { msg.textContent = e.message; }
  } }, 'Save note');
  const root = el('section', { class: 'notes' }, el('h3', {}, 'Notes'),
    el('div', { class: 'form' }, el('label', {}, 'Kind ', kind), el('label', {}, atT, ' at the current frame'), tagBox,
      el('div', { class: 'row' }, newTag, addTag), text, save, msg), list);
  drawTags();
  drawList();
  const off = store.on(() => { drawTags(); drawList(); });
  return { root, destroy: off };
}

export function renderNotes(root, app, route) {
  const store = app.notes, idx = app.idx;
  const f = { kind: route.params.kind || '', tag: route.params.tag || '', group: route.params.group || '' };
  const go = (k, v) => { location.hash = `#/notes?${new URLSearchParams(Object.entries({ ...f, [k]: v }).filter(([, x]) => x))}`; };
  const pick = (k, label, options) => el('select', { 'aria-label': label, onchange: (e) => go(k, e.target.value) },
    el('option', { value: '' }, label), options.map(([v, l]) => el('option', { value: v, selected: v === f[k] }, l)));
  const file = el('input', { type: 'file', accept: 'application/json,.json', 'aria-label': 'Annotations file to import' });
  const mode = el('select', { 'aria-label': 'Import mode' }, el('option', { value: 'merge' }, 'Merge (newer copy wins)'),
    el('option', { value: 'replace' }, 'Replace all'));
  const msg = el('p', { class: 'msg', role: 'status' });
  const exportBtn = el('button', { class: 'btn', type: 'button', onclick: () => {
    const url = URL.createObjectURL(new Blob([store.exportJSON(idx.build)], { type: 'application/json' }));
    const a = el('a', { href: url, download: `blockform01-annotations-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } }, 'Export JSON');
  const importBtn = el('button', { class: 'btn', type: 'button', onclick: async () => {
    const fl = file.files && file.files[0];
    if (!fl) { msg.textContent = 'Choose a file first.'; return; }
    if (mode.value === 'replace' && !window.confirm('Replace every note in this browser with the file’s notes?')) return;
    const r = store.importJSON(await fl.text(), mode.value);
    msg.textContent = r.added || r.updated || r.kept
      ? `Imported ${r.added} new, ${r.updated} updated, kept ${r.kept}, rejected ${r.rejected}${r.errors.length ? ` (${r.errors.join('; ')})` : ''}.`
      : `Nothing imported${r.errors.length ? `: ${r.errors.join('; ')}` : '.'}`;
  } }, 'Import');
  const count = el('h2', {}), list = el('ul', { class: 'nlist' });
  const draw = () => {
    const items = store.list({ kind: f.kind || undefined, tag: f.tag || undefined })
      .filter((a) => !f.group || (app.byId.get(a.event) || {}).group === f.group);
    count.textContent = `Notes (${items.length})`;
    list.replaceChildren(...items.map((a) => noteItem(app, a, { showEvent: true })));
  };
  root.append(count,
    el('div', { class: 'bar' }, pick('kind', 'All kinds', KINDS.map((k) => [k, KIND_LABELS[k]])),
      pick('tag', 'All tags', store.tags().map((t) => [t, t])), pick('group', 'All groups', idx.groups.map((g) => [g.key, g.label]))),
    el('div', { class: 'bar' }, exportBtn, file, mode, importBtn), msg,
    el('p', { class: 'meta' }, store.storage.persistent
      ? 'Notes live in this browser only. Export them to back them up or share them; import merges by note id.'
      : 'Browser storage is unavailable here: notes last only for this visit. Export them to keep them.'),
    list);
  draw();
  return { destroy: store.on(draw) };
}
