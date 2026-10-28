// Controls for one Player (owner O8 A, B; plan R8): play / pause, step, and a slider proportional to model time with
// the 5-day window shaded and a tick where the frames change from daily to 6-hourly, speed in model days per second,
// loop. Keyboard: space plays / pauses, arrows step one frame (not while typing).
import { el, tLabel } from './ui.js';
import { RATES } from './player.js';

const SCALE = 1000;

export function timeline(player, { dateOf = null, frames = null } = {}) {
  const t = player.times, t0 = t[0], t1 = t[t.length - 1];
  const pos = (x) => Math.round((SCALE * (x - t0)) / (t1 - t0)), pct = (x) => `${(100 * (x - t0)) / (t1 - t0)}%`;
  const prev = el('button', { class: 'btn', type: 'button', 'aria-label': 'Previous frame' }, '◀');
  const play = el('button', { class: 'btn', type: 'button', 'aria-label': 'Play or pause' }, '▶');
  const next = el('button', { class: 'btn', type: 'button', 'aria-label': 'Next frame' }, '▶|');
  const range = el('input', { type: 'range', min: 0, max: SCALE, step: 1, value: pos(t[player.index]), 'aria-label': 'Model time' });
  const label = el('span', { class: 'tlabel' });
  const speed = el('select', { 'aria-label': 'Playback speed in model days per second' },
    RATES.map((r) => el('option', { value: r, selected: r === player.rate }, `${r} d/s`)));
  const loop = el('input', { type: 'checkbox', checked: player.loop });
  const win = frames ? frames.window : [0, t1];
  range.style.setProperty('--w0', pct(Math.max(t0, win[0])));
  range.style.setProperty('--w1', pct(Math.min(t1, win[1])));
  range.style.setProperty('--c', pct(frames ? frames.daily_to : t0));
  if (frames) range.title = `Daily frames to t = ${frames.daily_to} d, then every ${frames.step_hours} h; the shaded part is the 5-day window`;
  const update = (k) => {
    range.value = String(pos(t[k]));
    range.setAttribute('aria-valuetext', tLabel(t[k]));
    play.textContent = player.playing ? '❚❚' : '▶';
    label.textContent = tLabel(t[k]) + (dateOf ? ` · ${dateOf(t[k])}` : '');
  };
  prev.addEventListener('click', () => { player.pause(); player.step(-1); });
  next.addEventListener('click', () => { player.pause(); player.step(1); });
  play.addEventListener('click', () => player.toggle());
  range.addEventListener('input', () => {
    const x = t0 + ((t1 - t0) * Number(range.value)) / SCALE;   // read before pause: pause's emit rewrites range.value
    player.pause(); player.set(player.nearest(x));
    update(player.index);                                   // snap the thumb to the frame even when the index is unchanged
  });
  speed.addEventListener('change', () => player.setRate(speed.value));
  loop.addEventListener('change', () => { player.loop = loop.checked; });
  const off = player.on(update);
  update(player.index);
  const onKey = (e) => {
    const tg = e.target;
    if (tg && tg.closest && tg.closest('input[type=text], textarea, select')) return;
    if (e.key === ' ') { e.preventDefault(); player.toggle(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); player.pause(); player.step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); player.pause(); player.step(1); }
  };
  document.addEventListener('keydown', onKey);
  const root = el('div', { class: 'timeline' }, prev, play, next, range, label, speed, el('label', {}, loop, ' loop'));
  return { root, destroy: () => { off(); document.removeEventListener('keydown', onKey); } };
}
