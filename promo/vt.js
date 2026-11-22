// Virtual clock for frame-by-frame capture. Injected into every document (page and iframes) before any script runs.
// Time only moves when __vt.step(ms) is called, so timers, rAF, performance.now and CSS animations stay in lockstep.
(() => {
  if (window.__vt) return;
  let now = 0;
  let seq = 0;
  const epoch = Date.parse('2026-12-24T20:00:00+08:00');
  const RealDate = Date;
  const timers = new Map();
  let frames = new Map();
  window.setTimeout = (fn, ms = 0, ...args) => { const id = ++seq; timers.set(id, { at: now + Math.max(0, +ms || 0), fn, args, every: 0 }); return id; };
  window.setInterval = (fn, ms = 0, ...args) => { const every = Math.max(1, +ms || 0); const id = ++seq; timers.set(id, { at: now + every, fn, args, every }); return id; };
  window.clearTimeout = window.clearInterval = id => { timers.delete(id); };
  window.requestAnimationFrame = fn => { const id = ++seq; frames.set(id, fn); return id; };
  window.cancelAnimationFrame = id => { frames.delete(id); };
  performance.now = () => now;
  let randomState = 0x2b7e1516;
  Math.random = () => {
    randomState = (randomState + 0x6d2b79f5) | 0;
    let value = Math.imul(randomState ^ (randomState >>> 15), randomState | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  class VirtualDate extends RealDate {
    constructor(...args) { if (args.length) super(...args); else super(epoch + now); }
    static now() { return epoch + now; }
  }
  window.Date = VirtualDate;
  Object.defineProperty(Document.prototype, 'hidden', { get: () => false, configurable: true });
  Object.defineProperty(Document.prototype, 'visibilityState', { get: () => 'visible', configurable: true });
  const seen = new WeakSet();
  function runTimers(limit) {
    for (let guard = 0; guard < 100000; guard++) {
      let pick, pickId;
      for (const [id, timer] of timers) if (timer.at <= limit && (!pick || timer.at < pick.at)) { pick = timer; pickId = id; }
      if (!pick) return;
      now = Math.max(now, pick.at);
      if (pick.every) pick.at += pick.every; else timers.delete(pickId);
      try { typeof pick.fn === 'function' ? pick.fn(...pick.args) : (0, eval)(pick.fn); } catch (error) { console.error(error); }
    }
  }
  function animations(ms) {
    for (const animation of document.getAnimations()) {
      if (!seen.has(animation)) { seen.add(animation); animation.pause(); animation.currentTime = 0; continue; }
      if (animation.playState !== 'paused') animation.pause();
      const end = animation.effect?.getComputedTiming().endTime ?? Infinity;
      const next = (animation.currentTime ?? 0) + ms;
      if (Number.isFinite(end) && next >= end) animation.finish(); else animation.currentTime = next;
    }
  }
  window.__vt = {
    get now() { return now; },
    step(ms) {
      const target = now + ms;
      runTimers(target);
      now = target;
      const queue = frames;
      frames = new Map();
      for (const fn of queue.values()) { try { fn(now); } catch (error) { console.error(error); } }
      animations(ms);
    },
  };
})();
