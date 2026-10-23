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
  function freshSave(name, diff) {
    return {
      name: name || '阿兵哥', diff: diff || (cfg.difficulty.default || 'hardcore'),
      level: '01-beachhead', checkpoint: 'camp_chat', beat: 0,
      flags: {}, companionFates: {}, hp: cfg.health.hpMax, loadout: null
    };
  }
  function setFlag(id, on) { if (!id) return; save.flags[id] = on !== false; persist(); }
  function hasFlag(id) { return !!(save && save.flags && save.flags[id]); }
  function fateOf(id) { return save.companionFates[id] || null; }
  function lockFate(id, val) {
    if (save.companionFates[id]) return save.companionFates[id];
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
  function hideDlg() { $('#dlg').hidden = true; W.setMode('play'); }
  function showLines(sceneId, onDone) {
    var sc = story.scenes[sceneId]; if (!sc) { onDone(); return; }
    var lines = (sc.lines || []).slice(), choices = sc.choices, i = 0;
    function render() {
      $('#dlg').hidden = false;
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
          if (q.antenna === 'bunker' && sceneId === 'antenna_choice') pick = choices[1] || pick;
          if (q.route === 'sea' && sceneId === 'flank_choice') pick = choices[0];
          if (q.route === 'bike' && sceneId === 'flank_choice') pick = choices[1] || pick;
          if (q.carry === '0' && sceneId === 'aftermath') pick = choices[1] || pick;
          setTimeout(function () { pick && $('#dBtns').querySelectorAll('button')[choices.indexOf(pick)].click(); }, 200);
        }
        return;
      }
      hideDlg(); onDone();
    }
    render();
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
      showLines(b.story, function () { nextBeat(); });
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
    var flag = hasFlag('isl_antenna_ridge') ? 'isl_antenna_ridge' : 'isl_antenna_bunker';
    if (!hasFlag('isl_antenna_ridge') && !hasFlag('isl_antenna_bunker')) flag = 'isl_antenna_ridge';
    var site = b.sites[flag];
    var sc = story.scenes.plant_antenna;
    var hint = flag === 'isl_antenna_ridge' ? sc.hintRidge : sc.hintBunker;
    objective(hint, site.x, site.z);
    $('#fpsHint').textContent = hint;
    W.setInteract([{ id: 'antenna', x: site.x, z: site.z, r: 2.4, label: b.label || '架設天線', hold: b.holdMs || 2000 }]);
    HHooks.pendingHold = function () {
      W.showAntenna(flag === 'isl_antenna_ridge' ? 'ridge' : 'bunker');
      W.setInteract([]);
      showLines('plant_antenna', function () { nextBeat(); });
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
    var flag = hasFlag('isl_flank_by_sea') ? 'isl_flank_by_sea' : 'isl_flank_by_bike';
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
      if (auto) {
        var wp = route.waypoints || [route.land], wi = 0;
        rideWatch = function () {
          var p = W.pos(), t = wp[Math.min(wi, wp.length - 1)];
          var dx = t[0] - p.x, dz = t[1] - p.z, d = Math.hypot(dx, dz);
          if (d < 3) wi++;
          if (wi >= wp.length) { rideWatch = null; W.exitVehicle(); nextBeat(); return; }
          W.S.yaw = Math.atan2(-dx, -dz);
          if (W.S.veh) W.S.veh.yaw = W.S.yaw;
          W.S.px += -Math.sin(W.S.yaw) * 14 * 0.016;
          W.S.pz += -Math.cos(W.S.yaw) * 14 * 0.016;
        };
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
    if (HHooks.onBoarded) { var fn = HHooks.onBoarded; HHooks.onBoarded = null; fn(); }
  }

  /* ---------- 戰鬥 ---------- */
  function startCombat(b) {
    showLines(b.story, function () {
      var linPos = antennaPos();
      if (fateOf('lin') === 'kia') {
        W.showNpc('npc_signal_lin', false);
      } else {
        W.moveNpc('npc_signal_lin', linPos.x, linPos.z);
      }
      W.moveNpc('npc_akai', W.pos().x - 3, W.pos().z + 1);
      var wave = b.wave;
      Cbt.startWave({
        id: wave.id, name: wave.name, enemies: wave.enemies, grace: wave.grace,
        lin: fateOf('lin') === 'kia' ? null : { hp: 100, x: linPos.x, z: linPos.z }
      });
      if (auto) { Cbt.bot = 'aim'; if (save.diff === 'story') { /* 劇情向不會倒下 */ } }
      objective('清掉灘上的敵軍', W.pos().x, W.pos().z - 8);
      if (q.down === '1' && !save._downTest) {
        save._downTest = 1;
        setTimeout(function () { if (Cbt.session()) { Cbt.session().pack.hp = 0; HHooks.onDown(); } }, 800);
      }
    });
  }
  function antennaPos() {
    if (hasFlag('isl_antenna_bunker')) return { x: -14, z: -16.6 };
    return { x: 16.4, z: -6.2 };
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
    setFlag(b.setFlag || 'isl_01_clear');
    if (!fateOf('lin') && Cbt.session() && Cbt.session().lin && Cbt.session().lin.hp > 0) lockFate('lin', 'alive');
    if (!fateOf('akai')) lockFate('akai', 'alive');
    showLines(b.story, function () { showCompleteCard(); });
  }
  function showCompleteCard() {
    phase = 'done';
    var lin = fateOf('lin') === 'kia' ? '小林：陣亡（已鎖定）' : '小林：生還';
    var akai = fateOf('akai') === 'kia' ? '阿凱：陣亡（已鎖定）' : '阿凱：生還';
    $('#card').hidden = false;
    $('#cIn').innerHTML = '<p class="kicker">第 1 關完成</p><h2>南灘據點</h2><p>天線' + (hasFlag('isl_antenna_ridge') ? '在稜線' : '在碉堡') + '。側翼走' + (hasFlag('isl_flank_by_sea') ? '舢舨' : '摩托車') + '。</p><p>' + lin + '<br>' + akai + '</p><p>第 2 關「雷達站」尚未開放，關卡資料就位後會依序解鎖。</p><div class="row"><button type="button" class="primary" id="toTitle">回標題</button></div>';
    $('#toTitle').onclick = function () { $('#card').hidden = true; showTitle(); };
    if (auto) { save._e2e = 'clear'; persist(); }
  }

  /* ---------- 倒下重試 ---------- */
  function onDown() {
    Cbt.stopWave();
    var sc = story.scenes.down;
    fade(sc.title, 900, function () {
      $('#card').hidden = false;
      $('#cIn').innerHTML = '<h2>' + sc.title + '</h2><p>' + sc.text + '</p><div class="row"><button type="button" class="primary" id="retryBtn">回到存檔點</button></div>';
      $('#retryBtn').onclick = function () { $('#card').hidden = true; retryCheckpoint(); };
      if (auto) setTimeout(function () { var b = $('#retryBtn'); if (b) b.click(); }, 200);
    });
  }
  function retryCheckpoint() {
    var id = save.checkpoint || 'camp_chat', i;
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
      var land = hasFlag('isl_flank_by_sea') ? [-22, -28] : [18, -26];
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
      var locked = lv.unlockFlag && !(prev && prev.flags && prev.flags[lv.unlockFlag]);
      if (lv.id === '01-beachhead') locked = false;
      var stub = lv.stub ? '<small>尚未開放</small>' : '<small>' + lv.outpostName + '</small>';
      return '<button type="button" data-lv="' + lv.id + '"' + (locked || lv.stub ? ' disabled' : '') + '>第 ' + lv.num + ' 關　' + lv.name + stub + '</button>';
    }).join('');
    $('#card').hidden = false;
    $('#cIn').innerHTML = '<p class="kicker">' + story.titleCard.kicker + '</p><h1>' + story.titleCard.name + '</h1><p>' + story.titleCard.blurb + '</p>' +
      '<label>姓名</label><input id="nm" maxlength="6" value="' + ((prev && prev.name) || '阿兵哥') + '">' +
      '<label>難度</label><select id="df">' + opts + '</select>' +
      '<div class="levels">' + lvBtns + '</div>' +
      '<div class="row">' + (prev ? '<button type="button" id="cont">繼續</button>' : '') + '<button type="button" class="primary" id="ng">新的戰役</button></div>' +
      '<p style="font-size:12px;margin-top:12px">桌機 WASD 移動、滑鼠瞄準、左鍵開火、C 蹲下、R 換彈、G 手榴彈、H 急救、F 互動、E 上下車。手機：左搖桿（拖到底奔跑）、右半邊拖曳視角。</p>';
    $('#ng').onclick = function () { startNew($('#nm').value, $('#df').value); };
    var c = $('#cont'); if (c) c.onclick = function () { continueSave(prev); };
    $('#cIn').querySelectorAll('[data-lv]').forEach(function (btn) {
      btn.onclick = function () { startNew($('#nm').value, $('#df').value, btn.getAttribute('data-lv')); };
    });
    if (auto) setTimeout(function () { startNew('阿兵哥', q.diff || 'hardcore', '01-beachhead'); }, 250);
  }
  function startNew(name, diff, lvId) {
    save = freshSave(name.trim() || '阿兵哥', diff);
    persist();
    bootLevel(lvId || '01-beachhead', 0);
  }
  function continueSave(s) {
    save = s;
    bootLevel(s.level || '01-beachhead', s.beat || 0);
  }
  function bootLevel(id, startBeat) {
    var meta = catalog.levels.filter(function (l) { return l.id === id; })[0];
    if (!meta || meta.stub) { toast(story.scenes.locked.text); return; }
    loadJson(meta.file).then(function (lv) {
      level = lv; level.num = meta.num;
      W.loadLevel(lv, cfg);
      Cbt.begin(Cbt.newLoadout());
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
  HHooks.onWaveClear = function () {
    Cbt.stopWave();
    if (Cbt.session() && Cbt.session().lin && Cbt.session().lin.hp > 0) {
      lockFate('lin', 'alive');
      showLines('lin_live', function () { nextBeat(); });
    } else nextBeat();
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
    loadJson('data/levels.json'),
    loadJson('data/story.json')
  ]).then(function (arr) {
    cfg = arr[0]; catalog = arr[1]; story = arr[2];
    KEY = cfg.save.key;
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
