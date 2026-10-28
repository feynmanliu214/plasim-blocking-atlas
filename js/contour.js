// Marching squares (plan R13) in index space: segments [i0, j0, i1, j1, ...] (fractional row, column) where the field,
// linear along each cell edge, crosses `level`. Corners: a (i, j), b (i, j+1), c (i+1, j+1), d (i+1, j); edges: 0 a-b,
// 1 b-c, 2 d-c, 3 a-d. Cells with a non-finite corner are skipped. Saddles are split by the cell mean: when the mean is
// above `level`, the two high corners connect.
const CASES = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]],
  9: [[0, 2]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[0, 3]] };

function edge(e, i, j, a, b, c, d, level) {
  if (e === 0) return [i, j + (level - a) / (b - a)];
  if (e === 1) return [i + (level - b) / (c - b), j + 1];
  if (e === 2) return [i + 1, j + (level - d) / (c - d)];
  return [i + (level - a) / (d - a), j];
}

export function contourSegments(vals, nrow, ncol, level) {
  const out = [];
  for (let i = 0; i < nrow - 1; i++) {
    for (let j = 0; j < ncol - 1; j++) {
      const k = i * ncol + j;
      const a = vals[k], b = vals[k + 1], c = vals[k + ncol + 1], d = vals[k + ncol];
      if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d))) continue;
      const code = (a > level) | ((b > level) << 1) | ((c > level) << 2) | ((d > level) << 3);
      if (code === 0 || code === 15) continue;
      let pairs = CASES[code];
      if (!pairs) {
        const high = (a + b + c + d) / 4 > level;       // 5: a, c high; 10: b, d high
        pairs = (code === 5) === high ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]];
      }
      for (const [p, q] of pairs) {
        const e = edge(p, i, j, a, b, c, d, level), f = edge(q, i, j, a, b, c, d, level);
        out.push(e[0], e[1], f[0], f[1]);
      }
    }
  }
  return out;
}

// The (nrow - 1) f + 1 by (ncol - 1) f + 1 grid of the field's bilinear interpolant (plan R5): marching squares on it
// traces the interpolant's own level curves, the surface the shading shows. Divide its segment coordinates by f to get
// back to the field's index space.
export function refine(vals, nrow, ncol, f) {
  const r = (nrow - 1) * f + 1, c = (ncol - 1) * f + 1, out = new Float32Array(r * c);
  for (let I = 0; I < r; I++) {
    const i0 = Math.min(Math.floor(I / f), nrow - 2), fi = I / f - i0;
    for (let J = 0; J < c; J++) {
      const j0 = Math.min(Math.floor(J / f), ncol - 2), fj = J / f - j0, k = i0 * ncol + j0;
      out[I * c + J] = (1 - fi) * ((1 - fj) * vals[k] + fj * vals[k + 1]) + fi * ((1 - fj) * vals[k + ncol] + fj * vals[k + ncol + 1]);
    }
  }
  return { vals: out, nrow: r, ncol: c, f };
}

// Marching-squares segments [i0, j0, i1, j1, ...] joined at shared end points into polylines [i, j, i, j, ...], so a
// dash pattern runs along a whole line. Neighbouring cells compute a shared edge crossing identically, so end points
// match exactly; a closed curve ends on its first point.
export function chain(segs) {
  const key = (a, b) => `${a},${b}`, ends = new Map(), n = segs.length / 4, used = new Uint8Array(n), lines = [];
  for (let s = 0; s < n; s++) {
    for (const e of [0, 2]) {
      const k = key(segs[4 * s + e], segs[4 * s + e + 1]);
      if (!ends.has(k)) ends.set(k, []);
      ends.get(k).push(s);
    }
  }
  for (let s0 = 0; s0 < n; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const pts = segs.slice(4 * s0, 4 * s0 + 4);
    for (const forward of [true, false]) {
      for (;;) {
        const a = forward ? pts[pts.length - 2] : pts[0], b = forward ? pts[pts.length - 1] : pts[1];
        const next = (ends.get(key(a, b)) || []).find((s) => !used[s]);
        if (next === undefined) break;
        used[next] = 1;
        const q = segs.slice(4 * next, 4 * next + 4), far = q[0] === a && q[1] === b ? [q[2], q[3]] : [q[0], q[1]];
        if (forward) pts.push(far[0], far[1]); else pts.unshift(far[0], far[1]);
      }
    }
    lines.push(pts);
  }
  return lines;
}
