/* 島嶼守備 3D 世界：永遠第一人稱、JSON 地圖、載具、搖桿（拖到底奔跑）。 */
(function (root) {
  'use strict';
  var T = root.THREE, Sfx = root.Sfx;
  var $ = function (s) { return document.querySelector(s); };
  var W = { ok: false, cb: {} };
  if (!T) { root.World = W; return; }

  var cv, R, scene, cam, hemi, sun, stars, spot, lost = false, paused = false, rafId = 0, last = 0;
  var UB = new T.BoxGeometry(1, 1, 1), MATS = {}, CG = null, SIGNS = [];
  var vm = null, vmRifle = null, vmPistol = null;
  var FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei","WenQuanYi Micro Hei","Noto Sans CJK TC",sans-serif';

  var S = {
    px: 0, pz: 0, yaw: Math.PI, pitch: 0, eye: 1.62, eyeT: 1.62, crouch: 0, kick: 0,
    bounds: [-50, 50, -60, 50], spawn: [0, 38], speed: 1, mv: 0, t: 0, stepT: 0,
    cols: [], covers: [], eCovers: [], npcs: {}, temps: [], vehicles: [], inter: [], near: null,
    marks: [], water: null, waterZ: -44, mode: 'title', w: 1, h: 1, veh: null, carry: false,
    spawns: { sea: [], shore: [] }, sprint: 0, weap: 't91',
    blackout: false, powerOn: false, flashlight: false, fogNear: 42, fogFar: 130
  };
  W.S = S;

  function M(col) { return MATS[col] || (MATS[col] = new T.MeshLambertMaterial({ color: col })); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function turn(a, b, k) { return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k; }

  function bx(w, h, d, x, y, z, col, solid, ry) {
    var m = new T.Mesh(UB, M(col)); m.scale.set(w, h, d); m.position.set(x, y + h / 2, z); if (ry) m.rotation.y = ry; CG.add(m);
    if (solid) S.cols.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0: y, y1: y + h });
    return m;
  }
  function cyl(r, h, x, y, z, col, solid, seg) {
    var m = new T.Mesh(new T.CylinderGeometry(r, r, h, seg || 10), M(col)); m.position.set(x, y + h / 2, z); CG.add(m);
    if (solid) S.cols.push({ x0: x - r, x1: x + r, z0: z - r, z1: z + r, y0: y, y1: y + h });
    return m;
  }
  function cone(r, h, x, y, z, col, seg, ry) {
    var m = new T.Mesh(new T.ConeGeometry(r, h, seg || 8), M(col)); m.position.set(x, y + h / 2, z); if (ry) m.rotation.y = ry; CG.add(m); return m;
  }
  function sph(r, x, y, z, col) { var m = new T.Mesh(new T.SphereGeometry(r, 8, 6), M(col)); m.position.set(x, y, z); CG.add(m); return m; }
  function sign(txt, x, y, z, w, h, bg, fg, ry) {
    var cvs = document.createElement('canvas'); cvs.width = 256; cvs.height = Math.max(32, Math.round(256 * h / w));
    var ctx = cvs.getContext('2d'), tex = new T.CanvasTexture(cvs);
    function paint() {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, cvs.width, cvs.height); ctx.fillStyle = fg;
      var fs = Math.min(cvs.height * 0.6, cvs.width * 0.9 / Math.max(1, txt.length));
      ctx.font = '700 ' + Math.round(fs) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, cvs.width / 2, cvs.height / 2 + 2); tex.needsUpdate = true;
    }
    paint(); SIGNS.push(paint);
    var m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: tex }));
    m.position.set(x, y, z); m.rotation.y = ry || 0; CG.add(m); return m;
  }
  function label(txt, color, bgc, scale) {
    var cvs = document.createElement('canvas'), ctx = cvs.getContext('2d');
    ctx.font = '700 28px ' + FONT;
    var w = Math.ceil(ctx.measureText(txt).width) + 24;
    cvs.width = w; cvs.height = 44;
    ctx = cvs.getContext('2d');
    ctx.fillStyle = bgc; ctx.globalAlpha = 0.78;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(1, 2, w - 2, 40, 10) : ctx.rect(1, 2, w - 2, 40); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = color; ctx.font = '700 28px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, w / 2, 24);
    var tex = new T.CanvasTexture(cvs);
    var sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
    var s = scale || 0.012;
    sp.scale.set(w * s, 44 * s, 1); sp.renderOrder = 10;
    return sp;
  }

  function person(o) {
    var g = new T.Group();
    function part(par, w, h, d, x, y, z, col) { var m = new T.Mesh(UB, M(col)); m.scale.set(w, h, d); m.position.set(x, y, z); par.add(m); return m; }
    var sk = o.skin || '#e0b08a';
    part(g, 0.56, 0.7, 0.32, 0, 1.22, 0, o.shirt || '#5b6b3c');
    if (o.pack) part(g, 0.42, 0.5, 0.2, 0, 1.25, -0.26, o.pack);
    var legL = new T.Group(), legR = new T.Group();
    legL.position.set(-0.14, 0.88, 0); legR.position.set(0.14, 0.88, 0);
    [legL, legR].forEach(function (l) { part(l, 0.25, 0.74, 0.27, 0, -0.37, 0, o.pants || '#4d5a33'); part(l, 0.27, 0.14, 0.36, 0, -0.8, 0.04, o.shoes || '#222'); g.add(l); });
    var armL = new T.Group(), armR = new T.Group();
    armL.position.set(-0.38, 1.5, 0); armR.position.set(0.38, 1.5, 0);
    [armL, armR].forEach(function (a) { part(a, 0.17, 0.55, 0.2, 0, -0.28, 0, o.shirt || '#5b6b3c'); part(a, 0.15, 0.14, 0.16, 0, -0.62, 0, sk); g.add(a); });
    var head = new T.Mesh(new T.SphereGeometry(0.22, 10, 8), M(sk)); head.position.set(0, 1.78, 0); g.add(head);
    part(g, 0.06, 0.06, 0.04, -0.08, 1.8, 0.205, '#222'); part(g, 0.06, 0.06, 0.04, 0.08, 1.8, 0.205, '#222');
    if (o.hat) {
      var cp = new T.Mesh(new T.CylinderGeometry(0.235, 0.25, 0.14, 10), M(o.hat)); cp.position.set(0, 1.93, 0); g.add(cp);
      part(g, 0.34, 0.03, 0.2, 0, 1.88, 0.2, o.hat);
    }
    g.scale.setScalar(0.88);
    g.userData = { legL: legL, legR: legR, armL: armL, armR: armR };
    return g;
  }
  var PRE = {
    sgt: { shirt: '#5b6b3c', pants: '#4d5a33', hat: '#4d5a33', skin: '#d3a075' },
    kai: { shirt: '#5b6b3c', pants: '#4d5a33', skin: '#c99a72' },
    lin: { shirt: '#5b6b3c', pants: '#4d5a33', pack: '#3a4330', skin: '#d9a77a' },
    rec: { shirt: '#5b6b3c', pants: '#4d5a33', skin: '#d9a77a' },
    wounded: { shirt: '#5b6b3c', pants: '#4d5a33', skin: '#c48a6a' }
  };
  W.PRE = PRE;

  function coverObj(x, z, w, d, h, type, ax, az, ry) {
    var m, colr;
    if (type === 'sandbag') {
      m = bx(w, h, d, x, 0, z, '#b59a5e', true, ry);
      bx(w * 0.94, h * 0.18, d * 1.05, x, h * 0.35, z, '#a8935a', false, ry);
      bx(w * 0.94, h * 0.18, d * 1.05, x, h * 0.7, z, '#c0ab72', false, ry);
    } else if (type === 'rock') {
      m = bx(w, h, d, x, 0, z, '#6d675c', true, ry);
    } else {
      m = bx(w, h, d, x, 0, z, '#5c5a50', true, ry);
    }
    colr = S.cols[S.cols.length - 1];
    colr.cover = true;
    var bagHp = 600;
    try { bagHp = (W.cfg && W.cfg.cover.types.sandbag.hp) || 600; } catch (e) { bagHp = 600; }
    var c = { x: x, z: z, w: w, d: d, h: h, type: type, hp: type === 'sandbag' ? bagHp : null, maxhp: bagHp, ax: ax, az: az, mesh: m, col: colr, alive: true, _sy: m.scale.y, _my: m.position.y, _mat: m.material };
    S.covers.push(c);
    return c;
  }

  function makeBike(x, z, yaw) {
    var g = new T.Group();
    var body = new T.Mesh(UB, M('#2c3034')); body.scale.set(0.45, 0.35, 1.7); body.position.y = 0.55; g.add(body);
    var tank = new T.Mesh(UB, M('#3d4a32')); tank.scale.set(0.38, 0.22, 0.55); tank.position.set(0, 0.78, 0.1); g.add(tank);
    [[0, 0.32, 0.55], [0, 0.32, -0.55]].forEach(function (p) {
      var wh = new T.Mesh(new T.CylinderGeometry(0.32, 0.32, 0.12, 10), M('#1a1a1a'));
      wh.rotation.z = Math.PI / 2; wh.position.set(p[0], p[1], p[2]); g.add(wh);
    });
    g.position.set(x, 0, z); g.rotation.y = yaw || 0; CG.add(g); return g;
  }
  function makeJeep(x, z, yaw) {
    var g = new T.Group();
    var body = new T.Mesh(UB, M('#4d5a33')); body.scale.set(1.9, 0.9, 4.1); body.position.y = 0.75; g.add(body);
    var cab = new T.Mesh(UB, M('#a9c7e0')); cab.scale.set(1.7, 0.7, 1.6); cab.position.set(0, 1.4, 0.3); g.add(cab);
    [[-0.7, 0.28, 1.2], [0.7, 0.28, 1.2], [-0.7, 0.28, -1.2], [0.7, 0.28, -1.2]].forEach(function (p) {
      var wh = new T.Mesh(new T.CylinderGeometry(0.32, 0.32, 0.22, 8), M('#222'));
      wh.rotation.z = Math.PI / 2; wh.position.set(p[0], p[1], p[2]); g.add(wh);
    });
    g.position.set(x, 0, z); g.rotation.y = yaw || 0; CG.add(g);
    return g;
  }
  function makeCart(x, z, yaw) {
    var g = new T.Group();
    var box = new T.Mesh(UB, M('#4a4e42')); box.scale.set(1.4, 1.15, 1.8); box.position.y = 0.85; g.add(box);
    var gen = new T.Mesh(UB, M('#6a5a2a')); gen.scale.set(0.7, 0.55, 0.9); gen.position.set(0, 1.55, 0); g.add(gen);
    [[-0.55, 0.22, 0.6], [0.55, 0.22, 0.6], [-0.55, 0.22, -0.6], [0.55, 0.22, -0.6]].forEach(function (p) {
      var wh = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 0.16, 8), M('#222'));
      wh.rotation.z = Math.PI / 2; wh.position.set(p[0], p[1], p[2]); g.add(wh);
    });
    g.position.set(x, 0, z); g.rotation.y = yaw || 0; CG.add(g);
    return g;
  }
  function makeRail(x, z, yaw) {
    var g = new T.Group();
    var box = new T.Mesh(UB, M('#6b4a2f')); box.scale.set(1.15, 0.7, 1.6); box.position.y = 0.62; g.add(box);
    var rim = new T.Mesh(UB, M('#4a4e42')); rim.scale.set(1.25, 0.18, 1.7); rim.position.y = 0.98; g.add(rim);
    [[-0.48, 0.2, 0.5], [0.48, 0.2, 0.5], [-0.48, 0.2, -0.5], [0.48, 0.2, -0.5]].forEach(function (p) {
      var wh = new T.Mesh(new T.CylinderGeometry(0.18, 0.18, 0.14, 8), M('#2a2a28'));
      wh.rotation.z = Math.PI / 2; wh.position.set(p[0], p[1], p[2]); g.add(wh);
    });
    g.position.set(x, 0, z); g.rotation.y = yaw || 0; CG.add(g); return g;
  }
  function makeSampan(x, z, yaw) {
    var g = new T.Group();
    var hull = new T.Mesh(UB, M('#6b4a2f')); hull.scale.set(1.4, 0.45, 4.4); hull.position.y = 0.28; g.add(hull);
    var prow = new T.Mesh(new T.ConeGeometry(0.7, 1.1, 4), M('#7a5636')); prow.rotation.x = Math.PI / 2; prow.position.set(0, 0.3, -2.4); g.add(prow);
    var seat = new T.Mesh(UB, M('#8a6a46')); seat.scale.set(1.1, 0.2, 0.8); seat.position.set(0, 0.55, 0.4); g.add(seat);
    g.position.set(x, 0, z); g.rotation.y = yaw || 0; CG.add(g); return g;
  }

  function addNpc(id, preset, x, z, ry, name) {
    var g = person(PRE[preset] || PRE.rec); g.position.set(x, 0, z); g.rotation.y = ry || 0; CG.add(g);
    var col = { x0: x - 0.35, x1: x + 0.35, z0: z - 0.35, z1: z + 0.35, noRay: true }; S.cols.push(col);
    var n = { id: id, g: g, x: x, z: z, col: col, name: name || '', preset: preset };
    if (name) { var lb = label(name, '#ffffff', '#1c2218', 0.0078); lb.position.set(0, 2.75, 0); g.add(lb); n.lbl = lb; }
    S.npcs[id] = n;
    return n;
  }

  function applyProp(p) {
    var k = p.kind;
    if (k === 'tent') { cone(p.r || 2.2, p.h || 2.1, p.x, 0, p.z, p.col || '#6b7a4a', 4, Math.PI / 4); S.cols.push({ x0: p.x - 1.2, x1: p.x + 1.2, z0: p.z - 1.2, z1: p.z + 1.2 }); }
    else if (k === 'crate') bx(p.w || 1.1, p.h || 0.7, p.d || 0.9, p.x, 0, p.z, '#8a6a46', true);
    else if (k === 'flag') {
      cyl(0.07, p.h || 8, p.x, 0, p.z, '#d9d9d9'); sph(0.13, p.x, (p.h || 8) + 0.1, p.z, '#e2bb4f');
      bx(2, 1.33, 0.05, p.x + 1.1, (p.h || 8) - 1.4, p.z, '#c8312b');
    } else if (k === 'bld') {
      bx(p.w, p.h, p.d, p.x, 0, p.z, p.wall || '#8a7a62', true); bx(p.w + 0.4, 0.28, p.d + 0.4, p.x, p.h, p.z, p.roof || '#5a4a38');
      if (p.lab) sign(p.lab, p.x, p.h + 0.7, p.z + p.d / 2 + 0.2, Math.min(p.w - 0.4, 4), 0.7, '#2c4a2c', '#f2ecd0', 0);
    } else if (k === 'tree') {
      cyl(0.22, 1.5, p.x, 0, p.z, '#6b4a2f', true, 6);
      cone(1.5, 2.6, p.x, 1.2, p.z, '#3f6e3b', 7); cone(1.1, 2, p.x, 2.6, p.z, '#4b7d44', 7);
    } else if (k === 'rock') bx(p.w, p.h, p.d, p.x, 0, p.z, '#6d675c', true);
    else if (k === 'bunker') {
      bx(p.w, p.h, p.d, p.x, 0, p.z, '#5a584c', true); bx(p.w + 0.3, 0.25, p.d + 0.3, p.x, p.h, p.z, '#4a4840');
      bx(1.4, 1.1, 0.12, p.x, 0, p.z + p.d / 2 + 0.04, '#3a382e');
    } else if (k === 'pier') bx(p.w, p.h || 0.35, p.d, p.x, 0, p.z, '#6b4a2f', true);
    else if (k === 'road') bx(p.w, 0.06, p.d, p.x, 0, p.z, '#4a4a44', false);
    else if (k === 'rail') {
      bx(p.w || 1.1, 0.05, p.d, p.x, 0, p.z, '#3a3a36', false);
      bx(0.08, 0.07, p.d, p.x - 0.38, 0.02, p.z, '#6a6a62', false);
      bx(0.08, 0.07, p.d, p.x + 0.38, 0.02, p.z, '#6a6a62', false);
    } else if (k === 'slab') {
      bx(p.w, p.h || 0.28, p.d, p.x, p.y != null ? p.y : 3.1, p.z, p.col || '#1c1a16', false);
    }
    else if (k === 'sign') sign(p.txt, p.x, p.y || 2, p.z, p.w || 3, p.h || 0.7, p.bg || '#2c4a2c', p.fg || '#f2ecd0', p.ry || 0);
    else if (k === 'sand') bx(p.w, 0.08, p.d, p.x, -0.04, p.z, '#cbb98a', false);
    else if (k === 'grass') bx(p.w, 0.08, p.d, p.x, -0.03, p.z, '#5a7348', false);
    else if (k === 'water') {
      var wg = new T.PlaneGeometry(p.w, p.d, 18, 10); wg.rotateX(-Math.PI / 2);
      var wm = new T.Mesh(wg, new T.MeshLambertMaterial({ color: '#3a6e8a', transparent: true, opacity: 0.86 }));
      wm.position.set(p.x, 0.02, p.z); CG.add(wm);
      S.water = { mesh: wm, geo: wg, base: wg.attributes.position.array.slice(), z: p.z };
    }
  }

  function dummyTarget(x, z) {
    cyl(0.05, 1.8, x, 0, z, '#6b4a2f');
    var a = cyl(0.7, 0.08, x, 1.1, z, '#f2f2ea'); a.rotation.x = Math.PI / 2;
    var b = cyl(0.45, 0.09, x, 1.1, z + 0.02, '#c8312b'); b.rotation.x = Math.PI / 2;
    return { x: x, z: z, y: 1.1 };
  }

  function antennaMast(x, z) {
    var g = new T.Group();
    var pole = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 4.2, 8), M('#c8c4b4')); pole.position.y = 2.1; g.add(pole);
    var dish = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 0.08, 12), M('#d9d4c4')); dish.rotation.x = 0.6; dish.position.set(0, 3.6, 0.1); g.add(dish);
    g.position.set(x, 0, z); g.visible = false; CG.add(g); return g;
  }

  W.loadLevel = function (lv, cfg) {
    W.cfg = cfg;
    if (CG) scene.remove(CG);
    CG = new T.Group(); scene.add(CG);
    S.cols = []; S.covers = []; S.eCovers = []; S.npcs = {}; S.temps = []; S.vehicles = []; S.inter = []; S.near = null;
    S.veh = null; S.carry = false;
    S.marks = []; S.water = null; SIGNS.length = 0; MATS = {};
    S.bounds = lv.bounds || [-50, 50, -60, 50];
    S.spawn = lv.spawn || [0, 38];
    S.waterZ = lv.waterZ != null ? lv.waterZ : -44;
    if (lv.fog && scene && scene.fog) {
      S.fogNear = lv.fog[0]; S.fogFar = lv.fog[1];
      scene.fog.near = lv.fog[0]; scene.fog.far = lv.fog[1];
    }
    S.px = S.spawn[0]; S.pz = S.spawn[1]; S.yaw = lv.spawnYaw != null ? lv.spawnYaw : Math.PI; S.pitch = 0;
    var map = lv.map || {};
    (map.ground || []).forEach(applyProp);
    (map.props || []).forEach(applyProp);
    (map.covers || []).forEach(function (c) { coverObj(c.x, c.z, c.w, c.d, c.h, c.type, c.ax, c.az, c.ry); });
    S.eCovers = (map.eCovers || []).map(function (e) { return { x: e.x, z: e.z, kind: e.kind || 'sand', taken: 0 }; });
    S.spawns = map.spawns || { sea: [], shore: [] };
    S.dummies = (map.targets || []).map(function (t) { return dummyTarget(t.x, t.z); });
    (map.npcs || []).forEach(function (n) { addNpc(n.id, n.preset, n.x, n.z, n.ry, n.name); });
    (map.vehicles || []).forEach(function (v) {
      var mesh = v.type === 'jeep' ? makeJeep(v.x, v.z, v.yaw) : v.type === 'sampan' ? makeSampan(v.x, v.z, v.yaw) : (v.type === 'cart' || v.type === 'generator_cart') ? makeCart(v.x, v.z, v.yaw) : (v.type === 'rail_cart' || v.type === 'rail') ? makeRail(v.x, v.z, v.yaw) : makeBike(v.x, v.z, v.yaw);
      var rec = { id: v.id, type: v.type === 'generator_cart' ? 'cart' : (v.type === 'rail' ? 'rail_cart' : v.type), x: v.x, z: v.z, yaw: v.yaw || 0, homeX: v.x, homeZ: v.z, homeYaw: v.yaw || 0, mesh: mesh, occupied: false, wrecked: false };
      attachVeh(rec);
      S.vehicles.push(rec);
    });
    S.antennas = {};
    W.mastRidge = antennaMast(16.4, -6.2); W.mastBunker = antennaMast(-14, -16.6);
    S.blackout = false; S.powerOn = false; S.flashlight = false;
    if (spot) spot.intensity = 0;
    setTone(lv.tone || 'dawn', true);
    if (lv.blackout) W.setBlackout(true);
    W.setMarks([]);
    S.mode = 'play';
  };

  /* ---------- 輸入 ---------- */
  var joy, knob, jid = null, jv = { x: 0, y: 0 }, jmag = 0, keys = {}, oid = null, ox = 0, oy = 0;
  function bindInput() {
    joy = $('#joy'); knob = $('#knob');
    function jmove(e) {
      var r = joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, dx = e.clientX - cx, dy = e.clientY - cy, m = Math.hypot(dx, dy), mx = r.width / 2 - 8;
      var ux = dx, uy = dy;
      if (m > mx) { ux *= mx / m; uy *= mx / m; }
      knob.style.transform = 'translate(' + ux + 'px,' + uy + 'px)';
      jv.x = dx / mx; jv.y = -dy / mx;
      jmag = Math.min(1.25, Math.hypot(jv.x, jv.y));
      if (jmag > 1) { jv.x /= jmag; jv.y /= jmag; }
    }
    joy.addEventListener('pointerdown', function (e) { jid = e.pointerId; try { joy.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } jmove(e); e.preventDefault(); });
    joy.addEventListener('pointermove', function (e) { if (e.pointerId === jid) jmove(e); });
    function jend(e) { if (e.pointerId === jid) { jid = null; jv.x = 0; jv.y = 0; jmag = 0; knob.style.transform = 'translate(0,0)'; } }
    joy.addEventListener('pointerup', jend); joy.addEventListener('pointercancel', jend);

    var look = $('#lookPad');
    function lookStart(e) {
      if (e.target.closest && (e.target.closest('#cluster') || e.target.closest('#joy') || e.target.closest('#side') || e.target.closest('.sheet') || e.target.closest('#card') || e.target.closest('#act'))) return;
      if (S.mode !== 'play') return;
      if (e.pointerType === 'mouse') {
        if (document.pointerLockElement !== cv && cv.requestPointerLock) {
          try { var pr = cv.requestPointerLock(); if (pr && pr.catch) pr.catch(function () { /* 拖曳瞄準 */ }); } catch (x2) { /* ignore */ }
        }
        if (e.button === 2) { if (W.cb.onAds) W.cb.onAds(true); }
        else if (e.button === 0 && W.cb.onFireDown) W.cb.onFireDown();
      }
      oid = e.pointerId; ox = e.clientX; oy = e.clientY;
      try { (e.target === look ? look : cv).setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    }
    function lookMove(e) {
      if (S.mode !== 'play') return;
      if (document.pointerLockElement === cv && e.pointerType === 'mouse') return;
      if (e.pointerId !== oid) return;
      if (W.cb.onAim) W.cb.onAim(e.clientX - ox, e.clientY - oy, e.pointerType);
      ox = e.clientX; oy = e.clientY;
    }
    function lookEnd(e) {
      if (e.pointerType === 'mouse') {
        if (e.button === 2 && W.cb.onAds) W.cb.onAds(false);
        if (e.button === 0 && W.cb.onFireUp) W.cb.onFireUp();
      }
      if (e.pointerId === oid) oid = null;
    }
    [cv, look].forEach(function (el) {
      if (!el) return;
      el.addEventListener('pointerdown', lookStart);
      el.addEventListener('pointermove', lookMove);
      el.addEventListener('pointerup', lookEnd);
      el.addEventListener('pointercancel', lookEnd);
    });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('mousemove', function (e) {
      if (S.mode === 'play' && document.pointerLockElement === cv && W.cb.onAim) W.cb.onAim(e.movementX, e.movementY, 'mouse');
    });
    window.addEventListener('keydown', function (e) {
      var t = e.target && e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA') return;
      keys[e.code] = 1;
      if (S.mode === 'play' && !e.repeat && W.cb.onKey) W.cb.onKey(e.code, true);
      if (S.mode === 'play' && e.code === 'Space' && !e.repeat && W.cb.onFireDown) { W.cb.onFireDown(); e.preventDefault(); }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
    });
    window.addEventListener('keyup', function (e) {
      delete keys[e.code];
      if (e.code === 'Space' && W.cb.onFireUp) W.cb.onFireUp();
      if (S.mode === 'play' && W.cb.onKey) W.cb.onKey(e.code, false);
    });
    window.addEventListener('blur', function () { keys = {}; jv.x = 0; jv.y = 0; jmag = 0; });
  }
  function kx() { return ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0); }
  function ky() { return ((keys.KeyW || keys.ArrowUp) ? 1 : 0) - ((keys.KeyS || keys.ArrowDown) ? 1 : 0); }
  W.keysDown = function () { return keys; };
  W.stick = function () { return { x: jv.x, y: jv.y, mag: jmag, sprint: jmag >= 0.92 || !!(keys.ShiftLeft || keys.ShiftRight) }; };

  var TONES = {
    dawn: { sky: '#c9b89a', hs: '#f0e0c4', hg: '#6d6a50', hi: 0.9, dc: '#ffd2a0', di: 0.72, star: 0.08 },
    day: { sky: '#9cc3e6', hs: '#d7e8ff', hg: '#6d7b55', hi: 0.95, dc: '#fff1d2', di: 0.8, star: 0 },
    dusk: { sky: '#e0a77a', hs: '#f0cfa8', hg: '#6d6a50', hi: 0.85, dc: '#ffb87a', di: 0.7, star: 0.2 },
    night: { sky: '#0b1222', hs: '#7088b8', hg: '#2a382a', hi: 0.7, dc: '#9db4e6', di: 0.4, star: 1 }
  };
  var cur, tg;
  function mkTone() { return { sky: new T.Color(), hs: new T.Color(), hg: new T.Color(), dc: new T.Color(), hi: 0, di: 0, star: 0 }; }
  function setTone(n, now) {
    var t = TONES[n] || TONES.dawn;
    tg.sky.set(t.sky); tg.hs.set(t.hs); tg.hg.set(t.hg); tg.dc.set(t.dc); tg.hi = t.hi; tg.di = t.di; tg.star = t.star;
    if (now) { cur.sky.copy(tg.sky); cur.hs.copy(tg.hs); cur.hg.copy(tg.hg); cur.dc.copy(tg.dc); cur.hi = tg.hi; cur.di = tg.di; cur.star = tg.star; }
  }
  function applyTone(dt) {
    var k = Math.min(1, dt * 2.4);
    ['sky', 'hs', 'hg', 'dc'].forEach(function (n) { cur[n].lerp(tg[n], k); });
    cur.hi += (tg.hi - cur.hi) * k; cur.di += (tg.di - cur.di) * k; cur.star += (tg.star - cur.star) * k;
    scene.fog.color.copy(cur.sky); hemi.color.copy(cur.hs); hemi.groundColor.copy(cur.hg);
    hemi.intensity = S.blackout && !S.powerOn ? cur.hi * 0.15 : cur.hi;
    sun.color.copy(cur.dc); sun.intensity = S.blackout && !S.powerOn ? cur.di * 0.15 : cur.di;
    stars.material.opacity = cur.star;
    if (scene.background) scene.background.copy(cur.sky);
    if (S.blackout && !S.powerOn) { scene.fog.near = 3; scene.fog.far = 18; }
    else { scene.fog.near = S.fogNear; scene.fog.far = S.fogFar; }
  }

  var PR = 0.42;
  function collide() {
    for (var it = 0; it < 2; it++) {
      for (var i = 0; i < S.cols.length; i++) {
        var q = S.cols[i];
        if (q.dead || (S.veh && q.veh)) continue;
        var cx = clamp(S.px, q.x0, q.x1), cz = clamp(S.pz, q.z0, q.z1), dx = S.px - cx, dz = S.pz - cz, d2 = dx * dx + dz * dz;
        if (d2 < PR * PR) {
          if (d2 > 1e-8) { var d = Math.sqrt(d2); S.px = cx + dx / d * PR; S.pz = cz + dz / d * PR; }
          else {
            var l = S.px - q.x0, r = q.x1 - S.px, t = S.pz - q.z0, b = q.z1 - S.pz, m = Math.min(l, r, t, b);
            if (m === l) S.px = q.x0 - PR; else if (m === r) S.px = q.x1 + PR; else if (m === t) S.pz = q.z0 - PR; else S.pz = q.z1 + PR;
          }
        }
      }
    }
    var B = S.bounds; S.px = clamp(S.px, B[0], B[1]); S.pz = clamp(S.pz, B[2], B[3]);
  }

  function updateWater(dt) {
    if (!S.water) return;
    var arr = S.water.geo.attributes.position.array, base = S.water.base, i, n = arr.length;
    for (i = 1; i < n; i += 3) arr[i] = base[i] + Math.sin(S.t * 1.4 + arr[i - 1] * 0.12 + arr[i + 1] * 0.08) * 0.12;
    S.water.geo.attributes.position.needsUpdate = true;
    void dt;
  }

  function vehSpec(type) {
    var key = type === 'bike' ? 'motorcycle' : (type === 'cart' ? 'generator_cart' : (type === 'rail' ? 'rail_cart' : type));
    var v = (W.cfg && W.cfg.vehicles && W.cfg.vehicles[key]) || (W.cfg && W.cfg.props && W.cfg.props[key]) || {};
    var spd = (v.speed && (v.speed.cruise || v.speed.max)) || v.pushSpeed || v.speed || 10;
    var col = v.collision || {};
    return {
      speed: spd, steer: v.turnRate || v.steer || 1.2, water: type === 'sampan' || !!v.water,
      push: type === 'cart',
      hp: v.hp || v.cartHp || (v.cover && v.cover.hp) || (type === 'rail_cart' ? 300 : 150),
      obstacleDmg: col.obstacleStopDmg || 15, minorDmg: col.minorDmg || 10,
      flipDmg: type === 'jeep' ? 40 : 25, armor: v.armorDmgMul || 1,
      hw: type === 'jeep' ? 1.1 : (type === 'cart' || type === 'rail_cart') ? 0.85 : 0.45,
      hd: type === 'jeep' ? 2.1 : (type === 'cart' || type === 'rail_cart') ? 1.0 : 0.9
    };
  }
  function attachVeh(v) {
    var vs = vehSpec(v.type);
    v.hp = vs.hp; v.maxHp = vs.hp;
    v.col = { x0: v.x - vs.hw, x1: v.x + vs.hw, z0: v.z - vs.hd, z1: v.z + vs.hd, y0: 0, y1: 1.8, veh: true, vehId: v.id };
    if (v.type === 'jeep' || v.type === 'cart') S.cols.push(v.col);
  }
  function syncVehCol(v) {
    if (!v || !v.col) return;
    var vs = vehSpec(v.type);
    v.col.x0 = v.x - vs.hw; v.col.x1 = v.x + vs.hw; v.col.z0 = v.z - vs.hd; v.col.z1 = v.z + vs.hd;
  }

  function update(dt) {
    S.t += dt; applyTone(dt); updateWater(dt);
    if (S.mode !== 'play' || paused) {
      cam.position.set(S.px, 4.5, S.pz + 8); cam.lookAt(S.px, 1.2, S.pz); return;
    }
    var st = W.stick(), jx = clamp(st.x + kx(), -1, 1), jy = clamp(st.y + ky(), -1, 1), mag = Math.hypot(jx, jy);
    var moving = 0;
    var fwx = -Math.sin(S.yaw), fwz = -Math.cos(S.yaw), rtx = Math.cos(S.yaw), rtz = -Math.sin(S.yaw);
    if (S.veh) {
      var vs = vehSpec(S.veh.type), thr = jy, stw = jx, ox = S.px, oz = S.pz;
      if (vs.push) {
        var pmx = rtx * jx + fwx * jy, pmz = rtz * jx + fwz * jy, pml = Math.hypot(pmx, pmz) || 1;
        S.px += pmx / pml * vs.speed * Math.min(1, mag) * dt;
        S.pz += pmz / pml * vs.speed * Math.min(1, mag) * dt;
        S.veh.yaw = S.yaw;
        moving = Math.min(1, mag);
      } else {
        S.veh.yaw -= stw * vs.steer * dt * (thr < 0 ? -1 : 1);
        var sp = vs.speed * thr;
        S.px += -Math.sin(S.veh.yaw) * sp * dt;
        S.pz += -Math.cos(S.veh.yaw) * sp * dt;
        S.yaw = turn(S.yaw, S.veh.yaw, Math.min(1, dt * 4));
        moving = Math.min(1, Math.abs(thr));
        if (moving > 0.2 && Math.random() < dt * 4) Sfx.sfx('engine');
      }
      if (vs.water) { if (S.pz > -6) S.pz = -6; }
      else if (S.pz < S.waterZ + 1) S.pz = S.waterZ + 1;
      if (!vs.water && !vs.push) {
        var hit = vehHitObstacle();
        if (hit) {
          S.px = ox; S.pz = oz;
          if (Math.abs(thr) > 0.25) W.damageVehicle(vs.obstacleDmg, Math.abs(thr) > 0.85 ? 'flip' : 'obstacle');
        }
      }
      S.veh.x = S.px; S.veh.z = S.pz;
      S.veh.mesh.position.set(S.px, S.veh.type === 'sampan' ? 0.05 : 0, S.pz);
      S.veh.mesh.rotation.y = S.veh.yaw;
      syncVehCol(S.veh);
    } else if (mag > 0.12) {
      var sprint = (!S.crouch && !S.carry && (st.sprint || mag > 0.92 || keys.ShiftLeft || keys.ShiftRight)) ? 1.55 : 1;
      var walk = (S.crouch ? 2.2 : 4.6) * (S.carry ? 0.6 : 1) * sprint * S.speed;
      var mx = rtx * jx + fwx * jy, mz = rtz * jx + fwz * jy, ml = Math.hypot(mx, mz) || 1;
      S.px += mx / ml * walk * Math.min(1, mag) * dt;
      S.pz += mz / ml * walk * Math.min(1, mag) * dt;
      moving = Math.min(1, mag);
      collide();
    } else collide();
    if (S.pz < S.waterZ && !S.veh) S.pz = S.waterZ;
    S.mv += (moving - S.mv) * Math.min(1, dt * 10);
    if (moving) { S.stepT += dt; if (S.stepT > (S.crouch ? 0.5 : 0.36)) { S.stepT = 0; Sfx.sfx('step'); } }

    var best = null, bd = 1e9, i;
    for (i = 0; i < S.inter.length; i++) {
      var it = S.inter[i], d = Math.hypot(S.px - it.x, S.pz - it.z);
      if (d < (it.r || 2.4) && d < bd) { bd = d; best = it; }
    }
    if (best !== S.near) { S.near = best; if (W.cb.onNear) W.cb.onNear(best); }

    S.eye += (S.eyeT - S.eye) * Math.min(1, dt * 10);
    S.kick *= Math.max(0, 1 - dt * 12);
    var cp = Math.cos(S.pitch), dxf = -Math.sin(S.yaw) * cp, dyf = Math.sin(S.pitch), dzf = -Math.cos(S.yaw) * cp;
    cam.position.set(S.px, S.eye, S.pz);
    cam.lookAt(S.px + dxf * 10, S.eye + dyf * 10, S.pz + dzf * 10);
    if (Math.abs(cam.fov - (S.ads ? 52 : 70)) > 0.2) { cam.fov = S.ads ? 52 : 70; cam.updateProjectionMatrix(); }

    if (vm) {
      vm.visible = !S.veh;
      vm.position.set(0.18, -0.22 + S.kick * 0.02, -0.44 + S.kick * 0.07);
      vm.rotation.x = S.kick * 0.12 + Math.sin(S.t * 1.6) * 0.004;
      if (vmRifle) vmRifle.visible = S.weap !== 'm9';
      if (vmPistol) vmPistol.visible = S.weap === 'm9';
    }
    Object.keys(S.npcs).forEach(function (id) {
      var n = S.npcs[id]; if (!n || !n.g.visible) return;
      var ud = n.g.userData, sw = Math.sin(S.t * 3 + n.x) * 0.04;
      if (ud && ud.armR) ud.armR.rotation.x = sw;
    });
    if (W.cb.onTick) W.cb.onTick(dt);
    stars.position.copy(cam.position);
    if (spot) {
      spot.visible = !!S.flashlight && !!S.blackout && !S.powerOn;
      if (spot.visible) { spot.target.position.set(0, -0.05, -1); spot.target.updateMatrixWorld(); }
    }
  }

  function vehHitObstacle() {
    var i, hit = false;
    for (i = 0; i < S.cols.length; i++) {
      var q = S.cols[i];
      if (q.dead || q.veh || q.cover || q.ecover || q.noRay) continue;
      var cx = clamp(S.px, q.x0, q.x1), cz = clamp(S.pz, q.z0, q.z1), dx = S.px - cx, dz = S.pz - cz;
      if (dx * dx + dz * dz < 0.55 * 0.55) hit = true;
    }
    return hit;
  }
  function frame(now) {
    rafId = requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (lost || paused) return;
    update(dt);
    try { R.render(scene, cam); } catch (e) { /* 暫時失效 */ }
  }

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); S.w = w; S.h = h;
  }

  function buildViewmodel() {
    vm = new T.Group();
    function vpart(parent, w, h, d, x, y, z, col) {
      var m = new T.Mesh(UB, new T.MeshLambertMaterial({ color: col })); m.scale.set(w, h, d); m.position.set(x, y, z); parent.add(m); return m;
    }
    vmRifle = new T.Group();
    vpart(vmRifle, 0.05, 0.09, 0.3, 0, 0, 0.08, '#2c2f2a');
    vpart(vmRifle, 0.045, 0.06, 0.34, 0, 0, -0.22, '#3a3d36');
    var brl = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.4, 8), new T.MeshLambertMaterial({ color: '#1d1f1c' }));
    brl.rotation.x = Math.PI / 2; brl.position.set(0, 0.025, -0.42); vmRifle.add(brl);
    vpart(vmRifle, 0.03, 0.08, 0.05, 0, -0.07, 0, '#26291f');
    vpart(vmRifle, 0.07, 0.07, 0.1, 0.02, -0.04, -0.2, '#d9a77a');
    vm.add(vmRifle);
    vmPistol = new T.Group();
    vpart(vmPistol, 0.04, 0.08, 0.16, 0, 0, -0.12, '#2a2c28');
    vpart(vmPistol, 0.035, 0.12, 0.05, 0, -0.08, 0.02, '#3a2a22');
    vmPistol.visible = false; vm.add(vmPistol);
    vm.scale.setScalar(0.62); cam.add(vm); vm.visible = false;
  }

  W.init = function (canvas, cb) {
    cv = canvas; W.cb = cb || {};
    try {
      R = new T.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
      if (!R.getContext()) return false;
    } catch (e) { return false; }
    var mobile = W.isMobileLike();
    R.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    scene = new T.Scene(); cam = new T.PerspectiveCamera(70, 1, 0.05, 280); scene.add(cam);
    scene.fog = new T.Fog('#c9b89a', 42, 130); scene.background = new T.Color('#c9b89a');
    hemi = new T.HemisphereLight('#f0e0c4', '#6d6a50', 0.9); scene.add(hemi);
    sun = new T.DirectionalLight('#ffd2a0', 0.72); sun.position.set(30, 50, 20); scene.add(sun);
    spot = new T.SpotLight('#ffe8b8', 0, 28, 0.42, 0.45, 1);
    spot.position.set(0, 0.05, 0.1); cam.add(spot);
    spot.target.position.set(0, -0.05, -1); cam.add(spot.target);
    var starG = new T.BufferGeometry(), sp = [];
    for (var si = 0; si < 180; si++) { var sa = Math.random() * 6.283, sb = Math.random() * 1.2 + 0.15; sp.push(Math.cos(sa) * Math.cos(sb) * 150, Math.sin(sb) * 150, Math.sin(sa) * Math.cos(sb) * 150); }
    starG.setAttribute('position', new T.Float32BufferAttribute(sp, 3));
    stars = new T.Points(starG, new T.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(stars);
    cur = mkTone(); tg = mkTone(); setTone('dawn', true);
    buildViewmodel();
    bindInput();
    window.addEventListener('resize', resize); resize();
    cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); lost = true; if (W.cb.onLost) W.cb.onLost(); }, false);
    cv.addEventListener('webglcontextrestored', function () { lost = false; SIGNS.forEach(function (p) { p(); }); if (W.cb.onRestored) W.cb.onRestored(); }, false);
    last = performance.now(); rafId = requestAnimationFrame(frame);
    W.ok = true;
    return true;
  };

  W.pause = function () { paused = true; };
  W.resume = function () { paused = false; last = performance.now(); };
  W.isLost = function () { return lost; };
  W.isMobileLike = function () {
    return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || window.innerWidth < 700 || (window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
  };
  W.setMode = function (m) { S.mode = m; var play = m === 'play'; $('#joy').hidden = !play || !W.isMobileLike(); $('#lookPad').hidden = !play || !W.isMobileLike(); };
  W.pos = function () { return { x: S.px, z: S.pz }; };
  W.place = function (x, z, yaw) { S.px = x; S.pz = z; if (yaw != null) S.yaw = yaw; collide(); };
  W.aim = function (dx, dy, type) {
    var sens = type === 'touch' ? 0.22 : 0.12;
    if (S.ads) sens *= 0.65;
    S.yaw -= dx * sens * Math.PI / 180;
    S.pitch = clamp(S.pitch - dy * sens * Math.PI / 180, -1.15, 1.15);
  };
  W.setCrouch = function (on) {
    S.crouch = on ? 1 : 0;
    var cfg = W.cfg && W.cfg.view;
    S.eyeT = on ? (cfg && cfg.eyeCrouch) || 1.02 : (cfg && cfg.eyeStand) || 1.62;
  };
  W.setAds = function (v) { S.ads = !!v; };
  W.setWeap = function (id) { S.weap = id; };
  W.setCarry = function (on) { S.carry = !!on; };
  W.setSpeed = function (v) { S.speed = v; };
  W.camera = function () { return cam; };
  W.scene = function () { return scene; };
  W.renderer = function () { return R; };

  W.rayBlock = function (ox, oy, oz, dx, dy, dz, maxT, skip, noCovers) {
    var best = maxT, i;
    for (i = 0; i < S.cols.length; i++) {
      var c = S.cols[i];
      if (c.noRay || c === skip || (c.cover && c.dead) || (noCovers && (c.cover || c.ecover))) continue;
      var y0 = c.y0 != null ? c.y0 : 0, y1 = c.y1 != null ? c.y1 : 3, tmin = 0, tmax = best, ok = true;
      var lo = [c.x0, y0, c.z0], hi = [c.x1, y1, c.z1], o = [ox, oy, oz], d = [dx, dy, dz], k;
      for (k = 0; k < 3; k++) {
        if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) { ok = false; break; } }
        else {
          var t1 = (lo[k] - o[k]) / d[k], t2 = (hi[k] - o[k]) / d[k];
          if (t1 > t2) { var tt = t1; t1 = t2; t2 = tt; }
          if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
          if (tmin > tmax) { ok = false; break; }
        }
      }
      if (ok && tmin < best && tmin > 0.001) best = tmin;
    }
    return best;
  };
  W.nearestCover = function (x, z, maxd) {
    var best = null, bd = maxd || 1.2, i;
    for (i = 0; i < S.covers.length; i++) {
      var c = S.covers[i]; if (!c.alive) continue;
      var d = Math.hypot(c.ax - x, c.az - z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };
  W.killCover = function (c) {
    c.alive = false; c.col.dead = true;
    if (c.mesh) { c.mesh.scale.y = (c._sy || c.mesh.scale.y) * 0.22; c.mesh.position.y = 0.1; c.mesh.material = M('#6a5840'); }
  };
  W.crackCover = function (c) { if (c && c.mesh) c.mesh.material = M('#8a6f48'); };
  W.reviveCovers = function () {
    S.covers.forEach(function (c) {
      if (c.type === 'sandbag') c.hp = c.maxhp;
      if (!c.alive) { c.alive = true; c.col.dead = false; }
      if (c.mesh) { c.mesh.visible = true; if (c._sy) c.mesh.scale.y = c._sy; if (c._my != null) c.mesh.position.y = c._my; if (c._mat) c.mesh.material = c._mat; }
    });
  };
  var MKPOOL = [];
  function makeMarker() {
    var g = new T.Group(), mat = new T.MeshBasicMaterial({ color: '#e2bb4f' });
    var ring = new T.Mesh(new T.RingGeometry(1.0, 1.25, 28), mat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; g.add(ring);
    var beam = new T.Mesh(new T.CylinderGeometry(1.1, 1.1, 6, 16, 1, true), new T.MeshBasicMaterial({ color: '#e2bb4f', transparent: true, opacity: 0.2, depthWrite: false, side: T.DoubleSide })); beam.position.y = 3; g.add(beam);
    g.userData = { mat: mat, beam: beam }; g.visible = false; scene.add(g); return g;
  }
  W.setMarks = function (pts) {
    S.marks = pts || [];
    while (MKPOOL.length < S.marks.length) MKPOOL.push(makeMarker());
    MKPOOL.forEach(function (m, i) {
      var p = S.marks[i];
      m.visible = !!p && !p.hidden;
      if (p) { m.position.set(p.x, 0, p.z); m.userData.mat.color.set(p.color || '#e2bb4f'); }
    });
  };
  W.setInteract = function (list) { S.inter = list || []; S.near = null; if (W.cb.onNear) W.cb.onNear(null); };
  W.near = function () { return S.near; };
  W.npc = function (id) { return S.npcs[id]; };
  W.moveNpc = function (id, x, z) {
    var n = S.npcs[id]; if (!n) return;
    n.x = x; n.z = z; n.g.position.set(x, 0, z);
    n.col.x0 = x - 0.35; n.col.x1 = x + 0.35; n.col.z0 = z - 0.35; n.col.z1 = z + 0.35;
  };
  W.showNpc = function (id, on) { var n = S.npcs[id]; if (n) n.g.visible = !!on; };
  W.addTempNpc = function (id, preset, x, z, name) {
    if (S.npcs[id]) { W.moveNpc(id, x, z); W.showNpc(id, true); return S.npcs[id]; }
    return addNpc(id, preset, x, z, 0, name);
  };
  W.nearestVehicle = function (x, z, maxd) {
    var best = null, bd = maxd || 2.8, i;
    for (i = 0; i < S.vehicles.length; i++) {
      var v = S.vehicles[i]; if (v.occupied || v.wrecked || v.hp <= 0 || /wreck/.test(v.id || '')) continue;
      var d = Math.hypot(v.x - x, v.z - z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  };
  W.vehicleById = function (id) {
    var i; for (i = 0; i < S.vehicles.length; i++) if (S.vehicles[i].id === id) return S.vehicles[i];
    return null;
  };
  W.enterVehicle = function (v) {
    if (!v || v.wrecked || v.hp <= 0) return;
    if (S.carry && (v.type === 'cart' || v.type === 'bike' || v.type === 'motorcycle')) return;
    S.veh = v; v.occupied = true; v.seat = v.type === 'jeep' ? 'driver' : 'driver'; S.px = v.x; S.pz = v.z; S.yaw = v.yaw;
    W.setCrouch(false);
  };
  W.exitVehicle = function () {
    if (!S.veh) return;
    S.veh.occupied = false; S.veh.x = S.px; S.veh.z = S.pz;
    S.veh.mesh.position.set(S.px, 0, S.pz);
    syncVehCol(S.veh);
    S.veh.seat = null;
    S.veh = null;
  };
  W.inVehicle = function () { return S.veh; };
  W.seat = function () { return S.veh ? (S.veh.seat || 'driver') : null; };
  W.cycleSeat = function () {
    if (!S.veh || S.veh.type !== 'jeep') return null;
    var order = ['driver', 'gunner', 'passenger'];
    var i = order.indexOf(S.veh.seat || 'driver');
    S.veh.seat = order[(i + 1) % order.length];
    return S.veh.seat;
  };
  W.damageVehicle = function (dmg, reason) {
    if (!S.veh || S.veh.hp == null) return;
    S.veh.hp = Math.max(0, S.veh.hp - dmg);
    if (W.cb.onVehHp) W.cb.onVehHp(S.veh);
    if (S.veh.hp <= 0) W.wreckVehicle(reason || 'hp');
  };
  W.wreckVehicle = function (reason, fallHp) {
    var v = S.veh; if (!v) return;
    var vs = vehSpec(v.type);
    var playerDmg = reason === 'gunner' ? (fallHp || 20) : vs.flipDmg;
    var x = v.x, z = v.z;
    W.exitVehicle();
    v.hp = 0; v.wrecked = true;
    if (v.mesh) v.mesh.rotation.z = reason === 'gunner' ? 1.1 : 0.55;
    if (W.cb.onVehWreck) W.cb.onVehWreck(v, playerDmg, reason || 'hp', x, z);
  };
  W.resetVehicle = function (v) {
    if (!v) return;
    v.wrecked = false;
    v.hp = v.maxHp || 150;
    v.occupied = false;
    v.x = v.homeX != null ? v.homeX : v.x;
    v.z = v.homeZ != null ? v.homeZ : v.z;
    v.yaw = v.homeYaw != null ? v.homeYaw : (v.yaw || 0);
    if (v.mesh) {
      v.mesh.position.set(v.x, v.type === 'sampan' ? 0.05 : 0, v.z);
      v.mesh.rotation.set(0, v.yaw, 0);
    }
    syncVehCol(v);
  };
  W.setBlackout = function (on) {
    S.blackout = !!on; S.powerOn = false;
    if (on) { scene.fog.near = 3; scene.fog.far = 18; scene.fog.color.set('#05070c'); scene.background.set('#05070c'); }
  };
  W.setPower = function (on) {
    S.powerOn = !!on;
    if (on) { S.flashlight = false; if (spot) spot.intensity = 0; scene.fog.near = S.fogNear; scene.fog.far = S.fogFar; }
  };
  W.setFlashlight = function (on) {
    S.flashlight = !!on && S.blackout && !S.powerOn;
    if (spot) spot.intensity = S.flashlight ? 2.1 : 0;
  };
  W.isLit = function (x, y, z) {
    if (!S.blackout || S.powerOn) return true;
    if (!S.flashlight || !cam) return false;
    var dx = x - cam.position.x, dy = (y || 1.2) - cam.position.y, dz = z - cam.position.z, len = Math.hypot(dx, dy, dz) || 1;
    if (len > 26) return false;
    var cp = Math.cos(S.pitch), fx = -Math.sin(S.yaw) * cp, fy = Math.sin(S.pitch), fz = -Math.cos(S.yaw) * cp;
    return (dx * fx + dy * fy + dz * fz) / len > 0.78;
  };
  W.applyEnemyVis = function (e) {
    if (!e || !e.group) return;
    var dark = S.blackout && !S.powerOn;
    var lit = W.isLit(e.x, 1.2, e.z);
    e.group.traverse(function (m) {
      if (m.isLine) m.visible = dark && lit;
      else if (m.isMesh) m.visible = !dark || lit;
    });
  };
  W.showAntenna = function (which) {
    if (W.mastRidge) W.mastRidge.visible = which === 'ridge';
    if (W.mastBunker) W.mastBunker.visible = which === 'bunker';
  };
  W.kick = function () { S.kick = 1; };
  root.World = W;
})(typeof self !== 'undefined' ? self : this);
