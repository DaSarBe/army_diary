/* 島嶼守備主流程：讀 JSON 關卡、劇情、存檔、重試。關卡 2–5 只要加 JSON 就能接。 */
(function (root) {
  'use strict';
  var W = root.World, Cbt = root.Combat, Sfx = root.Sfx;
  var $ = function (s) { return document.querySelector(s); };
  var KEY = 'island-save-0';
  var cfg = null, catalog = null, story = null, level = null, save = null, beatI = 0, phase = 'boot';
  var holdT = null, auto = false, q = {};

  function parseQuery() {
    (location.search || '').replace(/^\?/, '').split('&').forEach(function (p) {
      if (!p) return; var i = p.indexOf('='), k = decodeURIComponent(i < 0 ? p : p.slice(0, i)), v = i < 0 ? '1' : decodeURIComponent(p.slice(i + 1));
      q[k] = v;
    });
    auto = q.auto === '1';
  }
  function testMode() { return auto || q.test === '1' || q.eval === '1'; }
  function loadJson(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); });
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
  }
  function readSave() {
    try { var s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function normalize(island, fps) {
    var modes = JSON.parse(JSON.stringify((fps.difficulty && fps.difficulty.modes) || {}));
    if (island.difficulty && island.difficulty.hardcore && modes.hardcore) {
      modes.hardcore.dmgTakenMul = island.difficulty.hardcore.dmgTakenMul;
      modes.hardcore.enemyAccMul = island.difficulty.hardcore.enemyAccMul;
    }
    if (island.difficulty && island.difficulty.normal && modes.standard) {
      modes.standard.dmgTakenMul = island.difficulty.normal.dmgTakenMul;
      modes.standard.enemyAccMul = island.difficulty.normal.enemyAccMul;
    }
    function wep(id, name, mags) {
      var w = island.weapons[id];
      return { id: id, name: name, dmg: w.dmg, rpm: w.rpm, magSize: w.mag, startMags: mags, reloadSec: w.reloadSec, range: w.range, swayMul: w.swayMul };
    }
    var carry = ((fps.npcFate && fps.npcFate.civilian && fps.npcFate.civilian.carryRules) || {});
    carry.hint = carry.hint || '背著人不能瞄準射擊';
    return {
      raw: island, fps: fps,
      view: { fov: (fps.view && fps.view.fovFirst) || 70, eyeStand: 1.62, eyeCrouch: 1.02 },
      difficulty: { default: (fps.difficulty && fps.difficulty.default) || 'hardcore', modes: modes, aimAssist: fps.difficulty && fps.difficulty.aimAssist },
      cover: fps.cover, aiming: fps.aiming,
      health: {
        hpMax: island.player.hp, lowHpPct: (fps.health && fps.health.lowHpPct) || 25,
        medkitHealPct: island.weapons.medkit.heal, medkitsStart: island.weapons.medkit.count,
        medkitUseSec: island.weapons.medkit.useSec, cancelOnHit: island.weapons.medkit.cancelOnHit
      },
      weapons: {
        t91: wep('t91', 'T91 步槍', 4), m9: wep('m9', 'M9 手槍', 2),
        t75: island.weapons.t75_lmg ? { id: 't75', name: 'T75 機槍', dmg: island.weapons.t75_lmg.dmg, rpm: island.weapons.t75_lmg.rpm, magSize: island.weapons.t75_lmg.mag, startMags: 1, reloadSec: island.weapons.t75_lmg.reloadSec, range: island.weapons.t75_lmg.range, swayMul: island.weapons.t75_lmg.swayMul } : null,
        t65: island.weapons.t65k2_dmr ? { id: 't65', name: 'T65K2', dmg: island.weapons.t65k2_dmr.dmg, rpm: island.weapons.t65k2_dmr.rpm, magSize: island.weapons.t65k2_dmr.mag, startMags: 2, reloadSec: island.weapons.t65k2_dmr.reloadSec, range: island.weapons.t65k2_dmr.range, swayMul: island.weapons.t65k2_dmr.swayMul } : null
      },
      grenade: { name: '手榴彈', count: island.weapons.frag.count, dmg: island.weapons.frag.dmg, radius: island.weapons.frag.radius, fuse: island.weapons.frag.fuseSec },
      enemies: { types: island.enemies, maxOnScreen: island.maxEnemiesOnScreen || 8 },
      vehicles: island.vehicles, props: island.props, carry: carry,
      npcFate: island.npcFate, playerDeath: island.playerDeath, carryOver: island.carryOver,
      save: { key: 'island-save-0' }
    };
  }
  function freshSave(name, diff) {
    return {
      name: name || '方子豪', diff: diff || (cfg.difficulty.default || 'hardcore'),
      level: 'op1_landing', checkpoint: 'boat_chat', beat: 0,
      flags: {}, companionFates: { wang: 'absent', akai: 'absent', lin: 'absent' }, fateRolls: {},
      hp: cfg.health.hpMax, loadout: null,
      carryOver: false, downSeen: false, o: 50, wangHits: 0
    };
  }
  function setFlag(id, on) { if (!id) return; save.flags[id] = on !== false; persist(); }
  function hasFlag(id) { return !!(save && save.flags && save.flags[id]); }
  var ROUTE_FLAGS = ['isl_flank_front', 'isl_flank_by_sea', 'isl_flank_by_bike', 'isl_stealth'];
  var ANTENNA_FLAGS = ['isl_radio_strong', 'isl_radio_weak'];
  var CHAT_FLAGS = ['isl_chat_lin_ok', 'isl_chat_quiet', 'isl_chat_wang'];
  var AKAI_FLAGS = ['isl_akai_with_you', 'isl_akai_outside'];
  var DRIVER_FLAGS = ['isl_jeep_driver_akai', 'isl_jeep_driver_lin', 'isl_jeep_driver_player'];
  var RIDGE_FLAGS = ['isl_ridge_walk', 'isl_bike_dash', 'isl_ridge_trail'];
  var SCOUT_FLAGS = ['isl_spared_scout', 'isl_killed_scout'];
  var TUNNEL_FLAGS = ['isl_tunnel_stealth', 'isl_tunnel_assault', 'isl_rail_escape', 'isl_tunnel_jeep'];
  var CAPTIVE_FLAGS = ['isl_captives_rescued', 'isl_captives_left'];
  var HQ_FLAGS = ['isl_hq_assault', 'isl_jeep_charge', 'isl_hq_stealth', 'isl_hq_dmr'];
  var BOSS_FLAGS = ['isl_commander_captured', 'isl_commander_killed'];
  function exclusiveFlags(group, id) {
    group.forEach(function (f) { save.flags[f] = f === id; });
    persist();
  }
  function countBag(bag) {
    var n = 0; Object.keys(bag || {}).forEach(function (k) { n += bag[k] || 0; }); return n;
  }
  function dropBag(en, n, order) {
    var i, k;
    for (i = 0; i < n; i++) {
      for (k = 0; k < order.length; k++) {
        if ((en[order[k]] || 0) > 0) { en[order[k]]--; break; }
      }
    }
  }
  function takeBag(en, n, order) {
    var out = {}, i, k;
    for (i = 0; i < n; i++) {
      for (k = 0; k < order.length; k++) {
        if ((en[order[k]] || 0) > 0) { en[order[k]]--; out[order[k]] = (out[order[k]] || 0) + 1; break; }
      }
    }
    return out;
  }
  function routeSpec() {
    var ops = (cfg && cfg.raw && cfg.raw.outposts) || [];
    var op = ops.filter(function (x) { return x.id === 'op1_landing'; })[0];
    return (op && op.routes) || {};
  }
  function applyDelta(en, delta) {
    Object.keys(delta || {}).forEach(function (k) { en[k] = Math.max(0, (en[k] || 0) + (delta[k] || 0)); });
  }
  function assaultPlan() {
    var b = (level && level.beats || []).filter(function (x) { return x.id === 'assault'; })[0];
    var wave = (b && b.wave) || { enemies: { scout: 4, rifleman: 6, rusher: 2 } };
    var enemies = JSON.parse(JSON.stringify(wave.enemies || {}));
    var routes = routeSpec();
    var plan = { enemies: enemies, stealth: false, reinforce: null, ammo: null, gather: null, keep: false, noise: false };
    if (hasFlag('isl_stealth')) {
      plan.stealth = true;
      applyDelta(enemies, (routes.stealth && routes.stealth.enemyDelta) || { rifleman: -3 });
      plan.reinforce = wave.stealthReinforce || { rusher: 2 };
    } else if (hasFlag('isl_flank_by_sea')) {
      applyDelta(enemies, (routes.sea && routes.sea.enemyDelta) || { rifleman: -(wave.seaMinusRifleman || 2) });
    } else if (hasFlag('isl_flank_by_bike')) {
      applyDelta(enemies, (routes.bike && routes.bike.enemyDelta) || { rifleman: -(wave.bikeMinus || 2) });
      plan.noise = true;
      var sess = Cbt.session && Cbt.session();
      var live = sess && sess.enemies && sess.enemies.filter(function (e) { return e.state !== 'dead'; }).length;
      if (save._bikeGather && sess && (live || sess.gatherKilled)) {
        plan.keep = true;
        Object.keys(save._bikeGather).forEach(function (k) {
          enemies[k] = Math.max(0, (enemies[k] || 0) - save._bikeGather[k]);
        });
      }
    } else {
      plan.ammo = wave.frontAmmo || { x: 10, z: -16 };
    }
    return plan;
  }
  function landForRoute() {
    if (hasFlag('isl_flank_by_sea')) return [-22, -40];
    if (hasFlag('isl_flank_by_bike')) return [18, -26];
    if (hasFlag('isl_stealth')) return [-24, -8];
    return [0, 20];
  }
  function playerO() {
    var o = 50;
    if (hasFlag('isl_chat_lin_ok')) o += 8;
    if (hasFlag('isl_chat_wang')) o += 6;
    if (hasFlag('isl_chat_quiet')) o += 2;
    var s = Cbt.session && Cbt.session();
    if (s && s.pack) o += Math.round((s.pack.hp / s.pack.hpMax) * 10 - 5);
    if (s && s.lin && s.lin.max) o += Math.round((s.lin.hp / s.lin.max) * 8);
    if (save.downSeen) o -= 4;
    o = clamp(o, 1, 99);
    save.o = o; persist();
    return o;
  }
  function companionRadio(id, lines, cb) {
    lockFate(id, 'kia');
    if (id === 'lin') W.showNpc('npc_signal_lin', false);
    if (id === 'akai') W.showNpc('npc_akai', false);
    if (id === 'wang') W.showNpc('npc_sgt_wang', false);
    var list = Array.isArray(lines) ? lines : [lines];
    var i = 0;
    function step() {
      if (i >= list.length) { if (cb) cb(); return; }
      Sfx.sfx('radio');
      fade(list[i], 1800, function () { i++; step(); });
    }
    step();
  }
  function pickRollRadio(id) {
    var sc = story && story.scenes && story.scenes[id + '_roll'];
    if (id === 'lin' && level && level.num === 1 && sc && sc.radioOp1) return sc.radioOp1;
    if (id === 'akai' && level && level.num === 4 && sc && sc.radioOp4) return sc.radioOp4;
    var bag = (sc && sc.radio) || [];
    if (!bag.length) return pickCompanionRadio(id);
    return auto ? bag[0] : bag[Math.floor(Math.random() * bag.length)];
  }
  function playRollRadios(ids, cb) {
    function next() {
      if (!ids.length) { if (cb) cb(); return; }
      var id = ids.shift();
      companionRadio(id, pickRollRadio(id), next);
    }
    next();
  }
  function pickCompanionRadio(id) {
    var sc = story && story.scenes && story.scenes[id + '_down'];
    var bag = (sc && sc.radio) || [];
    if (!bag.length) {
      if (id === 'lin') return ['黃連長：「小林，回答。……小林，回答。」', '黃連長：「頻道裡少了一個人。」'];
      if (id === 'wang') return ['黃連長：「班長的呼號不再回應。他帶過的人，今天站得很穩。」'];
      if (id === 'akai') return ['黃連長：「阿凱的頻道沒有再開。他守的那一段，沒有人退。」'];
      return ['黃連長：「頻道裡少了一個人。」'];
    }
    var pick = auto ? 0 : Math.floor(Math.random() * bag.length);
    return bag[pick];
  }
  function retryRadioLine() {
    var sc = story.scenes.down || {};
    var miss = [];
    if (fateOf('lin') === 'kia') miss.push('lin');
    if (fateOf('wang') === 'kia') miss.push('wang');
    if (fateOf('akai') === 'kia') miss.push('akai');
    if (miss.length >= 2) return sc.retryMany || '黃連長：「線守住了，但我們少了不只一個人。名單我先記著，你先站穩。」';
    if (miss[0] === 'lin') return sc.retryLin || '黃連長：「線守住了，但我們少了小林。天線交給你。」';
    if (miss[0] === 'wang') return sc.retryWang || '黃連長：「線守住了，但班長沒有回來。這一段，你帶。」';
    if (miss[0] === 'akai') return sc.retryAkai || '黃連長：「線守住了，但阿凱的頻道沒有再開。繼續往前。」';
    return sc.retryAll || '黃連長：「線還在，人都在。繼續。」';
  }
  function ensureFates(s) {
    s = s || save;
    if (!s) return s;
    if (!s.flags) s.flags = {};
    if (!s.fateRolls) s.fateRolls = {};
    var cur = s.companionFates || {};
    function one(id, kiaFlag, aliveHint) {
      var v = cur[id];
      if (v === 'kia' || v === 'alive' || v === 'absent') return v;
      if (s.flags[kiaFlag]) return 'kia';
      if (aliveHint) return 'alive';
      return 'absent';
    }
    s.companionFates = {
      wang: one('wang', 'isl_wang_kia', !!s.flags.isl_wang_rescued),
      akai: one('akai', 'isl_akai_kia', !!(s.flags.isl_03_clear || s.fateRolls['akai:op3_ridge'])),
      lin: one('lin', 'isl_lin_kia', !!(s.flags.isl_01_clear || s.fateRolls['lin:op1_landing']))
    };
    return s;
  }
  function fateOf(id) {
    if (!save) return null;
    if (!save.companionFates) ensureFates(save);
    var bag = save.companionFates || {};
    var v = bag[id];
    return (!v || v === 'absent') ? null : v;
  }
  function lockFate(id, val) {
    if (!save.companionFates) ensureFates(save);
    if (save.companionFates[id] === 'kia') return 'kia';
    save.companionFates[id] = val; persist(); return val;
  }
  function levelNumOf(id) {
    return { op1_landing: 1, op2_radar: 2, op3_ridge: 3, op4_tunnel: 4, op5_hq: 5 }[id] || (level && level.num) || 1;
  }
  function shouldRoll(id, levelId) {
    var table = (cfg.npcFate && cfg.npcFate.rollTable) || {};
    var n = levelNumOf(levelId);
    if (id === 'lin') {
      var lb = (table.lin && table.lin.base) || { op1: 14, op2: 0, op3: 12, op4: 14, op5: 12 };
      return !!(lb['op' + n]);
    }
    if (id === 'akai') {
      var ab = (table.akai && table.akai.base) || { op3: 17, op4: 19, op5: 15 };
      return !!(ab['op' + n]);
    }
    if (id === 'wang') return n === 4;
    return false;
  }
  function hasFirstAid() {
    if (save && save.usedMedkit) return true;
    if (!save || !save.carryOver) return false;
    try {
      var raw = JSON.parse(localStorage.getItem('abg2-save-0') || 'null');
      var sk = raw && raw.G && raw.G.skills;
      return !!(sk && sk.sk_firstaid);
    } catch (e) { return false; }
  }
  function chapterFate(id, levelId, force) {
    if (!save.companionFates) ensureFates(save);
    if (!save.fateRolls) save.fateRolls = {};
    if (save.companionFates[id] === 'kia') return 'kia';
    var lid = levelId || (level && level.id) || 'unk';
    if (!force && !shouldRoll(id, lid)) return fateOf(id);
    var key = id + ':' + lid;
    if (save.fateRolls[key]) {
      if (save.fateRolls[key] === 'kia') lockFate(id, 'kia');
      return save.fateRolls[key];
    }
    var result = force || computeFate(id);
    save.fateRolls[key] = result;
    if (result === 'kia') {
      lockFate(id, 'kia');
      if (id === 'wang') { save.flags.isl_wang_kia = true; save.flags.isl_wang_rescued = false; }
      if (id === 'lin') save.flags.isl_lin_kia = true;
      if (id === 'akai') save.flags.isl_akai_kia = true;
    } else {
      lockFate(id, 'alive');
      if (id === 'wang') setFlag('isl_wang_rescued');
    }
    persist();
    return result;
  }
  function computeFate(id) {
    var o = playerO();
    var table = (cfg.npcFate && cfg.npcFate.rollTable) || {};
    var n = (level && level.num) || 1;
    if (id === 'lin') {
      if (auto && (q.fate === 'kia' || q.lin === 'kia' || q.ending === 'silent_a')) return 'kia';
      if (auto) return 'alive';
      var bases = (table.lin && table.lin.base) || { op1: 14, op2: 0, op3: 12, op4: 14, op5: 12 };
      var base = bases['op' + n] != null ? bases['op' + n] : 12;
      return Math.random() * 100 < clamp(base - (o - 50) * 0.4, 2, 30) ? 'kia' : 'alive';
    }
    if (id === 'akai') {
      if (auto && (q.akai === 'kia' || q.ending === 'silent_a')) return 'kia';
      if (auto) return 'alive';
      var ab = (table.akai && table.akai.base) || { op3: 17, op4: 19, op5: 15 };
      var abase = ab['op' + n] != null ? ab['op' + n] : 17;
      if (hasFlag('isl_akai_outside')) abase += 8;
      if (hasFirstAid()) abase -= 8;
      return Math.random() * 100 < clamp(abase - (o - 50) * 0.5, 2, 35) ? 'kia' : 'alive';
    }
    if (id === 'wang') {
      if (auto && q.wang === 'kia') return 'kia';
      if (auto) return 'alive';
      var hits = Math.min(save.wangHits || 0, 3);
      var rail = hasFlag('isl_rail_escape') ? 10 : 0;
      var smoke = save._usedCarrySmoke ? 5 : 0;
      return Math.random() * 100 < clamp(29 - rail - smoke + 8 * hits - (o - 50) * 0.3, 5, 50) ? 'kia' : 'alive';
    }
    return 'alive';
  }

  function toast(t) {
    var box = $('#toasts'), i = document.createElement('i'); i.textContent = t; box.appendChild(i);
    setTimeout(function () { if (i.parentNode) i.parentNode.removeChild(i); }, 2600);
  }
  function hpBar() {
    if (!Cbt.session()) return;
    var p = Cbt.session().pack, pct = Math.round(p.hp / p.hpMax * 100);
    $('#bHp').style.width = pct + '%'; $('#tHp').textContent = '體力 ' + p.hp;
    $('#hWho').textContent = save.name; $('#hDay').textContent = level ? ('第 ' + (level.num || 1) + ' 關　' + level.name) : '島嶼守備';
    $('#hRes').textContent = (cfg.difficulty.modes[save.diff] || {}).name || save.diff;
  }
  function objective(txt, x, z) {
    var chip = $('#objChip'), el = $('#objTxt');
    if (!txt) { chip.classList.remove('on'); W.setMarks([]); return; }
    el.textContent = txt; chip.classList.add('on');
    if (x != null) W.setMarks([{ x: x, z: z }]);
  }
  function fade(txt, ms, cb) {
    $('#fade').classList.add('on'); $('#fadeTxt').textContent = txt || ''; $('#fadeTxt').classList.toggle('on', !!txt);
    setTimeout(function () { $('#fade').classList.remove('on'); $('#fadeTxt').classList.remove('on'); if (cb) cb(); }, ms || 600);
  }

  /* ---------- 對話 ---------- */
  function hideDlg(keepLocked) {
    $('#dlg').hidden = true;
    if (keepLocked) return;
    document.body.classList.remove('talking');
    W.setMode('play');
  }
  function showLines(sceneId, onDone) {
    var sc = story.scenes[sceneId]; if (!sc) { onDone(); return; }
    var lines = (sc.lines || []).slice(), choices = sc.choices, i = 0;
    function render() {
      $('#dlg').hidden = false; document.body.classList.add('talking');
      if (W.setMode) W.setMode('talk');
      if (i < lines.length) {
        var ln = lines[i];
        if (ln.pause) {
          hideDlg(true);
          fade('', ln.pause, function () { i++; render(); });
          return;
        }
        $('#dName').textContent = ln.who || '';
        $('#dText').textContent = ln.text;
        $('#dBtns').innerHTML = '';
        var b = document.createElement('button'); b.className = 'primary'; b.textContent = i === lines.length - 1 && !choices ? '繼續' : '下一句';
        b.onclick = function () { Sfx.sfx('click'); i++; render(); };
        $('#dBtns').appendChild(b);
        if (auto) setTimeout(function () { if (b.parentNode) b.click(); }, sceneId === '_ending' ? 900 : 180);
        return;
      }
      if (choices && choices.length) {
        $('#dName').textContent = '';
        $('#dText').textContent = '選擇：';
        $('#dBtns').innerHTML = '';
        choices.forEach(function (c) {
          var b = document.createElement('button'); b.textContent = c.text;
          b.onclick = function () {
            Sfx.sfx('confirm');
            if (c.flag && ROUTE_FLAGS.indexOf(c.flag) >= 0) exclusiveFlags(ROUTE_FLAGS, c.flag);
            else if (c.flag && ANTENNA_FLAGS.indexOf(c.flag) >= 0) exclusiveFlags(ANTENNA_FLAGS, c.flag);
            else if (c.flag && CHAT_FLAGS.indexOf(c.flag) >= 0) { exclusiveFlags(CHAT_FLAGS, c.flag); playerO(); }
            else if (c.flag && AKAI_FLAGS.indexOf(c.flag) >= 0) exclusiveFlags(AKAI_FLAGS, c.flag);
            else if (c.flag && RIDGE_FLAGS.indexOf(c.flag) >= 0) exclusiveFlags(RIDGE_FLAGS, c.flag);
            else if (c.flag && SCOUT_FLAGS.indexOf(c.flag) >= 0) exclusiveFlags(SCOUT_FLAGS, c.flag);
            else if (c.flag && TUNNEL_FLAGS.indexOf(c.flag) >= 0) exclusiveFlags(TUNNEL_FLAGS, c.flag);
            else if (c.flag && CAPTIVE_FLAGS.indexOf(c.flag) >= 0) exclusiveFlags(CAPTIVE_FLAGS, c.flag);
            else if (c.flag && HQ_FLAGS.indexOf(c.flag) >= 0) exclusiveFlags(HQ_FLAGS, c.flag);
            else if (c.flag && BOSS_FLAGS.indexOf(c.flag) >= 0) exclusiveFlags(BOSS_FLAGS, c.flag);
            else if (c.flag) setFlag(c.flag, true);
            if (sceneId === 'captives_choice') {
              var react = (c.flag === 'isl_captives_left') ? (story.scenes.captives_leave && story.scenes.captives_leave.wang) : (story.scenes.rescue_captives && story.scenes.rescue_captives.wang);
              if (react) toast(react);
            }
            if (c.driver) exclusiveFlags(DRIVER_FLAGS, c.driver);
            if (c.clear) { save.flags[c.clear] = false; persist(); }
            hideDlg();
            if (c.next) { jumpTo(c.next); return; }
            onDone(c);
          };
          $('#dBtns').appendChild(b);
        });
        if (auto) {
          var pick = choices[0];
          if ((q.antenna === 'weak' || q.antenna === 'warehouse') && sceneId === 'antenna_choice') pick = choices[1] || pick;
          if ((q.antenna === 'bunker' || q.antenna === 'strong' || q.antenna === 'ridge') && sceneId === 'antenna_choice') pick = choices[0];
          if (q.route === 'sea' && sceneId === 'approach_choice') pick = choices[1] || pick;
          if (q.route === 'bike' && sceneId === 'approach_choice') pick = choices[2] || pick;
          if (q.route === 'front' && sceneId === 'approach_choice') pick = choices[0];
          if (q.route === 'stealth' && sceneId === 'approach_choice') pick = choices[3] || pick;
          if (q.akai === 'out' && (sceneId === 'driver_choice' || sceneId === 'driver_choice_missing')) pick = choices[choices.length - 1];
          if ((q.akai === 'with' || !q.akai) && (sceneId === 'driver_choice' || sceneId === 'driver_choice_missing')) pick = choices[0];
          if (q.driver === 'lin' && sceneId === 'driver_choice') pick = choices[1] || pick;
          if (q.ridge === 'bike' && (sceneId === 'ridge_approach' || sceneId === 'ridge_approach_missing')) pick = choices[1] || pick;
          if (q.ridge === 'trail' && (sceneId === 'ridge_approach' || sceneId === 'ridge_approach_missing')) pick = choices[2] || pick;
          if ((q.ridge === 'walk' || !q.ridge) && (sceneId === 'ridge_approach' || sceneId === 'ridge_approach_missing')) pick = choices[0];
          if (q.scout === 'kill' && sceneId === 'scout_choice') pick = choices[0];
          if (q.scout === 'bind' && sceneId === 'scout_choice') pick = choices[1] || pick;
          if ((q.scout === 'spare' || !q.scout) && sceneId === 'scout_choice') pick = choices[2] || pick;
          if (sceneId === 'tunnel_choice') {
            if (q.tunnel === 'rail') pick = choices[2] || pick;
            else if (q.tunnel === 'jeep') pick = choices[3] || pick;
            else if (q.tunnel === 'stealth') pick = choices[0];
            else pick = choices[1] || pick;
          }
          if (sceneId === 'boat_chat') {
            if (q.chat === 'wang') pick = choices[2] || pick;
            else if (q.chat === 'quiet') pick = choices[1] || pick;
          }
          if (sceneId === 'captives_choice') {
            var leaveCap = q.captive === 'leave' || q.ending === 'silent' || q.ending === 'silent_b';
            pick = leaveCap ? (choices[1] || pick) : choices[0];
          }
          if (sceneId === 'hq_choice') {
            if (q.hq === 'jeep') pick = choices[1] || pick;
            else if (q.hq === 'stealth') pick = choices[2] || pick;
            else if (q.hq === 'dmr') pick = choices[3] || pick;
            else pick = choices[0];
          }
          if (sceneId === 'commander_choice') {
            var killBoss = q.boss === 'kill' || q.ending === 'silent' || q.ending === 'silent_b' || q.ending === 'nameless';
            pick = killBoss ? (choices[1] || pick) : choices[0];
          }
          setTimeout(function () { pick && $('#dBtns').querySelectorAll('button')[choices.indexOf(pick)].click(); }, 200);
        }
        return;
      }
      hideDlg(); onDone();
    }
    render();
  }

  function pickStory(sid) {
    if (!sid) return sid;
    var linDown = fateOf('lin') === 'kia';
    var akaiOut = hasFlag('isl_akai_outside');
    var weak = hasFlag('isl_radio_weak');
    if (sid === 'jeep_foreshadow') return linDown ? 'jeep_foreshadow_missing' : sid;
    if (sid === 'assault_start') return linDown ? 'assault_start_missing' : sid;
    if (sid === 'jeep_shop') return linDown ? 'jeep_shop_missing' : sid;
    if (sid === 'driver_choice') return linDown ? 'driver_choice_missing' : sid;
    if (sid === 'akai_outside_hint') return linDown ? 'akai_outside_hint_missing' : sid;
    if (sid === 'vehicle_jeep') {
      if (hasFlag('isl_jeep_driver_lin')) return 'vehicle_jeep_lin';
      if (hasFlag('isl_jeep_driver_player')) return 'vehicle_jeep_self';
      return 'vehicle_jeep';
    }
    if (sid === 'radar_door') {
      if (linDown) return (weak && story.scenes.radar_door_missing_weak) ? 'radar_door_missing_weak' : 'radar_door_missing';
      return (weak && story.scenes.radar_door_weak) ? 'radar_door_weak' : sid;
    }
    if (sid === 'power_hint') return linDown && story.scenes.power_hint_missing ? 'power_hint_missing' : sid;
    if (sid === 'rusher_warn') return linDown ? 'rusher_warn_missing' : sid;
    if (sid === 'dark_talk') {
      if (akaiOut) return linDown ? 'dark_talk_outside_missing' : 'dark_talk_outside';
      return linDown ? 'dark_talk_missing' : 'dark_talk';
    }
    if (sid === 'radar_complete') {
      var late = hasFlag('isl_power_restored_late') && !hasFlag('isl_power_restored');
      var lit = hasFlag('isl_power_restored');
      if (late) {
        if (akaiOut) return (weak && story.scenes.radar_complete_late_outside_weak) ? 'radar_complete_late_outside_weak' : 'radar_complete_late_outside';
        return 'radar_complete_late';
      }
      if (akaiOut) {
        if (lit) return (weak && story.scenes.radar_complete_outside_weak) ? 'radar_complete_outside_weak' : 'radar_complete_outside';
        return 'radar_complete_outside_dark';
      }
      return lit ? 'radar_complete' : 'radar_complete_dark';
    }
    if (sid === 'ridge_rest') {
      if (linDown && fateOf('akai') === 'kia') return 'ridge_rest_alone';
      if (linDown) return 'ridge_rest_missing';
      if (fateOf('akai') === 'kia') return 'ridge_rest_quiet';
      return sid;
    }
    if (sid === 'ridge_approach') return linDown ? 'ridge_approach_missing' : sid;
    if (sid === 'vehicle_ridge') return linDown ? 'vehicle_ridge_missing' : sid;
    if (sid === 'ridge_fight') return weak && story.scenes.ridge_fight_weak ? 'ridge_fight_weak' : sid;
    if (sid === 'outpost_roster') return linDown ? 'outpost_roster_missing' : sid;
    if (sid === 'ridge_outro_walk') {
      if (hasFlag('isl_bike_dash')) return linDown ? 'ridge_outro_bike_missing' : 'ridge_outro_bike';
      return 'ridge_outro_walk';
    }
    if (sid === 'tunnel_mouth') {
      if (linDown && fateOf('akai') === 'kia') return 'tunnel_mouth_alone';
      if (linDown) return 'tunnel_mouth_missing';
      if (fateOf('akai') === 'kia') return 'tunnel_mouth_quiet';
      return sid;
    }
    if (sid === 'tunnel_fight') return hasFlag('isl_tunnel_stealth') && story.scenes.tunnel_fight_stealth ? 'tunnel_fight_stealth' : sid;
    if (sid === 'wang_found') {
      if (hasFlag('isl_chat_wang') && story.scenes.wang_found_personal) return 'wang_found_personal';
      return linDown ? 'wang_found_missing' : sid;
    }
    if (sid === 'vehicle_rail') {
      if (fateOf('akai') === 'kia') return 'vehicle_rail_akai_kia';
      return linDown ? 'vehicle_rail_missing' : sid;
    }
    if (sid === 'vehicle_tunnel_jeep') {
      if (fateOf('akai') === 'kia') return 'vehicle_tunnel_jeep_akai_kia';
      return sid;
    }
    if (sid === 'tunnel_outro') {
      if (fateOf('wang') !== 'kia' && fateOf('wang') !== 'alive') chapterFate('wang', 'op4_tunnel');
      if (fateOf('wang') === 'kia') return 'tunnel_outro_kia';
      if (fateOf('akai') === 'kia') return 'tunnel_outro_akai_kia';
      if (hasFlag('isl_rail_escape')) return 'tunnel_outro_rail';
      if (hasFlag('isl_tunnel_jeep')) return 'tunnel_outro';
      return 'tunnel_outro_walk';
    }
    if (sid === 'hq_camp') {
      var wangK = fateOf('wang') === 'kia', akaiK = fateOf('akai') === 'kia';
      var picked;
      if (wangK && akaiK && linDown) picked = 'hq_camp_alone';
      else if (wangK && akaiK) picked = 'hq_camp_lin_only';
      else if (wangK && linDown) picked = 'hq_camp_akai_only';
      else if (akaiK && linDown) picked = 'hq_camp_wang_only';
      else if (wangK) picked = 'hq_camp_nowang';
      else if (akaiK) picked = 'hq_camp_quiet';
      else if (linDown) picked = 'hq_camp_missing';
      else picked = sid;
      save._hqCamp = picked; persist();
      return picked;
    }
    if (sid === 'hq_brief') return weak ? 'hq_brief_weak' : sid;
    return sid;
  }
  function currentBeat() { return level.beats[beatI]; }
  function jumpTo(id) {
    var i; for (i = 0; i < level.beats.length; i++) if (level.beats[i].id === id) { beatI = i; runBeat(); return; }
    nextBeat();
  }
  function nextBeat() { beatI++; runBeat(); }
  function markCheckpoint(b) {
    if (!b || !b.checkpoint) return;
    save.checkpoint = b.id; save.beat = beatI; save.level = level.id;
    if (Cbt.session()) save.loadout = JSON.parse(JSON.stringify(Cbt.session().pack));
    persist(); Sfx.sfx('save');
  }

  function runBeat() {
    var b = currentBeat();
    if (!b) { showCompleteCard(); return; }
    save.beat = beatI; persist();
    if (b.ifFlag && !hasFlag(b.ifFlag)) { nextBeat(); return; }
    if (b.unlessFlag && hasFlag(b.unlessFlag)) { nextBeat(); return; }
    if (auto && q.power === '0' && (b.kind === 'power_late' || b.id === 'restore_power_late')) { nextBeat(); return; }
    if (b.checkpoint) markCheckpoint(b);
    if (b.place) W.place(b.place[0], b.place[1]);
    if (b.type === 'talk' || b.type === 'choice') {
      if (b.story === 'scout_choice' && W.showNpc) W.showNpc('npc_scout_wounded', true);
      if (b.story === 'wang_found' && W.showNpc) W.showNpc('npc_sgt_wang', true);
      if (b.story === 'commander_choice' && !canCapture()) {
        exclusiveFlags(BOSS_FLAGS, 'isl_commander_killed');
        save._bossForced = true; persist();
        showLines('commander_choice_forced', function () { nextBeat(); });
        return;
      }
      var sid = pickStory(b.story);
      showLines(sid, function () { nextBeat(); });
    } else if (b.type === 'wait') {
      fade('', b.ms || 1500, function () { nextBeat(); });
    } else if (b.type === 'tutorial') startTutorial(b);
    else if (b.type === 'interact') startInteract(b);
    else if (b.type === 'vehicle') startVehicle(b);
    else if (b.type === 'combat') startCombat(b);
    else if (b.type === 'carry') startCarry(b);
    else if (b.type === 'rescue') startRescue(b);
    else if (b.type === 'complete') finishLevel(b);
    else nextBeat();
  }

  /* ---------- 教學 ---------- */
  function startTutorial(b) {
    var sc = story.scenes[b.hint] || {};
    $('#fpsHint').textContent = sc.hint || '';
    objective(sc.hint, b.mark && b.mark[0], b.mark && b.mark[1]);
    if (b.goal === 'crouch_cover') {
      Cbt.enableDummies(false);
      W.setInteract([]);
      var done = false;
      W.cb._tut = function () {
        if (done) return;
        var p = W.pos(), c = W.nearestCover(p.x, p.z, 1.4);
        if (c && W.S.crouch) {
          done = true; W.cb._tut = null; toast(sc.done || '好。'); Sfx.sfx('confirm');
          setTimeout(nextBeat, 700);
        }
      };
      if (auto) setTimeout(function () {
        if (b.mark) W.place(b.mark[0], b.mark[1]);
        W.setCrouch(true); if (W.cb._tut) W.cb._tut();
      }, 400);
    } else if (b.goal === 'hit_dummy') {
      Cbt.enableDummies(true);
      var hits = 0;
      HHooks.onDummy = function () {
        hits++;
        if (hits >= 1) { toast(sc.done || '彈著點有了。'); Cbt.enableDummies(false); HHooks.onDummy = null; setTimeout(nextBeat, 600); }
      };
      if (auto) setTimeout(function () { if (HHooks.onDummy) HHooks.onDummy(); }, 500);
    }
  }

  /* ---------- 天線 ---------- */
  function startInteract(b) {
    if (b.kind === 'power' || b.kind === 'power_late' || b.kind === 't75' || b.kind === 't65') {
      var sc = story.scenes[b.story] || {};
      objective(sc.hint || b.label, b.x, b.z);
      $('#fpsHint').textContent = sc.hint || b.label;
      W.setInteract([{ id: b.kind, x: b.x, z: b.z, r: 2.6, label: b.label, hold: b.holdMs || 2000 }]);
      HHooks.pendingHold = function () {
        W.setInteract([]);
        if (b.kind === 'power') {
          setFlag(b.setFlag || 'isl_power_restored');
          if (W.setPower) W.setPower(true);
          toast('電來了。整層亮了。');
        }
        if (b.kind === 'power_late') {
          setFlag('isl_power_restored_late');
          if (W.setPower) W.setPower(true);
          toast('電來了。這是打完才開的。');
        }
        if (b.kind === 't75' && Cbt.unlockT75) { Cbt.unlockT75(); save.hasT75 = true; persist(); }
        if (b.kind === 't65' && Cbt.unlockDmr) { Cbt.unlockDmr(); save.hasT65 = true; persist(); }
        var lines = sc.done || [{ who: '', text: '好。' }];
        if (b.kind === 't75' && hasFlag('isl_akai_outside') && sc.done_outside) lines = sc.done_outside;
        if (fateOf('lin') === 'kia' && sc.done_missing) lines = sc.done_missing;
        story.scenes._hold_done = { lines: lines };
        showLines('_hold_done', function () { nextBeat(); });
      };
      if (auto) setTimeout(function () { W.place(b.x, b.z); startHold(b.label, 400); }, 280);
      return;
    }
    var flag = hasFlag('isl_radio_strong') ? 'isl_radio_strong' : 'isl_radio_weak';
    if (!hasFlag('isl_radio_strong') && !hasFlag('isl_radio_weak')) flag = 'isl_radio_strong';
    var site = b.sites[flag];
    var scA = story.scenes.plant_antenna;
    var hint = flag === 'isl_radio_strong' ? scA.hintStrong : scA.hintWeak;
    objective(hint, site.x, site.z);
    $('#fpsHint').textContent = hint;
    W.setInteract([{ id: 'antenna', x: site.x, z: site.z, r: 2.4, label: b.label || '架設天線', hold: b.holdMs || 2000 }]);
    HHooks.pendingHold = function () {
      W.showAntenna(site.mast || (flag === 'isl_radio_strong' ? 'bunker' : 'ridge'));
      W.setInteract([]);
      var doneId = flag === 'isl_radio_strong' ? 'doneStrong' : 'doneWeak';
      var tmp = { lines: scA[doneId] || scA.doneStrong };
      story.scenes._plant_done = tmp;
      showLines('_plant_done', function () { nextBeat(); });
    };
    if (auto) setTimeout(function () { W.place(site.x, site.z); startHold(b.label, b.holdMs || 400); }, 300);
  }

  function startHold(label, ms) {
    if (holdT) return;
    $('#hold').hidden = false; $('#holdTx').textContent = label || '互動…';
    var t0 = performance.now();
    function tick() {
      var k = Math.min(1, (performance.now() - t0) / ms);
      $('#holdBar').style.width = (k * 100) + '%';
      if (k >= 1) { $('#hold').hidden = true; holdT = null; if (HHooks.pendingHold) HHooks.pendingHold(); }
      else holdT = requestAnimationFrame(tick);
    }
    holdT = requestAnimationFrame(tick);
  }
  function cancelHold() { if (holdT) { cancelAnimationFrame(holdT); holdT = null; } $('#hold').hidden = true; }

  /* ---------- 載具 ---------- */
  var rideWatch = null, pendingRide = null;
  function tickSampanRisk(dt, route) {
    if (!route || route.vehicle !== 'sampan_west') return false;
    if (save._sampanWreck || !W.inVehicle()) {
      save._sampanWreck = false;
      rideWatch = null;
      if (pendingRide) armRide(pendingRide.route, pendingRide.sc);
      return true;
    }
    return false;
  }
  function jeepChatterLines(sc) {
    var lines = ((sc && sc.chatter) || []).slice();
    if (sc && sc.chatterAkai && fateOf('akai') !== 'kia') lines.push(sc.chatterAkai);
    if (sc && sc.chatterLin && fateOf('lin') !== 'kia') lines.push(sc.chatterLin);
    return lines;
  }
  function armRide(route, sc) {
    HHooks.wantVehicle = route.vehicle;
    HHooks.onBoarded = function () {
      var lines = jeepChatterLines(sc), n = 0;
      save._jeepChat = lines.map(function (ln) { return (ln.who || '') + ':' + (ln.text || ''); });
      persist();
      function chat() {
        if (n < lines.length) { toast(lines[n].who + '：「' + lines[n].text + '」'); n++; setTimeout(chat, 3200); }
      }
      chat();
      var vNow = W.inVehicle();
      if (vNow && (vNow.type === 'rail_cart' || vNow.type === 'rail')) {
        setFlag('isl_rail_escape');
        if (Cbt.beginNoise) Cbt.beginNoise();
        if (Cbt.alertAll) Cbt.alertAll();
        toast('軌道車太吵。整座坑道的人都警戒了。');
      }
      if (vNow && (vNow.type === 'bike' || vNow.type === 'motorcycle')) {
        save.engineAlerted = true; persist();
        if (Cbt.beginNoise) Cbt.beginNoise();
        if (level && level.id === 'op1_landing') {
          var bikePlan = assaultPlan();
          var bag = JSON.parse(JSON.stringify(bikePlan.enemies));
          var gather = takeBag(bag, Math.ceil(countBag(bag) / 2), ['scout', 'rifleman', 'rusher']);
          save._bikeGather = gather; persist();
          if (Cbt.spawnGather) Cbt.spawnGather(gather);
        }
      }
      rideWatch = function () {
        var p = W.pos();
        if (Math.hypot(p.x - route.land[0], p.z - route.land[1]) < 4.5) {
          rideWatch = null;
          if (!route.stay) { W.exitVehicle(); Cbt.refresh(); toast('到了。下車。'); }
          else toast('到了。可以下車，也可以繼續坐車。');
          nextBeat();
        }
      };
      if (route.scripted) {
        var wps = route.waypoints || [route.land], t0 = performance.now(), dur = (route.durationSec || 20) * 1000;
        if (auto) dur = Math.min(dur, 4000);
        rideWatch = function (dt) {
          if (tickSampanRisk(dt, route)) return;
          var u = Math.min(1, (performance.now() - t0) / dur), n = Math.max(1, wps.length - 1), f = u * n, i0 = Math.min(n - 1, Math.floor(f)), t = f - i0;
          var a = wps[i0], b2 = wps[i0 + 1] || a;
          W.S.px = a[0] + (b2[0] - a[0]) * t; W.S.pz = a[1] + (b2[1] - a[1]) * t;
          if (W.S.veh) { W.S.veh.x = W.S.px; W.S.veh.z = W.S.pz; W.S.veh.mesh.position.set(W.S.px, 0.05, W.S.pz); }
          if (u >= 1) {
            rideWatch = null;
            if (!route.stay) { W.exitVehicle(); W.place(route.land[0], route.land[1]); }
            else { W.place(route.land[0], route.land[1]); }
            nextBeat();
          }
        };
      } else if (auto) {
        var wp = route.waypoints || [route.land], wi = 0;
        rideWatch = function () {
          var p = W.pos(), t = wp[Math.min(wi, wp.length - 1)];
          var dx = t[0] - p.x, dz = t[1] - p.z, d = Math.hypot(dx, dz);
          if (d < 3) wi++;
          if (wi >= wp.length || Math.hypot(p.x - route.land[0], p.z - route.land[1]) < 5) {
            rideWatch = null;
            if (!route.stay) W.exitVehicle();
            W.place(route.land[0], route.land[1]); nextBeat(); return;
          }
          W.S.yaw = Math.atan2(-dx, -dz);
          if (W.S.veh) W.S.veh.yaw = W.S.yaw;
          W.S.px += -Math.sin(W.S.yaw) * 14 * 0.016;
          W.S.pz += -Math.cos(W.S.yaw) * 14 * 0.016;
        };
        setTimeout(function () {
          if (!rideWatch) return;
          rideWatch = null;
          if (!route.stay) W.exitVehicle();
          W.place(route.land[0], route.land[1]); nextBeat();
        }, 14000);
      }
    };
  }
  function startVehicle(b) {
    var flag = null;
    Object.keys(b.routes || {}).forEach(function (k) {
      if (!flag && (k === 'default' || hasFlag(k))) flag = k;
    });
    if (!flag || !b.routes[flag]) flag = b.routes && b.routes.default ? 'default' : flag;
    if (!flag || !b.routes[flag]) { nextBeat(); return; }
    if (b.flag) setFlag(b.flag);
    if (flag === 'isl_tunnel_jeep') setFlag('isl_jeep_convoy');
    var route = b.routes[flag];
    var sc = story.scenes[pickStory(route.story)] || story.scenes[route.story];
    objective(sc.hint, null, null);
    var v = W.vehicleById(route.vehicle);
    if (v) { objective(sc.hint, v.x, v.z); W.setMarks([{ x: v.x, z: v.z }, { x: route.land[0], z: route.land[1], color: '#92c47a' }]); }
    $('#fpsHint').textContent = sc.hint;
    pendingRide = { route: route, sc: sc };
    armRide(route, sc);
    if (auto && v) {
      setTimeout(function () { W.place(v.x, v.z); boardVehicle(v); }, 250);
      setTimeout(function () {
        if (W.inVehicle()) return;
        W.place(v.x, v.z); boardVehicle(v);
        if (!W.inVehicle() && !rideWatch) { W.place(route.land[0], route.land[1]); nextBeat(); }
      }, 1400);
    }
  }
  function boardVehicle(v) {
    if (!v) v = W.nearestVehicle(W.pos().x, W.pos().z, 3.2);
    if (W.inVehicle()) {
      if (W.inVehicle() === v) { W.exitVehicle(); Cbt.refresh(); return; }
      W.exitVehicle();
    }
    if (!v) { Cbt.msg('附近沒有載具', 1200); return; }
    if (HHooks.wantVehicle && v.id !== HHooks.wantVehicle) { Cbt.msg('這不是這次要坐的', 1400); return; }
    W.enterVehicle(v); Cbt.refresh(); Sfx.sfx('confirm');
    if ((v.type === 'bike' || v.type === 'motorcycle') && Cbt.forceWeap) Cbt.forceWeap('m9');
    if (v.type === 'cart' && Cbt.session() && Cbt.session().carrying) { Cbt.msg('背著人不能推車', 1400); W.exitVehicle(); Cbt.refresh(); return; }
    if (HHooks.onBoarded) { var fn = HHooks.onBoarded; HHooks.onBoarded = null; fn(); }
  }

  /* ---------- 戰鬥 ---------- */
  function startCombat(b) {
    var sid = pickStory(b.story || 'assault_start');
    showLines(sid, function () {
      var p = W.pos(), linPos = { x: p.x + 2.2, z: p.z + 1.4 };
      if (fateOf('lin') === 'kia') W.showNpc('npc_signal_lin', false);
      else if (W.npc('npc_signal_lin')) W.moveNpc('npc_signal_lin', linPos.x, linPos.z);
      if (hasFlag('isl_akai_outside')) W.showNpc('npc_akai', false);
      if (b.blackout && W.setBlackout) W.setBlackout(true);
      var wave = b.wave, plan;
      if (level && level.id === 'op1_landing') plan = assaultPlan();
      else if (level && level.id === 'op4_tunnel' && wave.id === 'tunnel' && hasFlag('isl_tunnel_stealth') && wave.stealthEnemies) {
        plan = { enemies: JSON.parse(JSON.stringify(wave.stealthEnemies)), stealth: true };
      } else if (level && level.id === 'op5_hq' && hasFlag('isl_hq_stealth') && wave.stealthEnemies) {
        plan = { enemies: JSON.parse(JSON.stringify(wave.stealthEnemies)), stealth: true };
      } else {
        plan = { enemies: JSON.parse(JSON.stringify((hasFlag('isl_ridge_trail') && wave.trailEnemies) || wave.enemies || {})) };
      }
      if (level && level.id === 'op4_tunnel' && hasFlag('isl_rail_escape')) plan.noise = true;
      Cbt.startWave({
        id: wave.id, name: wave.name, enemies: plan.enemies, grace: wave.grace,
        stealth: !!plan.stealth, reinforce: plan.reinforce || wave.reinforce, keep: !!plan.keep, noise: !!plan.noise,
        lin: fateOf('lin') === 'kia' || !W.npc('npc_signal_lin') ? null : { hp: 80, x: linPos.x, z: linPos.z },
        buddyGunner: !!(W.inVehicle() && W.inVehicle().type === 'jeep' && !hasFlag('isl_akai_outside') && (fateOf('akai') !== 'kia' || fateOf('lin') === 'alive')),
        placed: wave.placed || b.placed
      });
      if (b.optionalPower) {
        W.setInteract([{ id: 'power', x: b.optionalPower.x, z: b.optionalPower.z, r: 2.6, label: b.optionalPower.label || '復電', hold: b.optionalPower.holdMs || 3000 }]);
        HHooks.pendingHold = function () {
          W.setInteract([]);
          setFlag('isl_power_restored');
          if (W.setPower) W.setPower(true);
          var scP = story.scenes.restore_power || {};
          var lines = fateOf('lin') === 'kia' && scP.done_missing ? scP.done_missing : (scP.done || [{ who: '黃連長', text: '記下。' }]);
          var ti = 0;
          function bark() {
            if (ti >= lines.length) return;
            toast(lines[ti].who + '：「' + lines[ti].text + '」');
            ti++;
            if (ti < lines.length) setTimeout(bark, 1600);
          }
          bark();
        };
        var hintSc = story.scenes[pickStory('power_hint')] || story.scenes.power_hint;
        if (hintSc && hintSc.toast) setTimeout(function () { toast(hintSc.toast); }, auto ? 400 : 10000);
        if (auto && q.power !== '0' && q.power !== 'late') setTimeout(function () { W.place(b.optionalPower.x, b.optionalPower.z); startHold(b.optionalPower.label || '復電', 400); }, 700);
      }
      HHooks._rushed = false;
      HHooks.onRusher = function () {
        if (HHooks._rushed || !b.blackout) return;
        HHooks._rushed = true;
        var rsc = story.scenes[pickStory('rusher_warn')] || story.scenes.rusher_warn;
        if (rsc && rsc.toast) toast(rsc.toast);
      };
      if (plan.ammo) {
        W.setInteract([{ id: 'ammo', x: plan.ammo.x, z: plan.ammo.z, r: 2.2, label: '彈藥箱', hold: 900 }]);
        HHooks.pendingHold = function () {
          W.setInteract([]);
          if (Cbt.giveAmmo) Cbt.giveAmmo(2);
        };
      }
      if (auto) {
        Cbt.bot = 'aim';
        if (b.blackout && W.setFlashlight) W.setFlashlight(true);
        setTimeout(function () {
          var s = Cbt.session();
          if (!s || !s.combat || s.ended) return;
          s.queue = [];
          s.enemies.forEach(function (e) { e.state = 'dead'; e.hp = 0; });
          s.killed = s.total;
        }, 18000);
      }
      objective(b.wave && b.wave.name ? ('清空' + b.wave.name) : '清空敵人', p.x, p.z - 8);
      if (q.down === '1' && !save._downTest) {
        save._downTest = 1;
        setTimeout(function () { if (Cbt.session()) { Cbt.session().pack.hp = 0; HHooks.onDown(); } }, 800);
      }
    });
  }

  /* ---------- 背人 ---------- */
  function startCarry(b) {
    var sc = story.scenes[b.story] || story.scenes.carry_hint || story.scenes.carry_wang;
    var dest = b.to;
    if (b.toByFlag) {
      Object.keys(b.toByFlag).forEach(function (k) { if (hasFlag(k)) dest = b.toByFlag[k]; });
    }
    HHooks.carryNpc = b.npc || 'npc_wounded';
    if (HHooks.carryNpc === 'npc_wounded') W.addTempNpc('npc_wounded', 'wounded', b.from[0], b.from[1], '傷患');
    else if (W.showNpc) W.showNpc(HHooks.carryNpc, true);
    objective((sc && sc.hint) || '背起傷患', b.from[0], b.from[1]);
    W.setMarks([{ x: b.from[0], z: b.from[1] }, { x: dest[0], z: dest[1], color: '#92c47a' }]);
    HHooks.carryFrom = b.from; HHooks.carryTo = dest;
    HHooks.carryOn = false;
    if (auto) setTimeout(function () { W.place(b.from[0], b.from[1]); doCarry(); setTimeout(function () { W.place(dest[0], dest[1]); doCarry(); }, 400); }, 300);
  }
  function doCarry() {
    var p = W.pos();
    if (!HHooks.carryOn) {
      if (!HHooks.carryFrom || Math.hypot(p.x - HHooks.carryFrom[0], p.z - HHooks.carryFrom[1]) > 2.8) { Cbt.msg('靠近傷患再背', 1200); return; }
      HHooks.carryOn = true; Cbt.setCarrying(true); W.showNpc(HHooks.carryNpc || 'npc_wounded', false);
      save._usedCarrySmoke = true; persist();
      objective((story.scenes.carry_wang && story.scenes.carry_wang.hint) || story.scenes.carry_hint.hint, HHooks.carryTo[0], HHooks.carryTo[1]);
      toast('背起來了。不能瞄準。煙霧會擋準頭。');
    } else {
      if (Math.hypot(p.x - HHooks.carryTo[0], p.z - HHooks.carryTo[1]) > 3) { Cbt.msg('送到發光的集結點', 1200); return; }
      Cbt.setCarrying(false);
      if (HHooks.carryNpc === 'npc_sgt_wang') setFlag('isl_wang_rescued');
      toast((story.scenes.carry_wang && story.scenes.carry_wang.done) || story.scenes.carry_hint.done);
      HHooks.carryFrom = null; nextBeat();
    }
  }

  function startRescue(b) {
    var sc = story.scenes[b.story] || story.scenes.rescue_captives || {};
    var pts = (b.points || []).slice();
    var i = 0;
    function armOne() {
      if (i >= pts.length) {
        setFlag('isl_captives_rescued');
        save.flags.isl_captives_left = false; persist();
        toast(sc.done || '三個人都站起來了。');
        nextBeat();
        return;
      }
      var p = pts[i];
      if (W.showNpc) W.showNpc(p.id, true);
      objective(sc.hint || '解開被俘守軍', p.x, p.z);
      W.setInteract([{ id: 'captive', x: p.x, z: p.z, r: 2.4, label: '解開', hold: b.holdMs || 3000 }]);
      HHooks.pendingHold = function () {
        W.setInteract([]);
        if (W.showNpc) W.showNpc(p.id, false);
        i++;
        armOne();
      };
      if (auto) setTimeout(function () { W.place(p.x, p.z); startHold('解開', 400); }, 220);
    }
    armOne();
  }

  function canCapture() {
    return !hasFlag('isl_killed_scout') || hasFlag('isl_radio_strong');
  }
  function kiaCount() {
    var n = 0;
    if (fateOf('wang') === 'kia') n++;
    if (fateOf('akai') === 'kia') n++;
    if (fateOf('lin') === 'kia') n++;
    return n;
  }
  function pickEnding() {
    var kiaN = kiaCount();
    var wangOk = (hasFlag('isl_wang_rescued') || hasFlag('isl_key_captive_rescued')) && fateOf('wang') !== 'kia';
    if (wangOk && hasFlag('isl_captives_rescued') && fateOf('akai') !== 'kia' && fateOf('lin') !== 'kia' && hasFlag('isl_commander_captured')) return 'island_guard';
    if (kiaN >= 2 || (hasFlag('isl_captives_left') && hasFlag('isl_commander_killed'))) return 'silent_island';
    return 'nameless_line';
  }
  function buildEndingScene() {
    var end = save.ending || pickEnding();
    var linK = fateOf('lin') === 'kia', akaiK = fateOf('akai') === 'kia', wangK = fateOf('wang') === 'kia';
    var kiaN = (linK ? 1 : 0) + (akaiK ? 1 : 0) + (wangK ? 1 : 0);
    var lines = [], variant = end;
    function add(who, text) { lines.push({ who: who || '', text: text }); }
    function addKiaMemorial() {
      if (linK) { lines.push({ pause: 1500 }); add('黃連長', '小林，南灘通信。位置我收到了。'); }
      if (akaiK) { lines.push({ pause: 1500 }); add('黃連長', '阿凱，保險業務。他守的那一段，沒有人退。'); }
      if (wangK) { lines.push({ pause: 1500 }); add('黃連長', '王班長。方子豪的班長。'); }
    }
    if (end === 'island_guard') {
      add('黃連長', '回來就好。');
      add('王班長', '便當。我說話算話。');
      add('阿凱', '班長，你終於——');
      add('小林', '天線我收好了。');
      if (hasFlag('isl_chat_wang')) {
        add('王班長', '你那時候說，你是來找人的。');
        add('王班長', '……找到了？');
        lines.push({ pause: 1500 });
        add('王班長', '那就回家去。');
        variant = 'island_guard_wangchat';
      }
      add('黃連長', '指揮官在第二艘船上。沒說話。被俘的人，名單都對上了。');
      lines.push({ pause: 1200 });
      add('', '隔天，水電行。');
      add('客人', '老闆，抽水馬達又壞了。……你是不是那個去過島上的？');
      add('方子豪', '軸承，我看一下。');
    } else if (end === 'silent_island' && kiaN >= 2) {
      /* A 優先：同袍死兩人以上時，即使同時留下俘虜並擊斃指揮官，也不播 B 版。 */
      variant = 'silent_a';
      add('黃連長', '名單我會親自簽。');
      addKiaMemorial();
      add('電台', '……');
    } else if (end === 'silent_island') {
      variant = 'silent_b';
      add('黃連長', '坑道裡還有三個名字。我也會簽。');
      if (kiaN === 1) addKiaMemorial();
      add('黃連長', '指揮官死了，地圖上的據點都還在。這不是勝利，只是結束。');
      add('電台', '……');
    } else {
      if (kiaN === 0) {
        if (hasFlag('isl_commander_captured')) {
          add('黃連長', '指揮官被帶走了。地圖上還有別的據點。');
          variant = 'nameless_captured';
        } else {
          add('黃連長', '指揮官倒下了。地圖上還有別的據點。');
          variant = 'nameless_none';
        }
      } else {
        add('黃連長', '名單上少一個名字，我會親自簽。');
        if (linK) { add('黃連長', '南灘通信，小林。'); variant = 'nameless_lin'; }
        if (akaiK) { add('黃連長', '阿凱。他說他還沒簽完那張保單。'); variant = 'nameless_akai'; }
        if (wangK) { add('黃連長', '班長。他帶過的人，今天站得很穩。'); variant = 'nameless_wang'; }
      }
      add('黃連長', '這一程結束了。下一程再說。');
      lines.push({ pause: 1200 });
      add('', '隔天，水電行。');
      add('電視', '離島防務順利恢復。');
      add('', '他關掉電視，沒有說話。');
    }
    save.endingVariant = variant;
    save.endingLines = lines.filter(function (ln) { return !ln.pause; }).map(function (ln) {
      return (ln.who || '') + ':' + (ln.text || '');
    });
    persist();
    story.scenes._ending = { lines: lines };
    return '_ending';
  }
  function evalStoryState(opts) {
    opts = opts || {};
    if (!save) save = freshSave(opts.name || '方子豪', 'story');
    save.companionFates = {
      wang: opts.wang || 'alive',
      akai: opts.akai || 'alive',
      lin: opts.lin || 'alive'
    };
    save.flags = {};
    var flags = opts.flags || {};
    Object.keys(flags).forEach(function (k) { save.flags[k] = flags[k]; });
    if (opts.wang === 'kia') { save.flags.isl_wang_kia = true; save.flags.isl_wang_rescued = false; }
    else if (!save.flags.isl_wang_kia) save.flags.isl_wang_rescued = true;
    if (opts.akai === 'kia') save.flags.isl_akai_kia = true;
    if (opts.lin === 'kia') save.flags.isl_lin_kia = true;
    var camp = pickStory('hq_camp');
    save.ending = opts.ending || pickEnding();
    buildEndingScene();
    var campLines = ((story.scenes[camp] || {}).lines || []);
    var forced = ((story.scenes.commander_choice_forced || {}).lines || []);
    var hqChoice = ((story.scenes.hq_choice || {}).lines || []);
    return {
      camp: camp,
      campWho: campLines.map(function (l) { return l.who; }),
      campText: campLines.map(function (l) { return (l.who || '') + ':' + (l.text || ''); }),
      ending: save.ending,
      variant: save.endingVariant,
      lines: save.endingLines,
      canCapture: canCapture(),
      jeepChat: jeepChatterLines(story.scenes.vehicle_hq_jeep).map(function (l) {
        return (l.who || '') + ':' + (l.text || '');
      }),
      forced: forced.map(function (l) { return l.text; }),
      hqChoice: hqChoice.map(function (l) { return l.text; })
    };
  }
  function finishLevel(b) {
    setFlag(b.setFlag || (level.id === 'op5_hq' ? 'isl_05_clear' : (level.id === 'op4_tunnel' ? 'isl_04_clear' : (level.id === 'op3_ridge' ? 'isl_03_clear' : (level.id === 'op2_radar' ? 'isl_02_clear' : 'isl_01_clear')))));
    if (Cbt.session()) save.loadout = JSON.parse(JSON.stringify(Cbt.session().pack));
    var kiaNow = [];
    function rollNow(id) {
      if (!shouldRoll(id, level.id) || fateOf(id) === 'kia') return;
      if (id === 'wang' && (fateOf('wang') === 'alive' || (save.fateRolls && save.fateRolls['wang:op4_tunnel']))) return;
      var r = chapterFate(id, level.id);
      if (r === 'kia') kiaNow.push(id);
    }
    rollNow('lin');
    rollNow('akai');
    if (level.id !== 'op4_tunnel') rollNow('wang');
    if (level.id === 'op5_hq') {
      var end = pickEnding();
      save.ending = end;
      setFlag('isl_ending_' + end);
    }
    var next = catalog.levels.filter(function (l) { return l.num === (level.num || 1) + 1; })[0];
    if (next && !next.stub) {
      save.level = next.id; save.beat = 0;
      save.checkpoint = next.id === 'op5_hq' ? 'hq_camp' : (next.id === 'op4_tunnel' ? 'tunnel_mouth' : (next.id === 'op3_ridge' ? 'ridge_rest' : (next.id === 'op2_radar' ? 'jeep_shop' : next.id)));
      persist();
    }
    function afterRadio() {
      var doneStory = (level.id === 'op5_hq' && save.ending) ? buildEndingScene() : pickStory(b.story);
      showLines(doneStory || pickStory(b.story), function () { showCompleteCard(); });
    }
    if (kiaNow.length) playRollRadios(kiaNow, afterRadio);
    else afterRadio();
  }
  function showCompleteCard() {
    phase = 'done';
    objective('');
    var lin = fateOf('lin') === 'kia' ? '小林：陣亡（已鎖定）' : (fateOf('lin') === 'alive' ? '小林：生還' : '小林：尚未判定');
    var akai = fateOf('akai') === 'kia' ? '阿凱：陣亡（已鎖定）' : (fateOf('akai') === 'alive' ? '阿凱：生還' : (level.num >= 2 ? '阿凱：同行（尚未判定）' : '阿凱：尚未登場'));
    var wang = fateOf('wang') === 'kia' ? '王班長：陣亡（已鎖定）' : (fateOf('wang') === 'alive' ? '王班長：生還' : (level.num >= 4 ? '王班長：尚未判定' : '王班長：失聯'));
    $('#card').hidden = false;
    if (level.id === 'op5_hq') {
      var end = save.ending || pickEnding();
      var titles = { island_guard: '島嶼守衛', silent_island: '沉默的島', nameless_line: '無名防線' };
      var how5 = hasFlag('isl_jeep_charge') ? '吉普衝廣場' : hasFlag('isl_hq_stealth') ? '側門潛入' : hasFlag('isl_hq_dmr') ? '遠距壓制' : '正面強攻';
      var boss = hasFlag('isl_commander_captured') ? '指揮官：活捉' : '指揮官：擊斃';
      $('#cIn').innerHTML = '<p class="kicker">戰役結束</p><h2>' + (titles[end] || end) + '</h2><p>' + how5 + '。' + boss + '。</p><p>' + lin + '<br>' + akai + '<br>' + wang + '</p><div class="row"><button type="button" class="primary" id="toTitle">回標題</button></div>';
      $('#toTitle').onclick = function () { $('#card').hidden = true; showTitle(); };
      if (auto) { save._e2e = 'clear'; persist(); }
      return;
    }
    if (level.id === 'op4_tunnel') {
      var how4 = hasFlag('isl_rail_escape') ? '軌道車撤離' : hasFlag('isl_tunnel_jeep') ? '吉普車接應' : hasFlag('isl_tunnel_stealth') ? '潛入' : '強攻';
      var cap = hasFlag('isl_captives_rescued') ? '俘虜：全救' : '俘虜：留下';
      $('#cIn').innerHTML = '<p class="kicker">第 4 關完成</p><h2>坑道</h2><p>' + how4 + '。' + cap + '。</p><p>' + lin + '<br>' + akai + '<br>' + wang + '</p><p>第 5 關「島上指揮所」已解鎖。</p><div class="row"><button type="button" class="primary" id="go5">進入第 5 關</button><button type="button" id="toTitle">回標題</button></div>';
      $('#toTitle').onclick = function () { $('#card').hidden = true; showTitle(); };
      $('#go5').onclick = function () { $('#card').hidden = true; bootLevel('op5_hq', 0); };
      if (auto) {
        save._e2e = 'ch4'; persist();
        setTimeout(function () { var g = $('#go5'); if (g) g.click(); }, 280);
      }
      return;
    }
    if (level.id === 'op3_ridge') {
      var how3 = hasFlag('isl_bike_dash') ? '機車衝稜線' : hasFlag('isl_ridge_trail') ? '山腹小徑' : '岩石步行';
      var scout = hasFlag('isl_killed_scout') ? '斥候：補一槍' : '斥候：留下';
      $('#cIn').innerHTML = '<p class="kicker">第 3 關完成</p><h2>稜線哨所</h2><p>' + how3 + '。' + scout + '。</p><p>' + lin + '<br>' + akai + '<br>王班長：被俘（坑道）</p><p>第 4 關「坑道」已解鎖。</p><div class="row"><button type="button" class="primary" id="go4">進入第 4 關</button><button type="button" id="toTitle">回標題</button></div>';
      $('#toTitle').onclick = function () { $('#card').hidden = true; showTitle(); };
      $('#go4').onclick = function () { $('#card').hidden = true; bootLevel('op4_tunnel', 0); };
      if (auto) {
        save._e2e = 'ch3'; persist();
        setTimeout(function () { var g = $('#go4'); if (g) g.click(); }, 280);
      }
      return;
    }
    if (level.id === 'op2_radar') {
      var how = hasFlag('isl_power_restored') ? '復電強攻' : '摸黑';
      var who = hasFlag('isl_akai_outside') ? '阿凱留在車上接應' : '阿凱同行';
      $('#cIn').innerHTML = '<p class="kicker">第 2 關完成</p><h2>雷達站</h2><p>' + how + '。' + who + '。</p><p>' + lin + '<br>' + akai + '<br>王班長：失聯</p><p>第 3 關「稜線哨所」已解鎖。</p><div class="row"><button type="button" class="primary" id="go3">進入第 3 關</button><button type="button" id="toTitle">回標題</button></div>';
      $('#toTitle').onclick = function () { $('#card').hidden = true; showTitle(); };
      $('#go3').onclick = function () { $('#card').hidden = true; bootLevel('op3_ridge', 0); };
      if (auto) {
        save._e2e = 'ch2'; persist();
        setTimeout(function () { var g = $('#go3'); if (g) g.click(); }, 280);
      }
      return;
    }
    var ant = hasFlag('isl_radio_strong') ? '碉堡頂（訊號好）' : '倉庫後（訊號弱）';
    var flank = hasFlag('isl_flank_by_sea') ? '舢舨繞後' : hasFlag('isl_flank_by_bike') ? '機車側翼' : hasFlag('isl_stealth') ? '潛行' : '正面推進';
    $('#cIn').innerHTML = '<p class="kicker">第 1 關完成</p><h2>登陸灘頭</h2><p>天線在' + ant + '。打法：' + flank + '。</p><p>' + lin + '<br>阿凱：尚未登場<br>王班長：失聯</p><p>第 2 關「雷達站」已解鎖。</p><div class="row"><button type="button" class="primary" id="go2">進入第 2 關</button><button type="button" id="toTitle">回標題</button></div>';
    $('#toTitle').onclick = function () { $('#card').hidden = true; showTitle(); };
    $('#go2').onclick = function () { $('#card').hidden = true; bootLevel('op2_radar', 0); };
    if (auto) {
      save._e2e = 'ch1'; persist();
      setTimeout(function () { var g = $('#go2'); if (g) g.click(); }, 280);
    }
  }

  /* ---------- 倒下重試 ---------- */
  function onDown() {
    Cbt.stopWave();
    var sc = story.scenes.down;
    Sfx.sfx('radio');
    function card() {
      $('#card').hidden = false;
      $('#cIn').innerHTML = '<h2>' + sc.title + '</h2><p>' + (save.downSeen ? sc.retryHint : sc.text) + '</p><div class="row"><button type="button" class="primary" id="retryBtn">回到存檔點</button></div>';
      $('#retryBtn').onclick = function () { $('#card').hidden = true; retryCheckpoint(); };
      if (auto) setTimeout(function () { var b = $('#retryBtn'); if (b) b.click(); }, 200);
    }
    if (!save.downSeen) { save.downSeen = true; persist(); fade(sc.text, 1600, card); }
    else { toast(sc.retryHint); card(); }
  }
  function retryCheckpoint() {
    var id = save.checkpoint || 'boat_chat', i;
    beatI = 0;
    for (i = 0; i < level.beats.length; i++) if (level.beats[i].id === id) beatI = i;
    Cbt.restoreHp();
    if (save.loadout) {
      var p = Cbt.session().pack;
      p.t91 = save.loadout.t91; p.m9 = save.loadout.m9; p.nades = save.loadout.nades; p.medkits = save.loadout.medkits; p.hp = p.hpMax;
    }
    var b = currentBeat();
    if (b && b.place) W.place(b.place[0], b.place[1]);
    else if (b && b.id === 'vehicle_ride') {
      if (hasFlag('isl_flank_by_sea')) W.place(-38, -10);
      else if (hasFlag('isl_flank_by_bike')) W.place(28, 18);
    } else if (b && b.id === 'assault') {
      var land = landForRoute();
      W.place(land[0], land[1]);
    }
    toast(retryRadioLine());
    runBeat();
  }

  /* ---------- 標題 / 關卡 ---------- */
  function showTitle() {
    phase = 'title';
    W.setMode('title');
    $('#hud').hidden = true;
    var prev = readSave();
    var diffs = cfg.difficulty.modes;
    var opts = Object.keys(diffs).map(function (k) { return '<option value="' + k + '"' + (k === cfg.difficulty.default ? ' selected' : '') + '>' + diffs[k].name + '</option>'; }).join('');
    var lvBtns = catalog.levels.map(function (lv) {
      var opened = !lv.unlockFlag || (prev && prev.flags && prev.flags[lv.unlockFlag]);
      if (lv.num === 1) opened = true;
      var stub = lv.stub || !opened ? '<small>尚未開放（須依序）</small>' : '<small>' + lv.outpostName + '</small>';
      return '<button type="button" disabled>第 ' + lv.num + ' 關　' + lv.name + stub + '</button>';
    }).join('');
    $('#card').hidden = false;
    $('#cIn').innerHTML = '<p class="kicker">' + story.titleCard.kicker + '</p><h1>' + story.titleCard.name + '</h1><p>' + story.titleCard.blurb + '</p>' +
      '<label>姓名</label><input id="nm" maxlength="6" value="' + ((prev && prev.name) || '方子豪') + '">' +
      '<label>難度</label><select id="df">' + opts + '</select>' +
      '<label><input type="checkbox" id="co"' + ((prev && prev.carryOver) ? ' checked' : '') + '> 承接《阿兵哥日記》存檔（預設關閉）</label>' +
      '<div class="levels">' + lvBtns + '</div>' +
      '<div class="row">' + (prev ? '<button type="button" id="cont">繼續</button>' : '') + '<button type="button" class="primary" id="ng">新的戰役</button></div>' +
      '<p style="font-size:12px;margin-top:12px">關卡 1 到 5 依序。桌機 WASD、滑鼠瞄準、左鍵開火、C 蹲下、R 換彈、X 換座位。手機：左搖桿拖到底奔跑、右半邊拖視角、右下開火。</p>';
    $('#ng').onclick = function () { startNew($('#nm').value, $('#df').value, $('#co').checked); };
    var c = $('#cont'); if (c) c.onclick = function () { continueSave(prev); };
    if (auto) setTimeout(function () { startNew('方子豪', q.diff || 'hardcore', false); }, 250);
  }
  function startNew(name, diff, carryOver) {
    save = freshSave(name.trim() || '方子豪', diff);
    save.carryOver = !!carryOver;
    if (auto) save._e2eSkipGunner = true;
    persist();
    bootLevel('op1_landing', 0);
  }
  function continueSave(s) {
    save = ensureFates(s || {});
    var id = s.level || 'op1_landing';
    if (s.flags && s.flags.isl_04_clear && !s.flags.isl_05_clear && (id === 'op1_landing' || id === 'op2_radar' || id === 'op3_ridge' || id === 'op4_tunnel')) id = 'op5_hq';
    else if (s.flags && s.flags.isl_03_clear && !s.flags.isl_04_clear && (id === 'op1_landing' || id === 'op2_radar' || id === 'op3_ridge')) id = 'op4_tunnel';
    else if (s.flags && s.flags.isl_02_clear && !s.flags.isl_03_clear && (id === 'op1_landing' || id === 'op2_radar')) id = 'op3_ridge';
    else if (s.flags && s.flags.isl_01_clear && !s.flags.isl_02_clear && id === 'op1_landing') id = 'op2_radar';
    bootLevel(id, id === s.level ? (s.beat || 0) : 0);
  }
  function bootLevel(id, startBeat) {
    var meta = catalog.levels.filter(function (l) { return l.id === id; })[0];
    if (!meta || meta.stub) { toast(story.scenes.locked.text); return; }
    loadJson(meta.file).then(function (lv) {
      level = lv; level.num = meta.num;
      save.level = id; persist();
      W.loadLevel(lv, cfg);
      Cbt.begin(save.loadout || Cbt.newLoadout());
      Cbt.restoreHp();
      if (save.hasT75 && Cbt.unlockT75) Cbt.unlockT75(true);
      if (save.hasT65 && Cbt.unlockDmr) Cbt.unlockDmr(true);
      if (fateOf('lin') === 'kia') W.showNpc('npc_signal_lin', false);
      if (fateOf('akai') === 'kia') W.showNpc('npc_akai', false);
      if (id === 'op2_radar' && hasFlag('isl_akai_outside')) W.showNpc('npc_akai', false);
      if (W.npc && W.npc('npc_scout_wounded')) W.showNpc('npc_scout_wounded', false);
      if (W.npc && W.npc('npc_sgt_wang')) W.showNpc('npc_sgt_wang', id === 'op5_hq' && fateOf('wang') !== 'kia');
      if (id === 'op5_hq' && fateOf('wang') === 'kia' && W.showNpc) W.showNpc('npc_sgt_wang', false);
      ['npc_captive_1', 'npc_captive_2', 'npc_captive_3'].forEach(function (cid) {
        if (W.npc && W.npc(cid)) W.showNpc(cid, id === 'op4_tunnel');
      });
      document.body.classList.toggle('hardcore', save.diff === 'hardcore');
      document.body.classList.toggle('touch', W.isMobileLike());
      $('#hud').hidden = false; $('#card').hidden = true;
      W.setMode('play');
      beatI = startBeat || 0;
      phase = 'play';
      hpBar();
      bindPlay();
      runBeat();
    }).catch(function (e) { toast('關卡讀取失敗'); console.error(e); });
  }

  var HHooks = {};
  function bindPlay() {
    W.cb.onAim = function (dx, dy, type) { Cbt.onAim(dx, dy, type); };
    W.cb.onAds = function (v) { Cbt.setAds(v); };
    W.cb.onFireDown = function () { Cbt.fireDown(); };
    W.cb.onFireUp = function () { Cbt.fireUp(); };
    W.cb.onKey = function (code, down) { Cbt.onKey(code, down); };
    W.cb.onTick = function (dt) {
      Cbt.tick(dt);
      if (W.cb._tut) W.cb._tut();
      if (rideWatch) rideWatch(dt);
      hpBar();
    };
    W.cb.onVehWreck = function (v, dmg, reason) {
      if (Cbt.hurtPlayer) Cbt.hurtPlayer(dmg);
      if (reason === 'gunner') {
        if (W.resetVehicle) W.resetVehicle(v);
        if (Cbt.session()) { Cbt.session()._sampanHit = false; Cbt.session()._sampanT = 0; }
        W.place((v && v.homeX) || -38, (v && v.homeZ) || -10);
        save._sampanWreck = true;
        toast('機槍手發現了。落水。從碼頭再上。');
      } else if (v && v.type === 'jeep') toast('吉普車打爆了。車上的人被甩出來。');
      else toast('翻車。引擎聲停了。');
    };
    W.cb.onVehHp = function (v) {
      if (!v) return;
      toast((v.type === 'jeep' ? '吉普' : v.type === 'cart' ? '發電車' : (v.type === 'rail_cart' ? '軌道車' : '機車')) + '耐久 ' + Math.max(0, Math.round(v.hp)));
    };
    W.cb.onNear = function (it) {
      var act = $('#act');
      if (!it) { act.hidden = true; return; }
      act.hidden = false; act.textContent = it.label || '互動';
    };
    W.cb.onLost = function () { $('#lost').hidden = false; };
    W.cb.onRestored = function () { $('#lost').hidden = true; };
  }
  HHooks.onHp = hpBar;
  HHooks.onUsedMedkit = function () {
    save.usedMedkit = true; persist();
  };
  HHooks.onCarryHit = function () {
    if (!level || level.id !== 'op4_tunnel') return;
    save.wangHits = (save.wangHits || 0) + 1; persist();
  };
  HHooks.onSniperCall = function () {
    if (!level || level.id !== 'op3_ridge') return;
    if (save._ridgeCallout) return;
    save._ridgeCallout = true; persist();
    if (fateOf('lin') === 'kia' || hasFlag('isl_radio_weak')) return;
    var sc = story.scenes.ridge_callout;
    if (sc && sc.toast) toast(sc.toast);
  };
  HHooks.onFriendlyFire = function () {
    if (hasFlag('isl_friendly_fire')) return;
    setFlag('isl_friendly_fire');
    toast('誤傷友軍。');
  };
  HHooks.onDown = onDown;
  HHooks.onCover = function () { if (W.cb._tut) W.cb._tut(); };
  HHooks.onWaveClear = function () {
    Cbt.stopWave();
    W.setInteract([]);
    if (Cbt.session() && Cbt.session().lin && Cbt.session().lin.hp <= 0) chapterFate('lin', level && level.id, 'kia');
    playerO();
    if (level && (level.id === 'op2_radar' || level.id === 'op3_ridge' || level.id === 'op4_tunnel')) { nextBeat(); return; }
    if (fateOf('lin') === 'kia') {
      if (save._linRadio) { nextBeat(); return; }
      save._linRadio = true; persist();
      companionRadio('lin', pickCompanionRadio('lin'), function () { nextBeat(); });
    } else showLines('lin_live', function () { nextBeat(); });
  };
  HHooks.onLinDown = function () {
    if (save._linRadio) return;
    save._linRadio = true; persist();
    companionRadio('lin', pickCompanionRadio('lin'));
  };
  HHooks.onCompanionDown = function (id) {
    if (!id || fateOf(id) === 'kia') return;
    companionRadio(id, pickCompanionRadio(id));
  };
  HHooks.onVehicle = function () { boardVehicle(); };
  HHooks.onCarry = function () { if (HHooks.carryFrom) doCarry(); else Cbt.msg('現在沒有人能背', 1200); };
  HHooks.onInteract = function () {
    var n = W.near();
    if (n && n.hold) startHold(n.label, n.hold);
    else if (W.inVehicle() || W.nearestVehicle(W.pos().x, W.pos().z, 3)) boardVehicle();
  };
  HHooks.save = function () { return save; };

  $('#act').addEventListener('pointerdown', function (e) { e.preventDefault(); HHooks.onInteract(); });
  $('#act').addEventListener('pointerup', cancelHold);
  $('#btnMenu').onclick = function () { showTitle(); };
  $('#mute').onclick = function () {
    Sfx.setMuted(!Sfx.isMuted()); $('#mute').textContent = Sfx.isMuted() ? '音效關' : '音效開'; Sfx.sfx('click');
  };
  $('#glRetry').onclick = function () { location.reload(); };
  $('#mute').textContent = Sfx.isMuted() ? '音效關' : '音效開';

  function attachTestApi() {
    if (!testMode() || !root.__island) return;
    root.__island.evalStoryState = evalStoryState;
    root.__island.ensureFates = ensureFates;
    root.__island.continueSave = continueSave;
    root.__island.hideDlg = hideDlg;
    root.__island.pickStory = pickStory;
    root.__island.pickEnding = pickEnding;
    root.__island.buildEndingScene = buildEndingScene;
    root.__island.canCapture = canCapture;
  }
  function boot() {
    parseQuery();
    attachTestApi();
    KEY = (cfg && cfg.save && cfg.save.key) || 'island-save-0';
    var canvas = $('#gl');
    if (!root.THREE) { $('#glerr').hidden = false; return; }
    var ok = W.init(canvas, {});
    if (!ok) { $('#glerr').hidden = false; return; }
    Cbt.init(HHooks, cfg);
    document.addEventListener('pointerdown', function () { Sfx.ensure(); }, { once: true });
    showTitle();
  }

  Promise.all([
    loadJson('data/island-fps-system.json'),
    loadJson('data/fps-system.json'),
    loadJson('data/levels.json'),
    loadJson('data/story.json')
  ]).then(function (arr) {
    cfg = normalize(arr[0], arr[1]); catalog = arr[2]; story = arr[3];
    KEY = (cfg.save && cfg.save.key) || 'island-save-0';
    boot();
  }).catch(function (e) {
    console.error(e);
    $('#card').hidden = false;
    $('#cIn').innerHTML = '<h2>資料讀取失敗</h2><p>' + e.message + '</p>';
  });

  root.__island = {
    phase: function () { return phase; },
    save: function () { return save; },
    level: function () { return level; },
    beat: function () { return level && level.beats[beatI]; },
    cfg: function () { return cfg; },
    World: W, Combat: Cbt,
    startNew: function (n, d) { startNew(n, d); },
    nextBeat: nextBeat,
    jumpTo: jumpTo
  };
})(typeof self !== 'undefined' ? self : this);
