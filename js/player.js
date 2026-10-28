// One timeline for every panel on screen (plan R8): the frame index, play / pause, loop and a rate in model days per
// second. Frame k is held (t[k+1] - t[k]) / rate seconds and the last frame for the last step before a loop wraps, so
// model time runs at one speed across the change from daily to 6-hourly frames. Holds run from each frame's due time
// on a monotonic clock, so the listeners' drawing does not stretch them; a draw that overruns its hold shows the next
// frame as soon as it ends and re-anchors there, so playback slows rather than skipping or bursting (review r1 F2).
// `clock` (setTimeout / clearTimeout / now) is injectable so the tests can drive time.
export const RATES = [0.5, 1, 2, 4];
const SYSTEM_CLOCK = {          // bare calls: browsers need the global object as the timers' receiver (DEV-4)
  setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id), now: () => performance.now() };

export class Player {
  constructor(times, { rate = 1, loop = true, clock = SYSTEM_CLOCK } = {}) {
    this.times = times; this.index = 0; this.rate = RATES.includes(rate) ? rate : 1; this.loop = loop; this.clock = clock;
    this.timer = null; this.due = 0; this.listeners = new Set();
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

  hold(k) {
    const t = this.times, n = t.length, dt = k < n - 1 ? t[k + 1] - t[k] : t[n - 1] - t[n - 2];
    return (1000 * dt) / this.rate;
  }

  // Start the current frame's hold from now and chain the next ones (each from its frame's due time).
  schedule() {
    const tick = () => {
      if (!this.loop && this.index >= this.times.length - 1) { this.timer = null; this.emit(); return; }
      this.step(1);                                            // the listeners draw here, synchronously
      const now = this.clock.now();
      this.due = Math.max(this.due + this.hold(this.index), now);   // from this frame's due time, never in the past
      this.timer = this.clock.setTimeout(tick, this.due - now);
    };
    this.due = this.clock.now() + this.hold(this.index);
    this.timer = this.clock.setTimeout(tick, this.hold(this.index));
  }

  play() {
    if (this.timer !== null) return;
    if (!this.loop && this.index >= this.times.length - 1) this.set(0);
    this.schedule();
    this.emit();
  }

  pause() {
    if (this.timer === null) return;
    this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.emit();
  }

  toggle() { if (this.playing) this.pause(); else this.play(); }

  // A rate change while playing restarts the current frame's hold at the new rate from now (review r2 F1).
  setRate(r) {
    const x = Number(r);
    this.rate = RATES.includes(x) ? x : 1;
    if (this.timer !== null) { this.clock.clearTimeout(this.timer); this.schedule(); }
  }

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
