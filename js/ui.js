// DOM helpers. User-provided strings (annotation text, tags) only ever reach the page as text nodes (plan R13).
export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

export const fmt = (x, d = 1) => (Number.isFinite(x) ? Number(x).toFixed(d) : '—');
export const num = (x) => Number(x).toLocaleString('en-US');
export const rankText = (idx, e) => `rank ${num(e.rank)} of ${num(idx.pool.n_seasons)}`;       // owner V3
export const rpText = (e) => `RP ≈ ${e.rp_display}`;
export const sentence = (s) => (s ? `${s[0].toUpperCase()}${s.slice(1)}${/[.!?]$/.test(s) ? '' : '.'}` : '');
export const groupLabel = (idx, key) => (idx.groups.find((g) => g.key === key) || { label: key }).label;
export const tLabel = (t) => `t = ${t >= 0 ? '+' : '−'}${Math.abs(t).toFixed(2)} d`;
