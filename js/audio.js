'use strict';
// Sound effects, synthesised with Web Audio so the game ships no audio files.
// The context starts on the first tap or key press (browsers require a gesture), and every
// effect is rate-limited so a busy raid does not turn into noise.
(function () {
  const RD = window.RD;
  let ctx = null, master = null;
  let on = true, ducked = false;
  const last = {};

  function ensure() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = 0;
        master.connect(ctx.destination);
        apply();
      } catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function apply() {
    if (!master) return;
    master.gain.setTargetAtTime(on && !ducked ? 0.45 : 0, ctx.currentTime, 0.02);
  }

  // one oscillator note with a quick attack and exponential release
  function tone(freq, dur, type, vol, slideTo, delay) {
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  // filtered white noise: impacts, hisses, rumbles
  function noise(dur, vol, freq, q, delay) {
    const t = ctx.currentTime + (delay || 0);
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf;
    f.type = 'bandpass';
    f.frequency.value = freq || 800;
    f.Q.value = q || 0.8;
    g.gain.value = vol || 0.3;
    src.connect(f).connect(g).connect(master);
    src.start(t);
  }

  const SFX = {
    click: () => tone(660, 0.05, 'triangle', 0.08),
    place: () => { noise(0.08, 0.35, 300, 1.2); tone(140, 0.12, 'sine', 0.2, 90); },
    sell: () => { tone(520, 0.08, 'triangle', 0.12); tone(390, 0.12, 'triangle', 0.1, null, 0.06); },
    level: () => { [523, 659, 784].forEach((f, i) => tone(f, 0.16, 'triangle', 0.14, null, i * 0.06)); },
    error: () => tone(160, 0.14, 'square', 0.06, 120),
    dig: () => noise(0.18, 0.4, 220, 0.9),
    gate: () => { noise(0.9, 0.35, 120, 0.6); tone(70, 0.9, 'sawtooth', 0.06, 55); },
    trap: () => { noise(0.12, 0.5, 1800, 1.5); tone(220, 0.1, 'square', 0.06, 110); },
    crush: () => { noise(0.35, 0.6, 140, 0.7); tone(60, 0.35, 'sine', 0.3, 40); },
    fire: () => { noise(0.5, 0.45, 900, 0.5); tone(180, 0.4, 'sawtooth', 0.05, 90); },
    frost: () => { [1568, 2093, 1760].forEach((f, i) => tone(f, 0.25, 'sine', 0.05, null, i * 0.04)); noise(0.3, 0.15, 4000, 2); },
    hiss: () => noise(0.6, 0.2, 2500, 0.6),
    daze: () => { tone(440, 0.4, 'sine', 0.08, 660); tone(330, 0.4, 'sine', 0.06, 220, 0.05); },
    hit: () => noise(0.05, 0.25, 1200, 1),
    death: () => { tone(300, 0.35, 'sawtooth', 0.08, 70); noise(0.2, 0.2, 500, 1); },
    gold: () => { [1319, 1568].forEach((f, i) => tone(f, 0.12, 'triangle', 0.09, null, i * 0.05)); },
    loot: () => { [784, 659, 523].forEach((f, i) => tone(f, 0.14, 'triangle', 0.1, null, i * 0.07)); },
    spot: () => tone(880, 0.12, 'sine', 0.05, 990),
    door: () => { noise(0.25, 0.4, 260, 1); tone(90, 0.2, 'square', 0.06, 60); },
    boom: () => { noise(0.7, 0.6, 90, 0.5); tone(50, 0.7, 'sine', 0.35, 30); },
    summon: () => { tone(200, 0.35, 'sine', 0.08, 400); noise(0.3, 0.12, 1500, 2); },
    escape: () => tone(392, 0.25, 'triangle', 0.07, 523),
    dawn: () => { [262, 330, 392, 523].forEach((f, i) => tone(f, 0.7, 'sine', 0.06, null, i * 0.09)); },
    win: () => { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, 'triangle', 0.1, null, i * 0.1)); },
    lose: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.6, 'sawtooth', 0.05, null, i * 0.16)); },
    power: () => { noise(0.5, 0.5, 160, 0.6); tone(80, 0.5, 'sine', 0.25, 50); },
  };
  const GAP = { hit: 0.06, trap: 0.08, death: 0.05, gold: 0.08 };

  RD.sfx = function (name) {
    if (!on || ducked || !ctx || ctx.state !== 'running' || !SFX[name]) return;
    const now = ctx.currentTime;
    if (now - (last[name] || -1) < (GAP[name] || 0.05)) return;
    last[name] = now;
    try { SFX[name](); } catch (e) { /* audio is best effort */ }
  };

  RD.audio = {
    unlock: ensure,
    isOn: () => on,
    setOn(v) { on = !!v; apply(); },
    duck(v) { ducked = !!v; apply(); }, // ads and hidden tabs
  };
})();
