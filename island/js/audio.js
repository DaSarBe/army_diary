/* Web Audio 合成音效，靜音鍵存在 island-mute */
(function (root) {
  'use strict';
  var ctx = null, master = null, muted = false, KEY = 'island-mute';
  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) { /* 無痕 */ }

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }
  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ensure() || muted) return;
    var t = ctx.currentTime + (when || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, when, hp) {
    if (!ensure() || muted) return;
    var t = ctx.currentTime + (when || 0), n = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0), i;
    for (i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = hp || 800;
    g.gain.value = vol || 0.2;
    s.buffer = buf; s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }
  var SFX = {
    click: function () { tone(660, 0.05, 'square', 0.12); },
    confirm: function () { tone(520, 0.07, 'square', 0.14); tone(780, 0.09, 'square', 0.14, 0.07); },
    cancel: function () { tone(400, 0.08, 'square', 0.12); tone(300, 0.1, 'square', 0.12, 0.07); },
    open: function () { tone(440, 0.05, 'triangle', 0.14); tone(660, 0.06, 'triangle', 0.14, 0.05); },
    step: function () { noise(0.04, 0.05, 0, 400); },
    success: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.14, 'triangle', 0.2, i * 0.09); }); },
    fail: function () { tone(330, 0.2, 'sawtooth', 0.16); tone(247, 0.35, 'sawtooth', 0.16, 0.18, 150); },
    hit: function () { tone(220, 0.07, 'square', 0.16, 0, 120); },
    thud: function () { noise(0.12, 0.25, 0, 100); tone(90, 0.15, 'sine', 0.3, 0, 50); },
    shot: function () { noise(0.22, 0.32, 0, 200); tone(120, 0.18, 'sawtooth', 0.18, 0, 40); },
    pistol: function () { noise(0.12, 0.22, 0, 400); tone(180, 0.1, 'square', 0.14, 0, 70); },
    boom: function () { noise(0.4, 0.4, 0, 80); tone(70, 0.35, 'sine', 0.35, 0, 30); },
    save: function () { tone(660, 0.08, 'triangle', 0.16); tone(880, 0.12, 'triangle', 0.16, 0.09); },
    reload: function () { noise(0.05, 0.2, 0, 1500); tone(180, 0.06, 'square', 0.12, 0.05); noise(0.05, 0.2, 0.9, 1500); tone(260, 0.07, 'square', 0.14, 1.05); },
    empty: function () { tone(140, 0.05, 'square', 0.14); },
    hurt: function () { noise(0.1, 0.28, 0, 300); tone(110, 0.14, 'sawtooth', 0.18, 0, 70); },
    heart: function () { tone(70, 0.09, 'sine', 0.35); tone(60, 0.1, 'sine', 0.3, 0.16); },
    hitmark: function () { tone(1500, 0.04, 'square', 0.1); },
    radio: function () { noise(0.12, 0.12, 0, 2500); tone(900, 0.05, 'square', 0.06, 0.1); },
    engine: function () { tone(90, 0.08, 'sawtooth', 0.08, 0, 70); }
  };
  function sfx(name) {
    var f = SFX[name];
    if (f) { try { f(); } catch (e) { /* 音效失敗不影響遊戲 */ } }
  }
  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (master) master.gain.value = muted ? 0 : 0.5;
  }
  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume() { if (ctx && ctx.state === 'suspended' && !muted) ctx.resume(); }
  root.Sfx = { sfx: sfx, ensure: ensure, setMuted: setMuted, isMuted: function () { return muted; }, suspend: suspend, resume: resume };
})(typeof self !== 'undefined' ? self : this);
