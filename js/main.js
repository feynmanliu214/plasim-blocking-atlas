// App shell: load the index and thumbnails, set up the event store, the notes and the compare tray, and route.
import { loadIndex, EventStore, loadThumbs } from './data.js';
import { AnnotationStore, safeStorage } from './annotations.js';
import { parseHash } from './router.js';
import { el } from './ui.js';
import { renderGallery } from './gallery.js';
import { renderEvent } from './event.js';
import { renderCompare } from './compare.js';
import { renderNotes } from './notes.js';
import { renderAbout } from './about.js';

const VIEWS = { gallery: renderGallery, event: renderEvent, compare: renderCompare, notes: renderNotes, about: renderAbout };
const TRAY_KEY = 'blockform01.tray';
const app = { tray: [] };
let current = null;

function saveTray() {
  try { sessionStorage.setItem(TRAY_KEY, JSON.stringify(app.tray)); } catch { /* a per-tab convenience only */ }
  document.getElementById('tray-count').textContent = app.tray.length ? `(${app.tray.length})` : '';
}

function loadTray() {
  try {
    const t = JSON.parse(sessionStorage.getItem(TRAY_KEY) || '[]');
    return Array.isArray(t) ? t.filter((id) => app.byId.has(id)).slice(0, 4) : [];
  } catch { return []; }
}

app.toggleTray = (id) => {
  const k = app.tray.indexOf(id);
  if (k >= 0) app.tray.splice(k, 1);
  else { if (app.tray.length >= 4) app.tray.shift(); app.tray.push(id); }
  saveTray();
};

function route() {
  const r = parseHash(location.hash), root = document.getElementById('view');   // the destination, read before teardown
  if (current && current.destroy) current.destroy();
  root.replaceChildren();
  root.className = `view-${r.view}`;
  for (const a of document.querySelectorAll('[data-nav]')) a.classList.toggle('on', a.dataset.nav === r.view);
  if (!app.notes.storage.persistent) {
    root.append(el('p', { class: 'banner' }, 'Browser storage is unavailable here: notes last only for this visit. Export them from Notes to keep them.'));
  }
  current = VIEWS[r.view](root, app, r) || {};
  window.scrollTo(0, 0);
}

async function boot() {
  const root = document.getElementById('view');
  root.textContent = 'Loading the atlas…';
  try {
    app.idx = await loadIndex();
    app.byId = new Map(app.idx.events.map((e) => [e.id, e]));
    app.thumbs = await loadThumbs(app.idx);
  } catch (e) {
    root.textContent = `Could not load the atlas data: ${e.message}`;
    return;
  }
  app.events = new EventStore(app.idx);
  app.notes = new AnnotationStore({ storage: safeStorage(), eventIds: app.idx.events.map((e) => e.id), times: app.idx.frames.t });
  app.tray = loadTray();
  saveTray();
  window.addEventListener('hashchange', route);
  route();
}

boot();
