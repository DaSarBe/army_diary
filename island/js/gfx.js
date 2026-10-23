/* 島嶼守備畫質：單一設定表、自動降級、FPS 疊層。之後階段只往 table 加欄。 */
(function (root) {
  'use strict';
  var KEY_TIER = 'island-gfx-tier';
  var KEY_HUD = 'island-fps-hud';
  var ORDER = ['low', 'mid', 'high'];
  var LABELS = { auto: '自動', low: '低', mid: '中', high: '高' };

  var table = {
    defaultPref: 'auto',
    autoStartTier: 'mid',
    autoNeverHigh: true,
    autoDropFps: 40,
    autoSampleSec: 3,
    autoCooldownSec: 10,
    tiers: {
      low: { pixelRatio: 1, antialias: false, sky: 'flat', fog: 'linear', heightFog: false, clouds: 0, sunDisc: true, sunHalo: false, maxTex: 512, domeSeg: 8, waterWaves: false, coverDetail: false },
      mid: { pixelRatio: 1.25, antialias: false, sky: 'dome', fog: 'linear', heightFog: true, clouds: 5, sunDisc: true, sunHalo: true, maxTex: 512, domeSeg: 16, waterWaves: true, coverDetail: true },
      high: { pixelRatio: 1.75, antialias: true, sky: 'dome', fog: 'linear', heightFog: true, clouds: 8, sunDisc: true, sunHalo: true, maxTex: 1024, domeSeg: 24, waterWaves: true, coverDetail: true }
    },
    budget: {
      low: { triangles: 60000, drawCalls: 80, maxTex: 512 },
      mid: { triangles: 120000, drawCalls: 120, maxTex: 512 },
      high: { triangles: 200000, drawCalls: 180, maxTex: 1024 }
    }
  };

  var pref = 'auto', applied = 'mid', hudOn = false, freezeAuto = false;
  var sampleT = 0, sampleFrames = 0, lastChangeMs = 0, fpsEma = 60;

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
    ['defaultPref', 'autoStartTier', 'autoNeverHigh', 'autoDropFps', 'autoSampleSec', 'autoCooldownSec'].forEach(function (k) {
      if (cfg[k] != null) table[k] = cfg[k];
    });
    if (pref === 'auto') {
      applied = table.autoStartTier || 'mid';
      if (table.autoNeverHigh && applied === 'high') applied = 'mid';
    }
  }

  function setPref(v, applyFn) {
    if (v !== 'auto' && v !== 'low' && v !== 'mid' && v !== 'high') return;
    pref = v;
    applied = v === 'auto' ? (table.autoStartTier || 'mid') : v;
    if (table.autoNeverHigh && pref === 'auto' && applied === 'high') applied = 'mid';
    sampleT = 0; sampleFrames = 0; lastChangeMs = performance.now();
    savePref();
    if (applyFn) applyFn(spec(), applied);
  }

  function tick(nowMs, dt, applyFn) {
    if (dt > 0 && dt < 1) fpsEma = fpsEma * 0.9 + (1 / dt) * 0.1;
    if (freezeAuto || pref !== 'auto') return;
    sampleT += dt; sampleFrames++;
    var need = table.autoSampleSec || 3;
    var cool = (table.autoCooldownSec || 10) * 1000;
    if (sampleT < need) return;
    var fps = sampleFrames / Math.max(0.001, sampleT);
    sampleT = 0; sampleFrames = 0;
    if (nowMs - lastChangeMs < cool) return;
    if (fps < (table.autoDropFps || 40) && applied !== 'low') {
      var i = ORDER.indexOf(applied);
      if (i > 0) {
        applied = ORDER[i - 1];
        lastChangeMs = nowMs;
        if (applyFn) applyFn(spec(), applied);
      }
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
    try { console.log('[island-gfx]', JSON.stringify(info)); } catch (e) { console.log('[island-gfx]', info); }
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
