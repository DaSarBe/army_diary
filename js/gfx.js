/* 主遊戲畫質：單一設定表、自動降級、FPS 疊層。沿用島嶼守備的取樣規則。 */
(function (root) {
  'use strict';
  var KEY_TIER = 'army-gfx-tier';
  var KEY_HUD = 'army-fps-hud';
  var ORDER = ['low', 'mid', 'high'];
  var LABELS = { auto: '自動', low: '低', mid: '中', high: '高' };

  var table = {
    defaultPref: 'auto',
    autoStartTier: 'mid',
    autoNeverHigh: true,
    autoDropFps: 32,
    autoSampleSec: 3,
    autoWarmupSec: 4,
    autoDropStrikes: 2,
    autoCooldownSec: 10,
    tiers: {
      low: { pixelRatio: 1, antialias: false, shadows: false, bloom: false, vignette: false, toneMapping: true, toneExposure: 1.0, shadowMap: 0, maxTex: 512 },
      mid: { pixelRatio: 1.25, antialias: false, shadows: true, bloom: true, vignette: true, toneMapping: true, toneExposure: 1.05, shadowMap: 1024, bloomStr: 0.22, bloomRad: 0.38, bloomThr: 0.86, vignetteDark: 0.22, maxTex: 512 },
      high: { pixelRatio: 1.75, antialias: true, shadows: true, bloom: true, vignette: true, toneMapping: true, toneExposure: 1.08, shadowMap: 2048, bloomStr: 0.32, bloomRad: 0.48, bloomThr: 0.82, vignetteDark: 0.3, maxTex: 1024 }
    },
    budget: {
      low: { triangles: 60000, drawCalls: 80, maxTex: 512 },
      mid: { triangles: 120000, drawCalls: 120, maxTex: 512 },
      high: { triangles: 200000, drawCalls: 180, maxTex: 1024 }
    },
    characterTriangles: 3000
  };

  var pref = 'auto', applied = 'mid', hudOn = false, freezeAuto = false;
  var sampleT = 0, sampleDts = [], strikes = 0, warmupT = 0, lastChangeMs = 0, fpsEma = 60;

  function load() {
    try {
      var t = localStorage.getItem(KEY_TIER);
      if (t === 'low' || t === 'mid' || t === 'high' || t === 'auto') pref = t;
      hudOn = localStorage.getItem(KEY_HUD) === '1';
    } catch (e) { /* 無痕 */ }
    applied = pref === 'auto' ? (table.autoStartTier || 'mid') : pref;
    if (table.autoNeverHigh && pref === 'auto' && applied === 'high') applied = 'mid';
  }
  function savePref() {
    try { localStorage.setItem(KEY_TIER, pref); } catch (e) { /* ignore */ }
  }
  function saveHud() {
    try { localStorage.setItem(KEY_HUD, hudOn ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  function spec(tier) { return table.tiers[tier || applied] || table.tiers.mid; }
  function budget(tier) { return table.budget[tier || applied] || table.budget.mid; }

  function configure(cfg) {
    if (!cfg) return;
    if (cfg.tiers) table.tiers = cfg.tiers;
    if (cfg.budget) table.budget = cfg.budget;
    if (cfg.characterTriangles != null) table.characterTriangles = cfg.characterTriangles;
    ['defaultPref', 'autoStartTier', 'autoNeverHigh', 'autoDropFps', 'autoSampleSec', 'autoWarmupSec', 'autoDropStrikes', 'autoCooldownSec'].forEach(function (k) {
      if (cfg[k] != null) table[k] = cfg[k];
    });
    if (pref === 'auto') {
      applied = table.autoStartTier || 'mid';
      if (table.autoNeverHigh && applied === 'high') applied = 'mid';
    }
  }

  function clearSample() { sampleT = 0; sampleDts = []; }
  function resetPlay() { warmupT = 0; strikes = 0; clearSample(); }

  function setPref(v, applyFn) {
    if (v !== 'auto' && v !== 'low' && v !== 'mid' && v !== 'high') return;
    pref = v;
    applied = v === 'auto' ? (table.autoStartTier || 'mid') : v;
    if (table.autoNeverHigh && pref === 'auto' && applied === 'high') applied = 'mid';
    resetPlay();
    lastChangeMs = performance.now();
    savePref();
    if (applyFn) applyFn(spec(), applied);
  }

  function median(arr) {
    if (!arr.length) return 0;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var m = (a.length - 1) / 2;
    return (a[Math.floor(m)] + a[Math.ceil(m)]) * 0.5;
  }

  function isHidden(ctx) {
    if (ctx && ctx.hidden != null) return !!ctx.hidden;
    return typeof document !== 'undefined' && !!document.hidden;
  }

  function isPlayable(ctx) {
    ctx = ctx || {};
    if (ctx.paused || isHidden(ctx)) return false;
    if (ctx.mode && ctx.mode !== 'play') return false;
    return true;
  }

  function tick(nowMs, dt, applyFn, ctx) {
    if (dt > 0 && dt < 1) fpsEma = fpsEma * 0.9 + (1 / dt) * 0.1;
    if (freezeAuto || pref !== 'auto') return;
    if (!isPlayable(ctx) || !(dt > 0) || dt > 0.25) return;
    var warm = table.autoWarmupSec != null ? table.autoWarmupSec : 4;
    if (warmupT + 1e-4 < warm) { warmupT += dt; return; }
    sampleDts.push(dt);
    sampleT += dt;
    var need = table.autoSampleSec || 3;
    if (sampleT + 1e-4 < need) return;
    var med = median(sampleDts);
    var fps = med > 0 ? (1 / med) : 0;
    clearSample();
    var cool = (table.autoCooldownSec || 10) * 1000;
    var needStrikes = table.autoDropStrikes || 2;
    var floor = table.autoDropFps || 32;
    if (nowMs - lastChangeMs < cool) { strikes = 0; return; }
    if (fps < floor && applied !== 'low') strikes++;
    else strikes = 0;
    if (strikes < needStrikes) return;
    var i = ORDER.indexOf(applied);
    if (i > 0) {
      applied = ORDER[i - 1];
      lastChangeMs = nowMs;
      strikes = 0;
      if (applyFn) applyFn(spec(), applied);
    }
  }

  function toggleHud(on) {
    if (on == null) hudOn = !hudOn; else hudOn = !!on;
    saveHud();
    var el = document.getElementById('gfxHud');
    if (el) el.hidden = !hudOn;
    return hudOn;
  }

  function paintHud(info) {
    var el = document.getElementById('gfxHud');
    if (!el) return;
    el.hidden = !hudOn;
    if (!hudOn || !info) return;
    var fps = info.fps != null ? Math.round(info.fps) : '--';
    var prefLab = pref === 'auto' ? ('自動→' + (LABELS[applied] || applied)) : (LABELS[applied] || applied);
    el.textContent = fps + ' FPS · ' + prefLab + ' · dc ' + (info.calls || 0) + ' · tri ' + (info.triangles || 0);
  }

  load();

  function dump() {
    var info = (root.World && root.World.gfxInfo) ? root.World.gfxInfo() : null;
    try { console.log('[army-gfx]', JSON.stringify(info)); } catch (e) { console.log('[army-gfx]', info); }
    return info;
  }

  root.Gfx = {
    table: table,
    configure: configure,
    spec: spec,
    budget: budget,
    pref: function () { return pref; },
    applied: function () { return applied; },
    label: function (k) { return LABELS[k] || k; },
    setPref: setPref,
    tick: tick,
    resetPlay: resetPlay,
    freezeAuto: function (v) { freezeAuto = !!v; },
    hudOn: function () { return hudOn; },
    toggleHud: toggleHud,
    setHud: function (on) { return toggleHud(!!on); },
    paintHud: paintHud,
    fps: function () { return fpsEma; },
    dump: dump,
    KEY_TIER: KEY_TIER,
    KEY_HUD: KEY_HUD
  };
})(typeof self !== 'undefined' ? self : this);
