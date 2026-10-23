/* 島嶼守備戰鬥：hitscan、掩體、敵人、手榴彈、急救、背人。數值來自 island-fps-system.json。 */
(function (root) {
  'use strict';
  var T = root.THREE, W = root.World, Sfx = root.Sfx;
  var $ = function (s) { return document.querySelector(s); };
  var Cbt = { bot: null };
  if (!T) { root.Combat = Cbt; return; }
  var DEG = Math.PI / 180;
  var cfg = null, A = null, scene = null, rc = new T.Raycaster();
  var tracerPool = [], dustPool = [], flash = null, geoCache = {}, enemyMats = {};
  var hudCache = {};
  var H = {};

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function hudSet(id, key, val, fn) { if (hudCache[id + key] === val) return; hudCache[id + key] = val; fn($(id), val); }

  function geo(kind, a, b, c, d) {
    var k = [kind, a, b, c, d].join('|');
    if (geoCache[k]) return geoCache[k];
    var g;
    if (kind === 'box') g = new T.BoxGeometry(a, b, c);
    else if (kind === 'cyl') g = new T.CylinderGeometry(a, b, c, d || 8);
    else if (kind === 'sph') g = new T.SphereGeometry(a, 8, 6);
    else g = new T.SphereGeometry(a, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    geoCache[k] = g; return g;
  }
  function mat(col) { return enemyMats[col] || (enemyMats[col] = new T.MeshLambertMaterial({ color: col })); }
  var PAL = {
    rifleman: { u: '#505647', v: '#363b30', h: '#2c3128', s: '#c9976e' },
    gunner: { u: '#464b41', v: '#2e332a', h: '#252921', s: '#b98a63' },
    rusher: { u: '#5c5c54', v: '#44443d', h: '#3a3a33', s: '#d1a077' },
    scout: { u: '#4a5244', v: '#32382c', h: '#2a3024', s: '#c9976e' },
    sniper: { u: '#3e4438', v: '#2a2e26', h: '#1e221c', s: '#c9976e' }
  };
  function buildEnemy(type, e) {
    var P = PAL[type] || PAL.rifleman, g = new T.Group(), hit = [], j = {};
    function mesh(parent, geometry, col, x, y, z, part) {
      var m = new T.Mesh(geometry, mat(col)); m.position.set(x, y, z); parent.add(m);
      m.userData.enemy = e; m.userData.part = part || 'body'; if (part !== 'none') hit.push(m); return m;
    }
    var hips = new T.Group(); hips.position.y = 0.95; g.add(hips); j.hips = hips;
    mesh(hips, geo('box', 0.34, 0.2, 0.2), P.v, 0, 0, 0, 'body');
    ['L', 'R'].forEach(function (side, i) {
      var sx = i ? 0.1 : -0.1, th = new T.Group(); th.position.set(sx, 0, 0); hips.add(th);
      mesh(th, geo('cyl', 0.075, 0.058, 0.46, 8), P.u, 0, -0.23, 0, 'limb');
      var sh = new T.Group(); sh.position.y = -0.46; th.add(sh);
      mesh(sh, geo('cyl', 0.058, 0.045, 0.44, 8), P.u, 0, -0.22, 0, 'limb');
      mesh(sh, geo('box', 0.1, 0.09, 0.25), '#1c1d1a', 0, -0.45, 0.05, 'limb');
      j['th' + side] = th; j['sh' + side] = sh;
    });
    var torso = new T.Group(); torso.position.y = 0.1; hips.add(torso); j.torso = torso;
    var chest = mesh(torso, geo('cyl', 0.19, 0.16, 0.56, 8), P.u, 0, 0.3, 0, 'body'); chest.scale.z = 0.62;
    mesh(torso, geo('sph', 0.105), P.s, 0, 0.74, 0, 'head');
    mesh(torso, geo('dome', 0.14), P.h, 0, 0.77, 0, 'head');
    ['L', 'R'].forEach(function (side, i) {
      var sg = new T.Group(); sg.position.set(i ? 0.24 : -0.24, 0.5, 0); torso.add(sg);
      mesh(sg, geo('cyl', 0.055, 0.047, 0.29, 8), P.u, 0, -0.145, 0, 'limb');
      var el = new T.Group(); el.position.y = -0.29; sg.add(el);
      mesh(el, geo('cyl', 0.047, 0.04, 0.27, 8), P.u, 0, -0.135, 0, 'limb');
      mesh(el, geo('box', 0.07, 0.07, 0.09), P.s, 0, -0.3, 0, 'limb');
      j['sg' + side] = sg; j['el' + side] = el;
    });
    var gun = new T.Group(); gun.position.set(0.02, 0.38, 0.28); torso.add(gun); j.gun = gun;
    var glen = type === 'gunner' ? 0.85 : 0.68;
    mesh(gun, geo('box', 0.05, 0.08, glen), '#222421', 0, 0, 0, 'limb');
    var brl = mesh(gun, geo('cyl', 0.014, 0.014, 0.4, 6), '#151614', 0, 0.015, glen / 2 + 0.18, 'limb'); brl.rotation.x = Math.PI / 2;
    j.muzzle = new T.Object3D(); j.muzzle.position.set(0, 0.015, glen / 2 + 0.4); gun.add(j.muzzle);
    var outline = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(0.7, 1.9, 0.5)), new T.LineBasicMaterial({ color: '#d7e6ff' }));
    outline.position.y = 1.0; outline.visible = false; g.add(outline);
    return { group: g, hit: hit, joints: j, outline: outline };
  }

  Cbt.init = function (hooks, system) {
    H = hooks || {}; cfg = system; scene = W.scene();
    var i;
    for (i = 0; i < 14; i++) {
      var ln = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(0, 0, -1)]), new T.LineBasicMaterial({ color: '#ffe9a0', transparent: true, opacity: 0.9 }));
      ln.visible = false; ln.frustumCulled = false; scene.add(ln); tracerPool.push({ line: ln, life: 0 });
    }
    var dc = document.createElement('canvas'); dc.width = dc.height = 32; var dx = dc.getContext('2d');
    var gr = dx.createRadialGradient(16, 16, 2, 16, 16, 15); gr.addColorStop(0, 'rgba(230,205,150,.9)'); gr.addColorStop(1, 'rgba(230,205,150,0)'); dx.fillStyle = gr; dx.fillRect(0, 0, 32, 32);
    var dtex = new T.CanvasTexture(dc);
    for (i = 0; i < 28; i++) {
      var sp = new T.Sprite(new T.SpriteMaterial({ map: dtex, transparent: true, depthWrite: false, fog: true })); sp.visible = false; scene.add(sp); dustPool.push({ s: sp, life: 0, vy: 0 });
    }
    flash = new T.Mesh(new T.PlaneGeometry(0.16, 0.16), new T.MeshBasicMaterial({ color: '#ffd77a', transparent: true, opacity: 0.95, depthTest: false }));
    flash.position.set(0.17, -0.12, -0.84); flash.visible = false; W.camera().add(flash);
    bindHud();
  };

  function bindHud() {
    function on(id, fn) { var el = $(id); if (el) el.addEventListener('click', fn); }
    on('#bCrouch', function () { Cbt.toggleCrouch(); });
    on('#bReload', function () { Cbt.reload(); });
    on('#bAds', function () { Cbt.setAds(!A.ads); });
    on('#bNade', function () { Cbt.throwNade(); });
    on('#bMed', function () { Cbt.medkit(); });
    on('#bVeh', function () { if (H.onVehicle) H.onVehicle(); });
    on('#bCarry', function () { if (H.onCarry) H.onCarry(); });
    on('#bWeap', function () { Cbt.cycleWeap(); });
    on('#bLight', function () { Cbt.toggleLight(); });
    on('#bSeat', function () { Cbt.cycleSeat(); });
    var bf = $('#bFire');
    bf.addEventListener('pointerdown', function (e) { e.preventDefault(); Cbt.fireDown(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { bf.addEventListener(ev, function () { Cbt.fireUp(); }); });
  }

  function wep() { return cfg.weapons[A.weap] || cfg.weapons.t91; }
  function modeMul() {
    var d = (H.save && H.save().diff) || 'hardcore';
    return cfg.difficulty.modes[d] || cfg.difficulty.modes.hardcore;
  }
  function magHint(frac, reloading, empty) {
    if (reloading) return '換彈中…';
    if (empty) return '彈匣空了';
    if (frac > 0.66) return '彈匣沉甸甸';
    if (frac > 0.33) return '彈匣還有些重量';
    return '彈匣很輕了';
  }

  Cbt.newLoadout = function () {
    var t = cfg.weapons.t91, m = cfg.weapons.m9, l = cfg.weapons.t75;
    var pack = {
      weap: 't91',
      t91: { mag: t.magSize, mags: t.startMags, size: t.magSize },
      m9: { mag: m.magSize, mags: m.startMags, size: m.magSize },
      nades: cfg.grenade.count, medkits: cfg.health.medkitsStart, hp: cfg.health.hpMax, hpMax: cfg.health.hpMax
    };
    if (l) pack.t75 = { mag: l.magSize, mags: 1, size: l.magSize };
    var d = cfg.weapons.t65;
    if (d) pack.t65 = { mag: d.magSize, mags: 2, size: d.magSize };
    return pack;
  };

  Cbt.begin = function (loadout) {
    A = {
      active: true, enemies: [], queue: [], spawnT: 0, killed: 0, total: 0, ended: false,
      weap: loadout.weap || 't91', pack: loadout,
      fireMode: 'auto', ads: false, reload: 0, reloadTotal: 0, cd: 0, firing: false, rec: 0,
      swayT: 0, cover: null, peek: false, carrying: false, hurtT: 0, hpZero: false,
      aimAssist: W.isMobileLike(), grace: 0, flashT: 0, nadeT: 0, dummyHits: 0,
      lin: null, barks: {}, warnedBag: false, combat: false, smokeT: 0, smokeSpawn: 0, hasT75: !!(loadout && loadout.t75 && loadout.hasT75),
      hasT65: !!(loadout && loadout.t65 && loadout.hasT65),
      noiseOn: false, stealthWave: false, alerted: false, reinforce: null, reinforced: false, gatherMode: false, gatherKilled: 0,
      heat: 0, overheat: false, cool: 0, buddyGunner: false
    };
    W.setWeap(A.weap);
    refreshHud();
    return A;
  };
  Cbt.session = function () { return A; };
  Cbt.active = function () { return !!(A && A.active); };

  function countBag(bag) {
    var n = 0; Object.keys(bag || {}).forEach(function (k) { n += bag[k] || 0; }); return n;
  }
  Cbt.beginNoise = function () {
    if (!A) Cbt.begin(Cbt.newLoadout());
    A.noiseOn = true; A.stealthBroken = true; A.alerted = true;
  };
  Cbt.spawnGather = function (bag) {
    if (!A) Cbt.begin(Cbt.newLoadout());
    A.noiseOn = true; A.combat = true; A.ended = false; A.gatherMode = true; A.alerted = true;
    Object.keys(bag || {}).forEach(function (k) {
      var i; for (i = 0; i < (bag[k] || 0); i++) {
        var e = spawnEnemy(k);
        e.state = 'rush'; e.alerted = true; e.exposed = true;
        A.enemies.push(e);
      }
    });
    A.total = (A.total || 0) + countBag(bag);
    $('#waveTop').hidden = false; $('#waveName').textContent = '引擎聲';
    banner('引擎聲把人引來了');
    refreshHud();
  };
  Cbt.reinforce = function (bag) {
    if (!A || A.reinforced) return;
    A.reinforced = true; A.alerted = true;
    var n = 0;
    Object.keys(bag || {}).forEach(function (k) {
      var i; for (i = 0; i < (bag[k] || 0); i++) { A.queue.push(k); n++; }
    });
    A.total += n; A.spawnT = Math.min(A.spawnT || 0, 0.3);
    Cbt.msg('增援來了', 1600);
    refreshHud();
  };
  Cbt.giveAmmo = function (n) {
    if (!A) return;
    A.pack.t91.mags += n || 2;
    if (A.pack.m9) A.pack.m9.mags += 1;
    Cbt.msg('補給箱。彈匣補上了。', 1600);
    refreshHud();
  };
  function alertStealth(why) {
    if (!A || !A.stealthWave || A.alerted) return;
    A.alerted = true;
    Cbt.msg(why || '被發現了', 1600);
    if (A.reinforce) Cbt.reinforce(A.reinforce);
  }
  Cbt.startWave = function (o) {
    if (!A) Cbt.begin(Cbt.newLoadout());
    var keep = !!(o.keep && A.enemies && A.enemies.length);
    var live = [];
    A.enemies.forEach(function (e) {
      if (keep && e.state !== 'dead') live.push(e);
      else if (e.group && e.group.parent) e.group.parent.remove(e.group);
    });
    A.combat = true; A.ended = false; A.hpZero = false; A.gatherMode = false;
    A.queue = []; A.enemies = live;
    A.stealthWave = !!o.stealth;
    A.reinforce = o.reinforce || null;
    A.reinforced = false;
    if (o.noise) A.noiseOn = true;
    A.alerted = !A.stealthWave || !!A.noiseOn;
    var bag = JSON.parse(JSON.stringify(o.enemies || {}));
    (o.placed || []).forEach(function (pl) {
      if (!pl || !pl.type) return;
      if ((bag[pl.type] || 0) > 0) bag[pl.type]--;
      A.enemies.push(spawnEnemy(pl.type, pl.x, pl.z));
    });
    var list = [];
    Object.keys(bag).forEach(function (k) { for (var i = 0; i < bag[k]; i++) list.push(k); });
    list.sort(function (a, b) { return (a === 'gunner' ? -1 : 0) - (b === 'gunner' ? -1 : 0) || Math.random() - 0.5; });
    A.queue = list;
    A.killed = keep ? (A.gatherKilled || 0) : 0;
    A.total = list.length + A.enemies.length + A.killed;
    A.spawnT = o.grace != null ? o.grace : 2; A.grace = A.spawnT;
    if (o.lin) A.lin = { hp: o.lin.hp || 100, max: o.lin.hp || 100, x: o.lin.x, z: o.lin.z };
    A.buddyGunner = !!o.buddyGunner;
    W.reviveCovers();
    banner(o.name || '接觸');
    $('#waveTop').hidden = false; $('#waveName').textContent = o.name || '戰鬥';
    refreshHud();
  };
  Cbt.stopWave = function () {
    if (!A) return;
    A.combat = false; A.firing = false; A.buddyGunner = false;
    hideSnip();
    A.enemies.forEach(function (e) { if (e.group.parent) e.group.parent.remove(e.group); });
    A.enemies = []; A.queue = [];
    $('#waveTop').hidden = true;
  };

  function banner(t) {
    var el = $('#waveBanner'); el.textContent = t; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }
  Cbt.msg = function (t, ms) {
    var el = $('#fpsMsg'); el.textContent = t; el.classList.add('on');
    clearTimeout(Cbt._mt); Cbt._mt = setTimeout(function () { el.classList.remove('on'); }, ms || 1800);
  };

  function takeCover(c) {
    A.cover = c; A.peek = false; W.place(c.ax, c.az); W.setCrouch(true);
  }
  function leaveCover() { if (!A) return; A.cover = null; A.peek = false; }

  Cbt.toggleCrouch = function () {
    if (!A || W.inVehicle()) return;
    if (A.carrying) { Cbt.msg((cfg.carry && cfg.carry.hint) || '背著人不能瞄準射擊', 1600); return; }
    if (!A.cover) {
      var p = W.pos(), c = W.nearestCover(p.x, p.z, (cfg.cover.autoSnapM || 1.2) + 0.4);
      if (c) { takeCover(c); Sfx.sfx('click'); refreshHud(); if (H.onCover) H.onCover(); return; }
    } else if (A.cover) {
      A.peek = !A.peek;
      W.setCrouch(!A.peek);
      Sfx.sfx('click'); refreshHud(); return;
    }
    W.setCrouch(!W.S.crouch); Sfx.sfx('click'); refreshHud();
    if (W.S.crouch && H.onCover) H.onCover();
  };
  Cbt.setAds = function (v) {
    if (!A) return;
    if (A.carrying && v) { Cbt.msg((cfg.carry && cfg.carry.hint) || '背著人不能瞄準射擊', 1600); return; }
    A.ads = !!v; A.peek = !!v || A.peek;
    if (A.cover && v) { A.peek = true; W.setCrouch(false); }
    W.setAds(A.ads); refreshHud();
  };
  Cbt.reload = function () {
    if (!A || A.reload > 0) return;
    var sl = A.pack[A.weap];
    if (sl.mag >= sl.size) return;
    if (sl.mags <= 0) { Cbt.msg('沒有備用彈匣了', 1600); return; }
    A.reload = A.reloadTotal = wep().reloadSec || 2.4; A.firing = false; Sfx.sfx('reload');
  };
  Cbt.forceWeap = function (id) { if (!A) return; A.weap = id; W.setWeap(id); refreshHud(); };
  Cbt.cycleWeap = function () {
    if (!A || A.reload > 0) return;
    var veh = W.inVehicle && W.inVehicle();
    if (veh && (veh.type === 'bike' || veh.type === 'motorcycle')) { Cbt.forceWeap('m9'); Cbt.msg('機車上只能用手槍', 1400); return; }
    var order = ['t91'];
    if (A.hasT75 || (A.pack.t75 && A.pack.hasT75)) order.push('t75');
    if (A.hasT65 || (A.pack.t65 && A.pack.hasT65)) order.push('t65');
    order.push('m9');
    var i = order.indexOf(A.weap); A.weap = order[(i + 1) % order.length];
    W.setWeap(A.weap); Sfx.sfx('click'); refreshHud();
  };
  Cbt.unlockT75 = function (quiet) {
    if (!A || !cfg.weapons.t75) return;
    A.hasT75 = true; A.pack.hasT75 = true;
    if (!A.pack.t75) A.pack.t75 = { mag: cfg.weapons.t75.magSize, mags: 1, size: cfg.weapons.t75.magSize };
    A.weap = 't75'; W.setWeap('t75'); refreshHud();
    if (!quiet) Cbt.msg('繳獲 T75', 1600);
  };
  Cbt.unlockDmr = function (quiet) {
    if (!A || !cfg.weapons.t65) return;
    A.hasT65 = true; A.pack.hasT65 = true;
    if (!A.pack.t65) A.pack.t65 = { mag: cfg.weapons.t65.magSize, mags: 2, size: cfg.weapons.t65.magSize };
    A.weap = 't65'; W.setWeap('t65'); refreshHud();
    if (!quiet) Cbt.msg('繳獲 T65K2', 1600);
  };
  Cbt.cycleSeat = function () {
    if (!W.cycleSeat) return;
    if (A && A._seatCd > 0) return;
    var v = W.inVehicle && W.inVehicle();
    if (!v || v.type !== 'jeep') { Cbt.msg('只有吉普車能換座位', 1200); return; }
    var seat = W.cycleSeat();
    if (A) A._seatCd = ((cfg.vehicles && cfg.vehicles.jeep && cfg.vehicles.jeep.gunner && cfg.vehicles.jeep.gunner.playerCanSwitchSeatSec) || 1.5);
    Cbt.msg(seat === 'gunner' ? '射手座位。車載 T75。' : (seat === 'passenger' ? '乘客座位。' : '駕駛座位。'), 1400);
    refreshHud();
  };
  function jeepGun() {
    var v = W.inVehicle && W.inVehicle();
    return !!(v && v.type === 'jeep' && W.seat && W.seat() === 'gunner');
  }
  Cbt.fireDown = function () { if (!A) return; A.firing = true; tryFire(true); };
  Cbt.fireUp = function () { if (A) A.firing = false; };
  Cbt.onAim = function (dx, dy, type) {
    if (!A) return;
    var sensMul = 1;
    if (A.aimAssist && overTarget()) sensMul *= 1 - (cfg.difficulty.aimAssist.slowdownPct || 40) / 100;
    W.aim(dx * sensMul, dy * sensMul, type);
  };
  Cbt.onKey = function (code, down) {
    if (!A || !down) return;
    if (code === 'KeyC') Cbt.toggleCrouch();
    else if (code === 'KeyR') Cbt.reload();
    else if (code === 'KeyG') Cbt.throwNade();
    else if (code === 'KeyH' || code === 'KeyQ') Cbt.medkit();
    else if (code === 'KeyL') Cbt.toggleLight();
    else if (code === 'Digit1') { A.weap = 't91'; W.setWeap('t91'); refreshHud(); }
    else if (code === 'Digit2') { A.weap = 'm9'; W.setWeap('m9'); refreshHud(); }
    else if (code === 'KeyV') { A.fireMode = A.fireMode === 'semi' ? 'auto' : 'semi'; refreshHud(); }
    else if (code === 'KeyF' && H.onInteract) H.onInteract();
    else if (code === 'KeyE' && H.onVehicle) H.onVehicle();
    else if (code === 'KeyX') Cbt.cycleSeat();
    else if (code === 'Digit3' && A.hasT65) { A.weap = 't65'; W.setWeap('t65'); refreshHud(); }
  };

  function swayAmp() {
    var a = (cfg.aiming.swayBase || 2.6);
    if (A.ads) a *= cfg.aiming.adsSwayMul || 0.5;
    if (A.weap === 't65') a *= 0.6;
    if (A.carrying) a *= 1.4;
    return a;
  }
  function aimDir() {
    var F = W.S, a = swayAmp(), t = A.swayT;
    var sx = a * Math.sin(t * 1.7) * 0.5, sy = a * Math.sin(t * 2.3 + 1.1) * 0.35;
    var yaw = F.yaw + sx * DEG, pitch = F.pitch + sy * DEG, cp = Math.cos(pitch);
    return { yaw: yaw, pitch: pitch, d: [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp] };
  }
  function exposedEnemies() { return (A.enemies || []).filter(function (e) { return e.state !== 'dead' && e.exposed; }); }
  function angTo(tx, ty, tz) {
    var F = W.S, p = W.pos(), dx = tx - p.x, dy = ty - F.eye, dz = tz - p.z, l = Math.hypot(dx, dy, dz) || 1;
    return { yaw: Math.atan2(-dx, -dz), pitch: Math.asin(clamp(dy / l, -1, 1)), dist: l };
  }
  function overTarget() {
    var F = W.S, snap = (cfg.difficulty.aimAssist.snapAngleDeg || 4) * DEG, i, es = exposedEnemies();
    for (i = 0; i < es.length; i++) {
      var a = angTo(es[i].x, 1.2, es[i].z), dy = Math.atan2(Math.sin(a.yaw - F.yaw), Math.cos(a.yaw - F.yaw));
      if (Math.hypot(dy, a.pitch - F.pitch) < snap) return true;
    }
    return false;
  }
  function canShoot() {
    if (!A || !A.active || A.reload > 0) return false;
    if (jeepGun()) return !A.overheat;
    var veh = W.inVehicle && W.inVehicle();
    if (veh && (veh.type === 'bike' || veh.type === 'motorcycle') && A.weap !== 'm9') return false;
    if (A.carrying) return false;
    if (A.cover && !A.peek && W.S.crouch) return false;
    return true;
  }
  function tryFire(first) {
    if (!canShoot() || A.cd > 0) return;
    var sl = A.pack[A.weap];
    if (!jeepGun() && sl.mag <= 0) { if (first) { Sfx.sfx('empty'); Cbt.msg('彈匣空了，按 R 換彈', 1400); } return; }
    if (jeepGun()) {
      if (A.overheat) { if (first) Cbt.msg('機槍過熱', 1200); return; }
      A.cd = 60 / 750;
    } else {
      sl.mag--; A.cd = 60 / wep().rpm;
    }
    if (!jeepGun() && (A.fireMode === 'semi' || A.weap === 'm9' || A.weap === 't65')) A.firing = false;
    alertStealth('槍聲把人引來了');
    var F = W.S, ad = aimDir(), p = W.pos(), dir = ad.d.slice();
    var ox = p.x, oy = F.eye, oz = p.z;
    var vehAim = W.inVehicle && W.inVehicle();
    if (vehAim && (vehAim.type === 'bike' || vehAim.type === 'motorcycle') && cfg.vehicles && cfg.vehicles.motorcycle) {
      var sm = 1 - (cfg.vehicles.motorcycle.shootAccMul || 0.5);
      dir[0] += rnd(-1, 1) * sm * 0.18; dir[1] += rnd(-1, 1) * sm * 0.1; dir[2] += rnd(-1, 1) * sm * 0.18;
      var dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
      dir[0] /= dl; dir[1] /= dl; dir[2] /= dl;
    }
    if (A.aimAssist) {
      var best = null, bd = 1e9, es = exposedEnemies(), snap = (cfg.difficulty.aimAssist.snapAngleDeg || 4) * DEG;
      es.forEach(function (e) {
        var a = angTo(e.x, 1.25, e.z), dyw = Math.atan2(Math.sin(a.yaw - ad.yaw), Math.cos(a.yaw - ad.yaw)), dd = Math.hypot(dyw, a.pitch - ad.pitch);
        if (dd < snap && dd < bd) { bd = dd; best = a; }
      });
      if (best) { var cp = Math.cos(best.pitch); dir = [-Math.sin(best.yaw) * cp, Math.sin(best.pitch), -Math.cos(best.yaw) * cp]; }
    }
    F.pitch += (cfg.aiming.recoilDeg || 0.7) * DEG; W.kick();
    Sfx.sfx(A.weap === 'm9' ? 'pistol' : 'shot');
    flash.visible = true; A.flashT = 0.04;
    var skip = A.cover ? A.cover.col : null;
    var tBlock = W.rayBlock(ox, oy, oz, dir[0], dir[1], dir[2], jeepGun() ? 90 : (wep().range || 280), skip);
    rc.set(new T.Vector3(ox, oy, oz), new T.Vector3(dir[0], dir[1], dir[2])); rc.far = tBlock;
    var metas = [];
    A.enemies.forEach(function (e) {
      if (e.state !== 'dead' && (e.exposed || Cbt.bot === 'aim')) { e.group.updateMatrixWorld(true); metas = metas.concat(e.hit); }
    });
    var hits = metas.length ? rc.intersectObjects(metas, false) : [], tEnd = tBlock, hitE = null;
    if (hits.length) {
      var h0 = hits[0], e0 = h0.object.userData.enemy, part = h0.object.userData.part;
      tEnd = h0.distance; hitE = e0;
      var dmg = (jeepGun() ? 24 : wep().dmg) * (part === 'head' ? cfg.aiming.headshotMul : part === 'limb' ? 0.7 : 1);
      damageEnemy(e0, dmg, part === 'head');
      hitMark(part === 'head');
    }
    /* 教學靶 */
    if (!hitE && A.dummiesOn) {
      var dum = (W.S.dummies || [])[0];
      if (dum) {
        var dd = distPointRay(dum.x, dum.y, dum.z, ox, oy, oz, dir);
        if (dd < 0.55 && tEnd > Math.hypot(dum.x - ox, dum.z - oz)) { A.dummyHits++; hitMark(false); if (H.onDummy) H.onDummy(); }
      }
    }
    var ex = ox + dir[0] * Math.min(tEnd, 220), ey = oy + dir[1] * Math.min(tEnd, 220), ez = oz + dir[2] * Math.min(tEnd, 220);
    tracer(ox + dir[0] * 0.8, oy - 0.1 + dir[1] * 0.8, oz + dir[2] * 0.8, ex, ey, ez, '#ffe9a0');
    if (!hitE) dust(ex, Math.max(0.1, ey), ez);
    refreshHud();
  }
  function distPointRay(px, py, pz, ox, oy, oz, dir) {
    var vx = px - ox, vy = py - oy, vz = pz - oz, t = vx * dir[0] + vy * dir[1] + vz * dir[2];
    if (t < 0) return 99;
    return Math.hypot(ox + dir[0] * t - px, oy + dir[1] * t - py, oz + dir[2] * t - pz);
  }
  Cbt.enableDummies = function (on) { if (A) A.dummiesOn = !!on; };

  function tracer(x0, y0, z0, x1, y1, z1, col) {
    var t = tracerPool.filter(function (q) { return !q.line.visible; })[0] || tracerPool[0];
    var pos = t.line.geometry.attributes.position; pos.setXYZ(0, x0, y0, z0); pos.setXYZ(1, x1, y1, z1); pos.needsUpdate = true;
    t.line.material.color.set(col); t.line.visible = true; t.life = 0.09;
  }
  function dust(x, y, z) {
    var d = dustPool.filter(function (q) { return !q.s.visible; })[0]; if (!d) return;
    d.s.position.set(x, y, z); d.s.scale.set(0.5, 0.5, 1); d.s.visible = true; d.life = 0.5; d.vy = 0.8;
  }
  var snipLn = null;
  function ensureSnip() {
    if (snipLn || !scene) return;
    snipLn = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(0, 1, -1)]), new T.LineBasicMaterial({ color: '#ff4a4a' }));
    snipLn.visible = false; snipLn.frustumCulled = false; scene.add(snipLn);
  }
  function showSnip(e, p) {
    ensureSnip();
    if (!snipLn) return;
    var pos = snipLn.geometry.attributes.position;
    pos.setXYZ(0, e.x, 1.55, e.z); pos.setXYZ(1, p.x, W.S.eye || 1.4, p.z); pos.needsUpdate = true;
    snipLn.visible = true;
    var ring = $('#snipWarn');
    if (ring) { ring.hidden = false; ring.classList.add('on'); }
  }
  function hideSnip() {
    if (snipLn) snipLn.visible = false;
    var ring = $('#snipWarn');
    if (ring) { ring.hidden = true; ring.classList.remove('on'); }
  }
  function hitMark(head) {
    var el = $('#hitmk'); el.classList.remove('on', 'head'); void el.offsetWidth; el.classList.add('on'); if (head) el.classList.add('head');
    Sfx.sfx('hitmark');
  }

  function ET(k) { return (cfg.enemies.types && cfg.enemies.types[k]) || { hp: 80, acc: 0.4, dmg: 10, speed: 2.4 }; }
  function spawnEnemy(type, x, z) {
    var pts = W.S.spawns, bag = (Math.random() < 0.45 ? pts.sea : pts.shore) || pts.sea || [[0, -50]];
    var sp = bag[Math.floor(Math.random() * bag.length)];
    var e = { type: type, hp: ET(type).hp, state: 'advance', x: x != null ? x : sp[0] + rnd(-3, 3), z: z != null ? z : sp[1] + rnd(-2, 2), t: 0, fireCd: rnd(0.4, 1.2), burst: 0, cover: null, exposed: true, walkT: Math.random() * 6, dieT: 0, flinch: 0, relocT: rnd(4, 6), peekT: 0, crouch: 0 };
    var m = buildEnemy(type, e); e.group = m.group; e.hit = m.hit; e.j = m.joints; e.outline = m.outline;
    e.group.position.set(e.x, 0, e.z); scene.add(e.group);
    pickCover(e);
    if (type === 'rusher' && H.onRusher) H.onRusher();
    return e;
  }
  function pickCover(e) {
    var list = W.S.eCovers, best = null, bs = 1e9, i, p = W.pos();
    for (i = 0; i < list.length; i++) {
      var c = list[i], sc = Math.hypot(c.x - p.x, c.z - p.z) + Math.hypot(c.x - e.x, c.z - e.z) * 0.4 + (c.taken || 0) * 12;
      if (sc < bs) { bs = sc; best = c; }
    }
    if (e.cover) e.cover.taken = Math.max(0, (e.cover.taken || 0) - 1);
    e.cover = best; if (best) best.taken = (best.taken || 0) + 1;
    e.state = e.type === 'rusher' ? 'rush' : 'advance';
  }
  function playerCovered() {
    var veh = W.inVehicle && W.inVehicle();
    if (veh && veh.type === 'cart') return true;
    return !!(A.cover && A.cover.alive && W.S.crouch && !A.peek);
  }
  function playerPeeking() { return !!(A.cover && A.cover.alive && A.peek); }

  function hitSandbag(dmg) {
    var c = A.cover, warnAt;
    if (!c || c.type !== 'sandbag' || !c.alive) return;
    warnAt = ((cfg.cover.types.sandbag && cfg.cover.types.sandbag.warnAtPct) || 30) / 100;
    var before = c.hp / c.maxhp; c.hp -= dmg; var after = c.hp / c.maxhp;
    if (before > warnAt && after <= warnAt) { W.crackCover(c); Cbt.msg(cfg.cover.feedback.sandbagWarn, 2200); }
    if (c.hp <= 0) { W.killCover(c); Cbt.msg('沙包被打爛了！換個位置', 2200); Sfx.sfx('thud'); A.cover = null; }
  }
  function enemyShoot(e, accMul) {
    var mode = modeMul(), et = ET(e.type), mz = new T.Vector3();
    e.j.muzzle.getWorldPosition(mz);
    var p = W.pos(), F = W.S, toLin = A.lin && A.lin.hp > 0 && Math.random() < 0.22;
    var tx = toLin ? A.lin.x : p.x, tz = toLin ? A.lin.z : p.z, ty = toLin ? 1.1 : F.eye;
    var dx = tx - mz.x, dy = ty - mz.y, dz = tz - mz.z, dl = Math.hypot(dx, dy, dz) || 1;
    var crouched = playerCovered(), peeking = playerPeeking();
    var blocked = W.rayBlock(mz.x, mz.y, mz.z, dx / dl, dy / dl, dz / dl, dl - 0.5, null, !crouched) < dl - 0.6;
    var acc = et.acc * mode.enemyAccMul * (accMul || 1);
    var veh = W.inVehicle && W.inVehicle();
    if (veh && veh.type === 'sampan') acc *= ((cfg.props && cfg.props.sampan && cfg.props.sampan.enemyAccMul) || 0.8);
    if (veh && (veh.type === 'bike' || veh.type === 'motorcycle') && cfg.vehicles.motorcycle) acc *= cfg.vehicles.motorcycle.enemyAccMul || 0.6;
    if (veh && veh.type === 'jeep' && cfg.vehicles.jeep) acc *= cfg.vehicles.jeep.enemyAccMul || 0.7;
    if (A.carrying) acc *= (cfg.carry.enemyAccMul || 0.5);
    if (A.smokeT > 0) acc *= (cfg.raw && cfg.raw.smokeRule && cfg.raw.smokeRule.enemyAccMulInSmoke) || 0.6;
    var sv = H.save && H.save();
    if (sv && sv.flags && sv.flags.isl_power_restored) acc *= 1.1;
    if (crouched) acc *= cfg.cover.crouched.enemyAccMul;
    else if (peeking) acc *= cfg.cover.peeking.enemyAccMul;
    if (toLin) {
      acc *= 0.35;
      var hitL = !blocked && Math.random() < acc;
      tracer(mz.x, mz.y, mz.z, tx, ty, tz, '#ffb070');
      if (hitL) {
        A.lin.hp = Math.max(0, A.lin.hp - et.dmg * 0.9);
        if (A.lin.hp <= 0 && H.onLinDown) H.onLinDown();
      }
      return;
    }
    var coverStruck = crouched && blocked;
    var hit = coverStruck ? Math.random() < acc : (!blocked && Math.random() < acc);
    tracer(mz.x, mz.y, mz.z, tx + (hit ? 0 : rnd(-1.4, 1.4)), ty, tz + (hit ? 0 : rnd(-1.4, 1.4)), '#ff9a55');
    if (coverStruck) hitSandbag(et.dmg);
    if (hit) {
      var dmgMul = 1;
      if (crouched && A.cover && cfg.cover.crouched.dmgTakenMul[A.cover.type] != null) dmgMul = cfg.cover.crouched.dmgTakenMul[A.cover.type];
      else if (peeking) dmgMul = cfg.cover.peeking.dmgTakenMul;
      if (veh && veh.type === 'cart') dmgMul *= ((cfg.props && cfg.props.generator_cart && cfg.props.generator_cart.cover && cfg.props.generator_cart.cover.dmgTakenMul) || 0.1);
      else if (veh && veh.type === 'jeep') {
        dmgMul *= 0.4;
        if (W.damageVehicle) W.damageVehicle(et.dmg * (cfg.vehicles.jeep.armorDmgMul || 0.4));
      } else if (veh && (veh.type === 'bike' || veh.type === 'motorcycle') && W.damageVehicle) {
        W.damageVehicle(et.dmg);
      }
      var dmg = et.dmg * mode.dmgTakenMul * dmgMul;
      if (dmgMul < 1) Cbt.msg(cfg.cover.feedback.blockedHint, 800);
      if (dmg > 0) hurt(dmg);
    }
  }
  function hurt(dmg) {
    var mode = modeMul();
    if (A.carrying) dmg *= cfg.carry.dmgTakenMul || 0.6;
    A.pack.hp = Math.max(mode.canDie === false ? 1 : 0, Math.round(A.pack.hp - dmg));
    A.hurtT = 0.35; Sfx.sfx('hurt');
    if (H.onHp) H.onHp();
    if (A.pack.hp / A.pack.hpMax * 100 <= cfg.health.lowHpPct) Cbt.msg('體力很低，用急救包', 1600);
    if (A.pack.hp <= 0 && !A.hpZero) {
      A.hpZero = true; A.firing = false;
      if (H.onDown) H.onDown();
    }
    refreshHud();
  }
  function damageEnemy(e, dmg, head) {
    if (e.state === 'dead') return;
    e.hp -= dmg; e.flinch = 0.18;
    if (e.hp <= 0) {
      e.state = 'dead'; e.exposed = false; e.dieT = 0; A.killed++;
      if (A.gatherMode) A.gatherKilled = (A.gatherKilled || 0) + 1;
      if (e.cover) e.cover.taken = Math.max(0, (e.cover.taken || 0) - 1);
      if (H.onKill) H.onKill(e, head);
    }
  }
  function updateEnemy(e, dt) {
    var p = W.pos(), j = e.j, et = ET(e.type);
    if (e.state === 'dead') {
      e.dieT += dt; var k = Math.min(1, e.dieT / 0.55);
      e.group.rotation.x = -k * 1.45;
      if (e.dieT > 3.2 && e.group.parent) { e.group.parent.remove(e.group); e.gone = true; }
      return;
    }
    e.t += dt; e.fireCd -= dt; e.relocT -= dt; e.flinch = Math.max(0, e.flinch - dt);
    var veh = W.inVehicle && W.inVehicle();
    var noisy = A.noiseOn || (veh && (veh.type === 'bike' || veh.type === 'motorcycle'));
    var nd = Math.hypot(e.x - p.x, e.z - p.z);
    if (noisy && nd < 100) {
      e.exposed = true; e.alerted = true; A.stealthBroken = true; A.alerted = true;
      if (e.state === 'cover') { e.state = 'peek'; e.t = 0; e.burst = 3; e.peekDur = 1.6; }
      if (e.state === 'advance') e.state = 'rush';
    }
    var silent = A.stealthWave && !A.alerted && !A.noiseOn;
    if (e.type === 'sniper' && !silent) {
      e.group.rotation.y = Math.atan2(p.x - e.x, p.z - e.z);
      e.exposed = true;
      var lockSec = (cfg.raw && cfg.raw.sniperTelegraph && cfg.raw.sniperTelegraph.lockSec) || 1;
      if (W.S.crouch) {
        e.lockT = 0; hideSnip();
      } else {
        e.lockT = (e.lockT || 0) + dt;
        showSnip(e, p);
        if (e.lockT >= lockSec) { e.lockT = 0; enemyShoot(e, 1.1); }
      }
      e.group.position.set(e.x, 0, e.z);
      if (W.applyEnemyVis) W.applyEnemyVis(e);
      return;
    }
    var toX = e.cover ? e.cover.x : p.x, toZ = e.cover ? e.cover.z : p.z, moving = false;
    if (e.state === 'advance' || e.state === 'rush') {
      var tx = e.state === 'rush' ? p.x : toX, tz = e.state === 'rush' ? p.z - 0.6 : toZ;
      var dx = tx - e.x, dz = tz - e.z, dd = Math.hypot(dx, dz) || 1;
      var sp = e.state === 'rush' ? (et.speed || 4.6) : (et.speed || 2.4);
      if (e.type === 'scout' && dd < 22 && !e.called) {
        e.called = true; A.alerted = true; A.spawnT = Math.min(A.spawnT, 0.4);
        Cbt.msg('偵察兵在呼叫支援', 1600);
        if (A.stealthWave) Cbt.reinforce(A.reinforce);
      }
      if (e.state === 'rush' && dd < 2.2 && !silent) {
        e.rushT = (e.rushT || 0) - dt;
        if (e.rushT <= 0) {
          e.rushT = 1.4;
          var macc = et.acc * modeMul().enemyAccMul * (playerCovered() ? 0.5 : 1);
          if (Math.random() < macc) {
            var mmul = playerCovered() && A.cover ? (cfg.cover.crouched.dmgTakenMul[A.cover.type] || 0.1) : 1;
            if (mmul < 1) Cbt.msg(cfg.cover.feedback.blockedHint, 800);
            if (mmul * et.dmg > 0) hurt(et.dmg * modeMul().dmgTakenMul * mmul);
          }
        }
      } else if (e.state === 'advance' && dd < 0.9) { e.state = 'cover'; e.t = 0; e.peekT = rnd(0.8, 1.6); }
      else { e.x += dx / dd * sp * dt; e.z += dz / dd * sp * dt; moving = true; e.group.rotation.y = Math.atan2(dx, dz); }
      e.exposed = !silent || e.type === 'scout';
      if (!silent && !A.gatherMode && moving && e.fireCd <= 0 && A.grace <= 0) { e.fireCd = 2.4; enemyShoot(e, 0.5); }
    } else if (e.state === 'cover') {
      e.exposed = false; e.group.rotation.y = Math.atan2(p.x - e.x, p.z - e.z);
      if (!silent && e.t >= e.peekT) { e.state = 'peek'; e.t = 0; e.burst = e.type === 'gunner' ? 8 : 2; e.fireCd = 0.2; e.peekDur = rnd(1.0, 1.8); }
    } else if (e.state === 'peek') {
      if (silent) { e.state = 'cover'; e.exposed = false; }
      else {
        e.exposed = true; e.group.rotation.y = Math.atan2(p.x - e.x, p.z - e.z);
        if (e.fireCd <= 0 && A.grace <= 0 && e.burst > 0) { e.fireCd = e.type === 'gunner' ? 0.12 : 0.85; e.burst--; enemyShoot(e); }
        if (e.t >= e.peekDur) { e.state = 'cover'; e.t = 0; e.peekT = rnd(1.2, 2.4); if (e.relocT <= 0 && e.type === 'rifleman') { e.relocT = rnd(4, 6); pickCover(e); } }
      }
    }
    e.group.position.set(e.x, 0, e.z);
    if (W.applyEnemyVis) W.applyEnemyVis(e);
    if (j && j.thL) {
      var sw = moving ? Math.sin(e.t * 9) * 0.6 : 0;
      j.thL.rotation.x = sw; j.thR.rotation.x = -sw;
    }
    void j;
  }

  Cbt.throwNade = function () {
    if (!A || A.pack.nades <= 0 || A.nadeT > 0 || A.carrying) return;
    A.pack.nades--; A.nadeT = cfg.grenade.fuse || 1.1;
    var p = W.pos(), F = W.S, ad = aimDir();
    A.nade = { x: p.x, y: F.eye, z: p.z, vx: ad.d[0] * 14, vy: 3.2, vz: ad.d[2] * 14, t: A.nadeT };
    Sfx.sfx('click'); Cbt.msg('手榴彈出手', 900); refreshHud();
  };
  function boom(n) {
    Sfx.sfx('boom');
    var r = cfg.grenade.radius, dmg = cfg.grenade.dmg;
    A.enemies.forEach(function (e) {
      if (e.state === 'dead') return;
      var d = Math.hypot(e.x - n.x, e.z - n.z);
      if (d < r) damageEnemy(e, dmg * (1 - d / r), false);
    });
    dust(n.x, 0.4, n.z); dust(n.x + 0.6, 0.5, n.z);
  }
  Cbt.medkit = function () {
    if (!A || A.pack.medkits <= 0) return;
    if (A.pack.hp >= A.pack.hpMax) { Cbt.msg('體力還夠', 1000); return; }
    A.pack.medkits--;
    A.pack.hp = Math.min(A.pack.hpMax, A.pack.hp + Math.round(A.pack.hpMax * (cfg.health.medkitHealPct || 40) / 100));
    Sfx.sfx('success'); Cbt.msg('用了急救包', 1400); if (H.onHp) H.onHp(); refreshHud();
  };
  Cbt.setCarrying = function (on) {
    if (!A) return;
    A.carrying = !!on; A.ads = false; W.setAds(false); W.setCarry(!!on);
    if (on) {
      leaveCover(); W.setCrouch(false);
      A.smokeT = (cfg.raw && cfg.raw.smokeRule && cfg.raw.smokeRule.carrySmokeSec) || (cfg.carry && cfg.carry.smokeSec) || 6;
      A.smokeSpawn = 0;
    } else A.smokeT = 0;
    refreshHud();
  };
  Cbt.restoreHp = function () { if (A) { A.pack.hp = A.pack.hpMax; A.hpZero = false; refreshHud(); } };
  Cbt.hurtPlayer = function (dmg) { if (A) hurt(dmg); };
  Cbt.tickSampanRisk = function (dt) {
    if (!A) return false;
    var ride = W.inVehicle && W.inVehicle();
    if (!ride || ride.type !== 'sampan') return false;
    if (H.save && H.save() && H.save()._e2eSkipGunner) return false;
    if (root.location && /[?&]auto=1/.test(root.location.search || '')) return false;
    A._sampanT = (A._sampanT || 0) + dt;
    if (A._sampanT <= 1.8 || A._sampanHit) return false;
    A._sampanT = 0;
    if (Math.random() < 0.22 * modeMul().enemyAccMul) {
      A._sampanHit = true;
      if (W.wreckVehicle) W.wreckVehicle('gunner', 20);
      else { W.exitVehicle(); hurt(20); Cbt.msg('機槍手發現了。船翻了。', 2000); }
      return true;
    }
    return false;
  };
  Cbt.toggleLight = function () {
    if (!W.setFlashlight) return;
    var on = !W.S.flashlight;
    W.setFlashlight(on);
    Cbt.msg(on ? '手電筒開了。對方也看得到。' : '手電關了。', 1400);
    var btn = $('#bLight'); if (btn) btn.classList.toggle('on', on);
  };

  function refreshHud() {
    if (!A) return;
    var sl = A.pack[A.weap], hard = ((H.save && H.save().diff) || 'hardcore') === 'hardcore';
    var frac = sl.mag / sl.size, hint = magHint(frac, A.reload > 0, sl.mag === 0);
    if (jeepGun()) {
      var heatMax = ((cfg.vehicles && cfg.vehicles.jeep && cfg.vehicles.jeep.gunner && cfg.vehicles.jeep.gunner.overheatSec) || 6);
      hudSet('#magHint', 'h', A.overheat ? '過熱' : ('熱 ' + Math.round(((A.heat || 0) / heatMax) * 100) + '%'), function (el, v) { el.textContent = v; });
      hudSet('#magRes', 'r', 'mount', function (el) { el.textContent = '車載'; });
      hudSet('#fireMode', 'f', 'mg', function (el) { el.textContent = '連發'; });
    } else {
      hudSet('#magHint', 'h', hard ? hint : (sl.mag + ' / ' + sl.size + '　' + hint), function (el, v) { el.textContent = v; });
      hudSet('#magRes', 'r', sl.mags + '|' + A.weap, function (el) { el.textContent = '備用 ' + new Array(sl.mags + 1).join('▮') + (sl.mags ? '' : '無'); });
      hudSet('#fireMode', 'f', A.fireMode + A.weap, function (el) { el.textContent = (A.weap === 'm9' || A.weap === 't65' ? '半自動' : (A.fireMode === 'semi' ? '單發' : '連發')); });
    }
    var cs = A.carrying ? '背負中' : (A.cover ? (A.peek ? '探頭' : '掩體') : (W.S.crouch ? '蹲下' : ''));
    hudSet('#coverState', 'c', cs, function (el, v) { el.textContent = v; });
    hudSet('#wepName', 'w', A.weap + (jeepGun() ? '|mg' : ''), function (el) { el.textContent = jeepGun() ? '車載 T75' : wep().name; });
    var seat = W.seat && W.seat();
    var seatBtn = $('#bSeat');
    if (seatBtn) {
      var vnow = W.inVehicle && W.inVehicle();
      seatBtn.hidden = !(vnow && vnow.type === 'jeep');
      seatBtn.textContent = seat === 'gunner' ? '射手' : (seat === 'passenger' ? '乘客' : '駕駛');
      seatBtn.classList.toggle('on', seat === 'gunner');
    }
    var touch = W.isMobileLike();
    document.body.classList.toggle('touch', touch);
    document.body.classList.toggle('hardcore', hard);
    $('#bWeap').textContent = A.weap === 'm9' ? 'M9' : (A.weap === 't75' ? 'T75' : (A.weap === 't65' ? 'T65' : 'T91'));
    $('#bCrouch').textContent = W.S.crouch && !A.peek ? '探頭' : '蹲下';
    $('#bCrouch').classList.toggle('on', !!W.S.crouch);
    $('#bAds').classList.toggle('on', !!A.ads);
    $('#bAds').classList.toggle('dim', !!A.carrying);
    $('#bFire').classList.toggle('dim', !!A.carrying);
    $('#bNade').textContent = '手榴彈 ' + A.pack.nades;
    $('#bMed').textContent = '急救 ' + A.pack.medkits;
    $('#bVeh').textContent = W.inVehicle() ? '下車' : '上車';
    $('#bCarry').classList.toggle('on', !!A.carrying);
    $('#xhair').classList.toggle('ads', !!A.ads);
    $('#xhair').classList.toggle('lock', !!(A.aimAssist && overTarget()));
    if (A.combat) $('#waveLeft').textContent = '剩餘 ' + Math.max(0, A.total - A.killed);
  }
  Cbt.refresh = refreshHud;

  Cbt.tick = function (dt) {
    if (!A || !A.active) return;
    A.swayT += dt; A.grace = Math.max(0, A.grace - dt); A.flashT -= dt;
    if (A.flashT <= 0 && flash) flash.visible = false;
    if (A.reload > 0) {
      A.reload -= dt;
      if (A.reload <= 0) {
        var sl = A.pack[A.weap]; sl.mags--; sl.mag = sl.size;
      }
    }
    A.cd = Math.max(0, A.cd - dt);
    if (A._seatCd > 0) A._seatCd -= dt;
    if (jeepGun()) {
      if (A.firing && !A.overheat) {
        A.heat = (A.heat || 0) + dt;
        if (A.heat >= ((cfg.vehicles && cfg.vehicles.jeep && cfg.vehicles.jeep.gunner && cfg.vehicles.jeep.gunner.overheatSec) || 6)) {
          A.overheat = true; A.firing = false; A.cool = ((cfg.vehicles && cfg.vehicles.jeep && cfg.vehicles.jeep.gunner && cfg.vehicles.jeep.gunner.cooldownSec) || 3);
          Cbt.msg('機槍過熱', 1400);
        }
      } else if (!A.overheat) A.heat = Math.max(0, (A.heat || 0) - dt * 1.6);
      if (A.overheat) {
        A.cool = (A.cool || 0) - dt;
        if (A.cool <= 0) { A.overheat = false; A.heat = 0; Cbt.msg('機槍冷卻好了', 1000); }
      }
    }
    if (A.firing && (jeepGun() || (A.fireMode === 'auto' && (A.weap === 't91' || A.weap === 't75')))) tryFire(false);
    if (A.buddyGunner && A.combat) {
      A._buddyCd = (A._buddyCd || 0.5) - dt;
      if (A._buddyCd <= 0) {
        A._buddyCd = 0.28;
        var be = A.enemies.filter(function (en) { return en.state !== 'dead'; })[0];
        if (be) damageEnemy(be, 14, false);
      }
    }
    if (A.hurtT > 0) { A.hurtT -= dt; $('#dmgfx').style.opacity = String(Math.min(0.85, 0.25 + (1 - A.pack.hp / A.pack.hpMax) * 0.6)); }
    else $('#dmgfx').style.opacity = A.pack.hp / A.pack.hpMax < 0.25 ? '0.35' : '0';
    if (A.nade) {
      var n = A.nade; n.t -= dt; n.vy -= 9 * dt; n.x += n.vx * dt; n.y += n.vy * dt; n.z += n.vz * dt;
      if (n.y < 0.2 || n.t <= 0) { boom(n); A.nade = null; }
    }
    tracerPool.forEach(function (t) { if (t.line.visible) { t.life -= dt; if (t.life <= 0) t.line.visible = false; } });
    dustPool.forEach(function (d) { if (d.s.visible) { d.life -= dt; d.s.position.y += d.vy * dt; d.s.material.opacity = Math.max(0, d.life); if (d.life <= 0) d.s.visible = false; } });
    if (A.combat) {
      A.spawnT -= dt;
      if (!A.gatherMode && A.queue.length && A.spawnT <= 0 && A.enemies.filter(function (e) { return e.state !== 'dead'; }).length < (cfg.enemies.maxOnScreen || 8)) {
        A.enemies.push(spawnEnemy(A.queue.shift())); A.spawnT = 1.1;
      }
      A.enemies.forEach(function (e) { updateEnemy(e, dt); });
      A.enemies = A.enemies.filter(function (e) { return !e.gone; });
      if (!A.gatherMode && !A.queue.length && A.enemies.every(function (e) { return e.state === 'dead'; }) && A.total && !A.ended) {
        A.ended = true;
        if (H.onWaveClear) H.onWaveClear();
      }
    }
    Cbt.tickSampanRisk(dt);
    if (A.smokeT > 0) {
      A.smokeT -= dt; A.smokeSpawn = (A.smokeSpawn || 0) - dt;
      if (A.smokeSpawn <= 0) {
        A.smokeSpawn = 0.1;
        var sp = W.pos();
        dust(sp.x + rnd(-1.0, 1.0), 0.4 + Math.random(), sp.z + rnd(-1.0, 1.0));
      }
    }
    if (Cbt.bot === 'aim' && A.combat) botTick(dt);
    refreshHud();
  };

  function botTick(dt) {
    var es = A.enemies.filter(function (e) { return e.state !== 'dead'; }), F = W.S;
    if (!es.length) return;
    var e = es[0], a = angTo(e.x, 1.2, e.z);
    F.yaw += Math.atan2(Math.sin(a.yaw - F.yaw), Math.cos(a.yaw - F.yaw)) * Math.min(1, dt * 8);
    F.pitch += (a.pitch - F.pitch) * Math.min(1, dt * 8);
    A.peek = true; W.setCrouch(false);
    es.forEach(function (en) {
      en.exposed = true;
      if (en.state === 'cover') en.state = 'peek';
      damageEnemy(en, 999, false);
    });
    if (A.pack[A.weap].mag <= 0) Cbt.reload();
    else { A.firing = true; A.aimAssist = true; tryFire(false); }
  }

  root.Combat = Cbt;
})(typeof self !== 'undefined' ? self : this);
