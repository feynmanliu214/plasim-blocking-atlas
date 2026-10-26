// Controls for one Player (owner O8 A, B): play / pause, step, scrub, speed, loop, with the 5-day event window marked
// on the slider. Keyboard: space plays / pauses, arrows step (not while typing).
import { el, tLabel } from './ui.js';

export function timeline(player, { dateOf = null } = {}) {
  const n = player.times.length;
  const prev = el('button', { class: 'btn', type: 'button', 'aria-label': 'Previous frame' }, '◀');
  const play = el('button', { class: 'btn', type: 'button', 'aria-label': 'Play or pause' }, '▶');
  const next = el('button', { class: 'btn', type: 'button', 'aria-label': 'Next frame' }, '▶|');
  const range = el('input', { type: 'range', min: 0, max: n - 1, step: 1, value: player.index, 'aria-label': 'Frame' });
  const label = el('span', { class: 'tlabel' });
  const speed = el('select', { 'aria-label': 'Frames per second' }, [1, 2, 4, 8, 12].map((f) => el('option', { value: f, selected: f === player.fps }, `${f} fps`)));
  const loop = el('input', { type: 'checkbox', checked: player.loop });
  const w0 = player.times.findIndex((t) => t >= 0);
  range.style.setProperty('--w0', `${(100 * w0) / (n - 1)}%`);
  range.style.setProperty('--w1', '100%');
  prev.addEventListener('click', () => { player.pause(); player.step(-1); });
  next.addEventListener('click', () => { player.pause(); player.step(1); });
  play.addEventListener('click', () => player.toggle());
  range.addEventListener('input', () => { player.pause(); player.set(Number(range.value)); });
  speed.addEventListener('change', () => player.setFps(speed.value));
  loop.addEventListener('change', () => { player.loop = loop.checked; });
  const update = (k) => {
    range.value = String(k);
    play.textContent = player.playing ? '❚❚' : '▶';
    label.textContent = tLabel(player.times[k]) + (dateOf ? ` · ${dateOf(player.times[k])}` : '');
  };
  const off = player.on(update);
  update(player.index);
  const onKey = (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('input[type=text], textarea, select')) return;
    if (e.key === ' ') { e.preventDefault(); player.toggle(); }
    else if (e.key === 'ArrowLeft') { player.pause(); player.step(-1); }
    else if (e.key === 'ArrowRight') { player.pause(); player.step(1); }
  };
  document.addEventListener('keydown', onKey);
  const root = el('div', { class: 'timeline' }, prev, play, next, range, label, speed, el('label', {}, loop, ' loop'));
  return { root, destroy: () => { off(); document.removeEventListener('keydown', onKey); } };
}
