/* 漢光海岸戰鬥：第一人稱射擊（舉槍切換視角）、掩體、敵人 AI 與波次。
 * 數值全部來自 data/fps-system.json；射線判定用 hitscan，只畫曳光線。 */
(function (root) {
  'use strict';
  var T = root.THREE, E = root.Engine, W = root.World, Sfx = root.Sfx;
  var $ = function (s) { return document.querySelector(s); };
  var FPS = { bot: null };
  if (!T) { root.FPS = FPS; return; }
  var DEG = Math.PI / 180;
  var cfg = null, H = {}, A = null, dpool = null, enemyMats = {}, geoCache = {};
  var scene = null, tracerPool = [], dustPool = [], flash = null, rc = new T.Raycaster();
  var hudCache = {};

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function G() { return H.G(); }
  function hudSet(id, key, val, fn) { if (hudCache[id + key] === val) return; hudCache[id + key] = val; fn($(id), val); }

  /* ---------- 敵人模型（低多邊形人形，階層式關節） ---------- */
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
    rusher: { u: '#5c5c54', v: '#44443d', h: '#3a3a33', s: '#d1a077' }
  };
  function triCount(obj) {
    var n = 0;
    obj.traverse(function (o) { if (o.isMesh) { var g = o.geometry; n += g.index ? g.index.count / 3 : g.attributes.position.count / 3; } });
    return n;
  }
  function buildEnemy(type, e) {
    var P = PAL[type], g = new T.Group(), hit = [], detail = [], j = {};
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
      var boot = mesh(sh, geo('box', 0.1, 0.09, 0.25), '#1c1d1a', 0, -0.45, 0.05, 'limb'); detail.push(boot);
      j['th' + side] = th; j['sh' + side] = sh;
    });
    var torso = new T.Group(); torso.position.y = 0.1; hips.add(torso); j.torso = torso;
    var chest = mesh(torso, geo('cyl', 0.19, 0.16, 0.56, 8), P.u, 0, 0.3, 0, 'body'); chest.scale.z = 0.62;
    if (type !== 'rusher') { var vest = mesh(torso, geo('box', 0.4, 0.34, 0.26), P.v, 0, 0.34, 0, 'body'); detail.push(vest); }
    mesh(torso, geo('cyl', 0.05, 0.055, 0.09, 6), P.s, 0, 0.62, 0, 'body');
    var head = mesh(torso, geo('sph', 0.105), P.s, 0, 0.74, 0, 'head'); j.head = head;
    if (type === 'rusher') { var cap = mesh(torso, geo('dome', 0.115), P.h, 0, 0.76, 0, 'head'); detail.push(cap); }
    else { var hel = mesh(torso, geo('dome', 0.14), P.h, 0, 0.77, 0, 'head'); hel.scale.y = 1.05; detail.push(hel); }
    ['L', 'R'].forEach(function (side, i) {
      var sg = new T.Group(); sg.position.set(i ? 0.24 : -0.24, 0.5, 0); torso.add(sg);
      mesh(sg, geo('cyl', 0.055, 0.047, 0.29, 8), P.u, 0, -0.145, 0, 'limb');
      var el = new T.Group(); el.position.y = -0.29; sg.add(el);
      mesh(el, geo('cyl', 0.047, 0.04, 0.27, 8), P.u, 0, -0.135, 0, 'limb');
      var hand = mesh(el, geo('box', 0.07, 0.07, 0.09), P.s, 0, -0.3, 0, 'limb'); detail.push(hand);
      j['sg' + side] = sg; j['el' + side] = el;
    });
    var gun = new T.Group(); gun.position.set(0.02, 0.38, 0.28); torso.add(gun); j.gun = gun;
    var glen = type === 'gunner' ? 0.85 : 0.68;
    mesh(gun, geo('box', 0.05, 0.08, glen), '#222421', 0, 0, 0, 'limb');
    var brl = mesh(gun, geo('cyl', 0.014, 0.014, 0.4, 6), '#151614', 0, 0.015, glen / 2 + 0.18, 'limb'); brl.rotation.x = Math.PI / 2;
    if (type === 'gunner') mesh(gun, geo('box', 0.08, 0.1, 0.16), '#2b2e29', 0, -0.08, 0.05, 'limb');
    j.muzzle = new T.Object3D(); j.muzzle.position.set(0, 0.015, glen / 2 + 0.4); gun.add(j.muzzle);
    if (type === 'gunner') g.scale.setScalar(1.05);
    g.userData.detail = detail;
    return { group: g, hit: hit, joints: j, detail: detail };
  }
  FPS.enemyTris = function () { var out = {}; ['rifleman', 'gunner', 'rusher'].forEach(function (t) { var m = buildEnemy(t, {}); out[t] = triCount(m.group); }); return out; };

  /* ---------- 初始化與 HUD ---------- */
  FPS.init = function (hooks) {
    H = hooks; cfg = E.data().fps; scene = W.scene();
    $('#bRaise').addEventListener('click', function () { FPS.toggleRaise(); });
    $('#bCover').addEventListener('click', function () { FPS.coverKey(); });
    $('#bReload').addEventListener('click', function () { FPS.reload(); });
    $('#bMode').addEventListener('click', function () { FPS.toggleMode(); });
    $('#bAssist').addEventListener('click', function () { FPS.toggleAssist(); });
    var bf = $('#bFire');
    bf.addEventListener('pointerdown', function (e) { e.preventDefault(); FPS.fireDown(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { bf.addEventListener(ev, function () { FPS.fireUp(); }); });
    for (var i = 0; i < 14; i++) {
      var ln = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(0, 0, -1)]), new T.LineBasicMaterial({ color: '#ffe9a0', transparent: true, opacity: 0.9 }));
      ln.visible = false; ln.frustumCulled = false; scene.add(ln); tracerPool.push({ line: ln, life: 0 });
    }
    var dc = document.createElement('canvas'); dc.width = dc.height = 32; var dx = dc.getContext('2d');
    var gr = dx.createRadialGradient(16, 16, 2, 16, 16, 15); gr.addColorStop(0, 'rgba(230,205,150,.9)'); gr.addColorStop(1, 'rgba(230,205,150,0)'); dx.fillStyle = gr; dx.fillRect(0, 0, 32, 32);
    var dtex = new T.CanvasTexture(dc);
    for (i = 0; i < 40; i++) {
      var sp = new T.Sprite(new T.SpriteMaterial({ map: dtex, transparent: true, depthWrite: false, fog: true })); sp.visible = false; scene.add(sp); dustPool.push({ s: sp, life: 0, vy: 0 });
    }
    flash = new T.Mesh(new T.PlaneGeometry(0.16, 0.16), new T.MeshBasicMaterial({ color: '#ffd77a', transparent: true, opacity: 0.95, depthTest: false }));
    flash.position.set(0.17, -0.12, -0.84); flash.visible = false; W.camera().add(flash);
  };

  function newSession(o) {
    var g = G(), b = g.beach, total = b.mags;
    return {
      active: true, id: o.id, spec: o.enemies, enemies: [], queue: [], spawnT: o.grace != null ? o.grace : 4, killed: 0, total: 0, holdLeft: o.holdSec || 0, holdSec: o.holdSec || 0,
      mag: o.mag != null ? o.mag : 30, mags: o.mags != null ? o.mags : Math.max(0, total - 1), fireMode: 'semi', ads: false, reload: 0, reloadTotal: 0, cd: 0, firing: false, rec: 0,
      swayT: 0, shakeT: 0, cover: null, peek: false, peekT: 0, buddyUsed: false, zone: o.zone, awayT: 0, lin: o.lin ? { hp: (E.data().tune.beach || {}).signalHp || 100, max: 100 } : null,
      raised: false, noise: 0, hurtT: 0, hpZero: false, ended: false, carrying: !!o.carrying, enemyTick: 0, firers: 0, suppress: false, botT: 0, botIdle: 0, lowT: 0, startAnchor: o.anchor, waveName: o.name,
      aimAssist: !!b.aim, kills: 0, shots: 0, hits: 0, rushHit: 0, killedHeadshots: 0, grace: o.grace != null ? o.grace : 4, barks: {}, warnedBag: false
    };
  }

  /* ---------- 波次 ---------- */
  FPS.startWave = function (o) {
    // o: {id, enemies:{type:n}, holdSec, zone, anchor:[x,z], lin, mag, mags, name, carrying}
    FPS.stop(true);
    var g = G();
    if (g && g.beach && g.beach.medevac) return null;
    A = newSession(o);
    W.reviveCovers();
    var list = [];
    Object.keys(o.enemies).forEach(function (k) { for (var i = 0; i < o.enemies[k]; i++) list.push(k); });
    // 洗牌讓類型交錯，gunner 先到位
    list.sort(function (a, b) { return (a === 'gunner' ? -1 : 0) - (b === 'gunner' ? -1 : 0) || Math.random() - 0.5; });
    A.queue = list; A.total = list.length;
    if (o.anchor && !o.carrying) { W.place(o.anchor[0], o.anchor[1]); }
    if (!o.carrying) snapCover();
    $('#fps').hidden = false; refreshButtons();
    FPS.banner('第 ' + o.num + ' 波：' + o.name);
    if (g.beach.diff === 'story') FPS.msg('劇情向：不會倒下', 3000);
    return A;
  };
  FPS.stop = function (silent) {
    if (!A) return;
    A.enemies.forEach(function (e) { if (e.group.parent) e.group.parent.remove(e.group); });
    A.enemies = []; A.queue = []; A.active = false; A.ended = true; A.firing = false;
    if (W.S.fps.on) W.fpsExit();
    W.setCrouch(false); W.speed(1);
    tracerPool.forEach(function (t) { t.line.visible = false; });
    dustPool.forEach(function (d) { d.s.visible = false; });
    $('#fps').hidden = true; $('#xhair').hidden = true; $('#dmgfx').style.opacity = 0;
    var keep = A; A = null;
    if (!silent && H.onStopped) H.onStopped(keep);
  };
  FPS.session = function () { return A; };
  FPS.enterCover = function () { if (A) { snapCover(); refreshButtons(); } };
  FPS.active = function () { return !!(A && A.active); };
  FPS.setCarrying = function (v) { if (A) { A.carrying = !!v; if (v) { leaveCover(); if (W.S.fps.on) FPS.lower(); } refreshButtons(); } };
  FPS.setZone = function (z) { if (A) { A.zone = z; A.awayT = 0; } };

  function snapCover() {
    if (!A || A.carrying) return;
    var p = W.pos(), c = W.nearestCover(p.x, p.z, 1.3);
    if (c) { takeCover(c); }
  }
  function takeCover(c) {
    A.cover = c; A.peek = false; W.place(c.ax, c.az); W.setCrouch(true);
    if (c.type === 'rock') bark('on_first_rock_cover');
  }
  function leaveCover() { if (!A) return; A.cover = null; A.peek = false; W.setCrouch(false); }

  /* ---------- 輸入 ---------- */
  function refreshButtons() {
    var on = !!A, fp = W.S.fps.on, touch = W.isMobileLike(), carry = !!(A && A.carrying);
    $('#fpsBtns').classList.toggle('touch', touch);
    $('#bFire').hidden = !fp; $('#bReload').hidden = !fp; $('#bMode').hidden = !fp; $('#bAssist').hidden = !on;
    $('#bRaise').textContent = fp ? '放下' : '舉槍'; $('#bRaise').hidden = !on;
    $('#bCover').hidden = !on; $('#bCover').textContent = fp && A && A.cover ? (A.peek ? '蹲下' : '探頭') : '掩體';
    $('#bRaise').classList.toggle('dim', carry);
    $('#bCover').classList.toggle('dim', carry);
    $('#bMode').textContent = A && A.fireMode === 'semi' ? '單發' : '連發';
    $('#bAssist').textContent = '輔助瞄準：' + (A && A.aimAssist ? '開' : '關');
    $('#xhair').hidden = !fp;
    $('#fpsHint').hidden = touch || !on;
  }
  FPS.toggleRaise = function () {
    if (!A) return;
    if (A.carrying) { FPS.msg('背著人不能舉槍', 1600); return; }
    if (W.S.fps.on) FPS.lower(); else FPS.raise();
  };
  FPS.raise = function () {
    if (A && A.carrying) { FPS.msg('背著人不能舉槍', 1600); return false; }
    if (!A || !A.active || W.S.fps.on) return false;
    var p = W.pos(), near = A.cover || W.nearestCover(p.x, p.z, 1.3);
    var za = A.startAnchor, nearPost = za && Math.hypot(p.x - za[0], p.z - za[1]) < 4;
    if (!near && !nearPost) { FPS.msg('靠近掩體或射擊位置才能舉槍', 1800); return false; }
    if (near && !A.cover) takeCover(near);
    A.peek = true; W.setCrouch(false); W.fpsEnter(); A.peekT = 0; A.raised = true;
    Sfx.sfx('click'); refreshButtons(); return true;
  };
  FPS.lower = function () {
    if (!A) return;
    A.firing = false; A.ads = false;
    if (W.S.fps.on) W.fpsExit();
    if (A.cover) { A.peek = false; W.setCrouch(true); }
    A.raised = false; refreshButtons();
  };
  FPS.coverKey = function () {
    if (!A || !A.active) return;
    if (A.carrying) { FPS.msg('背著人不能舉槍', 1600); return; }
    if (!A.cover) {
      var p = W.pos(), c = W.nearestCover(p.x, p.z, (cfg.cover.autoSnapM || 1.2) + 0.3);
      if (!c) { FPS.msg('附近沒有掩體', 1500); return; }
      takeCover(c); Sfx.sfx('click'); refreshButtons(); return;
    }
    if (W.S.fps.on) { A.peek = !A.peek; A.peekT = 0; W.setEye(A.peek ? 1.6 : 1.0); }
    else { A.peek = false; W.setCrouch(!W.S.fps.crouch); }
    Sfx.sfx('click'); refreshButtons();
  };
  FPS.reload = function () {
    if (!A || !A.active || A.reload > 0 || A.mag >= 30) return;
    if (A.mags <= 0) { FPS.msg('沒有備用彈匣了', 1600); return; }
    var b = E.eff(G(), 'b'), r = cfg.weapon.reload, t = clamp(r.baseSec * (1 - (b - 50) / 250), r.minSec, r.maxSec);
    A.reload = A.reloadTotal = t; A.firing = false; Sfx.sfx('reload');
  };
  FPS.toggleMode = function () { if (A) { A.fireMode = A.fireMode === 'semi' ? 'auto' : 'semi'; refreshButtons(); Sfx.sfx('click'); } };
  FPS.toggleAssist = function () { if (A) { A.aimAssist = !A.aimAssist; G().beach.aim = A.aimAssist; refreshButtons(); FPS.msg('輔助瞄準' + (A.aimAssist ? '開啟（硬派經驗值 ×0.9）' : '關閉'), 1800); Sfx.sfx('click'); } };
  FPS.fireDown = function () { if (!A || !W.S.fps.on) return; A.firing = true; tryFire(true); };
  FPS.fireUp = function () { if (A) A.firing = false; };
  FPS.onAim = function (dx, dy, type) {
    if (!A || !W.S.fps.on) return;
    var F = W.S.fps, sens = type === 'touch' ? 0.2 : 0.12;
    if (A.aimAssist && overTarget()) sens *= 1 - cfg.difficulty.aimAssist.slowdownPct / 100;
    if (A.ads) sens *= 0.7;
    F.yaw -= dx * sens * DEG; F.pitch = clamp(F.pitch - dy * sens * DEG, -1.2, 1.2);
  };
  FPS.onAimJoy = function (jx, jy, dt) {
    if (!A || !W.S.fps.on) return;
    var F = W.S.fps; F.yaw -= jx * 70 * DEG * dt; F.pitch = clamp(F.pitch + jy * 50 * DEG * dt, -1.2, 1.2);
  };
  FPS.onKey = function (code) {
    if (!A) return;
    if (code === 'KeyF') FPS.toggleRaise();
    else if (code === 'KeyC') FPS.coverKey();
    else if (code === 'KeyR') FPS.reload();
    else if (code === 'KeyV') FPS.toggleMode();
    else if (code === 'KeyT') FPS.toggleAssist();
  };
  FPS.setAds = function (v) { if (A) A.ads = !!v; };

  /* ---------- 瞄準與射擊 ---------- */
  function swayAmp() {
    var g = G(), d = E.eff(g, 'd'), sk = E.skillRank(g, 'sk_marksman'), s = cfg.aiming;
    var a = s.swayBase * (1 - (d - 50) / 200) * (1 - 0.15 * sk) * (1 + g.fatigue / 150);
    if (A.shakeT > 0) a *= s.moraleShake.mul;
    if (A.ads) a *= s.adsSwayMul;
    return a;
  }
  function aimDir() {
    var F = W.S.fps, a = swayAmp(), t = A.swayT;
    var sx = a * Math.sin(t * 1.7) * 0.5, sy = a * Math.sin(t * 2.3 + 1.1) * 0.35;
    var yaw = F.yaw + sx * DEG, pitch = F.pitch + sy * DEG, cp = Math.cos(pitch);
    return { yaw: yaw, pitch: pitch, sx: sx, sy: sy, d: [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp] };
  }
  function exposedEnemies() { return A.enemies.filter(function (e) { return e.state !== 'dead' && e.exposed; }); }
  function angTo(e, tx, ty, tz) {
    var F = W.S.fps, p = W.pos(), dx = tx - p.x, dy = ty - F.eye, dz = tz - p.z, l = Math.hypot(dx, dy, dz);
    var yaw = Math.atan2(-dx, -dz), pitch = Math.asin(dy / l);
    return { yaw: yaw, pitch: pitch, dist: l };
  }
  function overTarget() {
    var F = W.S.fps, snap = cfg.difficulty.aimAssist.snapAngleDeg * DEG, i, es = exposedEnemies();
    for (i = 0; i < es.length; i++) {
      var a = angTo(es[i], es[i].x, 1.2, es[i].z), dy = Math.atan2(Math.sin(a.yaw - F.yaw), Math.cos(a.yaw - F.yaw));
      if (Math.hypot(dy, a.pitch - F.pitch) < snap) return true;
    }
    return false;
  }
  function canShoot() { return A && A.active && W.S.fps.on && A.reload <= 0 && (!A.cover || A.peek); }
  function tryFire(first) {
    if (!canShoot() || A.cd > 0) return;
    if (A.mag <= 0) { if (first) { Sfx.sfx('empty'); FPS.msg('彈匣空了，按 R 換彈', 1400); } return; }
    A.mag--; A.cd = 60 / cfg.weapon.rifle.rpm; A.shots++;
    if (A.fireMode === 'semi') A.firing = false;
    var F = W.S.fps, ad = aimDir(), p = W.pos(), dir = ad.d.slice();
    var ox = p.x, oy = F.eye, oz = p.z;
    // 輔助瞄準：4 度內吸向敵人
    if (A.aimAssist) {
      var best = null, bd = 1e9, es = exposedEnemies(), snap = cfg.difficulty.aimAssist.snapAngleDeg * DEG;
      es.forEach(function (e) {
        var a = angTo(e, e.x, 1.25, e.z), dyw = Math.atan2(Math.sin(a.yaw - ad.yaw), Math.cos(a.yaw - ad.yaw)), dd = Math.hypot(dyw, a.pitch - ad.pitch);
        if (dd < snap && dd < bd) { bd = dd; best = a; }
      });
      if (best) { var cp = Math.cos(best.pitch); dir = [-Math.sin(best.yaw) * cp, Math.sin(best.pitch), -Math.cos(best.yaw) * cp]; }
    }
    // 後座力
    var rk = cfg.aiming.recoilDeg; F.pitch += rk * DEG; A.rec += rk; F.kick = 1;
    Sfx.sfx('shot'); if (navigator.vibrate && W.isMobileLike()) { try { navigator.vibrate(15); } catch (x) { /* ignore */ } }
    flash.visible = true; A.flashT = 0.04;
    // 判定
    var skip = A.cover ? A.cover.col : null;
    var tBlock = W.rayBlock(ox, oy, oz, dir[0], dir[1], dir[2], cfg.weapon.rifle.range, skip);
    rc.set(new T.Vector3(ox, oy, oz), new T.Vector3(dir[0], dir[1], dir[2])); rc.far = tBlock;
    var metas = [];
    A.enemies.forEach(function (e) { if (e.state !== 'dead' && e.exposed) { e.group.updateMatrixWorld(true); metas = metas.concat(e.hit); } });
    var hits = metas.length ? rc.intersectObjects(metas, false) : [], tEnd = tBlock, hitE = null;
    if (hits.length) {
      var h0 = hits[0], e0 = h0.object.userData.enemy, part = h0.object.userData.part;
      tEnd = h0.distance; hitE = e0;
      var dmg = cfg.weapon.rifle.dmg * (part === 'head' ? cfg.aiming.headshotMul : part === 'limb' ? 0.7 : 1);
      A.hits++;
      damageEnemy(e0, dmg, part === 'head');
      hitMark(part === 'head');
    }
    var ex = ox + dir[0] * Math.min(tEnd, 300), ey = oy + dir[1] * Math.min(tEnd, 300), ez = oz + dir[2] * Math.min(tEnd, 300);
    tracer(ox + dir[0] * 0.8 + Math.cos(F.yaw) * 0.17, oy - 0.12 + dir[1] * 0.8, oz + dir[2] * 0.8 - Math.sin(F.yaw) * 0.17, ex, ey, ez, '#ffe9a0');
    if (!hitE) dust(ex, Math.max(0.1, ey), ez);
    if (A.mag === 0) FPS.msg('彈匣空了，按 R 換彈', 1200);
  }
  function tracer(x0, y0, z0, x1, y1, z1, col) {
    var t = tracerPool.filter(function (q) { return !q.line.visible; })[0] || tracerPool[0];
    var pos = t.line.geometry.attributes.position; pos.setXYZ(0, x0, y0, z0); pos.setXYZ(1, x1, y1, z1); pos.needsUpdate = true;
    t.line.material.color.set(col); t.line.visible = true; t.life = 0.09; t.line.material.opacity = 0.9;
  }
  function dust(x, y, z) {
    var d = dustPool.filter(function (q) { return !q.s.visible; })[0]; if (!d) return;
    d.s.position.set(x, y, z); d.s.scale.set(0.5, 0.5, 1); d.s.visible = true; d.life = 0.5; d.vy = 0.8;
  }
  function hitMark(head) {
    var el = $('#hitmk'); el.classList.remove('on', 'head'); void el.offsetWidth; el.classList.add('on'); if (head) el.classList.add('head');
    Sfx.sfx('hitmark'); if (navigator.vibrate && W.isMobileLike()) { try { navigator.vibrate(60); } catch (x) { /* ignore */ } }
  }

  /* ---------- 敵人 AI ---------- */
  var ET = function (k) { return cfg.enemies.types[k]; };
  function spawnEnemy(type) {
    var S = W.S, pts = A.id === 'wave1' ? S.spawns.sea : (Math.random() < 0.35 ? S.spawns.sea : S.spawns.shore);
    var sp = pts[Math.floor(Math.random() * pts.length)];
    var e = { type: type, hp: ET(type).hp, state: 'advance', x: sp[0] + rnd(-4, 4), z: sp[1] + rnd(-2, 2), t: 0, fireCd: rnd(0.5, 1.5), burst: 0, cover: null, group: null, hit: null, exposed: true, walkT: Math.random() * 6, dieT: 0, flinch: 0, relocT: rnd(4, 6), peekT: 0, crouch: 0, shots: 0 };
    var m = buildEnemy(type, e); e.group = m.group; e.hit = m.hit; e.j = m.joints; e.detail = m.detail;
    e.group.position.set(e.x, 0, e.z); scene.add(e.group);
    pickCover(e);
    return e;
  }
  function pickCover(e) {
    var S = W.S, p = W.pos(), list = S.eCovers, best = null, bs = 1e9, i;
    var tgt = A.lin ? { x: -32, z: 8 } : p;
    for (i = 0; i < list.length; i++) {
      var c = list[i];
      if (A.id === 'wave1' && c.kind !== 'boat') continue;
      if (A.id !== 'wave1' && c.kind === 'boat' && e.type !== 'gunner') continue;
      var dEnemy = Math.hypot(c.x - e.x, c.z - e.z), dP = Math.hypot(c.x - tgt.x, c.z - tgt.z);
      var sc = dP + dEnemy * 0.4 + c.taken * 14 + Math.random() * 14;
      if (e.cover && e.cover === c) sc += 40;
      if (e.type === 'gunner' && c.kind === 'boat') sc -= 10;
      if (sc < bs) { bs = sc; best = c; }
    }
    if (e.cover) e.cover.taken = Math.max(0, e.cover.taken - 1);
    e.cover = best; if (best) best.taken++;
    e.state = e.type === 'rusher' ? 'rush' : 'advance';
  }
  function playerPoint() {
    var p = W.pos(), F = W.S.fps; return { x: p.x, y: A.cover && !A.peek ? 0.9 : (F.on ? F.eye : 1.4), z: p.z };
  }
  function playerCovered() { return !!(A.cover && A.cover.alive && !A.peek); }
  function playerMoving() { return W.S.mv > 0.2 || A.carrying; }
  function barkCond(s, expr) {
    if (!expr) return true;
    function one(t) {
      t = String(t || '').trim();
      if (!t) return true;
      if (t === 'sgt_wang_down') return !!(s.beach && s.beach.wangDown);
      if (t.indexOf('quest>=') === 0) {
        var id = t.slice(7).trim(), q = E.data().q[id];
        return q && s.quests[id] && (s.quests[id].state === 'active' || s.quests[id].state === 'ready' || s.quests[id].state === 'done' || (s.quests.ch4_beach_command && s.quests.ch4_beach_command.state));
      }
      if (/npc_akai\s*不在場/.test(t) || t === 'npc_akai 不在場') return !E.npcPresent(s, 'npc_akai') || !!s.flags.akai_kia;
      return E.flagExpr(s, t);
    }
    return String(expr).split(/\s*\|\|\s*/).some(function (orP) { return orP.split(/\s*&&\s*/).every(one); });
  }
  function bark(trigger) {
    var barks = E.data().barks;
    if (!barks || !barks.triggers || !A) return;
    var spec = barks.triggers[trigger];
    if (!spec) return;
    if (spec.once && A.barks[trigger]) return;
    A.barks[trigger] = 1;
    var s = G(), pick = spec, i, fb, line, radio = false;
    if (spec.fallback && spec.fallback.length) {
      if (s.beach && s.beach.wangDown && spec.speaker === 'npc_sgt_wang') pick = null;
      if (pick && pick.speaker === 'npc_sgt_wang' && (s.flags.sgt_wang_kia || (s.beach && s.beach.wangDown))) pick = null;
      if (!pick || (pick.speaker === 'npc_akai' && !E.npcPresent(s, 'npc_akai'))) pick = null;
      if (!pick) {
        for (i = 0; i < spec.fallback.length; i++) {
          fb = spec.fallback[i];
          if (barkCond(s, fb.if) && !(fb.unlessFlag && s.flags[fb.unlessFlag])) { pick = fb; break; }
        }
      }
    }
    if (!pick) pick = spec;
    line = pick.line || spec.line;
    radio = pick.channel === 'radio';
    FPS.msg(line, 2200);
    if (radio) Sfx.sfx('radio');
  }
  function hitSandbag(dmg) {
    var c = A.cover, warnAt, before, after;
    if (!c || c.type !== 'sandbag' || !c.alive) return;
    warnAt = ((cfg.cover.types.sandbag && cfg.cover.types.sandbag.warnAtPct) || 30) / 100;
    before = c.hp / c.maxhp;
    c.hp -= dmg;
    after = c.hp / c.maxhp;
    if (before > warnAt && after <= warnAt) {
      if (W.crackCover) W.crackCover(c);
      bark('on_sandbag_30pct');
      FPS.msg((cfg.cover.feedback && cfg.cover.feedback.sandbagWarn) || '沙包要爛了，換位置！', 2200);
    }
    if (c.hp <= 0) {
      W.killCover(c);
      FPS.msg('沙包被打爛了！換個位置', 2200);
      Sfx.sfx('thud');
      $('#dmgfx').style.opacity = '0.45';
      A.cover = null;
      /* 不強制放下槍 */
    }
  }
  function enemyShoot(e, accMul) {
    var g = G(), mode = E.diffMode(g), et = ET(e.type), pp = playerPoint(), mz = new T.Vector3();
    var C = cfg.cover || {};
    e.j.muzzle.getWorldPosition(mz);
    var toLin = A.lin && A.lin.hp > 0 && Math.random() < 0.7;
    var tx = toLin ? -32 : pp.x, tz = toLin ? 8 : pp.z, ty = toLin ? 1.0 : pp.y;
    var dist = Math.hypot(tx - e.x, tz - e.z);
    var distF = dist > 35 ? 0.7 : 1;
    var dx = tx - mz.x, dy = ty - mz.y, dz = tz - mz.z, dl = Math.hypot(dx, dy, dz) || 1;
    var crouched = playerCovered(), peeking = !!(A.cover && A.cover.alive && A.peek);
    var noCovers = !crouched;
    var blocked = W.rayBlock(mz.x, mz.y, mz.z, dx / dl, dy / dl, dz / dl, dl - 0.5, null, noCovers) < dl - 0.6;
    var acc = et.acc * mode.enemyAccMul * distF * (accMul || 1);
    if (toLin) {
      acc *= 0.28; var hitL = !blocked && Math.random() < acc;
      tracer(mz.x, mz.y, mz.z, tx + (hitL ? 0 : rnd(-1.5, 1.5)), ty, tz + (hitL ? 0 : rnd(-1.5, 1.5)), '#ffb070');
      if (hitL) { A.lin.hp = Math.max(0, A.lin.hp - et.dmg * 0.9); if (A.lin.hp <= 0 && H.onLinDown) H.onLinDown(); }
      Sfx.sfx('hit');
      return;
    }
    if (A.carrying) acc *= 0.5;
    if (crouched) acc *= (C.crouched && C.crouched.enemyAccMul != null) ? C.crouched.enemyAccMul : 0.05;
    else if (peeking) acc *= (C.peeking && C.peeking.enemyAccMul != null) ? C.peeking.enemyAccMul : 0.7;
    if (playerMoving() && !A.carrying) acc *= 0.7;
    var coverStruck = crouched && blocked;
    var hit = coverStruck ? Math.random() < acc : (!blocked && Math.random() < acc);
    var miss = hit ? 0 : rnd(0.6, 2.4);
    tracer(mz.x, mz.y, mz.z, tx + (hit ? 0 : rnd(-miss, miss)), ty + (hit ? 0 : rnd(-0.5, 0.5)), tz + (hit ? 0 : rnd(-miss, miss)), '#ff9a55');
    if (coverStruck) hitSandbag(et.dmg);
    if (hit) {
      var dmgMul = 1;
      if (crouched && A.cover) dmgMul = (C.crouched && C.crouched.dmgTakenMul && C.crouched.dmgTakenMul[A.cover.type] != null) ? C.crouched.dmgTakenMul[A.cover.type] : 0.1;
      else if (peeking) dmgMul = (C.peeking && C.peeking.dmgTakenMul != null) ? C.peeking.dmgTakenMul : 0.5;
      var dmg = et.dmg * mode.dmgTakenMul * dmgMul;
      if (dmgMul < 1) FPS.msg((C.feedback && C.feedback.blockedHint) || '掩體擋下', 900);
      if (peeking) bark('on_first_hit_while_peeking');
      if (dmg > 0) hurt(dmg, e);
    } else if (!crouched || Math.random() < 0.3) Sfx.sfx('hit');
  }
  function hurt(dmg, from) {
    var g = G(), mode = E.diffMode(g), hm = E.hpMax(g);
    g.hp = Math.max(mode.canDie ? 0 : 1, g.hp - dmg); A.hurtT = 0.35; A.noise++;
    Sfx.sfx('hurt'); if (navigator.vibrate && W.isMobileLike()) { try { navigator.vibrate(60); } catch (x) { /* ignore */ } }
    if (H.onHp) H.onHp();
    var pct = g.hp / hm * 100;
    if (!A.buddyUsed && pct <= cfg.health.lowHpPct && g.hp > 0) {
      A.buddyUsed = true;
      var ch = clamp(30 + (E.eff(g, 'o') - 50) * 1.5, 10, 85);
      if (Math.random() * 100 < ch) { g.hp = Math.min(hm, g.hp + Math.round(hm * cfg.health.buddyRescue.healPct / 100)); FPS.msg('阿凱把急救包丟了過來：「撐住！」', 2600); if (H.onHp) H.onHp(); }
    }
    if (g.hp <= 0 && !A.hpZero) {
      A.hpZero = true; if (A.id === 'wave4') g.beach.hpZeroW4 = true;
      endWave('down');
    }
    void from;
  }
  function damageEnemy(e, dmg, head) {
    if (e.state === 'dead') return;
    e.hp -= dmg; e.flinch = 0.18;
    if (e.hp <= 0) {
      e.state = 'dead'; e.exposed = false; e.dieT = 0; A.kills++; if (head) A.killedHeadshots++;
      if (e.cover) e.cover.taken = Math.max(0, e.cover.taken - 1);
      if (H.onKill) H.onKill(e);
    }
  }
  function updateEnemy(e, dt) {
    var S = W.S, p = W.pos(), j = e.j, et = ET(e.type);
    if (e.state === 'dead') {
      e.dieT += dt; var k = Math.min(1, e.dieT / 0.55);
      e.group.rotation.x = -k * 1.45; e.group.position.y = -k * 0.12;
      if (e.dieT > 3.2 && e.group.parent) { e.group.parent.remove(e.group); e.gone = true; }
      return;
    }
    e.t += dt; e.fireCd -= dt; e.relocT -= dt; e.flinch = Math.max(0, e.flinch - dt);
    var toX = e.cover ? e.cover.x : p.x, toZ = e.cover ? e.cover.z - (e.cover.kind === 'boat' ? 1 : 0) : p.z;
    // 小林優先
    var moving = false;
    if (e.state === 'advance' || e.state === 'rush') {
      var tx = toX, tz = toZ;
      if (e.state === 'rush') { tx = p.x; tz = p.z - 0.6; }
      var dx = tx - e.x, dz = tz - e.z, dd = Math.hypot(dx, dz), sp = e.state === 'rush' ? 5.2 : e.type === 'gunner' ? 2.4 : 3.3;
      if (e.state === 'rush' && dd < 2.2) {
        moving = false; e.rushT = (e.rushT || 0) - dt;
        if (e.rushT <= 0) {
          e.rushT = 1.4;
          var mode = E.diffMode(G()), C = cfg.cover || {}, covered = playerCovered();
          var macc = et.acc * mode.enemyAccMul;
          if (A.carrying) macc *= 0.5;
          if (covered) macc *= (C.rusher && C.rusher.accMulBehindCover != null) ? C.rusher.accMulBehindCover : 0.5;
          if (C.rusher && C.rusher.meleeNeedsHitRoll && Math.random() >= macc) { Sfx.sfx('hit'); }
          else {
            var mmul = 1;
            if (covered && A.cover && C.crouched && C.crouched.dmgTakenMul && C.crouched.dmgTakenMul[A.cover.type] != null) mmul = C.crouched.dmgTakenMul[A.cover.type];
            var mdmg = et.dmg * mode.dmgTakenMul * mmul;
            if (mmul < 1) FPS.msg((C.feedback && C.feedback.blockedHint) || '掩體擋下', 900);
            if (mdmg > 0) hurt(mdmg, e);
          }
        }
      } else if (e.state === 'advance' && dd < 0.8) { e.state = 'cover'; e.t = 0; e.peekT = rnd(0.8, 1.6); }
      else { e.x += dx / dd * sp * dt; e.z += dz / dd * sp * dt; moving = true; e.group.rotation.y = Math.atan2(dx, dz); }
      e.exposed = true; e.crouch = 0;
      // 邊跑邊射
      if (moving && e.fireCd <= 0 && A.grace <= 0 && fireTokens(e)) { e.fireCd = e.state === 'rush' ? 1.6 : 3.2; enemyShoot(e, 0.5); }
    } else if (e.state === 'cover') {
      e.exposed = false; e.crouch = 1; e.group.rotation.y = Math.atan2(p.x - e.x, p.z - e.z);
      if (e.t >= e.peekT) { e.state = 'peek'; e.t = 0; e.burst = e.type === 'gunner' ? 99 : 2; e.fireCd = 0.25; e.peekDur = e.type === 'gunner' ? rnd(1.6, 2.4) : rnd(1.1, 1.7); e.hitting = false; }
    } else if (e.state === 'peek') {
      e.exposed = true; e.crouch = 0; e.group.rotation.y = Math.atan2(p.x - e.x, p.z - e.z);
      var rate = e.type === 'gunner' ? 60 / et.rpm * 2.6 : 0.95;
      if (e.fireCd <= 0 && A.grace <= 0 && e.burst > 0 && (e.hitting || fireTokens(e))) { e.hitting = true; e.fireCd = rate; e.burst--; enemyShoot(e); }
      if (e.t >= e.peekDur) {
        e.hitting = false; e.state = 'cover'; e.t = 0; e.peekT = e.type === 'gunner' ? rnd(1.2, 2.0) : rnd(1.6, 2.8);
        if (e.relocT <= 0 && e.type === 'rifleman') { e.relocT = rnd(4, 6); pickCover(e); }
      }
    }
    e.walkT += dt * (moving ? 9 : 0);
    // 動畫
    var sw = moving ? Math.sin(e.walkT) * 0.7 : 0;
    j.thL.rotation.x = sw; j.thR.rotation.x = -sw; j.shL.rotation.x = moving ? Math.max(0, -sw) * 0.9 : 0; j.shR.rotation.x = moving ? Math.max(0, sw) * 0.9 : 0;
    j.sgR.rotation.x = -1.35 + (e.flinch ? 0.4 : 0); j.sgL.rotation.x = -1.3; j.sgL.rotation.z = 0.35; j.elR.rotation.x = -0.15; j.elL.rotation.x = -0.35;
    j.torso.rotation.z = e.flinch ? Math.sin(e.t * 60) * 0.12 : 0; j.torso.rotation.x = moving ? 0.18 : 0;
    var cr = e.crouch; e.cr = (e.cr || 0) + (cr - (e.cr || 0)) * Math.min(1, dt * 12);
    e.group.scale.y = (e.type === 'gunner' ? 1.05 : 1) * (1 - 0.4 * e.cr);
    e.group.position.set(e.x, 0, e.z);
    // LOD
    var cam = W.camera().position, far = Math.hypot(e.x - cam.x, e.z - cam.z) > 30;
    if (far !== e.far) { e.far = far; e.detail.forEach(function (m) { m.visible = !far; }); }
  }
  function fireTokens(e) {
    // 同一時間最多 2 人開火，避免被集火秒殺
    var n = 0; A.enemies.forEach(function (o) { if (o !== e && o.state !== 'dead' && o.hitting) n++; });
    return n < (A.id === 'wave4' ? 3 : 2);
  }

  /* ---------- 每幀更新 ---------- */
  function endWave(how) {
    if (!A || A.ended) return;
    A.ended = true; A.active = false; A.firing = false;
    var s = A; if (W.S.fps.on) W.fpsExit();
    setTimeout(function () { if (H.onWaveEnd) H.onWaveEnd(how, s); }, 0);
  }
  FPS.endWave = endWave;
  FPS.msg = function (t, ms) {
    var el = $('#fpsMsg'); el.textContent = t; el.classList.add('on'); clearTimeout(FPS._mt); FPS._mt = setTimeout(function () { el.classList.remove('on'); }, ms || 2000);
  };
  FPS.banner = function (t) {
    var el = $('#waveBanner'); el.textContent = t; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  };
  function botStep(dt) {
    var F = W.S.fps; A.botT -= dt;
    if (A.carrying) {
      if (F.on) FPS.lower();
      var tgt = H.carryTarget ? H.carryTarget() : null;
      if (tgt) {
        var S = W.S, dx = tgt.x - S.px, dz = tgt.z - S.pz, dd = Math.hypot(dx, dz);
        if (dd > 0.9) W.place(S.px + dx / dd * 3.4 * dt, S.pz + dz / dd * 3.4 * dt);
      }
      return;
    }
    if (FPS.bot === 'idle') {
      if (A.cover) leaveCover();
      if (W.S.fps.on) W.fpsExit();
      return;
    }
    if (!F.on) { if (A.grace <= 0 || A.enemies.length) FPS.raise(); return; }
    A.ads = true;
    if (A.mag <= 0 || (A.mag < 8 && !A.enemies.some(function (e) { return e.exposed && e.state !== 'dead'; }))) { if (A.reload <= 0 && A.mags > 0) FPS.reload(); }
    A.botDuck = Math.max(0, (A.botDuck || 0) - dt);
    if (A.hurtT > 0.2 && A.cover && A.peek) { A.botDuck = 1.1; FPS.coverKey(); return; }
    var es = exposedEnemies();
    if (A.botDuck > 0 || A.reload > 0) { if (A.cover && A.peek) FPS.coverKey(); return; }
    if (!es.length) { A.botIdle += dt; if (A.cover && A.peek && A.botIdle > 0.6) FPS.coverKey(); return; }
    if (A.cover && !A.peek) { FPS.coverKey(); return; }
    A.botIdle = 0;
    var p = W.pos(), tgt = es.sort(function (a, b) { return Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z); })[0];
    var a = angTo(tgt, tgt.x, 1.2, tgt.z);
    F.yaw += Math.atan2(Math.sin(a.yaw - F.yaw), Math.cos(a.yaw - F.yaw)) * Math.min(1, dt * 14);
    F.pitch += (a.pitch - F.pitch) * Math.min(1, dt * 14);
    if (A.cd <= 0) {
      var sd = aimDir(), tol = Math.atan2(0.34, a.dist) + 0.002;
      var ey = Math.atan2(Math.sin(sd.yaw - a.yaw), Math.cos(sd.yaw - a.yaw)), ep = sd.pitch - a.pitch;
      if (Math.hypot(ey, ep) < tol) { A.firing = true; tryFire(false); A.firing = false; }
    }
  }
  FPS.update = function (dt) {
    if (!A || !A.active || A.ended) return;
    var S = W.S; if (S.mode !== 'world' && S.mode !== 'fps') return;
    var g = G(), mode = E.diffMode(g), F = S.fps;
    A.swayT += dt; A.cd = Math.max(0, A.cd - dt);
    if (A.grace > 0) A.grace -= dt;
    if (A.hurtT > 0) A.hurtT -= dt;
    if (A.flashT > 0) { A.flashT -= dt; if (A.flashT <= 0) flash.visible = false; }
    if (A.rec > 0) { var rv = Math.min(A.rec, cfg.aiming.recoilRecoverPerSec * dt); A.rec -= rv; F.pitch -= rv * DEG; }
    // 士氣低落發抖
    var ms = cfg.aiming.moraleShake;
    if (A.shakeT > 0) A.shakeT -= dt; else if (g.a.m < ms.ifMBelow && Math.random() < ms.chancePerSec * dt) A.shakeT = ms.durationSec;
    // 換彈
    if (A.reload > 0) { A.reload -= dt; if (A.reload <= 0) { A.reload = 0; A.mags--; A.mag = 30; Sfx.sfx('confirm'); } }
    if (A.firing && A.fireMode === 'auto') tryFire(false);
    // 探頭時間：被壓制時縮短；cover.peekAutoTimeoutSec 為 null 時不自動蹲下
    A.suppress = A.enemies.some(function (e) { return e.type === 'gunner' && e.state === 'peek'; });
    var peekTo = cfg.cover && cfg.cover.peekAutoTimeoutSec;
    if (peekTo && F.on && A.cover && A.peek) {
      A.peekT += dt;
      if (A.peekT > (A.suppress ? Math.min(1.8, peekTo) : peekTo)) { A.peek = false; W.setEye(1.0); A.firing = false; FPS.msg(A.suppress ? '被機槍壓制！快躲！' : '探頭太久了，蹲下', 1400); refreshButtons(); }
    }
    // 離開掩體超過 2 公尺：切回第三人稱
    if (F.on && A.cover) { var d = Math.hypot(S.px - A.cover.ax, S.pz - A.cover.az); if (d > 0.7 && !S.mv) { /* 微調位置 */ } if (d > 2.0) { FPS.lower(); A.cover = null; W.setCrouch(false); FPS.msg('離開掩體，切回第三人稱', 1600); } }
    if (!F.on && A.cover && Math.hypot(S.px - A.cover.ax, S.pz - A.cover.az) > 0.9) { A.cover = null; W.setCrouch(false); refreshButtons(); }
    // 生成敵人
    if (A.grace <= 0 && A.queue.length) {
      A.spawnT -= dt;
      var alive = A.enemies.filter(function (e) { return e.state !== 'dead'; }).length;
      var spreadWave = A.holdSec > 0 ? A.holdSec * 0.55 / Math.max(1, A.total) : 1.7;
      if (A.spawnT <= 0 && alive < cfg.enemies.maxOnScreen) { A.enemies.push(spawnEnemy(A.queue.shift())); A.spawnT = spreadWave; }
    }
    for (var ei = 0; ei < A.enemies.length && !A.ended; ei++) updateEnemy(A.enemies[ei], dt);
    if (A.ended) return;
    A.enemies = A.enemies.filter(function (e) { return !e.gone; });
    // 機器人（測試）
    if (FPS.bot) botStep(dt);
    // 戰區與擅自撤離
    if (A.zone && !A.carrying) {
      var dz = Math.hypot(S.px - A.zone.x, S.pz - A.zone.z);
      if (dz > A.zone.r) {
        A.awayT += dt;
        FPS.msg('你正在離開戰區！' + Math.max(0, Math.ceil(((E.data().tune.beach || {}).desertionSec || 10) - A.awayT)) + ' 秒後視為擅自撤離', 900);
        if (A.awayT > ((E.data().tune.beach || {}).desertionSec || 10)) { A.awayT = -999; if (H.onDesertion) H.onDesertion(); return; }
      } else A.awayT = Math.max(0, A.awayT - dt * 2);
    }
    // 小林撐 60 秒
    if (A.holdSec > 0) {
      A.holdLeft -= dt;
      if (A.lin && A.lin.hp <= 0) { endWave('lin'); return; }
      if (A.holdLeft <= 0) { endWave('clear'); return; }
    } else if (A.queue.length === 0 && A.enemies.every(function (e) { return e.state === 'dead'; }) && A.grace <= 0) { endWave('clear'); return; }
    // 抵達最低血量的畫面與心跳
    var pct = g.hp / E.hpMax(g);
    if (pct * 100 <= cfg.health.lowHpPct) { A.lowT -= dt; if (A.lowT <= 0) { A.lowT = 0.9; Sfx.sfx('heart'); } }
    updateHud(pct, mode);
    // 曳光與塵土
    tracerPool.forEach(function (t) { if (t.line.visible) { t.life -= dt; t.line.material.opacity = Math.max(0, t.life / 0.09); if (t.life <= 0) t.line.visible = false; } });
    dustPool.forEach(function (q) { if (q.s.visible) { q.life -= dt; q.s.position.y += q.vy * dt; q.s.scale.multiplyScalar(1 + dt * 2); q.s.material.opacity = Math.max(0, q.life * 2); if (q.life <= 0) q.s.visible = false; } });
  };

  function updateHud(pct, mode) {
    var F = W.S.fps, left = A.queue.length + A.enemies.filter(function (e) { return e.state !== 'dead'; }).length;
    hudSet('#waveName', 'n', A.waveName, function (el, v) { el.textContent = v; });
    hudSet('#waveLeft', 'l', A.holdSec ? ('撐住 ' + Math.max(0, Math.ceil(A.holdLeft)) + ' 秒' + (A.lin ? '　小林 ' + Math.round(A.lin.hp) + '%' : '')) : ('剩餘敵人 ' + left), function (el, v) { el.textContent = v; });
    var hp = A.holdSec ? clamp(A.holdLeft / A.holdSec, 0, 1) : 0;
    $('#waveHold').style.transform = 'scaleX(' + (A.holdSec ? 1 - hp : 0) + ')';
    var frac = A.mag / 30, hint = A.reload > 0 ? '換彈中…' : A.mag === 0 ? '彈匣空了' : frac > 0.66 ? '彈匣沉甸甸' : frac > 0.33 ? '彈匣還有些重量' : '彈匣很輕了';
    var hard = !!(mode.noHud && mode.noHud.indexOf('ammoCount') >= 0);
    hudSet('#magHint', 'h', hard ? hint : (A.mag + ' / 30　' + hint), function (el, v) { el.textContent = v; });
    hudSet('#magRes', 'r', A.mags + '|' + (hard ? 1 : 0), function (el) { el.textContent = '備用彈匣 ' + new Array(A.mags + 1).join('▮') + (A.mags ? '' : '（無）'); });
    hudSet('#coverState', 'c', (A.cover ? (A.peek ? '探頭中' : '掩體後') : '無掩體') + (A.suppress ? '・被壓制' : ''), function (el, v) { el.textContent = v; });
    hudSet('#fireMode', 'f', A.fireMode === 'semi' ? '單發' : '連發', function (el, v) { el.textContent = v; });
    var ad = F.on ? aimDir() : null;
    if (ad) {
      var H2 = window.innerHeight, k = H2 / 2 / Math.tan(W.camera().fov * DEG / 2);
      var cx = Math.tan(-(ad.yaw - F.yaw)) * k, cy = Math.tan(-(ad.pitch - F.pitch)) * k;
      $('#xhair').style.transform = 'translate(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px)';
    }
    $('#xhair').classList.toggle('lock', !!(A.aimAssist && F.on && overTarget()));
    var low = pct * 100 <= cfg.health.lowHpPct;
    $('#dmgfx').style.opacity = String(Math.max(A.hurtT > 0 ? 0.55 : 0, low ? 0.35 + 0.15 * Math.sin(performance.now() / 160) : 0));
    refreshButtonsLight();
  }
  var lastBtn = '';
  function refreshButtonsLight() {
    var k = [W.S.fps.on, A.cover ? 1 : 0, A.peek, A.fireMode, A.aimAssist, A.active].join();
    if (k !== lastBtn) { lastBtn = k; refreshButtons(); }
  }

  FPS.pointsLeft = function () { return A ? A.queue.length + A.enemies.filter(function (e) { return e.state !== 'dead'; }).length : 0; };
  FPS.supply = function () { /* 由導演模組放置補給箱 */ };
  FPS.addMags = function (n) {
    if (!A) return; var cap = cfg.ammo.maxMags - 1;
    A.mags = Math.min(cap, A.mags + n);
  };
  FPS.snapshot = function () { return A ? { mag: A.mag, mags: A.mags, hp: G().hp } : null; };
  FPS.debug = function () { return A ? { enemies: A.enemies.map(function (e) { return { t: e.type, s: e.state, x: e.x, z: e.z, hp: e.hp, exposed: e.exposed }; }), mag: A.mag, mags: A.mags, cover: !!A.cover, peek: A.peek, grace: A.grace, queue: A.queue.length, kills: A.kills, shots: A.shots, hits: A.hits } : null; };
  root.FPS = FPS;
})(typeof self !== 'undefined' ? self : this);
