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
