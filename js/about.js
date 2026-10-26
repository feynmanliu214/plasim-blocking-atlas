// The About page: what the events, groups, frames and panels are, the colour scales, the limitations (owner O6) and
// how notes are stored — all from index.json.
import { el } from './ui.js';

export function renderAbout(root, app) {
  const { idx } = app, st = idx.style, num = (x) => Number(x).toLocaleString('en-US');
  root.append(el('h2', {}, 'About this atlas'),
    el('p', {}, `Each event is the season maximum of a North Atlantic blocking index — the 5-day mean of the Z500 anomaly over `
      + `a 5 × 5-cell patch — in one December–February season of a ${num(idx.pool.n_seasons)}-season PlaSim simulation. `
      + `RP = (N + 1) / rank; the pool is the ${num(idx.pool.n_pool)} seasons with RP ≥ ${idx.pool.rp_min}. t = 0 is 00 UTC of `
      + `the first day of the 5-day window (s*); frames run from t = −15 d to +4.75 d, daily to t = ${idx.frames.daily_to} d `
      + `and then every ${idx.frames.step_hours} h.`),
    el('h3', {}, 'Groups'), el('ul', {}, idx.groups.map((g) => el('li', {}, `${g.label}: ${g.n} events — ${g.rule}.`))),
    el('h3', {}, 'Panels'), el('ul', {},
      el('li', {}, `Z500 anomaly, shaded ${st.z500a.lim[0]} … ${st.z500a.lim[1]} m, contours every 100 m (negative dashed). `
        + 'The dashed box is the peak 5 × 5 patch; × is the event centre.'),
      el('li', {}, `250 hPa meridional wind, shaded ${st.v250.lim[0]} … ${st.v250.lim[1]} m s⁻¹, with 250 hPa wind-speed `
        + `contours at ${st.spd250.contours.join(', ')} m s⁻¹.`),
      el('li', {}, `Sea-level pressure, shaded ${st.psl.lim[0]} … ${st.psl.lim[1]} hPa, contours every 4 hPa.`),
      el('li', {}, 'Every panel spans the event centre ± 120° longitude and 20–90° N; grey lines are the model coastline.')),
    el('p', {}, 'The centre is the cos(latitude) × anomaly-weighted centroid of the connected region where the five-day-mean '
      + 'anomaly from s* is at least half the event’s peak-patch value, around the peak patch; it stays fixed for the whole animation.'),
    el('h3', {}, 'Limitations'), el('ul', {}, idx.limitations.map((x) => el('li', {}, x))),
    el('h3', {}, 'Notes'), el('p', {}, 'Notes and tags are stored in this browser only. Use Notes → Export JSON to back them up '
      + 'or move them; Import merges by note id (the newer copy wins) or replaces everything.'),
    el('p', { class: 'meta' }, `Data build ${idx.build.attempt}${idx.build.created ? `, ${idx.build.created}` : ''}.`));
  return {};
}
