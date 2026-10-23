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
      weapons: { t91: wep('t91', 'T91 步槍', 4), m9: wep('m9', 'M9 手槍', 2), t75: island.weapons.t75_lmg ? { id: 't75', name: 'T75 機槍', dmg: island.weapons.t75_lmg.dmg, rpm: island.weapons.t75_lmg.rpm, magSize: island.weapons.t75_lmg.mag, startMags: 1, reloadSec: island.weapons.t75_lmg.reloadSec, range: island.weapons.t75_lmg.range } : null },
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
      flags: {}, companionFates: { wang: 'absent', akai: 'absent' }, hp: cfg.health.hpMax, loadout: null,
      carryOver: false, downSeen: false
    };
  }
  function setFlag(id, on) { if (!id) return; save.flags[id] = on !== false; persist(); }
  function hasFlag(id) { return !!(save && save.flags && save.flags[id]); }
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
            if (c.flag) setFlag(c.flag, true);
            if (c.clear) save.flags[c.clear] = false;
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
          if (q.akai === 'out' && sceneId === 'driver_choice') pick = choices[2] || pick;
          if ((q.akai === 'with' || !q.akai) && sceneId === 'driver_choice') pick = choices[0];
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
    if (sid === 'jeep_foreshadow' && fateOf('lin') === 'kia') return 'jeep_foreshadow_missing';
    if (sid === 'assault_start' && fateOf('lin') === 'kia') return 'assault_start_missing';
    if (sid === 'jeep_shop' && fateOf('lin') === 'kia') return 'jeep_shop_missing';
    if (sid === 'radar_door' && hasFlag('isl_radio_weak') && story.scenes.radar_door_weak) return 'radar_door_weak';
    if (sid === 'dark_talk' && hasFlag('isl_akai_outside') && story.scenes.dark_talk_outside) return 'dark_talk_outside';
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
    if (b.checkpoint) markCheckpoint(b);
    if (b.place) W.place(b.place[0], b.place[1]);
    if (b.type === 'talk' || b.type === 'choice') {
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
    if (b.kind === 'power' || b.kind === 't75') {
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
        if (b.kind === 't75' && Cbt.unlockT75) { Cbt.unlockT75(); save.hasT75 = true; persist(); }
        var done = { lines: sc.done || [{ who: '', text: '好。' }] };
        story.scenes._hold_done = done;
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
  var rideWatch = null;
  function startVehicle(b) {
    var flag = hasFlag('isl_flank_by_sea') ? 'isl_flank_by_sea' : (hasFlag('isl_flank_by_bike') ? 'isl_flank_by_bike' : null);
    if (!flag || !b.routes[flag]) flag = b.routes && b.routes.default ? 'default' : flag;
    if (!flag || !b.routes[flag]) { nextBeat(); return; }
    if (b.flag) setFlag(b.flag);
    var route = b.routes[flag];
    var sc = story.scenes[route.story];
    objective(sc.hint, null, null);
    var v = W.vehicleById(route.vehicle);
    if (v) { objective(sc.hint, v.x, v.z); W.setMarks([{ x: v.x, z: v.z }, { x: route.land[0], z: route.land[1], color: '#92c47a' }]); }
    $('#fpsHint').textContent = sc.hint;
    HHooks.wantVehicle = route.vehicle;
    HHooks.onBoarded = function () {
      var lines = (sc.chatter || []).slice(), n = 0;
      function chat() {
        if (n < lines.length) { toast(lines[n].who + '：「' + lines[n].text + '」'); n++; setTimeout(chat, 3200); }
      }
      chat();
      rideWatch = function () {
        var p = W.pos();
        if (Math.hypot(p.x - route.land[0], p.z - route.land[1]) < 4.5) {
          rideWatch = null; W.exitVehicle(); Cbt.refresh();
          toast('到了。下共。'); nextBeat();
        }
      };
      if (route.scripted) {
        var wps = route.waypoints || [route.land], t0 = performance.now(), dur = (route.durationSec || 20) * 1000;
        if (auto) dur = Math.min(dur, 4000);
        rideWatch = function () {
          var u = Math.min(1, (performance.now() - t0) / dur), n = Math.max(1, wps.length - 1), f = u * n, i0 = Math.min(n - 1, Math.floor(f)), t = f - i0;
          var a = wps[i0], b2 = wps[i0 + 1] || a;
          W.S.px = a[0] + (b2[0] - a[0]) * t; W.S.pz = a[1] + (b2[1] - a[1]) * t;
          if (W.S.veh) { W.S.veh.x = W.S.px; W.S.veh.z = W.S.pz; W.S.veh.mesh.position.set(W.S.px, 0.05, W.S.pz); }
          if (u >= 1) { rideWatch = null; W.exitVehicle(); W.place(route.land[0], route.land[1]); nextBeat(); }
        };
      } else if (auto) {
        var wp = route.waypoints || [route.land], wi = 0;
        rideWatch = function () {
          var p = W.pos(), t = wp[Math.min(wi, wp.length - 1)];
          var dx = t[0] - p.x, dz = t[1] - p.z, d = Math.hypot(dx, dz);
          if (d < 3) wi++;
          if (wi >= wp.length || Math.hypot(p.x - route.land[0], p.z - route.land[1]) < 5) {
            rideWatch = null; W.exitVehicle(); W.place(route.land[0], route.land[1]); nextBeat(); return;
          }
          W.S.yaw = Math.atan2(-dx, -dz);
          if (W.S.veh) W.S.veh.yaw = W.S.yaw;
          W.S.px += -Math.sin(W.S.yaw) * 14 * 0.016;
          W.S.pz += -Math.cos(W.S.yaw) * 14 * 0.016;
        };
        setTimeout(function () {
          if (!rideWatch) return;
          rideWatch = null; W.exitVehicle(); W.place(route.land[0], route.land[1]); nextBeat();
        }, 14000);
      }
    };
    if (auto && v) setTimeout(function () { W.place(v.x, v.z); boardVehicle(v); }, 250);
  }
  function boardVehicle(v) {
    if (!v) v = W.nearestVehicle(W.pos().x, W.pos().z, 3.2);
    if (W.inVehicle()) { W.exitVehicle(); Cbt.refresh(); return; }
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
      var wave = b.wave, enemies = JSON.parse(JSON.stringify(wave.enemies || {}));
      if (hasFlag('isl_flank_by_sea') && wave.seaMinusRifleman) enemies.rifleman = Math.max(0, (enemies.rifleman || 0) - wave.seaMinusRifleman);
      Cbt.startWave({
        id: wave.id, name: wave.name, enemies: enemies, grace: wave.grace,
        lin: fateOf('lin') === 'kia' || !W.npc('npc_signal_lin') ? null : { hp: 80, x: linPos.x, z: linPos.z }
      });
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
    setFlag(b.setFlag || (level.id === 'op2_radar' ? 'isl_02_clear' : 'isl_01_clear'));
    if (Cbt.session()) save.loadout = JSON.parse(JSON.stringify(Cbt.session().pack));
    if (!fateOf('lin')) lockFate('lin', 'alive');
    if (level.id === 'op2_radar' && !fateOf('akai')) lockFate('akai', 'alive');
    var next = catalog.levels.filter(function (l) { return l.num === (level.num || 1) + 1; })[0];
    if (next && !next.stub) { save.level = next.id; save.beat = 0; save.checkpoint = next.id === 'op2_radar' ? 'jeep_shop' : next.id; persist(); }
    showLines(pickStory(b.story), function () { showCompleteCard(); });
  }
  function showCompleteCard() {
    phase = 'done';
    objective('');
    var lin = fateOf('lin') === 'kia' ? '小林：陣亡（已鎖定）' : '小林：生還';
    var akai = !fateOf('akai') || fateOf('akai') === 'absent' ? '阿凱：尚未登場' : (fateOf('akai') === 'kia' ? '阿凱：陣亡（已鎖定）' : '阿凱：生還');
    $('#card').hidden = false;
    if (level.id === 'op2_radar') {
      var how = hasFlag('isl_power_restored') ? '復電強攻' : '摸黑';
      var who = hasFlag('isl_akai_outside') ? '阿凱留在車上接應' : '阿凱同行';
      $('#cIn').innerHTML = '<p class="kicker">第 2 關完成</p><h2>雷達站</h2><p>' + how + '。' + who + '。</p><p>' + lin + '<br>' + akai + '<br>王班長：失聯</p><p>第 3 關「稜線哨所」將依序解鎖。</p><div class="row"><button type="button" class="primary" id="toTitle">回標題</button></div>';
      $('#toTitle').onclick = function () { $('#card').hidden = true; showTitle(); };
      if (auto) { save._e2e = 'clear'; persist(); }
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
    else if (b && b.id === 'assault') {
      var land = hasFlag('isl_flank_by_sea') ? [-22, -40] : [18, -26];
      W.place(land[0], land[1]);
    }
    toast('回到存檔點。同袍生死不重擲。');
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
      '<p style="font-size:12px;margin-top:12px">關卡 1 到 5 依序。桌機 WASD、滑鼠瞄準、左鍵開火、C 蹲下、R 換彈。手機：左搖桿拖到底奔跑、右半邊拖視角、右下開火。</p>';
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
    if (s.flags && s.flags.isl_01_clear && !s.flags.isl_02_clear && id === 'op1_landing') id = 'op2_radar';
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
      if (fateOf('lin') === 'kia') W.showNpc('npc_signal_lin', false);
      if (id === 'op2_radar' && !fateOf('akai')) lockFate('akai', 'alive');
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
      if (reason === 'gunner') { toast('機槍手發現了。落水。從碼頭再上。'); W.place(-38, -10); }
      else if (v && v.type === 'jeep') toast('吉普車打爆了。車上的人被甩出來。');
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
    if (auto && q.fate !== 'kia') return lockFate('lin', 'alive');
    var o = 50, ch = clamp(20 - (o - 50) * 0.6, 3, 35);
    return lockFate('lin', Math.random() * 100 < ch ? 'kia' : 'alive');
  }
  HHooks.onWaveClear = function () {
    Cbt.stopWave();
    if (Cbt.session() && Cbt.session().lin && Cbt.session().lin.hp <= 0) lockFate('lin', 'kia');
    else rollLinFate();
    if (level && level.id === 'op2_radar') { nextBeat(); return; }
    if (fateOf('lin') === 'kia') showLines('lin_down', function () { nextBeat(); });
    else showLines('lin_live', function () { nextBeat(); });
  };
  HHooks.onLinDown = function () {
    lockFate('lin', 'kia');
    W.showNpc('npc_signal_lin', false);
    toast('小林沒聲了。');
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
