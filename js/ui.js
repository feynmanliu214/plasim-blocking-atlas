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
export const fmtRP = (rp) => (rp >= 100 ? Math.round(rp).toLocaleString('en-US') : rp.toFixed(1));
export const groupLabel = (idx, key) => (idx.groups.find((g) => g.key === key) || { label: key }).label;
export const tLabel = (t) => `t = ${t >= 0 ? '+' : '−'}${Math.abs(t).toFixed(2)} d`;
