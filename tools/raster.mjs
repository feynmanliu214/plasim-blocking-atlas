// A software stand-in for the part of CanvasRenderingContext2D that js/draw.js uses (plan R12), so
// tools/render-frame.mjs draws with the page's own code: createImageData / putImageData, save / restore, strokeStyle /
// lineWidth / setLineDash, beginPath / moveTo / lineTo / stroke (coverage-antialiased, source-over alpha, dashes that
// run on across vertices). Text and fills are accepted and ignored. `data` is RGBA, row-major.
export function parseColor(c) {
  let m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255, 1]; }
  m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) return [...m[1]].map((h) => parseInt(h + h, 16)).concat(1);
  m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (m) { const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
  throw new Error(`colour ${c}`);
}

const STATE = ['strokeStyle', 'lineWidth', 'fillStyle', 'font', 'textAlign', 'textBaseline', 'lineCap', 'globalAlpha', 'dash'];

export class Raster {
  constructor(width, height) {
    this.width = width; this.height = height; this.data = new Uint8ClampedArray(width * height * 4);
    this.strokeStyle = '#000'; this.lineWidth = 1; this.fillStyle = '#000'; this.font = ''; this.textAlign = 'start';
    this.textBaseline = 'alphabetic'; this.lineCap = 'butt'; this.globalAlpha = 1; this.dash = []; this.stack = []; this.paths = [];
  }

  createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }

  putImageData(img, dx = 0, dy = 0) {
    for (let y = 0; y < img.height; y++) {
      const ty = y + dy;
      if (ty < 0 || ty >= this.height) continue;
      for (let x = 0; x < img.width; x++) {
        const tx = x + dx;
        if (tx < 0 || tx >= this.width) continue;
        const s = 4 * (y * img.width + x), d = 4 * (ty * this.width + tx);
        for (let c = 0; c < 4; c++) this.data[d + c] = img.data[s + c];
      }
    }
  }

  save() { this.stack.push(Object.fromEntries(STATE.map((k) => [k, this[k]]))); }
  restore() { const s = this.stack.pop(); if (s) Object.assign(this, s); }
  setLineDash(d) { this.dash = [...d]; }
  getLineDash() { return [...this.dash]; }
  beginPath() { this.paths = []; }
  moveTo(x, y) { this.paths.push([x, y]); }
  lineTo(x, y) { if (!this.paths.length) this.paths.push([x, y]); else this.paths[this.paths.length - 1].push(x, y); }

  // One stroke composites once per pixel. Its coverage is the union (max) over all its pieces, as a canvas fills a
  // stroke's outline once, so subdividing a path or cutting it into dashes never darkens it (review r1 F3). Joins and
  // caps come out round; the page's canvas uses miter joins and butt caps, a sub-pixel difference.
  stroke() {
    const [r, g, b, a] = parseColor(this.strokeStyle), w = this.lineWidth, dash = this.dash.length ? this.dash : null;
    const cov = this.cov || (this.cov = new Float32Array(this.width * this.height)), touched = [];
    for (const p of this.paths) {
      let k = 0, left = dash ? dash[0] : Infinity;
      for (let q = 0; q + 3 < p.length; q += 2) {
        const x0 = p[q], y0 = p[q + 1], x1 = p[q + 2], y1 = p[q + 3], len = Math.hypot(x1 - x0, y1 - y0);
        let done = 0;
        while (done < len) {
          const run = Math.min(left, len - done), f0 = done / len, f1 = (done + run) / len;
          if (!dash || k % 2 === 0) this.cover(x0 + (x1 - x0) * f0, y0 + (y1 - y0) * f0, x0 + (x1 - x0) * f1, y0 + (y1 - y0) * f1, w, cov, touched);
          done += run; left -= run;
          if (dash && left <= 1e-9) { k = (k + 1) % dash.length; left = dash[k]; }
        }
      }
    }
    const a0 = a * this.globalAlpha;
    for (const i of touched) {
      const al = a0 * cov[i], o = 4 * i, da = this.data[o + 3] / 255, oa = al + da * (1 - al);
      cov[i] = 0;
      if (oa <= 0) continue;
      this.data[o] = (r * al + this.data[o] * da * (1 - al)) / oa;
      this.data[o + 1] = (g * al + this.data[o + 1] * da * (1 - al)) / oa;
      this.data[o + 2] = (b * al + this.data[o + 2] * da * (1 - al)) / oa;
      this.data[o + 3] = oa * 255;
    }
  }

  // Raise cov to this piece's coverage (half-width + 0.5 - distance, clamped to [0, 1]); list newly touched pixels.
  cover(x0, y0, x1, y1, w, cov, touched) {
    const hw = w / 2, dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy;
    const xa = Math.max(0, Math.floor(Math.min(x0, x1) - hw - 1)), xb = Math.min(this.width - 1, Math.ceil(Math.max(x0, x1) + hw + 1));
    const ya = Math.max(0, Math.floor(Math.min(y0, y1) - hw - 1)), yb = Math.min(this.height - 1, Math.ceil(Math.max(y0, y1) + hw + 1));
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        const px = x + 0.5, py = y + 0.5;
        let t = L2 > 0 ? ((px - x0) * dx + (py - y0) * dy) / L2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const c = Math.min(1, Math.max(0, hw + 0.5 - Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy))));
        if (c <= 0) continue;
        const i = y * this.width + x;
        if (cov[i] === 0) touched.push(i);
        if (c > cov[i]) cov[i] = c;
      }
    }
  }

  fillText() {} strokeText() {} fillRect() {} clearRect() {} strokeRect() {}
  measureText() { return { width: 0 }; }

  // The pixels composited over an opaque background (what the page shows behind a transparent canvas pixel).
  flatten(bg) {
    const [r, g, b] = parseColor(bg), out = new Uint8ClampedArray(this.data.length);
    for (let o = 0; o < out.length; o += 4) {
      const a = this.data[o + 3] / 255;
      out[o] = this.data[o] * a + r * (1 - a); out[o + 1] = this.data[o + 1] * a + g * (1 - a);
      out[o + 2] = this.data[o + 2] * a + b * (1 - a); out[o + 3] = 255;
    }
    return out;
  }
}
