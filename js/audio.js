/* Web Audio 合成音效（不需任何音檔），含靜音開關 */
(function (root) {
  'use strict';
  var ctx = null, master = null, muted = false, KEY = 'abg2-mute';
  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) { /* 無痕模式等 */ }

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
  var NOTES = [262, 330, 392, 523];
  var SFX = {
    click: function () { tone(660, 0.05, 'square', 0.12); },
    confirm: function () { tone(520, 0.07, 'square', 0.14); tone(780, 0.09, 'square', 0.14, 0.07); },
    cancel: function () { tone(400, 0.08, 'square', 0.12); tone(300, 0.1, 'square', 0.12, 0.07); },
    open: function () { tone(440, 0.05, 'triangle', 0.14); tone(660, 0.06, 'triangle', 0.14, 0.05); },
    step: function () { noise(0.04, 0.05, 0, 400); },
    pickup: function () { tone(880, 0.06, 'triangle', 0.18); tone(1320, 0.1, 'triangle', 0.18, 0.06); },
    coin: function () { tone(988, 0.07, 'square', 0.14); tone(1319, 0.16, 'square', 0.14, 0.07); },
    success: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.14, 'triangle', 0.2, i * 0.09); }); },
    fail: function () { tone(330, 0.2, 'sawtooth', 0.16); tone(247, 0.35, 'sawtooth', 0.16, 0.18, 150); },
    levelup: function () { [392, 523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.18, 'square', 0.15, i * 0.1); }); },
    whistle: function () { tone(1800, 0.25, 'sine', 0.18, 0, 2300); tone(2300, 0.3, 'sine', 0.18, 0.28, 1900); },
    alarm: function () { tone(880, 0.12, 'square', 0.14); tone(660, 0.12, 'square', 0.14, 0.14); tone(880, 0.12, 'square', 0.14, 0.28); },
    hit: function () { tone(220, 0.07, 'square', 0.16, 0, 120); },
    thud: function () { noise(0.12, 0.25, 0, 100); tone(90, 0.15, 'sine', 0.3, 0, 50); },
    shot: function () { noise(0.25, 0.35, 0, 200); tone(120, 0.2, 'sawtooth', 0.2, 0, 40); },
    dice: function () { for (var i = 0; i < 6; i++) tone(300 + Math.random() * 500, 0.04, 'square', 0.1, i * 0.06); },
    save: function () { tone(660, 0.08, 'triangle', 0.16); tone(880, 0.12, 'triangle', 0.16, 0.09); },
    tick: function () { tone(1000, 0.03, 'square', 0.08); },
    reload: function () { noise(0.05, 0.2, 0, 1500); tone(180, 0.06, 'square', 0.12, 0.05); noise(0.05, 0.2, 0.9, 1500); tone(260, 0.07, 'square', 0.14, 1.05); },
    empty: function () { tone(140, 0.05, 'square', 0.14); },
    hurt: function () { noise(0.1, 0.28, 0, 300); tone(110, 0.14, 'sawtooth', 0.18, 0, 70); },
    heart: function () { tone(70, 0.09, 'sine', 0.35); tone(60, 0.1, 'sine', 0.3, 0.16); },
    hitmark: function () { tone(1500, 0.04, 'square', 0.1); },
    radio: function () { noise(0.12, 0.12, 0, 2500); tone(900, 0.05, 'square', 0.06, 0.1); }
  };
  function sfx(name, arg) {
    if (name === 'note') { tone(NOTES[(arg || 0) % 4], 0.14, 'triangle', 0.22); return; }
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
