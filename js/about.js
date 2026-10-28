// The About page: what the events, ranks, groups, frames and maps are, the colour scales, the limitations (owner O6) and
// how notes are stored — all from index.json, in the wording the owner approved with the plan (V3, V4).
import { el, num, sentence } from './ui.js';

export function renderAbout(root, app) {
  const { idx } = app, st = idx.style, f = idx.frames, N = idx.pool.n_seasons, top = idx.events.find((e) => e.rank === 1);
  const sg = (x) => `${x < 0 ? '−' : x > 0 ? '+' : ''}${Math.abs(x)}`;             // U+2212 minus, as the wording table
  const zStep = st.z500a.contours[1] - st.z500a.contours[0], pStep = st.psl.contours[1] - st.psl.contours[0];
  root.append(el('h2', {}, 'About this atlas'),
    el('p', {}, `Each event is the season maximum of a North Atlantic blocking index — the 5-day mean of the Z500 anomaly `
      + `over a 5 × 5-cell patch — in one December–February season of a ${num(N)}-season PlaSim simulation. The pool is the `
      + `${num(idx.pool.n_pool)} seasons with RP ≥ ${idx.pool.rp_min}.`),
    el('h3', {}, 'Rank and return period'),
    el('p', {}, `Seasons are ranked by their index among all ${num(N)} seasons, and RP = ${num(N + 1)} / rank. For the highest `
      + 'ranks this is the length of the record divided by the rank, not a measured return period, so the atlas shows each '
      + `event’s rank and its RP to two significant figures${top ? ` (rank 1: RP ≈ ${top.rp_display})` : ''}. Event ids are E `
      + 'followed by the season’s rank, so gaps between ids are seasons that were not drawn.'),
    el('h3', {}, 'Groups'), el('ul', {}, idx.groups.map((g) => el('li', {}, `${g.label}: ${g.n} events. ${sentence(g.rule)}`))),
    el('h3', {}, 'Time'),
    el('p', {}, `t = 0 is 00 UTC of the first day of the 5-day window (s*). Frames run from t = ${sg(f.t[0])} d to ${sg(f.t[f.t.length - 1])} d, `
      + `daily to t = ${sg(f.daily_to)} d and then every ${f.step_hours} h. Playback runs at constant model time (model days per `
      + `second), so each daily frame is held ${24 / f.step_hours} times as long as a ${f.step_hours}-hourly one; the tick on the `
      + 'timeline marks the change.'),
    el('h3', {}, 'Maps'),
    el('p', {}, 'Every map is north-polar stereographic: the pole is near the top, the event centre’s longitude points down and '
      + `east is to the right. It covers the centre ± ${idx.grid.half_width_deg}° and ${idx.grid.lat_min_display}–90° N. Grey is `
      + 'outside the map or, when Compare centres every column on one longitude, outside that event’s data window. '
      + `Coastlines: ${idx.coast.source}, for orientation; the model’s own T42 land–sea mask is coarser.`),
    el('ul', {},
      el('li', {}, `Z500 anomaly, shaded ${st.z500a.lim[0]} … ${st.z500a.lim[1]} m, contours every ${zStep} m (negative dashed). `
        + 'The dashed outline is the peak 5 × 5 patch; × is the event centre.'),
      el('li', {}, `250 hPa meridional wind, shaded ${st.v250.lim[0]} … ${st.v250.lim[1]} m s⁻¹, with thin 250 hPa wind-speed `
        + `lines at ${st.spd250.contours.join(', ')} m s⁻¹.`),
      el('li', {}, `Sea-level pressure as isobars every ${pStep} hPa (1000 hPa bold), without shading.`),
      el('li', {}, 'Five-day mean s* … s*+4 of the Z500 anomaly. The bold line is the edge of the region where it is at least '
        + 'half the event’s peak-patch value M, around the peak patch, traced on the interpolated field.'),
      el('li', {}, 'Under the timeline: the peak-patch Z500 anomaly at each frame — the cos(latitude)-weighted mean over the '
        + 'event’s fixed 5 × 5-cell peak patch; the 20 frames of the 5-day window average to M.')),
    el('p', {}, 'The centre is the cos(latitude) × anomaly-weighted centroid of the connected region where the five-day-mean '
      + 'anomaly from s* is at least half the event’s peak-patch value, around the peak patch; it stays fixed for the whole animation.'),
    el('h3', {}, 'Limitations'), el('ul', {}, idx.limitations.map((x) => el('li', {}, x))),
    el('h3', {}, 'Notes'), el('p', {}, 'Notes and tags are stored in this browser only. Use Notes → Export JSON to back them up '
      + 'or move them; Import merges by note id (the newer copy wins) or replaces everything.'),
    el('p', { class: 'meta' }, `Data build ${idx.build.attempt}${idx.build.created ? `, ${idx.build.created}` : ''}.`));
  return {};
}
