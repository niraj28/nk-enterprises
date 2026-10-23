/* Game sounds, synthesised with the Web Audio API (no audio files to download).
   Browsers only allow sound after the player has tapped something, so the audio
   context is created on the first tap. The mute choice is remembered on this device. */
(function (root) {
  "use strict";
  let ctx = null, master = null;
  let on = true;
  try { on = localStorage.getItem("seq.sound") !== "off"; } catch (e) { /* private mode */ }

  function audio() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  // unlock audio on the first tap anywhere
  root.addEventListener("pointerdown", () => { if (on) audio(); }, { once: true, capture: true });

  // one short note: frequency, start offset, length, wave shape, peak volume, optional pitch slide
  function tone(f, at, len, type, peak, slideTo) {
    const c = audio();
    if (!c) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak || 0.5, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + len + 0.02);
  }
  // a soft burst of noise, for the chip sliding off the board
  function swish(at, len) {
    const c = audio();
    if (!c) return;
    const n = Math.floor(c.sampleRate * len), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = "bandpass"; f.frequency.value = 1800; g.gain.value = 0.5;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(c.currentTime + at);
  }

  const SOUNDS = {
    select: () => tone(880, 0, 0.05, "triangle", 0.18),
    place: () => { tone(190, 0, 0.12, "sine", 0.7, 90); tone(1200, 0, 0.03, "square", 0.08); },
    remove: () => { swish(0, 0.22); tone(500, 0.02, 0.18, "triangle", 0.2, 180); },
    sequence: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.28, "triangle", 0.45)),
    turn: () => { tone(660, 0, 0.12, "sine", 0.35); tone(990, 0.1, 0.18, "sine", 0.3); },
    chat: () => tone(1320, 0, 0.06, "sine", 0.15, 1650),
    win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.12, i === 5 ? 0.6 : 0.2, "triangle", 0.45)),
    lose: () => [392, 349, 311, 262].forEach((f, i) => tone(f, i * 0.18, 0.3, "sine", 0.35))
  };

  root.SeqSound = {
    play(name) { if (on && SOUNDS[name]) { try { SOUNDS[name](); } catch (e) { /* audio unavailable */ } } },
    enabled: () => on,
    toggle() {
      on = !on;
      try { localStorage.setItem("seq.sound", on ? "on" : "off"); } catch (e) { /* ignore */ }
      if (on) SOUNDS.select();
      return on;
    }
  };
})(window);
