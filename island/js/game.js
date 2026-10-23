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
      return { id: id, name: name, dmg: w.dmg, rpm: w.rpm, magSize: w.mag, startMags: mags, reloadSec: w.reloadSec, range: w.range };
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
        t75: island.weapons.t75_lmg ? { id: 't75', name: 'T75 機槍', dmg: island.weapons.t75_lmg.dmg, rpm: island.weapons.t75_lmg.rpm, magSize: island.weapons.t75_lmg.mag, startMags: 1, reloadSec: island.weapons.t75_lmg.reloadSec, range: island.weapons.t75_lmg.range } : null,
        t65: island.weapons.t65k2_dmr ? { id: 't65', name: 'T65K2', dmg: island.weapons.t65k2_dmr.dmg, rpm: island.weapons.t65k2_dmr.rpm, magSize: island.weapons.t65k2_dmr.mag, startMags: 2, reloadSec: island.weapons.t65k2_dmr.reloadSec, range: island.weapons.t65k2_dmr.range } : null
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
      flags: {}, companionFates: { wang: 'absent', akai: 'absent', lin: 'absent' }, hp: cfg.health.hpMax, loadout: null,
      carryOver: false, downSeen: false, o: 50
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
  function fateOf(id) {
    var v = save.companionFates[id];
    return (!v || v === 'absent') ? null : v;
  }
  function lockFate(id, val) {
    var cur = save.companionFates[id];
    if (cur && cur !== 'absent') return cur;
    save.companionFates[id] = val; persist(); return val;
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
  function hideDlg() { $('#dlg').hidden = true; document.body.classList.remove('talking'); W.setMode('play'); }
  function showLines(sceneId, onDone) {
    var sc = story.scenes[sceneId]; if (!sc) { onDone(); return; }
    var lines = (sc.lines || []).slice(), choices = sc.choices, i = 0;
    function render() {
      $('#dlg').hidden = false; document.body.classList.add('talking');
      if (i < lines.length) {
        var ln = lines[i];
        $('#dName').textContent = ln.who || '';
        $('#dText').textContent = ln.text;
        $('#dBtns').innerHTML = '';
        var b = document.createElement('button'); b.className = 'primary'; b.textContent = i === lines.length - 1 && !choices ? '繼續' : '下一句';
        b.onclick = function () { Sfx.sfx('click'); i++; render(); };
        $('#dBtns').appendChild(b);
        if (auto) setTimeout(function () { if (b.parentNode) b.click(); }, 180);
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
            else if (c.flag) setFlag(c.flag, true);
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
    if (sid === 'radar_door') return linDown ? 'radar_door_missing' : (weak && story.scenes.radar_door_weak ? 'radar_door_weak' : sid);
    if (sid === 'power_hint') return linDown && story.scenes.power_hint_missing ? 'power_hint_missing' : sid;
    if (sid === 'rusher_warn') {
      if (akaiOut) return 'rusher_warn_outside';
      return linDown ? 'rusher_warn_missing' : sid;
    }
    if (sid === 'dark_talk') {
      if (akaiOut) return linDown ? 'dark_talk_outside_missing' : 'dark_talk_outside';
      return linDown ? 'dark_talk_missing' : 'dark_talk';
    }
    if (sid === 'dark_clear') {
      if (akaiOut) return 'dark_clear_outside';
      return linDown ? 'dark_clear_missing' : 'dark_clear';
    }
    if (sid === 'radar_complete') {
      var lit = hasFlag('isl_power_restored');
      if (akaiOut) return lit ? 'radar_complete_outside' : 'radar_complete_outside_dark';
      if (linDown) return lit ? 'radar_complete_missing' : 'radar_complete_dark_missing';
      return lit ? 'radar_complete' : 'radar_complete_dark';
    }
    if (sid === 'ridge_rest') {
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
      var sid = pickStory(b.story);
      showLines(sid, function () { nextBeat(); });
    } else if (b.type === 'tutorial') startTutorial(b);
    else if (b.type === 'interact') startInteract(b);
    else if (b.type === 'vehicle') startVehicle(b);
    else if (b.type === 'combat') startCombat(b);
    else if (b.type === 'carry') startCarry(b);
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
  function armRide(route, sc) {
    HHooks.wantVehicle = route.vehicle;
    HHooks.onBoarded = function () {
      var lines = (sc.chatter || []).slice(), n = 0;
      function chat() {
        if (n < lines.length) { toast(lines[n].who + '：「' + lines[n].text + '」'); n++; setTimeout(chat, 3200); }
      }
      chat();
      var vNow = W.inVehicle();
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
      var wave = b.wave, plan = (level && level.id === 'op1_landing') ? assaultPlan() : { enemies: JSON.parse(JSON.stringify((hasFlag('isl_ridge_trail') && wave.trailEnemies) || wave.enemies || {})) };
      Cbt.startWave({
        id: wave.id, name: wave.name, enemies: plan.enemies, grace: wave.grace,
        stealth: !!plan.stealth, reinforce: plan.reinforce, keep: !!plan.keep, noise: !!plan.noise,
        lin: fateOf('lin') === 'kia' || !W.npc('npc_signal_lin') ? null : { hp: 80, x: linPos.x, z: linPos.z },
        buddyGunner: !!(W.inVehicle() && W.inVehicle().type === 'jeep' && !hasFlag('isl_akai_outside') && (fateOf('akai') === 'alive' || fateOf('lin') === 'alive')),
        placed: wave.placed || b.placed
      });
      if (b.optionalPower) {
        W.setInteract([{ id: 'power', x: b.optionalPower.x, z: b.optionalPower.z, r: 2.6, label: b.optionalPower.label || '復電', hold: b.optionalPower.holdMs || 2400 }]);
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
        if (hintSc && hintSc.toast) setTimeout(function () { toast(hintSc.toast); }, 900);
        if (auto && q.power !== '0') setTimeout(function () { W.place(b.optionalPower.x, b.optionalPower.z); startHold(b.optionalPower.label || '復電', 400); }, 700);
      }
      if (b.blackout && ((plan.enemies && plan.enemies.rusher) || (wave.enemies && wave.enemies.rusher))) {
        setTimeout(function () {
          var rs = pickStory('rusher_warn');
          var rsc = story.scenes[rs] || story.scenes.rusher_warn;
          if (rsc && rsc.toast) toast(rsc.toast);
        }, 2200);
      }
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
    var sc = story.scenes.carry_hint;
    W.addTempNpc('npc_wounded', 'wounded', b.from[0], b.from[1], '傷患');
    objective(sc.hint, b.from[0], b.from[1]);
    W.setMarks([{ x: b.from[0], z: b.from[1] }, { x: b.to[0], z: b.to[1], color: '#92c47a' }]);
    HHooks.carryFrom = b.from; HHooks.carryTo = b.to;
    HHooks.carryOn = false;
    if (auto) setTimeout(function () { W.place(b.from[0], b.from[1]); doCarry(); setTimeout(function () { W.place(b.to[0], b.to[1]); doCarry(); }, 400); }, 300);
  }
  function doCarry() {
    var p = W.pos();
    if (!HHooks.carryOn) {
      if (!HHooks.carryFrom || Math.hypot(p.x - HHooks.carryFrom[0], p.z - HHooks.carryFrom[1]) > 2.8) { Cbt.msg('靠近傷患再背', 1200); return; }
      HHooks.carryOn = true; Cbt.setCarrying(true); W.showNpc('npc_wounded', false);
      objective(story.scenes.carry_hint.hint, HHooks.carryTo[0], HHooks.carryTo[1]);
      toast('背起來了。不能瞄準。');
    } else {
      if (Math.hypot(p.x - HHooks.carryTo[0], p.z - HHooks.carryTo[1]) > 3) { Cbt.msg('送到發光的集結點', 1200); return; }
      Cbt.setCarrying(false); toast(story.scenes.carry_hint.done); HHooks.carryFrom = null; nextBeat();
    }
  }

  function finishLevel(b) {
    setFlag(b.setFlag || (level.id === 'op3_ridge' ? 'isl_03_clear' : (level.id === 'op2_radar' ? 'isl_02_clear' : 'isl_01_clear')));
    if (Cbt.session()) save.loadout = JSON.parse(JSON.stringify(Cbt.session().pack));
    if (!fateOf('lin')) lockFate('lin', 'alive');
    if ((level.id === 'op2_radar' || level.id === 'op3_ridge') && !fateOf('akai')) lockFate('akai', 'alive');
    var next = catalog.levels.filter(function (l) { return l.num === (level.num || 1) + 1; })[0];
    if (next && !next.stub) {
      save.level = next.id; save.beat = 0;
      save.checkpoint = next.id === 'op3_ridge' ? 'ridge_rest' : (next.id === 'op2_radar' ? 'jeep_shop' : next.id);
      persist();
    }
    showLines(pickStory(b.story), function () { showCompleteCard(); });
  }
  function showCompleteCard() {
    phase = 'done';
    objective('');
    var lin = fateOf('lin') === 'kia' ? '小林：陣亡（已鎖定）' : '小林：生還';
    var akai = !fateOf('akai') || fateOf('akai') === 'absent' ? '阿凱：尚未登場' : (fateOf('akai') === 'kia' ? '阿凱：陣亡（已鎖定）' : '阿凱：生還');
    $('#card').hidden = false;
    if (level.id === 'op3_ridge') {
      var how3 = hasFlag('isl_bike_dash') ? '機車衝稜線' : hasFlag('isl_ridge_trail') ? '山腹小徑' : '岩石步行';
      var scout = hasFlag('isl_killed_scout') ? '斥候：補一槍' : '斥候：留下';
      $('#cIn').innerHTML = '<p class="kicker">第 3 關完成</p><h2>稜線哨所</h2><p>' + how3 + '。' + scout + '。</p><p>' + lin + '<br>' + akai + '<br>王班長：被俘（坑道）</p><p>第 4 關「坑道」將依序解鎖。</p><div class="row"><button type="button" class="primary" id="toTitle">回標題</button></div>';
      $('#toTitle').onclick = function () { $('#card').hidden = true; showTitle(); };
      if (auto) { save._e2e = 'clear'; persist(); }
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
    save = s;
    var id = s.level || 'op1_landing';
    if (s.flags && s.flags.isl_02_clear && !s.flags.isl_03_clear && (id === 'op1_landing' || id === 'op2_radar')) id = 'op3_ridge';
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
      if ((id === 'op2_radar' || id === 'op3_ridge') && !fateOf('akai')) lockFate('akai', 'alive');
      if (W.npc && W.npc('npc_scout_wounded')) W.showNpc('npc_scout_wounded', false);
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
      toast((v.type === 'jeep' ? '吉普' : v.type === 'cart' ? '發電車' : '機車') + '耐久 ' + Math.max(0, Math.round(v.hp)));
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
  HHooks.onDown = onDown;
  HHooks.onCover = function () { if (W.cb._tut) W.cb._tut(); };
  function rollLinFate() {
    if (fateOf('lin')) return fateOf('lin');
    if (auto && q.fate === 'kia') return lockFate('lin', 'kia');
    if (auto && q.fate !== 'kia') return lockFate('lin', 'alive');
    var o = playerO(), ch = clamp(20 - (o - 50) * 0.6, 3, 35);
    return lockFate('lin', Math.random() * 100 < ch ? 'kia' : 'alive');
  }
  HHooks.onWaveClear = function () {
    Cbt.stopWave();
    W.setInteract([]);
    if (Cbt.session() && Cbt.session().lin && Cbt.session().lin.hp <= 0) lockFate('lin', 'kia');
    else rollLinFate();
    playerO();
    if (level && (level.id === 'op2_radar' || level.id === 'op3_ridge')) { nextBeat(); return; }
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

  function boot() {
    parseQuery();
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
