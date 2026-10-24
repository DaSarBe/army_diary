/* Quaternius CC0 角色／槍：預先 LOD GLB、單材質頂點色、敵我辨識。 */
(function (root) {
  'use strict';
  var THREE = root.THREE;
  var C = {
    ready: false, err: null, wait: [], gltfs: {}, maps: {},
    tri: { low: 0, mid: 0, high: 0 }, tier: 'mid', ei: 0, ai: 0, live: []
  };

  var BASE = 'assets/quaternius/';
  var MODELS = { soldier: 'soldier_male', blue: 'blue_soldier_male', casual: 'casual_bald', ninja: 'ninja_sand' };
  var GUNS = { t91: 'rifle_t91.glb', t75: 'rifle_t75.glb', t65: 'rifle_t65.glb', m9: 'pistol_m9.glb' };
  var CAP = { low: 600, mid: 1500, high: 3000 };
  var TIERS = ['low', 'mid', 'high'];

  var NAMED = {
    lin: { model: 'casual', scale: 1.00, skin: '#e2b48a', hat: 'none', hair: 'short', pack: true, vest: false },
    kai: { model: 'casual', scale: 0.93, skin: '#a87450', hat: 'cap', hair: 'none', pack: false, vest: true },
    sgt: { model: 'casual', scale: 1.12, skin: '#c49268', hat: 'none', helm: 'officer', pack: false, vest: true },
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
    for (i = 0; i < q.length; i++) {
      try { q[i](C.err); } catch (e2) { /* listener */ }
    }
    try { if (root.World && root.World.onCharsReady) root.World.onCharsReady(); } catch (e2) { /* world 尚未 init */ }
    try { if (root.Combat && root.Combat.onCharsReady) root.Combat.onCharsReady(); } catch (e2) { /* combat 尚未 init */ }
  }

  function countTris(rootObj) {
    var n = 0;
    if (!rootObj) return 0;
    rootObj.traverse(function (m) {
      if (!m.isMesh || !m.geometry || m.userData.iff) return;
      var g = m.geometry;
      if (g.index) n += g.index.count / 3;
      else if (g.attributes && g.attributes.position) n += g.attributes.position.count / 3;
    });
    return Math.round(n);
  }
  function noteTris(n) {
    C.tri[C.tier] = Math.max(C.tri[C.tier] || 0, n || 0);
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
  function fileFor(model, tier) {
    var stem = MODELS[model] || MODELS.soldier;
    var t = tier || C.tier || 'mid';
    if (t === 'high') return BASE + stem + '.glb';
    return BASE + stem + '_' + t + '.glb';
  }

  function loadGltf(url) {
    return new Promise(function (resolve, reject) {
      if (C.gltfs[url]) { resolve(C.gltfs[url]); return; }
      new THREE.GLTFLoader().load(url, function (g) { C.gltfs[url] = g; resolve(g); }, undefined, reject);
    });
  }

  function clothColor(name, side, spec) {
    var n = String(name || '').toLowerCase();
    var sand = !!(spec && spec.sand);
    if (n.indexOf('face') >= 0 || n.indexOf('skin') >= 0 || n.indexOf('hair') >= 0) return (spec && spec.skin) || '#d9a77a';
    if (side === 'ally') {
      if (n.indexOf('helmet') >= 0 || n.indexOf('officer') >= 0) return '#1e3a16';
      if (n.indexOf('black') >= 0 || n.indexOf('belt') >= 0) return '#1a2414';
      if (n.indexOf('pants') >= 0) return '#2a401c';
      if (n.indexOf('darkgreen') >= 0) return '#1f3d16';
      return '#2f6a24';
    }
    if (sand) {
      if (n.indexOf('helmet') >= 0 || n.indexOf('grey') >= 0 || n.indexOf('gray') >= 0) return '#8a7340';
      if (n.indexOf('black') >= 0 || n.indexOf('details') >= 0) return '#5a4a28';
      return '#d0a85c';
    }
    if (n.indexOf('helmet') >= 0) return '#2a3a50';
    if (n.indexOf('black') >= 0) return '#1a222c';
    if (n.indexOf('grey') >= 0 || n.indexOf('gray') >= 0) return '#4a5564';
    return '#3e5168';
  }

  function dummy() { return { rotation: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 0, z: 0 } }; }

  function boneIndex(skeleton, names) {
    if (!skeleton || !skeleton.bones) return 0;
    var i, nm, k;
    for (i = 0; i < skeleton.bones.length; i++) {
      nm = (skeleton.bones[i].name || '').toLowerCase();
      for (k = 0; k < names.length; k++) if (nm.indexOf(names[k]) >= 0) return i;
    }
    return 0;
  }

  function gearPieces(spec, col, ys) {
    ys = ys || 1;
    var acc = [];
    function mesh(geo, c, x, y, z) {
      var m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: c }));
      m.position.set(x, y, z);
      return m;
    }
    if (spec.hat === 'cap') {
      acc.push({ m: mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.05, 8), col, 0, 1.70 * ys, 0.10), bone: 'head' });
      acc.push({ m: mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.13, 8), col, 0, 1.80 * ys, 0), bone: 'head' });
    }
    if (spec.helm === 'peak') {
      acc.push({ m: mesh(new THREE.CylinderGeometry(0.20, 0.23, 0.20, 8), col, 0, 1.86 * ys, 0), bone: 'head' });
      acc.push({ m: mesh(new THREE.BoxGeometry(0.28, 0.04, 0.20), col, 0, 1.76 * ys, 0.16), bone: 'head' });
    }
    if (spec.helm === 'slouch') {
      acc.push({ m: mesh(new THREE.SphereGeometry(0.20, 8, 6), col, 0.04, 1.84 * ys, 0), bone: 'head' });
      acc.push({ m: mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.03, 8), col, 0, 1.72 * ys, 0.02), bone: 'head' });
    }
    if (spec.helm === 'officer') {
      acc.push({ m: mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.05, 10), col, 0, 1.74 * ys, 0.06), bone: 'head' });
      acc.push({ m: mesh(new THREE.CylinderGeometry(0.18, 0.20, 0.16, 10), '#1a3014', 0, 1.86 * ys, 0), bone: 'head' });
      acc.push({ m: mesh(new THREE.BoxGeometry(0.22, 0.03, 0.18), '#d2b25a', 0, 1.78 * ys, 0.20), bone: 'head' });
    }
    if (spec.hair === 'short' || spec.hair === 'buzz') {
      var hc = spec.hair === 'buzz' ? '#2a2218' : '#3a2a1c';
      acc.push({ m: mesh(new THREE.SphereGeometry(0.20, 8, 6), hc, 0, 1.82 * ys, -0.02), bone: 'head' });
      if (spec.hair === 'short') acc.push({ m: mesh(new THREE.BoxGeometry(0.16, 0.10, 0.08), hc, 0, 1.90 * ys, -0.10), bone: 'head' });
    }
    if (spec.pack) acc.push({ m: mesh(new THREE.BoxGeometry(0.30, 0.36, 0.18), col, 0, 1.18 * ys, -0.24), bone: 'spine' });
    if (spec.vest) acc.push({ m: mesh(new THREE.BoxGeometry(0.44, 0.30, 0.24), col, 0, 1.22 * ys, 0.05), bone: 'spine' });
    return acc;
  }

  function appendColored(buf, mesh, rgb, skeleton, boneHint, relMat) {
    mesh.updateMatrixWorld(true);
    var g = mesh.geometry, p = g.attributes.position, n = g.attributes.normal;
    var skinI = g.attributes.skinIndex, skinW = g.attributes.skinWeight, ix = g.index;
    var v = new THREE.Vector3(), vn = new THREE.Vector3(), nmat = new THREE.Matrix3();
    nmat.getNormalMatrix(relMat);
    var bi = boneHint ? boneIndex(skeleton, boneHint === 'head' ? ['head'] : ['spine', 'chest', 'torso', 'hip']) : 0;
    var vi, cr = rgb.r / 255, cg = rgb.g / 255, cb = rgb.b / 255;
    for (vi = 0; vi < p.count; vi++) {
      v.fromBufferAttribute(p, vi).applyMatrix4(relMat);
      buf.pos.push(v.x, v.y, v.z);
      if (n) { vn.fromBufferAttribute(n, vi).applyMatrix3(nmat).normalize(); buf.nrm.push(vn.x, vn.y, vn.z); }
      else buf.nrm.push(0, 1, 0);
      buf.col.push(cr, cg, cb);
      if (skinI) buf.si.push(skinI.getX(vi), skinI.getY(vi), skinI.getZ(vi), skinI.getW(vi));
      else buf.si.push(bi, 0, 0, 0);
      if (skinW) buf.sw.push(skinW.getX(vi), skinW.getY(vi), skinW.getZ(vi), skinW.getW(vi));
      else buf.sw.push(1, 0, 0, 0);
    }
    if (ix) for (vi = 0; vi < ix.count; vi++) buf.idx.push(ix.getX(vi) + buf.off);
    else for (vi = 0; vi < p.count; vi++) buf.idx.push(vi + buf.off);
    buf.off += p.count;
  }

  function finishSkinned(buf, skeleton, bind, parent) {
    var ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
    ng.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nrm, 3));
    ng.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
    ng.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(buf.si, 4));
    ng.setAttribute('skinWeight', new THREE.Float32BufferAttribute(buf.sw, 4));
    ng.setIndex(buf.idx);
    var mat = new THREE.MeshLambertMaterial({ skinning: !!skeleton });
    mat.vertexColors = (THREE.VertexColors != null) ? THREE.VertexColors : true;
    var out = skeleton && THREE.SkinnedMesh ? new THREE.SkinnedMesh(ng, mat) : new THREE.Mesh(ng, mat);
    if (skeleton) {
      try { out.bind(skeleton, bind || out.bindMatrix); } catch (e) { /* keep */ }
    }
    out.frustumCulled = false;
    (parent || new THREE.Group()).add(out);
    return out;
  }

  function mergeBody(rootObj, spec, side) {
    var meshes = [];
    rootObj.traverse(function (m) {
      if (m.isMesh && m.geometry && m.geometry.attributes && m.geometry.attributes.position) meshes.push(m);
    });
    if (!meshes.length) return null;
    var buf = { pos: [], nrm: [], col: [], si: [], sw: [], idx: [], off: 0 };
    var skeleton = null, parent = meshes[0].parent, bind = meshes[0].bindMatrix;
    var inv = new THREE.Matrix4(), rel = new THREE.Matrix4();
    rootObj.updateMatrixWorld(true);
    inv.copy(rootObj.matrixWorld);
    if (inv.invert) inv.invert(); else if (inv.getInverse) inv.getInverse(rootObj.matrixWorld);
    meshes.forEach(function (m) {
      if (m.skeleton) skeleton = m.skeleton;
      m.updateMatrixWorld(true);
      rel.multiplyMatrices(inv, m.matrixWorld);
      var rgb = hexRgb(clothColor((m.material && m.material.name) || m.name, side, spec));
      appendColored(buf, m, rgb, skeleton, null, rel);
      if (m.parent) m.parent.remove(m);
    });
    return finishSkinned(buf, skeleton, bind, rootObj);
  }

  function bakeGear(skinned, spec, side, ys) {
    if (!skinned) return;
    var cap = CAP[C.tier] || 3000;
    var used = 0;
    if (skinned.geometry) {
      if (skinned.geometry.index) used = skinned.geometry.index.count / 3;
      else if (skinned.geometry.attributes && skinned.geometry.attributes.position) used = skinned.geometry.attributes.position.count / 3;
    }
    if (used + 50 > cap) return;
    var accCol = side === 'enemy' ? (spec.sand ? '#8a7340' : '#2a3544') : '#243d18';
    var pieces = gearPieces(spec, accCol, ys);
    if (!pieces.length) return;
    var tmp = new THREE.Group();
    pieces.forEach(function (p) { tmp.add(p.m); });
    var holder = skinned.parent || skinned;
    holder.add(tmp);
    holder.updateMatrixWorld(true);
    var inv = new THREE.Matrix4().copy(skinned.matrixWorld);
    if (inv.invert) inv.invert(); else if (inv.getInverse) inv.getInverse(skinned.matrixWorld);
    var g = skinned.geometry;
    var pos = Array.prototype.slice.call(g.attributes.position.array);
    var nrm = Array.prototype.slice.call(g.attributes.normal.array);
    var col = Array.prototype.slice.call(g.attributes.color.array);
    var si = Array.prototype.slice.call(g.attributes.skinIndex.array);
    var sw = Array.prototype.slice.call(g.attributes.skinWeight.array);
    var idx = Array.prototype.slice.call(g.index.array);
    var off = g.attributes.position.count;
    var rel = new THREE.Matrix4(), nmat = new THREE.Matrix3();
    var v = new THREE.Vector3(), vn = new THREE.Vector3();
    pieces.forEach(function (p) {
      p.m.updateMatrixWorld(true);
      rel.multiplyMatrices(inv, p.m.matrixWorld);
      nmat.getNormalMatrix(rel);
      var geo = p.m.geometry, pa = geo.attributes.position, na = geo.attributes.normal, ix = geo.index, vi;
      var rgb = hexRgb((p.m.material && p.m.material.color) ? '#' + p.m.material.color.getHexString() : accCol);
      var bi = boneIndex(skinned.skeleton, p.bone === 'head' ? ['head'] : ['spine', 'chest', 'torso', 'hip']);
      for (vi = 0; vi < pa.count; vi++) {
        v.fromBufferAttribute(pa, vi).applyMatrix4(rel);
        pos.push(v.x, v.y, v.z);
        if (na) { vn.fromBufferAttribute(na, vi).applyMatrix3(nmat).normalize(); nrm.push(vn.x, vn.y, vn.z); }
        else nrm.push(0, 1, 0);
        col.push(rgb.r / 255, rgb.g / 255, rgb.b / 255);
        si.push(bi, 0, 0, 0);
        sw.push(1, 0, 0, 0);
      }
      if (ix) for (vi = 0; vi < ix.count; vi++) idx.push(ix.getX(vi) + off);
      else for (vi = 0; vi < pa.count; vi++) idx.push(vi + off);
      off += pa.count;
    });
    if (tmp.parent) tmp.parent.remove(tmp);
    var ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    ng.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    ng.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    ng.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    ng.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    ng.setIndex(idx);
    var old = skinned.geometry;
    skinned.geometry = ng;
    if (old && old.dispose) old.dispose();
  }

  function placeArrow(g) {
    var arrow = g.userData && g.userData.arrow;
    var rootObj = g.userData && g.userData.root;
    if (!arrow || !rootObj) return;
    g.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(rootObj);
    var c = box.getCenter(new THREE.Vector3());
    var inv = new THREE.Matrix4().copy(g.matrixWorld);
    if (inv.invert) inv.invert(); else if (inv.getInverse) inv.getInverse(g.matrixWorld);
    var top = new THREE.Vector3(c.x, box.max.y + 0.18, c.z).applyMatrix4(inv);
    arrow.position.copy(top);
  }

  function addArrow(g) {
    var mat = new THREE.MeshBasicMaterial({ color: '#3d8bfd', depthTest: false });
    var cone = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.18, 7), mat);
    cone.rotation.x = Math.PI;
    cone.renderOrder = 20;
    cone.userData.iff = 'arrow';
    cone.userData.noMerge = true;
    cone.frustumCulled = false;
    g.add(cone);
    return cone;
  }

  function disposeNode(obj) {
    if (!obj) return;
    obj.traverse(function (m) {
      if (m.geometry && m.geometry.dispose) m.geometry.dispose();
      var mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      mats.forEach(function (mat) {
        if (!mat) return;
        if (mat.map && mat.map.userData && mat.map.userData.owned && mat.map.dispose) mat.map.dispose();
        if (mat.dispose) mat.dispose();
      });
    });
  }

  function forget(g) {
    var i = C.live.indexOf(g);
    if (i >= 0) C.live.splice(i, 1);
    if (g && g.userData) g.userData.dead = true;
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

  function buildRoot(model, spec, side) {
    spec = spec || {};
    var url = fileFor(model, C.tier);
    var gltf = C.gltfs[url];
    if (!gltf || !THREE.SkeletonUtils) return null;
    var rootObj = THREE.SkeletonUtils.clone(gltf.scene);
    var skin = mergeBody(rootObj, spec, side);
    var box = new THREE.Box3().setFromObject(rootObj);
    var h = Math.max(0.3, box.max.y - box.min.y);
    var ys = spec.scale || 1;
    var s = (1.72 * ys) / h;
    rootObj.scale.setScalar(s);
    if (box.min.y) rootObj.position.y -= box.min.y * s;
    rootObj.updateMatrixWorld(true);
    if (skin) {
      skin.userData.side = side;
      skin.userData.part = 'body';
      bakeGear(skin, spec, side, ys);
    }
    var anim = bindAnim(rootObj, gltf.animations || []);
    return { root: rootObj, skin: skin, anim: anim, ys: ys };
  }

  function instantiate(model, spec, side) {
    var built = buildRoot(model, spec, side);
    if (!built) return null;
    var g = new THREE.Group();
    g.add(built.root);
    var arrow = null;
    if (side === 'ally') arrow = addArrow(g);
    var muzzle = new THREE.Object3D(); muzzle.position.set(0.16, 1.28 * built.ys, 0.42); g.add(muzzle);
    var gun = makeWorldGun(spec.gun || 't91', built.ys);
    if (gun) {
      gun.traverse(function (m) { if (m.isMesh) m.userData.side = side; });
      g.add(gun);
    }
    var hit = [];
    g.traverse(function (m) {
      if (m.isMesh && !m.userData.iff) { m.userData.side = side; hit.push(m); }
    });
    var tri = countTris(g);
    noteTris(tri);
    g.userData = {
      mixer: built.anim.mixer, setAnim: built.anim.setAnim, model: true, modelKey: model, spec: spec, side: side,
      tri: tri, muzzle: muzzle, hit: hit, arrow: arrow, nameSpr: null, noMerge: true,
      root: built.root, skin: built.skin, gun: gun,
      legL: dummy(), legR: dummy(), armL: dummy(), armR: dummy(),
      dispose: function () {
        forget(g);
        disposeNode(g);
      }
    };
    if (arrow) placeArrow(g);
    C.live.push(g);
    return g;
  }

  function swapLiveLod(g) {
    if (!g || !g.userData || !g.userData.model || g.userData.dead) return;
    var built = buildRoot(g.userData.modelKey, g.userData.spec, g.userData.side);
    if (!built) return;
    var old = g.userData.root;
    if (old && old.parent) old.parent.remove(old);
    disposeNode(old);
    g.add(built.root);
    g.userData.root = built.root;
    g.userData.skin = built.skin;
    g.userData.mixer = built.anim.mixer;
    g.userData.setAnim = built.anim.setAnim;
    var hit = [];
    g.traverse(function (m) {
      if (m.isMesh && !m.userData.iff) { m.userData.side = g.userData.side; hit.push(m); }
    });
    g.userData.hit = hit;
    g.userData.tri = countTris(g);
    noteTris(g.userData.tri);
    placeArrow(g);
  }

  function loadAll() {
    if (!THREE || !THREE.GLTFLoader) return Promise.reject(new Error('no-gltf'));
    var jobs = [], keys = Object.keys(MODELS), i, t;
    for (i = 0; i < keys.length; i++) {
      for (t = 0; t < TIERS.length; t++) jobs.push(loadGltf(fileFor(keys[i], TIERS[t])));
    }
    Object.keys(GUNS).forEach(function (k) { jobs.push(loadGltf(BASE + GUNS[k])); });
    return Promise.all(jobs);
  }

  function start() {
    if (!THREE || !THREE.GLTFLoader) { done(new Error('no-gltf')); return; }
    C.tier = (root.Gfx && Gfx.applied && Gfx.applied()) || 'mid';
    loadAll().then(function () { C.ready = true; done(null); }).catch(function (e) { done(e); });
  }

  function pickAllySpec(spec) {
    spec = spec || {};
    var named = NAMED[spec.preset];
    if (named) return named;
    return ALLY_MIX[(C.ai++) % ALLY_MIX.length];
  }

  function makeAlly(spec) {
    var v = Object.assign({}, pickAllySpec(spec));
    v.gun = (spec && spec.gun) || 't91';
    return instantiate(v.model, v, 'ally');
  }
  function makeEnemy(type) {
    var i = (C.ei++) % ENEMY_MIX.length;
    if (type === 'commander') i = 2;
    if (type === 'sniper' || type === 'scout') i = 1;
    var v = Object.assign({}, ENEMY_MIX[i]);
    v.gun = type === 'gunner' ? 't75' : (type === 'sniper' ? 't65' : (type === 'scout' ? 'm9' : 't91'));
    return instantiate(v.model, v, 'enemy');
  }

  function mergeStatic(src, hex) {
    var meshes = [];
    src.updateMatrixWorld(true);
    src.traverse(function (m) {
      if (m.isMesh && m.geometry && m.geometry.attributes && m.geometry.attributes.position) meshes.push(m);
    });
    if (!meshes.length) return src;
    var buf = { pos: [], nrm: [], col: [], idx: [], off: 0 };
    var inv = new THREE.Matrix4().copy(src.matrixWorld);
    if (inv.invert) inv.invert(); else if (inv.getInverse) inv.getInverse(src.matrixWorld);
    var rel = new THREE.Matrix4(), nmat = new THREE.Matrix3();
    var v = new THREE.Vector3(), vn = new THREE.Vector3();
    var rgb = hexRgb(hex);
    meshes.forEach(function (m) {
      m.updateMatrixWorld(true);
      rel.multiplyMatrices(inv, m.matrixWorld);
      nmat.getNormalMatrix(rel);
      var geo = m.geometry, p = geo.attributes.position, n = geo.attributes.normal, ix = geo.index, vi;
      for (vi = 0; vi < p.count; vi++) {
        v.fromBufferAttribute(p, vi).applyMatrix4(rel);
        buf.pos.push(v.x, v.y, v.z);
        if (n) { vn.fromBufferAttribute(n, vi).applyMatrix3(nmat).normalize(); buf.nrm.push(vn.x, vn.y, vn.z); }
        else buf.nrm.push(0, 1, 0);
        buf.col.push(rgb.r / 255, rgb.g / 255, rgb.b / 255);
      }
      if (ix) for (vi = 0; vi < ix.count; vi++) buf.idx.push(ix.getX(vi) + buf.off);
      else for (vi = 0; vi < p.count; vi++) buf.idx.push(vi + buf.off);
      buf.off += p.count;
      if (m.parent) m.parent.remove(m);
    });
    var ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
    ng.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nrm, 3));
    ng.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
    ng.setIndex(buf.idx);
    var mat = new THREE.MeshLambertMaterial({ color: hex });
    mat.vertexColors = (THREE.VertexColors != null) ? THREE.VertexColors : true;
    var out = new THREE.Mesh(ng, mat);
    out.frustumCulled = false;
    src.add(out);
    return src;
  }

  function gunColor(id) {
    if (id === 't75') return '#3a3228';
    if (id === 't65') return '#1e2420';
    if (id === 'm9') return '#2a2c28';
    return '#2c2f2a';
  }

  function makeGun(id) {
    var url = BASE + (GUNS[id] || GUNS.t91);
    var gltf = C.gltfs[url];
    if (!gltf) return null;
    var g = gltf.scene.clone(true);
    mergeStatic(g, gunColor(id));
    g.traverse(function (m) {
      if (!m.isMesh) return;
      m.frustumCulled = false;
      m.userData.iff = 'gun';
      m.userData.part = 'gun';
    });
    g.userData.iff = 'gun';
    g.userData.part = 'gun';
    g.userData.gunId = id;
    return g;
  }

  function makeWorldGun(id, ys) {
    var g = makeGun(id);
    if (!g) return null;
    var box = new THREE.Box3().setFromObject(g);
    var size = box.getSize(new THREE.Vector3());
    var longest = Math.max(size.x, size.y, size.z) || 1;
    var len = { t91: 0.72, t75: 0.88, t65: 0.98, m9: 0.26 };
    g.rotation.set(0, Math.PI / 2, 0);
    g.scale.setScalar((len[id] || 0.7) / longest);
    g.updateMatrixWorld(true);
    box.setFromObject(g);
    var c = box.getCenter(new THREE.Vector3());
    g.position.set(0.22 - c.x, 1.16 * (ys || 1) - c.y, 0.34 - c.z);
    return g;
  }
  function makeViewmodel() {
    var vm = new THREE.Group();
    var hand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 0.08), new THREE.MeshLambertMaterial({ color: '#3f6a2c' }));
    hand.position.set(0.04, -0.08, -0.22); vm.add(hand);
    var guns = {}, len = { t91: 0.38, t75: 0.42, t65: 0.46, m9: 0.20 };
    ['t91', 't75', 't65', 'm9'].forEach(function (id) {
      var g = makeGun(id);
      if (!g) return;
      var box = new THREE.Box3().setFromObject(g);
      var size = box.getSize(new THREE.Vector3());
      var longest = Math.max(size.x, size.y, size.z) || 1;
      g.rotation.set(0, -Math.PI / 2, 0);
      g.scale.setScalar((len[id] || 0.36) / longest);
      g.updateMatrixWorld(true);
      box.setFromObject(g);
      var c = box.getCenter(new THREE.Vector3());
      g.position.set(-c.x + 0.12, -c.y - 0.12, -c.z - 0.28);
      g.visible = id === 't91';
      vm.add(g); guns[id] = g;
    });
    vm.userData.guns = guns;
    return vm;
  }

  function charCalls(g) {
    var n = 0;
    if (!g) return 0;
    g.traverse(function (m) {
      if (m.isMesh && m.visible !== false && !m.userData.iff) n++;
    });
    return n;
  }

  if (THREE) start();

  root.Chars = {
    ready: function () { return C.ready; },
    error: function () { return C.err; },
    triCount: function (tier) { return C.tri[tier || C.tier] || 0; },
    cap: function (tier) { return CAP[tier || C.tier]; },
    whenReady: function (fn) { if (C.ready || C.err) fn(C.err); else C.wait.push(fn); },
    setTier: function (tier) {
      var next = tier || C.tier || 'mid';
      if (next === C.tier) return Promise.resolve();
      C.tier = next;
      C.live.forEach(swapLiveLod);
      return Promise.resolve();
    },
    makeAlly: makeAlly,
    makeEnemy: makeEnemy,
    makeGun: makeGun,
    makeWorldGun: makeWorldGun,
    makeViewmodel: makeViewmodel,
    countTris: countTris,
    charCalls: charCalls,
    forget: forget,
    live: function () { return C.live.slice(); },
    models: function () { return Object.keys(MODELS); }
  };
})(typeof self !== 'undefined' ? self : this);
