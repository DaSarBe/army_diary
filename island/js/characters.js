/* Quaternius CC0 角色／槍：GLTF + AnimationMixer，敵我配色與 LOD。 */
(function (root) {
  'use strict';
  var THREE = root.THREE;
  var C = { ready: false, err: null, wait: [], gltfs: {}, guns: {}, maps: {}, tri: { low: 0, mid: 0, high: 0 }, tier: 'mid', ei: 0, ai: 0 };

  var BASE = 'assets/quaternius/';
  var MODELS = {
    soldier: 'soldier_male',
    blue: 'blue_soldier_male',
    casual: 'casual_bald',
    ninja: 'ninja_sand'
  };
  var GUNS = { t91: 'rifle_t91.glb', t75: 'rifle_t75.glb', t65: 'rifle_t65.glb', m9: 'pistol_m9.glb' };
  var CAP = { low: 600, mid: 1500, high: 3000 };

  var NAMED = {
    lin: { model: 'casual', scale: 1.00, skin: '#e2b48a', hat: 'none', hair: 'short', pack: true, vest: false },
    kai: { model: 'casual', scale: 0.93, skin: '#a87450', hat: 'cap', hair: 'none', pack: false, vest: true },
    sgt: { model: 'soldier', scale: 1.10, skin: '#c49268', hat: 'none', hair: 'none', pack: false, vest: true },
    rec: { model: 'soldier', scale: 1.00, skin: '#d9a77a', hat: 'none', hair: 'none', pack: false, vest: false },
    wounded: { model: 'casual', scale: 0.98, skin: '#c48a6a', hat: 'none', hair: 'none', pack: false, vest: false }
  };
  var ALLY_MIX = [
    { model: 'soldier', scale: 1.00, skin: '#d9a77a', hat: 'none', pack: false, vest: false },
    { model: 'casual', scale: 0.98, skin: '#c99a72', hat: 'cap', pack: false, vest: false },
    { model: 'soldier', scale: 1.02, skin: '#b88a62', hat: 'none', pack: true, vest: true },
    { model: 'casual', scale: 1.01, skin: '#d3a075', hat: 'none', hair: 'buzz', pack: false, vest: true }
  ];
  var ENEMY_MIX = [
    { model: 'blue', scale: 1.00, skin: '#c9976e', sand: false, helm: 'peak', pack: false, vest: false },
    { model: 'ninja', scale: 1.00, skin: '#d1a077', sand: true, helm: 'none', pack: false, vest: false },
    { model: 'blue', scale: 1.04, skin: '#b98a63', sand: true, helm: 'slouch', pack: true, vest: true }
  ];

  function done(err) {
    C.err = err || null;
    C.ready = !err;
    var q = C.wait.splice(0, C.wait.length), i;
    for (i = 0; i < q.length; i++) q[i](C.err);
    if (root.World && root.World.onCharsReady) root.World.onCharsReady();
  }

  function countTris(rootObj) {
    var n = 0;
    if (!rootObj) return 0;
    rootObj.traverse(function (m) {
      if (!m.isMesh || !m.geometry) return;
      var g = m.geometry;
      if (g.index) n += g.index.count / 3;
      else if (g.attributes && g.attributes.position) n += g.attributes.position.count / 3;
    });
    return Math.round(n);
  }

  function hexRgb(hex) {
    var n = parseInt(String(hex).replace('#', ''), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function pickClip(clips, keys) {
    var i, c, nm, k;
    for (k = 0; k < keys.length; k++) {
      for (i = 0; i < (clips || []).length; i++) {
        c = clips[i]; nm = (c.name || '').toLowerCase();
        if (nm === keys[k] || nm.indexOf(keys[k]) >= 0) return c;
      }
    }
    return null;
  }

  function fileFor(model) {
    var stem = MODELS[model] || MODELS.soldier;
    return BASE + stem + '.glb';
  }
  function limitGeometry(geo, target) {
    var g = geo.clone();
    if (!g.index || !target) return g;
    var src = g.index.array, tris = src.length / 3;
    if (tris <= target) return g;
    var Ctor = src.length > 65535 ? Uint32Array : Uint16Array;
    var out = new Ctor(target * 3), step = tris / target, i, t;
    for (i = 0; i < target; i++) {
      t = Math.min(tris - 1, Math.floor(i * step)) * 3;
      out[i * 3] = src[t]; out[i * 3 + 1] = src[t + 1]; out[i * 3 + 2] = src[t + 2];
    }
    g.setIndex(new THREE.BufferAttribute(out, 1));
    return g;
  }
  function meshList(rootObj) {
    var out = [];
    rootObj.traverse(function (m) {
      if (m.isMesh && m.geometry && m.geometry.attributes && m.geometry.attributes.position) out.push(m);
    });
    return out;
  }
  function limitRoot(rootObj, target) {
    var total = countTris(rootObj);
    if (!target || total <= target) return;
    var meshes = meshList(rootObj), ratio = target / total;
    meshes.forEach(function (m) {
      var t = Math.max(8, Math.floor(countTris(m) * ratio));
      m.geometry = limitGeometry(m.geometry, t);
    });
  }

  function loadGltf(url) {
    return new Promise(function (resolve, reject) {
      if (C.gltfs[url]) { resolve(C.gltfs[url]); return; }
      new THREE.GLTFLoader().load(url, function (g) { C.gltfs[url] = g; resolve(g); }, undefined, reject);
    });
  }

  function tintTexture(tex, cloth, skinHex, camo) {
    if (!tex || !tex.image) return tex;
    var key = (tex.uuid || '') + '|' + cloth + '|' + (skinHex || '') + '|' + (camo ? 'c' : 's');
    if (C.maps[key]) return C.maps[key];
    var img = tex.image, w = img.width || 256, h = img.height || 256;
    var cvs = document.createElement('canvas'); cvs.width = w; cvs.height = h;
    var ctx = cvs.getContext('2d');
    try { ctx.drawImage(img, 0, 0, w, h); } catch (e) { return tex; }
    var data = ctx.getImageData(0, 0, w, h), p = data.data, i;
    var cl = hexRgb(cloth), sk = hexRgb(skinHex || '#d9a77a');
    var cDark = hexRgb('#1a3a14'), cLite = hexRgb('#6b8f3a');
    for (i = 0; i < p.length; i += 4) {
      var r = p[i], g = p[i + 1], b = p[i + 2];
      var isSkin = r > 88 && r > g + 8 && g > b && (r - b) > 20 && (r + g + b) < 640;
      if (isSkin) {
        p[i] = Math.min(255, r * 0.35 + sk.r * 0.65);
        p[i + 1] = Math.min(255, g * 0.35 + sk.g * 0.65);
        p[i + 2] = Math.min(255, b * 0.35 + sk.b * 0.65);
      } else if (camo) {
        var px = (i / 4) % w, py = ((i / 4) / w) | 0;
        var blob = Math.sin(px * 0.21) * Math.cos(py * 0.17) + Math.sin((px + py) * 0.09);
        var pick = blob > 0.38 ? cLite : (blob < -0.28 ? cDark : cl);
        p[i] = Math.min(255, r * 0.16 + pick.r * 0.84);
        p[i + 1] = Math.min(255, g * 0.16 + pick.g * 0.84);
        p[i + 2] = Math.min(255, b * 0.16 + pick.b * 0.84);
      } else {
        p[i] = Math.min(255, r * 0.18 + cl.r * 0.82);
        p[i + 1] = Math.min(255, g * 0.18 + cl.g * 0.82);
        p[i + 2] = Math.min(255, b * 0.18 + cl.b * 0.82);
      }
    }
    ctx.putImageData(data, 0, 0);
    var out = new THREE.CanvasTexture(cvs);
    out.flipY = !!tex.flipY;
    out.encoding = tex.encoding;
    out.needsUpdate = true;
    C.maps[key] = out;
    return out;
  }

  function dummy() { return { rotation: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 0, z: 0 } }; }

  function accMesh(geo, col, x, y, z, rx) {
    var m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: col }));
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    return m;
  }
  function addGear(g, spec, col, ys) {
    ys = ys || 1;
    var acc = [];
    if (spec.hat === 'cap') {
      acc.push(accMesh(new THREE.CylinderGeometry(0.24, 0.26, 0.05, 10), col, 0, 1.70 * ys, 0.10));
      acc.push(accMesh(new THREE.CylinderGeometry(0.17, 0.19, 0.13, 10), col, 0, 1.80 * ys, 0));
    }
    if (spec.helm === 'peak') {
      acc.push(accMesh(new THREE.CylinderGeometry(0.20, 0.23, 0.22, 8), col, 0, 1.86 * ys, 0));
      acc.push(accMesh(new THREE.BoxGeometry(0.28, 0.04, 0.22), col, 0, 1.76 * ys, 0.16));
    }
    if (spec.helm === 'slouch') {
      acc.push(accMesh(new THREE.SphereGeometry(0.20, 8, 6), col, 0.04, 1.84 * ys, 0));
      acc.push(accMesh(new THREE.CylinderGeometry(0.26, 0.28, 0.03, 8), col, 0, 1.72 * ys, 0.02));
    }
    if (spec.hair === 'short' || spec.hair === 'buzz') {
      var hc = spec.hair === 'buzz' ? '#2a2218' : '#3a2a1c';
      acc.push(accMesh(new THREE.SphereGeometry(0.20, 8, 6), hc, 0, 1.82 * ys, -0.02));
      if (spec.hair === 'short') {
        acc.push(accMesh(new THREE.BoxGeometry(0.16, 0.10, 0.08), hc, 0, 1.90 * ys, -0.10));
      }
    }
    if (spec.pack) acc.push(accMesh(new THREE.BoxGeometry(0.30, 0.36, 0.18), col, 0, 1.18 * ys, -0.24));
    if (spec.vest) acc.push(accMesh(new THREE.BoxGeometry(0.44, 0.30, 0.24), col, 0, 1.22 * ys, 0.05));
    if (!acc.length) return;
    acc.forEach(function (m) { g.add(m); });
    mergeAcc(g, acc);
  }
  function mergeAcc(g, meshes) {
    if (!meshes.length) return;
    g.updateMatrixWorld(true);
    var pos = [], nrm = [], col = [], idx = [], off = 0;
    var v = new THREE.Vector3(), vn = new THREE.Vector3(), nmat = new THREE.Matrix3(), rel = new THREE.Matrix4();
    var inv = new THREE.Matrix4().copy(g.matrixWorld);
    if (inv.invert) inv.invert(); else if (inv.getInverse) inv.getInverse(g.matrixWorld);
    meshes.forEach(function (m) {
      m.updateMatrixWorld(true);
      rel.multiplyMatrices(inv, m.matrixWorld);
      nmat.getNormalMatrix(rel);
      var geo = m.geometry, p = geo.attributes.position, n = geo.attributes.normal, ix = geo.index, vi;
      var c = m.material && m.material.color, cr = c ? c.r : 1, cg = c ? c.g : 1, cb = c ? c.b : 1;
      for (vi = 0; vi < p.count; vi++) {
        v.fromBufferAttribute(p, vi).applyMatrix4(rel);
        pos.push(v.x, v.y, v.z);
        if (n) { vn.fromBufferAttribute(n, vi).applyMatrix3(nmat).normalize(); nrm.push(vn.x, vn.y, vn.z); }
        col.push(cr, cg, cb);
      }
      if (ix) for (vi = 0; vi < ix.count; vi++) idx.push(ix.getX(vi) + off);
      else for (vi = 0; vi < p.count; vi++) idx.push(vi + off);
      off += p.count;
      if (m.parent) m.parent.remove(m);
    });
    var ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (nrm.length) ng.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    ng.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    ng.setIndex(idx);
    var mat = new THREE.MeshLambertMaterial();
    mat.vertexColors = (THREE.VertexColors != null) ? THREE.VertexColors : true;
    var merged = new THREE.Mesh(ng, mat);
    merged.userData.part = 'gear';
    g.add(merged);
  }
  function addArrow(g, ys) {
    var mat = new THREE.MeshBasicMaterial({ color: '#3d8bfd', depthTest: false });
    var cone = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.20, 7), mat);
    cone.rotation.x = Math.PI; cone.position.set(0, 2.26 * (ys || 1), 0); cone.renderOrder = 20;
    cone.userData.iff = 'arrow';
    cone.userData.noMerge = true;
    g.add(cone);
    return cone;
  }

  function bindAnim(rootObj, clips) {
    var idle = pickClip(clips, ['|idle', 'idle']);
    var walk = pickClip(clips, ['|walk', 'walk']);
    var shoot = pickClip(clips, ['shoot', 'punch']);
    var hit = pickClip(clips, ['recievehit', 'receivehit', 'hit']);
    var die = pickClip(clips, ['defeat', 'death', 'die']);
    var carry = pickClip(clips, ['walk_carry', 'carry']);
    var mixer = new THREE.AnimationMixer(rootObj);
    function act(clip) {
      if (!clip) return null;
      var a = mixer.clipAction(clip);
      a.enabled = true; a.setEffectiveWeight(0); a.play();
      return a;
    }
    var acts = { idle: act(idle), walk: act(walk), shoot: act(shoot), hit: act(hit), die: act(die), carry: act(carry) };
    if (acts.idle) acts.idle.setEffectiveWeight(1);
    var cur = 'idle';
    function setAnim(name, moving) {
      var next = name || (moving ? 'walk' : 'idle');
      if (next === 'run') next = 'walk';
      if (next === cur) {
        if (acts.walk && next === 'walk') acts.walk.timeScale = name === 'run' ? 1.35 : 1;
        return;
      }
      cur = next;
      Object.keys(acts).forEach(function (k) {
        if (acts[k]) acts[k].setEffectiveWeight(k === next ? 1 : 0);
      });
      if (next === 'die' && acts.die) { acts.die.setLoop(THREE.LoopOnce, 1); acts.die.clampWhenFinished = true; }
    }
    return { mixer: mixer, setAnim: setAnim, acts: acts };
  }

  function instantiate(model, spec, side) {
    spec = spec || {};
    var url = fileFor(model);
    var gltf = C.gltfs[url];
    if (!gltf || !THREE.SkeletonUtils) return null;
    var rootObj = THREE.SkeletonUtils.clone(gltf.scene);
    var cloth = side === 'enemy' ? (spec.sand ? '#d0a85c' : '#3e5168') : '#2a5a1c';
    var skin = spec.skin || '#d9a77a';
    var cap = CAP[C.tier] || CAP.mid;
    var camo = side === 'ally';
    if (C.tier !== 'high') limitRoot(rootObj, cap);
    rootObj.traverse(function (m) {
      if (!m.isMesh) return;
      var src = m.material && m.material.map;
      var map = tintTexture(src, cloth, skin, camo);
      m.material = new THREE.MeshLambertMaterial({
        map: map, color: '#ffffff', skinning: !!(m.skeleton || (m.material && m.material.skinning))
      });
      m.frustumCulled = false;
      m.userData.side = side;
      m.userData.part = (m.name || '').toLowerCase().indexOf('head') >= 0 ? 'head' : 'body';
    });
    var box = new THREE.Box3().setFromObject(rootObj);
    var h = Math.max(0.3, box.max.y - box.min.y);
    var ys = spec.scale || 1;
    var s = (1.72 * ys) / h;
    rootObj.scale.setScalar(s);
    if (box.min.y) rootObj.position.y -= box.min.y * s;
    var anim = bindAnim(rootObj, gltf.animations || []);
    var g = new THREE.Group();
    g.add(rootObj);
    var accCol = side === 'enemy' ? (spec.sand ? '#8a7340' : '#2a3544') : '#243d18';
    addGear(g, spec, accCol, ys);
    var arrow = null;
    if (side === 'ally') arrow = addArrow(g, ys);
    var muzzle = new THREE.Object3D(); muzzle.position.set(0.16, 1.28 * ys, 0.42); g.add(muzzle);
    var hit = [];
    g.traverse(function (m) {
      if (m.isMesh && !m.userData.iff) { m.userData.side = side; hit.push(m); }
    });
    g.userData = {
      mixer: anim.mixer, setAnim: anim.setAnim, model: true, side: side, tri: countTris(rootObj),
      muzzle: muzzle, hit: hit, arrow: arrow, nameSpr: null, noMerge: true,
      legL: dummy(), legR: dummy(), armL: dummy(), armR: dummy()
    };
    return g;
  }

  function loadTier(tier) {
    C.tier = tier || (root.Gfx && Gfx.applied && Gfx.applied()) || 'mid';
    if (!THREE || !THREE.GLTFLoader) return Promise.reject(new Error('no-gltf'));
    var keys = Object.keys(MODELS), i, jobs = [];
    for (i = 0; i < keys.length; i++) jobs.push(loadGltf(fileFor(keys[i])));
    Object.keys(GUNS).forEach(function (k) { jobs.push(loadGltf(BASE + GUNS[k])); });
    return Promise.all(jobs).then(function () {
      var mx = 0, cap = CAP[C.tier] || CAP.mid;
      keys.forEach(function (k) {
        var g = C.gltfs[fileFor(k)];
        if (g) mx = Math.max(mx, countTris(g.scene));
      });
      C.tri.high = mx;
      C.tri.mid = Math.min(mx, CAP.mid);
      C.tri.low = Math.min(mx, CAP.low);
      C.ready = true;
    });
  }

  function start() {
    if (!THREE || !THREE.GLTFLoader) { done(new Error('no-gltf')); return; }
    var tier = (root.Gfx && Gfx.applied && Gfx.applied()) || 'mid';
    loadTier(tier).then(function () { done(null); }).catch(function (e) { done(e); });
  }

  function makeAlly(spec) {
    spec = spec || {};
    var named = NAMED[spec.preset];
    var v = named ? named : ALLY_MIX[(C.ai++) % ALLY_MIX.length];
    if (spec.preset && !named) v = ALLY_MIX[(Math.abs(String(spec.preset).length) + C.ai) % ALLY_MIX.length];
    return instantiate(v.model, v, 'ally');
  }

  function makeEnemy(type, seed) {
    var i = (C.ei++) % ENEMY_MIX.length;
    if (type === 'commander') i = 2;
    if (type === 'sniper' || type === 'scout') i = 1;
    var v = ENEMY_MIX[i];
    return instantiate(v.model, v, 'enemy');
  }

  function makeGun(id) {
    var url = BASE + (GUNS[id] || GUNS.t91);
    var gltf = C.gltfs[url];
    if (!gltf) return null;
    var g = gltf.scene.clone(true);
    g.traverse(function (m) {
      if (!m.isMesh) return;
      var col = id === 'm9' ? '#2a2c28' : '#2c2f2a';
      m.material = new THREE.MeshLambertMaterial({
        map: m.material && m.material.map, color: col
      });
      m.frustumCulled = false;
    });
    return g;
  }

  function makeViewmodel() {
    var vm = new THREE.Group();
    var hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.1), new THREE.MeshLambertMaterial({ color: '#3f6a2c' }));
    hand.position.set(0.02, -0.05, -0.16); vm.add(hand);
    var guns = {};
    ['t91', 't75', 't65', 'm9'].forEach(function (id) {
      var g = makeGun(id);
      if (!g) return;
      g.rotation.y = Math.PI;
      if (id === 'm9') { g.scale.setScalar(0.55); g.position.set(0.02, -0.02, -0.18); }
      else if (id === 't65') { g.scale.setScalar(0.42); g.position.set(0.04, -0.04, -0.28); }
      else if (id === 't75') { g.scale.setScalar(0.40); g.position.set(0.05, -0.05, -0.30); }
      else { g.scale.setScalar(0.45); g.position.set(0.04, -0.04, -0.26); }
      g.visible = id === 't91';
      vm.add(g); guns[id] = g;
    });
    vm.userData.guns = guns;
    vm.scale.setScalar(1);
    return vm;
  }

  if (THREE) start();

  root.Chars = {
    ready: function () { return C.ready; },
    error: function () { return C.err; },
    triCount: function (tier) { return C.tri[tier || C.tier] || 0; },
    cap: function (tier) { return CAP[tier || C.tier]; },
    whenReady: function (fn) { if (C.ready || C.err) fn(C.err); else C.wait.push(fn); },
    setTier: function (tier) {
      C.tier = tier || C.tier || 'mid';
      if (root.World && root.World.onCharsReady) root.World.onCharsReady();
      if (root.Combat && root.Combat.onCharsReady) root.Combat.onCharsReady();
      return Promise.resolve();
    },
    makeAlly: makeAlly,
    makeEnemy: makeEnemy,
    makeGun: makeGun,
    makeViewmodel: makeViewmodel,
    countTris: countTris,
    models: function () { return Object.keys(MODELS); }
  };
})(typeof self !== 'undefined' ? self : this);
