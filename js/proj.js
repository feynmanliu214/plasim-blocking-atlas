// North-polar stereographic display projection (owner ruling V1; plan R4): the pole inside the panel, the domain's
// centre longitude pointing down and east to the right. A domain { lonC, half, latS } is lat >= latS and
// |lon - lonC| <= half, a 2·half-degree wedge of the disc; the panel is the wedge's bounding box fitted and centred in
// w × h pixels. Radii are tan((90° - lat) / 2): conformal, and the scale factor cancels in a fitted panel.
const D2R = Math.PI / 180;
const wrap = (x) => ((((x % 360) + 540) % 360) - 180);

export const rho = (lat) => Math.tan(((90 - lat) * D2R) / 2);

export function wedgeBox(dom) {
  const r = rho(dom.latS), h = dom.half * D2R;
  const x0 = dom.half >= 90 ? -r : -r * Math.sin(h), y0 = Math.min(0, r * Math.cos(h));
  return { x0, y0, W: -2 * x0, H: r - y0 };
}

export const aspectOf = (dom) => { const b = wedgeBox(dom); return b.W / b.H; };

export function projector(dom, w, h) {
  const { x0, y0, W, H } = wedgeBox(dom), s = Math.min(w / W, h / H), ox = (w - W * s) / 2, oy = (h - H * s) / 2;
  return {
    dom, s,
    xy(lat, lon) {
      const r = rho(lat), t = (lon - dom.lonC) * D2R;
      return [ox + (r * Math.sin(t) - x0) * s, oy + (r * Math.cos(t) - y0) * s];
    },
    ll(px, py) {
      const X = (px - ox) / s + x0, Y = (py - oy) / s + y0;
      return [90 - (2 * Math.atan(Math.hypot(X, Y))) / D2R, dom.lonC + Math.atan2(X, Y) / D2R];
    },
    inside(lat, lon) { return lat >= dom.latS - 1e-9 && Math.abs(wrap(lon - dom.lonC)) <= dom.half + 1e-9; },
  };
}
