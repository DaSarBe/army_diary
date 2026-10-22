/* 3D 世界（three.js r128）：地圖、角色、搖桿/WASD、鏡頭，以及 NPC、互動點、拾取物、跟隨者。 */
(function (root) {
  'use strict';
  var THREE = root.THREE, Places = root.Places;
  var $ = function (s) { return document.querySelector(s); };
  var W = { ok: false, cb: {} };
  if (!THREE) { root.World = W; return; }

  var cv, R, scene, cam, hemi, sun, stars, mkGroup, lost = false, paused = false, rafId = 0, last = 0;
  var UB = new THREE.BoxGeometry(1, 1, 1), MATS = {}, CG = null, SIGNS = [], LBL = {};
  var S = {
    mapKey: null, root: null, cols: [], bounds: [-30, 30, -30, 30], spawn: [0, 0], px: 0, pz: 0, yaw: 0, pitch: 0.5,
    distC: 8, pitchC: 0.5, face: 0, mv: 0, t: 0, mode: 'title', npcs: {}, temps: [], pickups: [], inter: [], near: null,
    followers: [], sheetH: 0, off: 0, w: 1, h: 1, marks: [], speed: 1, stepT: 0, unit: null
  };
  W.S = S;

  function M(col) { return MATS[col] || (MATS[col] = new THREE.MeshLambertMaterial({ color: col })); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function turn(a, b, k) { return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k; }

  /* ---------- 建構用的小函式 ---------- */
  function bx(w, h, d, x, y, z, col, solid, ry) {
    var m = new THREE.Mesh(UB, M(col)); m.scale.set(w, h, d); m.position.set(x, y + h / 2, z); if (ry) m.rotation.y = ry; CG.add(m);
    if (solid) S.cols.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
    return m;
  }
  function cyl(r, h, x, y, z, col, solid, seg) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg || 12), M(col)); m.position.set(x, y + h / 2, z); CG.add(m);
    if (solid) S.cols.push({ x0: x - r, x1: x + r, z0: z - r, z1: z + r });
    return m;
  }
  function cone(r, h, x, y, z, col, seg, ry) {
    var m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg || 8), M(col)); m.position.set(x, y + h / 2, z); if (ry) m.rotation.y = ry; CG.add(m); return m;
  }
  function sph(r, x, y, z, col) { var m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), M(col)); m.position.set(x, y, z); CG.add(m); return m; }
  var FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei","WenQuanYi Micro Hei","Noto Sans CJK TC",sans-serif';
  function sign(txt, x, y, z, w, h, bg, fg, ry) {
    var cvs = document.createElement('canvas'); cvs.width = 256; cvs.height = Math.max(32, Math.round(256 * h / w));
    var ctx = cvs.getContext('2d'), tex = new THREE.CanvasTexture(cvs);
    function paint() {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, cvs.width, cvs.height); ctx.fillStyle = fg;
      var fs = Math.min(cvs.height * 0.6, cvs.width * 0.9 / Math.max(1, txt.length));
      ctx.font = '700 ' + Math.round(fs) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, cvs.width / 2, cvs.height / 2 + 2); tex.needsUpdate = true;
    }
    paint(); SIGNS.push(paint);
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(x, y, z); m.rotation.y = ry || 0; CG.add(m); return m;
  }
  /* 頭上的文字標籤（精靈） */
  function label(txt, color, bgc, scale) {
    var key = txt + color + bgc;
    var cvs = document.createElement('canvas'), ctx = cvs.getContext('2d');
    ctx.font = '700 28px ' + FONT;
    var w = Math.ceil(ctx.measureText(txt).width) + 24;
    cvs.width = w; cvs.height = 44;
    ctx = cvs.getContext('2d');
    ctx.fillStyle = bgc; ctx.globalAlpha = 0.78;
    ctx.beginPath(); ctx.moveTo(10, 2); ctx.lineTo(w - 10, 2); ctx.quadraticCurveTo(w - 1, 2, w - 1, 12); ctx.lineTo(w - 1, 32); ctx.quadraticCurveTo(w - 1, 42, w - 10, 42); ctx.lineTo(10, 42); ctx.quadraticCurveTo(1, 42, 1, 32); ctx.lineTo(1, 12); ctx.quadraticCurveTo(1, 2, 10, 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = color; ctx.font = '700 28px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, w / 2, 24);
    var tex = new THREE.CanvasTexture(cvs);
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
    var s = scale || 0.012;
    sp.scale.set(w * s, 44 * s, 1); sp.renderOrder = 10; sp.userData.key = key;
    return sp;
  }
  function mark(sym) {
    var cvs = document.createElement('canvas'); cvs.width = cvs.height = 96;
    var ctx = cvs.getContext('2d');
    ctx.fillStyle = '#e2bb4f'; ctx.beginPath(); ctx.arc(48, 48, 40, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#1c1a0b'; ctx.font = '900 64px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(sym, 48, 52);
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cvs), transparent: true, depthTest: false, fog: false }));
    sp.scale.set(0.8, 0.8, 1); sp.renderOrder = 11; return sp;
  }
  function tree(x, z, s) {
    s = s || 1; var a = ((x * 7 + z * 3) | 0) % 2 === 0;
    cyl(0.22 * s, 1.5 * s, x, 0, z, '#6b4a2f', true, 6);
    cone(1.5 * s, 2.6 * s, x, 1.2 * s, z, a ? '#3f6e3b' : '#4f7d3c', 7);
    cone(1.1 * s, 2 * s, x, 2.6 * s, z, a ? '#4b7d44' : '#5b8a45', 7);
  }
  function bush(x, z) { sph(0.7, x, 0.45, z, '#4f8a45'); }
  function lamp(x, z) { cyl(0.06, 3.6, x, 0, z, '#4a4d52'); sph(0.2, x, 3.7, z, '#ffe9a8'); }
  function house(x, z, w, d, h, wall, roof, sz, sn) {
    bx(w, h, d, x, 0, z, wall, true);
    var rh = h * 0.55, r = new THREE.Mesh(new THREE.ConeGeometry(1, rh, 4), M(roof));
    r.rotation.y = Math.PI / 4; r.scale.set((w / 2 + 0.5) / 0.7071, 1, (d / 2 + 0.5) / 0.7071); r.position.set(x, h + rh / 2, z); CG.add(r);
    var fz = z + sz * (d / 2 + 0.03);
    bx(1.1, 2.1, 0.08, x, 0, fz, '#6b4a35');
    for (var i = -1; i <= 1; i += 2) bx(1, 0.9, 0.06, x + i * w * 0.28, 1.2, fz, '#cfe6f2');
    if (sn) sign(sn, x, h - 0.45, fz + sz * 0.05, Math.min(w - 1, 4.5), 0.8, '#2f3b2c', '#f0f0e0', sz < 0 ? Math.PI : 0);
  }
  function bld(x, z, w, d, h, wall, roof, sz, lab) {
    bx(w, h, d, x, 0, z, wall, true); bx(w + 0.5, 0.3, d + 0.5, x, h, z, roof);
    var fz = z + sz * (d / 2 + 0.03), n = Math.max(2, Math.floor(w / 2.6)), i;
    bx(1.2, 2.2, 0.08, x, 0, fz, '#5c4632');
    for (i = 0; i < n; i++) {
      var wx = x - w / 2 + (i + 0.5) * w / n;
      if (Math.abs(wx - x) < 1.2) continue;
      bx(1.1, 1, 0.06, wx, 1.4, fz, '#cfe6f2');
    }
    if (lab) sign(lab, x, h + 0.75, z + sz * (d / 2 + 0.3), Math.min(w - 0.4, 4.2), 0.8, '#2c4a2c', '#f2ecd0', sz < 0 ? Math.PI : 0);
  }
  function flagpole(x, z, h) {
    h = h || 9; cyl(0.07, h, x, 0, z, '#d9d9d9'); sph(0.13, x, h + 0.1, z, '#e2bb4f');
    bx(2, 1.33, 0.05, x + 1.1, h - 1.4, z, '#c8312b'); bx(1, 0.67, 0.06, x + 0.6, h - 0.74, z + 0.01, '#1f3f8f');
    var s = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.07, 12), M('#ffffff')); s.rotation.x = Math.PI / 2; s.position.set(x + 0.6, h - 0.4, z + 0.05); CG.add(s);
  }
  function tent(x, z, r, h, col) { cone(r, h, x, 0, z, col, 4, Math.PI / 4); S.cols.push({ x0: x - r * 0.6, x1: x + r * 0.6, z0: z - r * 0.6, z1: z + r * 0.6 }); }
  function fence(x0, z0, x1, z1) {
    var len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.5)), i;
    for (i = 0; i <= n; i++) cyl(0.06, 1.3, x0 + (x1 - x0) * i / n, 0, z0 + (z1 - z0) * i / n, '#8a8a80', false, 5);
    var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, horiz = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    bx(horiz ? len : 0.06, 0.08, horiz ? 0.06 : len, cx, 0.5, cz, '#a8a89c'); bx(horiz ? len : 0.06, 0.08, horiz ? 0.06 : len, cx, 1.0, cz, '#a8a89c');
  }
  function car(x, z, col) { bx(4, 0.9, 1.9, x, 0.3, z, col, true); bx(2.2, 0.7, 1.7, x + 0.1, 1.2, z, '#a9c7e0'); }
  function tgt(x, z) {
    cyl(0.05, 1.8, x, 0, z, '#6b4a2f'); var a = cyl(0.7, 0.08, x, 1.1, z, '#f2f2ea'); a.rotation.x = Math.PI / 2;
    var b = cyl(0.45, 0.09, x, 1.1, z + 0.02, '#c8312b'); b.rotation.x = Math.PI / 2; var c2 = cyl(0.18, 0.1, x, 1.1, z + 0.04, '#222'); c2.rotation.x = Math.PI / 2;
  }
  function gun(x, z) {
    bx(1.6, 0.5, 1.2, x, 0.3, z, '#4d5a33', true); bx(0.25, 0.25, 3, x, 0.9, z + 1.4, '#3a4430');
    cyl(0.4, 0.2, x - 0.9, 0.2, z, '#222', false, 10); cyl(0.4, 0.2, x + 0.9, 0.2, z, '#222', false, 10);
  }

  /* ---------- 人物 ---------- */
  function person(o) {
    var g = new THREE.Group();
    function part(par, w, h, d, x, y, z, col) { var m = new THREE.Mesh(UB, M(col)); m.scale.set(w, h, d); m.position.set(x, y, z); par.add(m); return m; }
    var sk = o.skin || '#e0b08a';
    part(g, 0.56, 0.7, 0.32, 0, 1.22, 0, o.shirt || '#888');
    if (o.apron) part(g, 0.5, 0.55, 0.05, 0, 1.1, 0.18, '#f2f2ec');
    if (o.pack) part(g, 0.42, 0.5, 0.2, 0, 1.25, -0.26, o.pack);
    var legL = new THREE.Group(), legR = new THREE.Group();
    legL.position.set(-0.14, 0.88, 0); legR.position.set(0.14, 0.88, 0);
    [legL, legR].forEach(function (l) { part(l, 0.25, 0.74, 0.27, 0, -0.37, 0, o.pants || '#444'); part(l, 0.27, 0.14, 0.36, 0, -0.8, 0.04, o.shoes || '#222'); g.add(l); });
    var armL = new THREE.Group(), armR = new THREE.Group();
    armL.position.set(-0.38, 1.5, 0); armR.position.set(0.38, 1.5, 0);
    [armL, armR].forEach(function (a) { part(a, 0.17, 0.55, 0.2, 0, -0.28, 0, o.shirt || '#888'); part(a, 0.15, 0.14, 0.16, 0, -0.62, 0, sk); g.add(a); });
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), M(sk)); head.position.set(0, 1.78, 0); g.add(head);
    part(g, 0.06, 0.06, 0.04, -0.08, 1.8, 0.205, '#222'); part(g, 0.06, 0.06, 0.04, 0.08, 1.8, 0.205, '#222');
    if (o.hair) {
      var h = new THREE.Mesh(new THREE.SphereGeometry(0.235, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), M(o.hair)); h.position.set(0, 1.79, -0.01); g.add(h);
      if (o.long) part(g, 0.4, 0.5, 0.12, 0, 1.62, -0.18, o.hair);
    }
    if (o.hat) {
      var cp = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.25, 0.14, 12), M(o.hat)); cp.position.set(0, 1.93, 0); g.add(cp);
      part(g, 0.34, 0.03, 0.2, 0, 1.88, 0.2, o.hat);
    }
    g.scale.setScalar(0.88);
    g.userData = { legL: legL, legR: legR, armL: armL, armR: armR };
    return g;
  }
  var PRE = {
    sgt: { shirt: '#5b6b3c', pants: '#4d5a33', hat: '#4d5a33', skin: '#d3a075' },
    cpt: { shirt: '#566338', pants: '#47532e', hat: '#3e4a2a', skin: '#cf9c70' },
    rec: { shirt: '#5b6b3c', pants: '#4d5a33', skin: '#d9a77a' },
    kai: { shirt: '#5b6b3c', pants: '#4d5a33', skin: '#c99a72' },
    sen: { shirt: '#6a7a44', pants: '#4d5a33', hat: '#6a7a44', skin: '#c99a72' },
    mom: { shirt: '#c76f86', pants: '#4a4f5c', hair: '#2a2220', long: 1 },
    dad: { shirt: '#5d7aa0', pants: '#3a3d46', hair: '#232020' },
    gpa: { shirt: '#a9b58a', pants: '#6b6f5e', hair: '#dcdcdc', skin: '#d9aa86' },
    fr1: { shirt: '#d98c3b', pants: '#3a4a68', hair: '#2c2420' },
    fr2: { shirt: '#3f9c98', pants: '#4a4a52', hair: '#4a3020' },
    fr3: { shirt: '#a35b9a', pants: '#33394a', hair: '#1f1a18', long: 1 },
    med: { shirt: '#eceee8', pants: '#7a8a6a', hair: '#2a2220', hat: '#eceee8' },
    cook: { shirt: '#f0f0e8', pants: '#4a4a4a', apron: 1, hat: '#f4f4ee', hair: '#2a2220' },
    barber: { shirt: '#f0f0e8', pants: '#3a3a3a', apron: 1, hair: '#2a2220' },
    post: { shirt: '#2f6b3f', pants: '#3b4a3b', hat: '#2f6b3f', skin: '#d9a77a' },
    gma: { shirt: '#b87a5c', pants: '#5a5048', hair: '#cfcfcf', long: 1 }
  };
  W.PRE = PRE;
  function addNpc(id, preset, x, z, ry, wave, name) {
    var g = person(PRE[preset] || PRE.rec); g.position.set(x, 0, z); g.rotation.y = ry || 0; CG.add(g);
    var col = { x0: x - 0.35, x1: x + 0.35, z0: z - 0.35, z1: z + 0.35 }; S.cols.push(col);
    var n = { id: id, g: g, x: x, z: z, wave: !!wave, col: col, mark: null, name: name || '' };
    if (name) { var lb = label(name, '#ffffff', '#1c2218', 0.0078); lb.position.set(0, 2.75, 0); g.add(lb); n.lbl = lb; }
    S.npcs[id] = n;
    return n;
  }
  function decoNpc(p, x, z, ry, wave) {
    var g = person(PRE[p] || PRE.rec); g.position.set(x, 0, z); g.rotation.y = ry || 0; CG.add(g);
    S.cols.push({ x0: x - 0.35, x1: x + 0.35, z0: z - 0.35, z1: z + 0.35 });
    S.npcs['_d' + Object.keys(S.npcs).length] = { g: g, x: x, z: z, wave: !!wave, deco: true };
  }
  function placeNpcs(map) {
    var tbl = Places.NPCSPOT[map] || {}, ids = Object.keys(tbl), i;
    var story = (W.story && W.story.npcs) || [], names = {};
    story.forEach(function (n) { names[n.id] = n.name; });
    for (i = 0; i < ids.length; i++) { var a = tbl[ids[i]]; addNpc(ids[i], a[3], a[0], a[1], a[2], a[4], names[ids[i]]); }
    if (map === 'unit' && Places.UNIT_NPC[S.unit]) {
      var ut = Places.UNIT_NPC[S.unit];
      Object.keys(ut).forEach(function (id) { var b = ut[id]; addNpc(id, b[3], b[0], b[1], b[2], b[4], names[id]); });
    }
  }

  /* ---------- 地圖 ---------- */
  var MAPS = {};
  function drawPosts(map) {
    Places.mapPlaces(map).forEach(function (p) {
      if (!p.post) return;
      cyl(0.07, 2.2, p.x, 0, p.z - 0.8, '#6b4a2f'); sign(p.label, p.x, 2.5, p.z - 0.8, 2.2, 0.6, '#3a4a2f', '#f2ecd0', 0);
    });
  }
  function board(x, z, ry) {
    bx(2.2, 1.3, 0.12, x, 1.0, z, '#8a6a46', true, ry); bx(2.0, 1.1, 0.04, x, 1.1, z + 0.08, '#2c4a2c', false, ry);
    cyl(0.06, 1, x - 0.9, 0, z, '#6b4a2f'); cyl(0.06, 1, x + 0.9, 0, z, '#6b4a2f');
    sign('布告欄', x, 2.5, z + 0.1, 1.8, 0.5, '#8a6a46', '#f2ecd0', 0);
  }

  MAPS.home = function () {
    S.bounds = [-31, 31, -27, 21]; S.spawn = [-14, -2.5];
    bx(320, 0.2, 320, 0, -0.2, -3, '#6f9a55');
    bx(80, 0.06, 6, 0, 0, -12, '#3d4148');
    for (var x = -36; x <= 36; x += 5) bx(2, 0.02, 0.2, x, 0.06, -12, '#d8d5c4');
    bx(80, 0.1, 1.6, 0, 0, -8.2, '#bdbcb2'); bx(80, 0.1, 1.6, 0, 0, -15.8, '#bdbcb2');
    house(-14, 6, 9, 6, 3.2, '#e8d9b8', '#a5513a', -1); bx(1.6, 0.05, 10.5, -14, 0, -2.25, '#cbc4ae');
    house(18, 7, 8, 6, 3.2, '#d6c7a3', '#4f6b8a', -1, '爺爺家'); bx(1.6, 0.05, 10, 18, 0, -2.5, '#cbc4ae');
    house(-27, 7, 7, 6, 3, '#c9d6c0', '#7a4f3a', -1);
    house(-4, -23, 10, 6, 3.4, '#ebe8dc', '#2c6b4f', 1, '便利商店');
    house(10, -23, 8, 6, 3.2, '#d9c0b0', '#6a4a3a', 1);
    house(24, -23, 8, 6, 3.2, '#c3cfdc', '#5a6a7a', 1);
    house(-20, -23, 8, 6, 3.2, '#dfd3a8', '#8a4f3a', 1, '理髮店');
    [[-23, -2], [-4, 2], [12, 2], [25, -2], [29, 3], [0, -18], [16, -18], [30, -18], [-12, -18], [-28, -18], [-4, 12]].forEach(function (t) { tree(t[0], t[1], 1); });
    bush(-18.5, -1); bush(-9.5, -1); bush(-18.5, 1.6); bush(13.5, -1); bush(22.5, -1);
    [-24, -8, 8, 24].forEach(function (x) { lamp(x, -8.5); });
    car(12, -14.2, '#3a6ea5'); car(-4, -10.2, '#b3452e');
    cyl(0.06, 1.1, -8, 0, -6.4, '#555'); bx(0.5, 0.35, 0.3, -8, 1.1, -6.4, '#c0392b');
    bx(5, 0.15, 3, 6, 2.6, -4, '#d9503a');
    [[3.6, -5.3], [8.4, -5.3], [3.6, -2.7], [8.4, -2.7]].forEach(function (p) { cyl(0.06, 2.6, p[0], 0, p[1], '#bdbdb0'); });
    bx(2.2, 0.8, 1, 6, 0, -3.2, '#8a6a46', true); bx(1.4, 0.9, 0.8, 8, 0, -3.2, '#2b2b2b', true);
    [[4.7, -4.5], [7.3, -4.5], [6, -5.2]].forEach(function (p) { cyl(0.28, 0.45, p[0], 0, p[1], '#d9d2c0'); });
    sign('夜市燒烤', 6, 3.1, -5.4, 3, 0.6, '#c8312b', '#ffffff', 0);
    decoNpc('fr2', 7.5, -5.7, -Math.PI / 2); decoNpc('fr3', 6, -6.4, 0);
    bx(1.6, 0.5, 0.5, 16.2, 0, 2.2, '#8a6a46');
    bx(0.8, 0.6, 0.35, -11.2, 0, 2.4, '#2d4f7a'); bx(0.5, 0.7, 0.3, -12.2, 0, 2.3, '#7a3a2a');
    bx(4, 0.12, 1.8, -26.5, 2.5, -8.3, '#4a5662'); cyl(0.06, 2.5, -28.3, 0, -8.8, '#777'); cyl(0.06, 2.5, -24.7, 0, -8.8, '#777');
    bx(3, 0.4, 0.55, -26.5, 0, -8.9, '#8a6a46'); sign('公車站', -26.5, 3, -7.35, 2.4, 0.55, '#2f5d8a', '#ffffff');
    bx(9, 2.8, 2.6, -21, 0, -13.4, '#d9a21e', true); bx(7.6, 0.9, 2.66, -21, 1.4, -13.4, '#8fb4c9');
    bx(1.2, 0.7, 2.7, -24.3, 0, -13.4, '#1d1d1d'); bx(1.2, 0.7, 2.7, -17.7, 0, -13.4, '#1d1d1d');
    // 公園
    bx(14, 0.05, 11, 6, 0, 15, '#7fae63');
    var pond = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.06, 20), M('#5b95c4')); pond.position.set(6, 0.05, 15); CG.add(pond);
    S.cols.push({ x0: 4.2, x1: 7.8, z0: 13.2, z1: 16.8 });
    [[-0.5, 11], [12.5, 11], [-0.5, 19.5], [12.5, 19.5]].forEach(function (t) { tree(t[0], t[1], 0.9); });
    bx(1.8, 0.4, 0.5, 2, 0, 20, '#8a6a46'); bx(1.8, 0.4, 0.5, 10, 0, 20, '#8a6a46');
    sign('公園', 6, 2.6, 10.2, 2.2, 0.6, '#2f5d8a', '#ffffff', Math.PI);
    cyl(0.07, 2.4, 6, 0, 10.2, '#6b4a2f');
    board(-8, -4.8, 0);
    bx(1.8, 0.2, 1.2, -4, 0, -19.9, '#d9c9a0'); sign('櫃檯', -4, 1.2, -19.5, 1.6, 0.5, '#2c6b4f', '#ffffff', 0);
    placeNpcs('home');
    drawPosts('home');
  };

  MAPS.camp1 = function () {
    S.bounds = [-31, 31, -35.5, 15]; S.spawn = [0, 9];
    bx(320, 0.2, 320, 0, -0.2, -12, '#6e8b4f');
    bx(30, 0.04, 24, 0, 0, -14, '#a8a591');
    bx(5, 0.06, 24, 0, 0, 3, '#4c5057');
    bx(1.3, 5.5, 1.3, -5.5, 0, 13, '#cfcabb', true); bx(1.3, 5.5, 1.3, 5.5, 0, 13, '#cfcabb', true); bx(13, 1.2, 1.5, 0, 4.6, 13, '#cfcabb');
    sign('新訓中心', 0, 5.2, 13.78, 6.4, 0.9, '#2c4a2c', '#f2ecd0'); sign('新訓中心', 0, 5.2, 12.22, 6.4, 0.9, '#2c4a2c', '#f2ecd0', Math.PI);
    fence(-31, 13, -6.4, 13); fence(6.4, 13, 31, 13); fence(-31, 13, -31, -35); fence(31, 13, 31, -35);
    lamp(-3.4, 8); lamp(3.4, 8); lamp(-3.4, -2); lamp(3.4, -2);
    for (var i = 0; i < 3; i++) bx(5, 0.02, 0.15, 0, 0.05, 5 - i * 1.5, '#e8e8e0');
    bx(1.8, 0.8, 0.9, 4.8, 0, 7.6, '#8a6a46', true);
    tent(-14, -6.2, 3, 2.8, '#6b7a45');
    bx(0.8, 0.5, 0.8, -14, 0, -2.4, '#7a3a2a'); bx(0.8, 0.9, 0.15, -14, 0.5, -2.8, '#7a3a2a');
    decoNpc('sgt', -12.5, -1.8, -Math.PI / 2); decoNpc('rec', -17.4, -1.4, Math.PI / 2); decoNpc('rec', -18.6, -1.6, Math.PI / 2);
    bld(16, -6, 16, 6, 3.4, '#b9b08c', '#6b6a56', 1, '第一營舍');
    decoNpc('sgt', 17.5, -1.6, -Math.PI / 2); bx(2.2, 0.4, 0.6, 24.6, 0, -1.6, '#8a6a46'); lamp(20, -1);
    bld(29, -6, 4, 5, 3, '#d9d6c4', '#6b6a56', 1, '盥洗室');
    flagpole(0, -24.5, 9);
    decoNpc('sgt', 2.4, -14.6, -Math.PI / 2);
    [-6, -4.2, -2.4, -0.6].forEach(function (x, i) { decoNpc(i === 1 ? 'kai' : 'rec', x - 2.5, -18, 0); });
    tent(-23, -8, 2.8, 2.6, '#d9d9cf'); tent(-23, -14, 2.8, 2.6, '#d9d9cf');
    bx(2.4, 0.8, 1, -18, 0, -14, '#8a6a46', true);
    bx(2.4, 0.04, 18, -26, 0, -21, '#7a6446');
    [[-29.5, -24], [-22.5, -26], [-29.5, -31], [-22.5, -32], [-28, -34], [-24, -34]].forEach(function (t) { tree(t[0], t[1], 1.1); });
    decoNpc('kai', -25.2, -29.4, Math.PI); decoNpc('sgt', -27, -29.4, Math.PI);
    bx(12, 0.9, 5, -12, 0, -30, '#8a6a46', true); bx(12, 3.4, 0.3, -12, 0.9, -32.4, '#2c4a2c', true);
    sign('軍歌比賽', -12, 3.2, -32.2, 6, 1, '#c8312b', '#ffffff');
    [-15, -13, -11, -9].forEach(function (x) { decoNpc('rec', x, -23, Math.PI); }); decoNpc('sgt', -12, -27.2, 0);
    bx(24, 0.05, 0.25, 6, 0.04, -29.6, '#e8e8e0');
    [-2, 2, 6, 10, 14].forEach(function (x) { tgt(x, -34); });
    bx(34, 2.4, 1.6, 6, 0, -35.2, '#7a6446');
    bld(24, -18, 9, 6, 3.4, '#b9b08c', '#6b6a56', 1, '大禮堂');
    bx(1.6, 0.8, 0.8, 24, 0, -12.6, '#8a6a46', true); bx(0.5, 0.4, 0.5, 24, 0.8, -12.6, '#c9a24a');
    bld(-26, 6, 7, 5, 3, '#cdd2c0', '#6b6a56', 1, '補給室');
    bld(-18, 6, 6, 5, 3, '#e8ebe3', '#6b6a56', 1, '醫務所'); bx(1, 0.3, 0.1, -18, 2.5, 8.6, '#c8312b'); bx(0.3, 1, 0.1, -18, 2, 8.6, '#c8312b');
    bld(-10, 6, 7, 5, 3, '#d9c89a', '#6b6a56', 1, '福利社');
    bld(18, 6, 12, 5, 3.4, '#e4dcc4', '#6b6a56', 1, '莒光教室');
    bx(1.1, 2.2, 1.1, 9.5, 0, 1, '#2f5d8a', true); bx(0.9, 1.2, 1.14, 9.5, 0.9, 1, '#cfe6f2'); sign('電話', 9.5, 2.7, 1.6, 1, 0.35, '#2f5d8a', '#fff');
    bx(2, 5, 2, 27, 0, 6, '#b9b08c', true); bx(3.4, 0.3, 3.4, 27, 5, 6, '#6b6a56'); cone(2.4, 1.4, 27, 5.3, 6, '#6b6a56', 4, Math.PI / 4);
    [[-27, -1], [-27, -6], [28, -12], [-28, 5], [12, -28], [18, -31], [26, -28]].forEach(function (t) { tree(t[0], t[1], 1); });
    board(-4.2, 6.2, 0);
    placeNpcs('camp1');
    drawPosts('camp1');
  };

  function unitZone(u) {
    bx(20, 0.04, 18, 24, 0, -29, '#8f9a72');
    var i;
    if (u === 'infantry') {
      bld(24, -28, 8, 5, 3.2, '#b9b08c', '#6b6a56', 1, '軍械室');
      for (i = 0; i < 4; i++) { bx(0.3, 0.7, 3, 18 + i * 4, 0, -33, '#7a6446'); }
      bx(12, 0.1, 0.4, 24, 0, -24, '#a8a591');
      for (i = 0; i < 3; i++) bx(1.2, 0.5, 0.4, 20 + i * 4, 0, -23.2, '#6b5a3c');
    } else if (u === 'artillery') {
      gun(17.5, -28); gun(24.5, -28);
      bld(30, -31, 6, 5, 3, '#9aa07c', '#6b6a56', 1, '彈藥庫');
      bld(21, -34, 7, 5, 3, '#b9b08c', '#6b6a56', 1, '射擊指揮所');
    } else if (u === 'airforce') {
      bx(22, 0.05, 6, 24, 0, -24, '#3d4148');
      for (i = 0; i < 9; i++) bx(1.6, 0.02, 0.2, 15 + i * 2.4, 0.06, -24, '#e8e8e0');
      bld(24, -34, 12, 6, 4.4, '#cfd3d6', '#6b6a56', 1, '機棚');
      bx(2, 5, 2, 32, 0, -35, '#b9b08c', true); bx(3.4, 0.3, 3.4, 32, 5, -35, '#6b6a56');
      fence(14, -20, 34, -20);
    } else if (u === 'navy') {
      bx(22, 0.05, 9, 24, 0, -34.5, '#3a6ea5');
      bx(10, 1.4, 3.6, 24, 0, -33.5, '#8a9099', true); bx(3, 1.6, 2.4, 22.5, 1.4, -33.5, '#c9cdd1'); cyl(0.2, 2.4, 25.5, 1.4, -33.5, '#4a4d52', false, 8);
      bx(22, 0.12, 3, 24, 0, -30, '#8a6a46');
      for (i = 0; i < 6; i++) cyl(0.12, 0.8, 14 + i * 4, 0, -28.4, '#4a4d52');
    } else {
      bld(26, -32, 10, 6, 3.6, '#c9bf9c', '#6b6a56', 1, '倉庫');
      car(17, -26, '#4d5a33'); car(17, -29, '#566338');
      for (i = 0; i < 4; i++) bx(1.2, 1, 1.2, 31 + (i % 2) * 1.3, 0, -23 - Math.floor(i / 2) * 1.3, '#8a6a46', true);
    }
  }

  MAPS.unit = function () {
    S.bounds = [-35, 35, -57, 19]; S.spawn = [-2, 10.5];
    bx(320, 0.2, 320, 0, -0.2, -20, '#6e8b4f');
    bx(5, 0.06, 64, 0, 0, -1, '#4c5057'); bx(66, 0.06, 4, 0, 0, 3, '#4c5057'); bx(70, 0.06, 5, 0, 0, 17, '#3d4148');
    for (var rx = -34; rx <= 34; rx += 5) bx(2, 0.02, 0.2, rx, 0.06, 17, '#d8d5c4');
    bx(14, 0.04, 10, 0, 0, -10, '#a8a591'); bx(20, 0.04, 20, 0, 0, -29, '#7f8f5a');
    bx(1.3, 5.5, 1.3, -5.2, 0, 12, '#cfcabb', true); bx(1.3, 5.5, 1.3, 5.2, 0, 12, '#cfcabb', true); bx(12.5, 1.2, 1.5, 0, 4.6, 12, '#cfcabb');
    sign('營區大門', 0, 5.2, 12.78, 6, 0.9, '#2c4a2c', '#f2ecd0'); sign('營區大門', 0, 5.2, 11.22, 6, 0.9, '#2c4a2c', '#f2ecd0', Math.PI);
    fence(-35, 12, -6.2, 12); fence(6.2, 12, 35, 12); fence(-35, 12, -35, -45); fence(35, 12, 35, -45);
    bx(3, 2.6, 3, -8.5, 0, 9.5, '#cfcabb', true); bx(3.5, 0.25, 3.5, -8.5, 2.6, 9.5, '#6b6a56');
    decoNpc('sgt', -5.9, 9.2, Math.PI / 2);
    [5, 6.4, 7.8, 9.2].forEach(function (x, k) { if (k !== 1) decoNpc('rec', x, 8.6 + (k % 2) * 0.8, Math.PI); bx(0.7, 0.45, 0.35, x, 0, 9.6 + (k % 2) * 0.4, '#4d5a33'); });
    bld(-14, -3, 7, 5, 3, '#d9c89a', '#6b6a56', 1, '福利社');
    bld(-27, -3, 7, 5, 3, '#e8ebe3', '#6b6a56', 1, '醫務所'); bx(1, 0.3, 0.1, -27, 2.5, -0.45, '#c8312b'); bx(0.3, 1, 0.1, -27, 2, -0.45, '#c8312b');
    bld(-14, -14, 9, 6, 3.2, '#d9c89a', '#6b6a56', 1, '伙房');
    for (var cb = 0; cb < 7; cb++) sph(0.32, -11.8 + (cb % 3) * 0.55, 0.32 + (cb > 3 ? 0.5 : 0), -9.7 - Math.floor(cb / 3) * 0.3, '#8fbf5a');
    bld(-6, -3, 4, 4, 3, '#e4dcc4', '#6b6a56', 1, '輔導室');
    bld(-26, -14, 7, 5, 3, '#cdd2c0', '#6b6a56', 1, '補給室');
    bld(14, -3, 10, 6, 3.4, '#e4dcc4', '#6b6a56', 1, '連部');
    bld(27, -3, 8, 6, 3.4, '#b9b08c', '#6b6a56', 1, '中山堂');
    bld(14, -14, 14, 6, 3.4, '#b9b08c', '#6b6a56', 1, '營舍');
    bx(0.5, 3.2, 0.3, 14, 0, -17.3, '#7a6446'); bx(1.2, 0.2, 0.2, 14, 3.2, -17.3, '#7a6446');
    decoNpc('sgt', 17.4, -9.4, -Math.PI / 2); bx(0.8, 0.5, 0.4, 13, 0, -8.6, '#4d5a33'); bx(0.8, 0.5, 0.4, 17, 0, -8.6, '#4d5a33');
    tent(28, -15, 3.2, 3, '#6b7a45'); bx(2, 0.8, 0.9, 28, 0, -11.4, '#8a6a46', true); bx(0.5, 0.35, 0.4, 28.4, 0.8, -11.4, '#2b2b2b');
    decoNpc('cpt', 29.6, -9.8, -Math.PI / 2);
    cyl(0.06, 2.4, 21, 0, -8.6, '#777'); cyl(0.06, 2.4, 21, 0, -3.4, '#777');
    ['#e8e8e0', '#9bbad6', '#d9c89a', '#e8e8e0'].forEach(function (c3, i) { bx(0.05, 1.1, 0.9, 21, 1.1, -8 + i * 1.3, c3); });
    bx(1.1, 2.2, 1.1, 7, 0, -6.2, '#2f5d8a', true); bx(0.9, 1.2, 1.14, 7, 0.9, -6.2, '#cfe6f2'); sign('電話', 7, 2.7, -5.6, 1, 0.35, '#2f5d8a', '#fff');
    flagpole(0, -13.5, 9);
    [-6, -3, 0, 3, 6].forEach(function (x) { decoNpc('rec', x, -24, 0); }); decoNpc('sgt', 0, -18, Math.PI);
    var tr = new THREE.Mesh(new THREE.RingGeometry(7, 10, 40), M('#b5543a')); tr.rotation.x = -Math.PI / 2; tr.scale.set(1.35, 1.35, 1); tr.position.set(-24, 0.05, -34); CG.add(tr);
    decoNpc('sgt', -12, -32.2, -Math.PI / 2);
    bx(4, 0.06, 16, 22, 0, -38, '#4c5057'); bx(36, 0.06, 4, 24, 0, -46, '#4c5057');
    house(14, -52, 7, 5, 3, '#d9c0b0', '#8a4f3a', 1); house(24, -52, 7, 5, 3, '#c9d6c0', '#5a6a7a', 1); house(31, -52, 6, 5, 3, '#dfd3a8', '#6a4a3a', 1);
    house(14, -40, 7, 5, 3, '#c3cfdc', '#7a4f3a', -1); house(32, -40, 6, 5, 3, '#e8d9b8', '#4f6b8a', -1);
    bx(5, 0.6, 0.7, 27, 0, -48.8, '#5c3f28', true, 0.4); cone(1.4, 2, 29.2, 0, -49.6, '#3f6e3b', 6);
    bx(8, 0.8, 1, 14, 0, -45, '#8a7a5a'); sign('堤防', 14, 1.6, -44.4, 1.6, 0.5, '#3a4a2f', '#f2ecd0', 0);
    decoNpc('gma', 23.2, -49.8, Math.PI / 2);
    [[-30, -12], [-31, -24], [-6, -40], [6, -42], [-31, 2], [31, 3], [-20, 12], [20, 12], [-30, -44], [10, -34], [-3, -47]].forEach(function (t) { tree(t[0], t[1], 1); });
    bx(4, 0.12, 1.8, 10, 2.5, 14, '#4a5662'); cyl(0.06, 2.5, 8.1, 0, 13.4, '#777'); cyl(0.06, 2.5, 11.9, 0, 13.4, '#777'); bx(3, 0.4, 0.55, 10, 0, 13.6, '#8a6a46');
    sign('公車站', 10, 3, 13.05, 2.4, 0.55, '#2f5d8a', '#ffffff');
    bld(-12, 14.2, 6, 2.4, 2.8, '#e0cf9a', '#6b6a56', 1, '營外小店');
    lamp(-3.4, 6); lamp(3.4, 6); lamp(-3.4, -8); lamp(3.4, -8);
    board(-4.8, 7.6, 0);
    unitZone(S.unit || 'infantry');
    placeNpcs('unit');
    drawPosts('unit');
  };

  MAPS.exit = function () {
    var vol = !!S.vol;
    S.bounds = [-20, 20, -34, 16]; S.spawn = [0, 10];
    bx(320, 0.2, 320, 0, -0.2, -14, '#6e8b4f'); bx(5, 0.06, 52, 0, 0, -10, '#4c5057'); bx(14, 0.04, 10, 0, 0, 6, '#a8a591');
    flagpole(-5, 3, 9);
    bx(1.3, 5.5, 1.3, -5.2, 0, -4, '#cfcabb', true); bx(1.3, 5.5, 1.3, 5.2, 0, -4, '#cfcabb', true); bx(12.5, 1.2, 1.5, 0, 4.6, -4, '#cfcabb');
    sign('營區大門', 0, 5.2, -3.22, 6, 0.9, '#2c4a2c', '#f2ecd0'); sign('營區大門', 0, 5.2, -4.78, 6, 0.9, '#2c4a2c', '#f2ecd0', Math.PI);
    fence(-20, -4, -6.2, -4); fence(6.2, -4, 20, -4); fence(-20, -4, -20, 16); fence(20, -4, 20, 16);
    bld(-13, 10, 9, 6, 3.2, '#b9b08c', '#6b6a56', -1, '營舍'); bld(13, 10, 9, 6, 3.2, '#d9c89a', '#6b6a56', -1, '福利社');
    [[-16, -14], [16, -16], [-17, -26], [17, -27], [-9, -30], [9, -31]].forEach(function (t) { tree(t[0], t[1], 1.1); });
    lamp(-3.4, 0); lamp(3.4, 0); lamp(-3.4, -12); lamp(3.4, -12);
    if (vol) { decoNpc('kai', -1.6, -6.4, 0); decoNpc('rec', 1.5, -6.8, 0); decoNpc('rec', -3.2, -8, 0); decoNpc('rec', 3.2, -8.4, 0); }
    else {
      cyl(0.08, 4, -4.5, 0, -18, '#999'); cyl(0.08, 4, 4.5, 0, -18, '#999'); sign('歡迎回家', 0, 3.6, -17.9, 8, 1, '#c8312b', '#ffffff');
      decoNpc('mom', -1.4, -12.8, 0, 1); decoNpc('dad', 1.2, -12.6, 0); decoNpc('fr1', -3.4, -14.4, 0); decoNpc('fr2', 3.4, -14.6, 0);
    }
  };

  function loadMap(key, unit, vol) {
    if (S.root) {
      scene.remove(S.root);
      S.root.traverse(function (o) {
        if (o.geometry && o.geometry !== UB) o.geometry.dispose();
        if (o.material && o.material.map) { o.material.map.dispose(); o.material.dispose(); }
      });
    }
    S.root = new THREE.Group(); scene.add(S.root); CG = S.root;
    S.cols = []; S.npcs = {}; S.temps = []; S.pickups = []; S.inter = []; S.near = null; SIGNS.length = 0; S.mapKey = key;
    S.unit = unit || S.unit; S.vol = vol;
    clearFollowers();
    MAPS[key]();
    var cur = null;
    setMarks([]);
    return cur;
  }

  /* ---------- 臨時物件（任務用 NPC、道具、記號） ---------- */
  function tempNpc(id, preset, x, z, name) {
    var prevCG = CG; CG = S.root;
    var n = addNpc(id, preset, x, z, Math.atan2(S.px - x, S.pz - z), false, name);
    n.temp = true; CG = prevCG; return n;
  }
  function removeNpc(id) {
    var n = S.npcs[id]; if (!n) return;
    S.root.remove(n.g); var i = S.cols.indexOf(n.col); if (i >= 0) S.cols.splice(i, 1); delete S.npcs[id];
  }
  function addProp(kind, x, z, lab) {
    var g = new THREE.Group(); g.position.set(x, 0, z);
    function b(w, h, d, px, py, pz, c) { var m = new THREE.Mesh(UB, M(c)); m.scale.set(w, h, d); m.position.set(px, py + h / 2, pz); g.add(m); }
    if (kind === 'crate') { b(0.9, 0.8, 0.9, 0, 0, 0, '#a07a4a'); b(0.94, 0.1, 0.94, 0, 0.35, 0, '#7a5a34'); }
    else if (kind === 'pile') { b(0.9, 0.7, 0.9, -0.5, 0, 0, '#8a6a46'); b(0.9, 0.7, 0.9, 0.5, 0, 0, '#9a7a56'); b(0.9, 0.7, 0.9, 0, 0.7, 0, '#a98a62'); }
    else if (kind === 'item') { var o = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshLambertMaterial({ color: '#e2bb4f', emissive: '#6a4f10' })); o.position.y = 0.7; g.add(o); g.userData.spin = o; }
    else if (kind === 'board') { b(0.12, 1.3, 0.12, -0.7, 0, 0, '#6b4a2f'); b(0.12, 1.3, 0.12, 0.7, 0, 0, '#6b4a2f'); b(1.7, 0.8, 0.1, 0, 0.8, 0, '#2c4a2c'); }
    else if (kind === 'post') { b(0.12, 1.8, 0.12, 0, 0, 0, '#6b4a2f'); b(0.8, 0.5, 0.08, 0, 1.4, 0, '#3a4a2f'); }
    else if (kind === 'cart') { b(1.6, 0.6, 1, 0, 0.3, 0, '#8a6a46'); b(1.4, 0.5, 0.8, 0, 0.9, 0, '#a98a62'); }
    else if (kind === 'truck') { b(3.4, 1.2, 1.7, 0, 0.3, 0, '#4d5a33'); b(1.2, 1, 1.6, 1.8, 0.6, 0, '#566338'); }
    if (lab) { var lb = label(lab, '#ffffff', '#1c2218', 0.0078); lb.position.set(0, 2.1, 0); g.add(lb); }
    S.root.add(g); S.temps.push(g);
    return g;
  }
  function clearTemps() {
    S.temps.forEach(function (g) { S.root.remove(g); });
    S.temps = [];
    Object.keys(S.npcs).forEach(function (id) { if (S.npcs[id].temp) removeNpc(id); });
    S.pickups = [];
  }
  function addPickup(x, z, id, kind) {
    var g = addProp(kind || 'item', x, z, null);
    var p = { x: x, z: z, id: id, g: g };
    S.pickups.push(p); return p;
  }
  function removePickup(p) { S.root.remove(p.g); var i = S.pickups.indexOf(p); if (i >= 0) S.pickups.splice(i, 1); }
  function setNpcMark(id, sym) {
    var n = S.npcs[id]; if (!n) return;
    if (n.mark && n.mark.userData.sym === sym) return;
    if (n.mark) { n.g.remove(n.mark); n.mark = null; }
    if (sym) { var m = mark(sym); m.userData.sym = sym; m.position.set(0, 3.25, 0); n.g.add(m); n.mark = m; }
  }
  function clearNpcMarks() { Object.keys(S.npcs).forEach(function (id) { setNpcMark(id, null); }); }

  /* ---------- 跟隨者 ---------- */
  function clearFollowers() {
    S.followers.forEach(function (f) { if (f.g.parent) f.g.parent.remove(f.g); });
    S.followers = [];
  }
  function setFollowers(list, sx, sz) {
    clearFollowers();
    list.forEach(function (f, i) {
      var g;
      if (f.kind) { g = addProp(f.kind, sx, sz, null); S.temps.pop(); }
      else {
        g = person(PRE[f.preset] || PRE.rec); S.root.add(g);
        if (f.name) { var lb = label(f.name, '#ffffff', '#1c2218', 0.0078); lb.position.set(0, 2.75, 0); g.add(lb); }
      }
      var a = (i + 1) * 0.9 + Math.PI;
      g.position.set(sx + Math.cos(a) * 1.4, 0, sz + Math.sin(a) * 1.4);
      S.followers.push({ g: g, dist: 1.6 + i * 0.9, vehicle: !!f.kind, x: g.position.x, z: g.position.z });
    });
  }

  /* ---------- 玩家外觀 ---------- */
  var avatar = null, avSig = '';
  function dress(sig, spec) {
    if (avatar && avSig === sig) return;
    var rot = avatar ? avatar.rotation.y : 0;
    if (avatar) scene.remove(avatar);
    avatar = person(spec); avatar.position.set(S.px, 0, S.pz); avatar.rotation.y = rot; scene.add(avatar); avSig = sig;
    if (carryBox) { avatar.add(carryBox); }
  }
  var carryBox = null;
  function setCarry(on) {
    if (!carryBox) {
      carryBox = new THREE.Mesh(UB, M('#a98a62')); carryBox.scale.set(0.55, 0.4, 0.45); carryBox.position.set(0, 1.0, 0.5);
    }
    if (avatar) { if (on) avatar.add(carryBox); else avatar.remove(carryBox); }
    carryBox.visible = !!on;
  }

  /* ---------- 任務記號 ---------- */
  var MKPOOL = [];
  function makeMarker() {
    var g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: '#e2bb4f' });
    var ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.25, 36), mat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; g.add(ring);
    var beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 6, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#e2bb4f', transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide })); beam.position.y = 3; g.add(beam);
    var gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), mat); gem.position.y = 3.2; g.add(gem);
    g.userData = { ring: ring, beam: beam, gem: gem, mat: mat };
    g.visible = false; scene.add(g); return g;
  }
  function setMarks(pts) {
    S.marks = pts || [];
    while (MKPOOL.length < S.marks.length) MKPOOL.push(makeMarker());
    MKPOOL.forEach(function (m, i) {
      var p = S.marks[i];
      m.visible = !!p && !p.hidden;
      if (p) { m.position.set(p.x, 0, p.z); m.userData.mat.color.set(p.color || '#e2bb4f'); }
    });
  }

  /* ---------- 輸入 ---------- */
  var joy, knob, jid = null, jv = { x: 0, y: 0 }, keys = {}, oid = null, ox = 0, oy = 0;
  function bindInput() {
    joy = $('#joy'); knob = $('#knob');
    function jmove(e) {
      var r = joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, dx = e.clientX - cx, dy = e.clientY - cy, m = Math.hypot(dx, dy), mx = r.width / 2 - 12;
      if (m > mx) { dx *= mx / m; dy *= mx / m; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; jv.x = dx / mx; jv.y = -dy / mx;
    }
    joy.addEventListener('pointerdown', function (e) { jid = e.pointerId; try { joy.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } jmove(e); e.preventDefault(); });
    joy.addEventListener('pointermove', function (e) { if (e.pointerId === jid) jmove(e); });
    function jend(e) { if (e.pointerId === jid) { jid = null; jv.x = 0; jv.y = 0; knob.style.transform = 'translate(0,0)'; } }
    joy.addEventListener('pointerup', jend); joy.addEventListener('pointercancel', jend);
    cv.addEventListener('pointerdown', function (e) { if (oid !== null) return; oid = e.pointerId; ox = e.clientX; oy = e.clientY; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
    cv.addEventListener('pointermove', function (e) {
      if (e.pointerId !== oid) return;
      S.yaw -= (e.clientX - ox) * 0.008; S.pitch = clamp(S.pitch + (e.clientY - oy) * 0.004, 0.12, 1.05); ox = e.clientX; oy = e.clientY;
    });
    function oend(e) { if (e.pointerId === oid) oid = null; }
    cv.addEventListener('pointerup', oend); cv.addEventListener('pointercancel', oend);
    window.addEventListener('keydown', function (e) {
      var t = e.target && e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA') return;
      keys[e.code] = 1;
      if ((e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') && S.mode === 'world' && !e.repeat && W.cb.onInteractKey) W.cb.onInteractKey();
      if (S.mode === 'world' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
    });
    window.addEventListener('keyup', function (e) { delete keys[e.code]; });
    window.addEventListener('blur', function () { keys = {}; jv.x = 0; jv.y = 0; });
  }
  function kx() { return ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0); }
  function ky() { return ((keys.KeyW || keys.ArrowUp) ? 1 : 0) - ((keys.KeyS || keys.ArrowDown) ? 1 : 0); }

  /* ---------- 色調 ---------- */
  var TONES = {
    day: { sky: '#9cc3e6', hs: '#d7e8ff', hg: '#6d7b55', hi: 0.95, dc: '#fff1d2', di: 0.8, star: 0 },
    dusk: { sky: '#e0a77a', hs: '#f0cfa8', hg: '#6d6a50', hi: 0.85, dc: '#ffb87a', di: 0.7, star: 0 },
    night: { sky: '#0b1222', hs: '#7088b8', hg: '#2a382a', hi: 0.7, dc: '#9db4e6', di: 0.4, star: 1 }
  };
  var cur, tg;
  function mkTone() { return { sky: new THREE.Color(), hs: new THREE.Color(), hg: new THREE.Color(), dc: new THREE.Color(), hi: 0, di: 0, star: 0 }; }
  function setTone(n, now) {
    var t = TONES[n] || TONES.day;
    tg.sky.set(t.sky); tg.hs.set(t.hs); tg.hg.set(t.hg); tg.dc.set(t.dc); tg.hi = t.hi; tg.di = t.di; tg.star = t.star;
    if (now) { cur.sky.copy(tg.sky); cur.hs.copy(tg.hs); cur.hg.copy(tg.hg); cur.dc.copy(tg.dc); cur.hi = tg.hi; cur.di = tg.di; cur.star = tg.star; }
  }
  function applyTone(dt) {
    var k = Math.min(1, dt * 2.4);
    ['sky', 'hs', 'hg', 'dc'].forEach(function (n) { cur[n].lerp(tg[n], k); });
    cur.hi += (tg.hi - cur.hi) * k; cur.di += (tg.di - cur.di) * k; cur.star += (tg.star - cur.star) * k;
    scene.fog.color.copy(cur.sky); hemi.color.copy(cur.hs); hemi.groundColor.copy(cur.hg); hemi.intensity = cur.hi;
    sun.color.copy(cur.dc); sun.intensity = cur.di; stars.material.opacity = cur.star;
  }

  /* ---------- 碰撞與空位 ---------- */
  var PR = 0.45;
  function collide() {
    for (var it = 0; it < 2; it++) {
      for (var i = 0; i < S.cols.length; i++) {
        var q = S.cols[i], cx = clamp(S.px, q.x0, q.x1), cz = clamp(S.pz, q.z0, q.z1), dx = S.px - cx, dz = S.pz - cz, d2 = dx * dx + dz * dz;
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
  function blocked(x, z, pad) {
    pad = pad || 0.8;
    var B = S.bounds;
    if (x < B[0] + 1 || x > B[1] - 1 || z < B[2] + 1 || z > B[3] - 1) return true;
    for (var i = 0; i < S.cols.length; i++) {
      var q = S.cols[i];
      if (x > q.x0 - pad && x < q.x1 + pad && z > q.z0 - pad && z < q.z1 + pad) return true;
    }
    return false;
  }
  function freeSpot(x, z) {
    if (!blocked(x, z)) return [x, z];
    for (var r = 1; r < 14; r += 0.8) {
      for (var a = 0; a < 12; a++) {
        var ang = a * Math.PI / 6 + r, nx = x + Math.cos(ang) * r, nz = z + Math.sin(ang) * r;
        if (!blocked(nx, nz)) return [nx, nz];
      }
    }
    return [x, z];
  }

  /* ---------- 更新 ---------- */
  function setMode(m) { S.mode = m; var w = m === 'world'; joy.hidden = !w; }
  function update(dt) {
    S.t += dt; applyTone(dt);
    var moving = 0;
    if (S.mode === 'world') {
      var jx = clamp(jv.x + kx(), -1, 1), jy = clamp(jv.y + ky(), -1, 1), mag = Math.hypot(jx, jy);
      if (mag > 0.12) {
        var f0 = -Math.sin(S.yaw), f1 = -Math.cos(S.yaw), r0 = Math.cos(S.yaw), r1 = -Math.sin(S.yaw);
        var mx = r0 * jx + f0 * jy, mz = r1 * jx + f1 * jy, ml = Math.hypot(mx, mz) || 1, spd = 5.4 * Math.min(1, mag) * S.speed;
        S.px += mx / ml * spd * dt; S.pz += mz / ml * spd * dt; S.face = Math.atan2(mx, mz); moving = Math.min(1, mag);
      }
      collide();
      if (moving) { S.stepT += dt; if (S.stepT > 0.36) { S.stepT = 0; if (W.cb.onStep) W.cb.onStep(); } }
      // 互動點
      var best = null, bd = 1e9, i;
      for (i = 0; i < S.inter.length; i++) {
        var it = S.inter[i], d = Math.hypot(S.px - it.x, S.pz - it.z);
        if (d < (it.r || 2.6) && d - (it.prio || 0) < bd) { bd = d - (it.prio || 0); best = it; }
      }
      if (best !== S.near) { S.near = best; if (W.cb.onNear) W.cb.onNear(best); }
      for (i = S.pickups.length - 1; i >= 0; i--) {
        var pk = S.pickups[i];
        if (Math.hypot(S.px - pk.x, S.pz - pk.z) < 1.5 && W.cb.onPickup) W.cb.onPickup(pk);
      }
      if (W.cb.onTick) W.cb.onTick(dt);
    } else if (S.mode === 'title' || S.mode === 'end') {
      S.yaw += dt * 0.32; S.face = S.yaw;
    }
    S.mv += (moving - S.mv) * Math.min(1, dt * 10);
    if (avatar) {
      avatar.position.set(S.px, Math.abs(Math.sin(S.t * 9)) * 0.05 * S.mv, S.pz);
      avatar.rotation.y = turn(avatar.rotation.y, S.face, Math.min(1, dt * 12));
      var ud = avatar.userData, sw = Math.sin(S.t * 9) * 0.85 * S.mv;
      ud.legL.rotation.x = sw; ud.legR.rotation.x = -sw; ud.armL.rotation.x = -sw * 0.9; ud.armR.rotation.x = sw * 0.9;
    }
    Object.keys(S.npcs).forEach(function (id) {
      var n = S.npcs[id];
      if (n.wave) n.g.userData.armR.rotation.x = -2.5 + Math.sin(S.t * 6 + n.x) * 0.45;
      if (n.mark) n.mark.position.y = 3.25 + Math.sin(S.t * 3 + n.x) * 0.12;
    });
    S.temps.forEach(function (g) { if (g.userData.spin) { g.userData.spin.rotation.y += dt * 2; g.userData.spin.position.y = 0.7 + Math.sin(S.t * 3 + g.position.x) * 0.12; } });
    S.followers.forEach(function (f, i) {
      var tx = S.px + Math.sin(S.yaw) * (f.dist) + Math.cos(S.yaw) * (i % 2 ? 0.9 : -0.9), tz = S.pz + Math.cos(S.yaw) * f.dist - Math.sin(S.yaw) * (i % 2 ? 0.9 : -0.9);
      var dx = tx - f.x, dz = tz - f.z, dd = Math.hypot(dx, dz);
      if (dd > 0.4) { var sp = Math.min(dd * 3, 6) * dt; f.x += dx / dd * sp; f.z += dz / dd * sp; f.g.rotation.y = turn(f.g.rotation.y, Math.atan2(dx, dz), 0.2); }
      f.g.position.set(f.x, 0, f.z);
      var ud2 = f.g.userData;
      if (ud2 && ud2.legL) { var sw2 = dd > 0.5 ? Math.sin(S.t * 9 + i) * 0.7 : 0; ud2.legL.rotation.x = sw2; ud2.legR.rotation.x = -sw2; ud2.armL.rotation.x = -sw2; ud2.armR.rotation.x = sw2; }
    });
    MKPOOL.forEach(function (m) {
      if (!m.visible) return;
      var u = m.userData; u.gem.rotation.y += dt * 2; u.gem.position.y = 3.2 + Math.sin(S.t * 3) * 0.25; u.beam.material.opacity = 0.16 + 0.07 * Math.sin(S.t * 3);
      var rs = 1 + 0.06 * Math.sin(S.t * 4); u.ring.scale.set(rs, rs, 1);
    });
    var dT, pT;
    if (S.mode === 'ui') { dT = 5.5; pT = 0.3; } else if (S.mode === 'title' || S.mode === 'end') { dT = 6.5; pT = 0.3; } else { dT = 8.5; pT = S.pitch; }
    if (S.w / S.h < 0.8) { dT *= 1.3; }
    var k = Math.min(1, dt * 3.5); S.distC += (dT - S.distC) * k; S.pitchC += (pT - S.pitchC) * k;
    var cx2 = S.px + Math.sin(S.yaw) * Math.cos(S.pitchC) * S.distC, cz2 = S.pz + Math.cos(S.yaw) * Math.cos(S.pitchC) * S.distC, cy2 = Math.max(0.6, 1.3 + Math.sin(S.pitchC) * S.distC);
    cam.position.set(cx2, cy2, cz2); cam.lookAt(S.px, 1.2, S.pz); stars.position.copy(cam.position);
    var sheetOn = (S.mode === 'ui' || S.mode === 'title' || S.mode === 'end') && S.sheetH > 0;
    var offT = sheetOn ? Math.min(S.h * 0.42, S.sheetH * 0.5) : 0;
    S.off += (offT - S.off) * Math.min(1, dt * 6);
    if (S.off > 1) cam.setViewOffset(S.w, S.h, 0, S.off, S.w, S.h); else if (cam.view && cam.view.enabled) cam.clearViewOffset();
  }
  function frame(now) {
    rafId = requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (lost || paused) return;
    update(dt);
    try { R.render(scene, cam); } catch (e) { /* context 暫時失效時略過這一幀 */ }
  }

  /* ---------- 公開介面 ---------- */
  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); S.w = w; S.h = h;
  }
  W.init = function (canvas, cb) {
    cv = canvas; W.cb = cb || {};
    try {
      R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
      if (!R.getContext()) return false;
    } catch (e) { return false; }
    var mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || window.innerWidth < 700;
    R.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    scene = new THREE.Scene(); cam = new THREE.PerspectiveCamera(58, 1, 0.1, 220);
    scene.fog = new THREE.Fog('#9cc3e6', 38, 115);
    hemi = new THREE.HemisphereLight('#d7e8ff', '#6d7b55', 0.95); scene.add(hemi);
    sun = new THREE.DirectionalLight('#fff1d2', 0.8); sun.position.set(30, 50, 20); scene.add(sun);
    var starG = new THREE.BufferGeometry(), sp = [];
    for (var si = 0; si < 260; si++) { var sa = Math.random() * 6.283, sb = Math.random() * 1.2 + 0.15; sp.push(Math.cos(sa) * Math.cos(sb) * 150, Math.sin(sb) * 150, Math.sin(sa) * Math.cos(sb) * 150); }
    starG.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    stars = new THREE.Points(starG, new THREE.PointsMaterial({ color: '#ffffff', size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(stars);
    cur = mkTone(); tg = mkTone(); setTone('day', true); scene.background = cur.sky;
    bindInput();
    window.addEventListener('resize', resize); resize();
    cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); lost = true; if (W.cb.onLost) W.cb.onLost(); }, false);
    cv.addEventListener('webglcontextrestored', function () { lost = false; SIGNS.forEach(function (p) { p(); }); if (W.cb.onRestored) W.cb.onRestored(); }, false);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { SIGNS.forEach(function (p) { p(); }); });
    last = performance.now(); rafId = requestAnimationFrame(frame);
    W.ok = true;
    return true;
  };
  W.pause = function () { paused = true; };
  W.resume = function () { paused = false; last = performance.now(); };
  W.isLost = function () { return lost; };
  W.loadMap = loadMap; W.setMode = setMode; W.setTone = setTone; W.dress = dress;
  W.setMarks = setMarks; W.setInteract = function (l) { S.inter = l || []; S.near = null; if (W.cb.onNear) W.cb.onNear(null); };
  W.interact = function () { if (S.near && S.near.act) S.near.act(S.near); };
  W.tempNpc = tempNpc; W.removeNpc = removeNpc; W.addProp = addProp; W.clearTemps = clearTemps;
  W.addPickup = addPickup; W.removePickup = removePickup; W.setNpcMark = setNpcMark; W.clearNpcMarks = clearNpcMarks;
  W.setFollowers = setFollowers; W.clearFollowers = clearFollowers; W.setCarry = setCarry;
  W.freeSpot = freeSpot; W.blocked = blocked;
  W.setSheet = function (px) { S.sheetH = px || 0; };
  W.pos = function () { return { x: S.px, z: S.pz }; };
  W.place = function (x, z, face) { S.px = x; S.pz = z; if (face != null) { S.face = face; } collide(); };
  W.spawn = function () { return { x: S.spawn[0], z: S.spawn[1] }; };
  W.lookAt = function (x, z) { S.face = Math.atan2(x - S.px, z - S.pz); S.yaw = S.face + Math.PI; };
  W.arrow = function (x, z) {
    var tx = x - S.px, tz = z - S.pz, fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw);
    return Math.atan2(fx * tz - fz * tx, fx * tx + fz * tz);
  };
  W.speed = function (v) { S.speed = v; };
  W.npcPos = function (id) { var n = S.npcs[id]; return n ? { x: n.x, z: n.z } : null; };
  W.hasNpc = function (id) { return !!S.npcs[id]; };
  W.faceNpc = function (id) {
    var n = S.npcs[id]; if (!n) return;
    n.g.rotation.y = Math.atan2(S.px - n.x, S.pz - n.z); S.face = Math.atan2(n.x - S.px, n.z - S.pz);
  };
  root.World = W;
})(typeof self !== 'undefined' ? self : this);
