// One timeline for every panel on screen (plan R13): the frame index, play / pause, frames per second and loop.
// `clock` (setTimeout / clearTimeout) is injectable so the tests can drive time.
export class Player {
  constructor(times, { fps = 4, loop = true, clock = globalThis } = {}) {
    this.times = times; this.index = 0; this.fps = fps; this.loop = loop; this.clock = clock;
    this.timer = null; this.listeners = new Set();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  emit() { for (const fn of this.listeners) fn(this.index, this); }

  get playing() { return this.timer !== null; }

  set(k) {
    const j = Math.max(0, Math.min(this.times.length - 1, Math.round(k)));
    if (j !== this.index) { this.index = j; this.emit(); }
  }

  step(d) {
    const n = this.times.length;
    this.set(this.loop ? (((this.index + d) % n) + n) % n : this.index + d);
  }

  play() {
    if (this.timer !== null) return;
    if (!this.loop && this.index >= this.times.length - 1) this.set(0);
    const tick = () => {
      if (!this.loop && this.index >= this.times.length - 1) { this.timer = null; this.emit(); return; }
      this.step(1);
      this.timer = this.clock.setTimeout(tick, 1000 / this.fps);
    };
    this.timer = this.clock.setTimeout(tick, 1000 / this.fps);
    this.emit();
  }

  pause() {
    if (this.timer === null) return;
    this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.emit();
  }

  toggle() { if (this.playing) this.pause(); else this.play(); }

  setFps(f) { this.fps = Math.max(0.5, Math.min(24, Number(f) || 4)); }

  nearest(t) {
    let best = 0;
    for (let k = 1; k < this.times.length; k++) if (Math.abs(this.times[k] - t) < Math.abs(this.times[best] - t)) best = k;
    return best;
  }
}

// Keep some state (the page URL) on the current frame while a view lives. The returned stop() detaches the writer
// *before* pausing, so the pause emitted during teardown never writes the old view's state over the next view's URL.
export function follow(player, write) {
  let live = true;
  const off = player.on((k) => { if (live) write(k); });
  return () => { live = false; off(); player.pause(); };
}
