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

  function findBone(rootObj, names) {
    var exact = null, fuzzy = null;
    if (!rootObj) return null;
    rootObj.traverse(function (o) {
      var nm = (o.name || '').toLowerCase();
      var k;
      for (k = 0; k < names.length; k++) {
        if (nm === names[k]) { if (!exact) exact = o; }
        else if (!fuzzy && nm.indexOf(names[k]) >= 0) fuzzy = o;
      }
    });
    return exact || fuzzy;
  }

  /* 槍本地 +X 是槍口。數值是 FistR 骨骼空間：握把在掌心、槍口沿拳骨向前。
     旋轉讓扁平的 XY 槍面立起來（彈匣朝下），位置把握把拉回掌心。 */
  var GUN_HOLD = {
    t91: { scale: 0.34, pos: [0.06, 0.02, 0.04], rot: [0.00, -1.57, 1.57], muzzle: 2.85, guard: 1.35 },
    t75: { scale: 0.22, pos: [0.07, 0.02, 0.06], rot: [0.00, -1.57, 1.57], muzzle: 3.50, guard: 1.55 },
    t65: { scale: 0.17, pos: [0.06, 0.01, 0.08], rot: [0.00, -1.57, 1.57], muzzle: 5.10, guard: 1.90 },
    m9: { scale: 0.15, pos: [0.03, 0.03, 0.02], rot: [0.20, -1.57, 1.57], muzzle: 1.40, guard: 0 }
  };
  var VM_HOLD = {
    t91: { scale: 0.12, pos: [0.20, -0.15, -0.30], rot: [0.40, 1.20, 0.18] },
    t75: { scale: 0.09, pos: [0.19, -0.16, -0.28], rot: [0.42, 1.18, 0.16] },
    t65: { scale: 0.08, pos: [0.20, -0.14, -0.34], rot: [0.38, 1.22, 0.14] },
    m9: { scale: 0.14, pos: [0.22, -0.12, -0.26], rot: [0.35, 1.15, 0.22] }
  };

  function applyHold(obj, hold) {
    if (!obj || !hold) return;
    obj.position.set(hold.pos[0], hold.pos[1], hold.pos[2]);
    obj.rotation.set(hold.rot[0], hold.rot[1], hold.rot[2]);
    obj.scale.setScalar(hold.scale);
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
    out.frustumCulled = false;
    (parent || new THREE.Group()).add(out);
    if (skeleton) {
      out.updateMatrixWorld(true);
      try { out.bind(skeleton); } catch (e) {
        try { out.bind(skeleton, bind || out.bindMatrix); } catch (e2) { /* keep */ }
      }
    }
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
      if (m.skeleton && m.skeleton.boneTexture) {
        if (m.skeleton.boneTexture.dispose) m.skeleton.boneTexture.dispose();
        m.skeleton.boneTexture = null;
      }
      if (m.geometry && m.geometry.dispose) m.geometry.dispose();
      var mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      mats.forEach(function (mat) {
        if (!mat) return;
        if (mat.map && mat.map.dispose) mat.map.dispose();
        if (mat.dispose) mat.dispose();
      });
    });
  }

  function forget(g) {
    var i = C.live.indexOf(g);
    if (i >= 0) C.live.splice(i, 1);
    if (g && g.userData) g.userData.dead = true;
  }

  function boneAlongY(bone) {
    if (!bone || !bone.children || !bone.children.length) return true;
    var c = bone.children[0], p = c.position;
    return Math.abs(p.y) >= Math.abs(p.x) && Math.abs(p.y) >= Math.abs(p.z);
  }

  function lookBoneAt(bone, worldTarget, axis) {
    if (!bone || !bone.parent) return;
    bone.parent.updateMatrixWorld(true);
    var origin = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
    var dir = worldTarget.clone().sub(origin);
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    var inv = new THREE.Matrix4().copy(bone.parent.matrixWorld);
    if (inv.invert) inv.invert(); else if (inv.getInverse) inv.getInverse(bone.parent.matrixWorld);
    dir.transformDirection(inv);
    var from = axis || (boneAlongY(bone) ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1));
    bone.quaternion.setFromUnitVectors(from, dir);
  }

  function poseSupport(g) {
    if (!g || !g.userData) return;
    var spec = g.userData.spec, gun = g.userData.gun, rootObj = g.userData.root;
    if (!spec || !gun || !rootObj || spec.gun === 'm9') return;
    var hold = GUN_HOLD[spec.gun] || GUN_HOLD.t91;
    if (!hold.guard) return;
    var upper = findBone(rootObj, ['upperarml']);
    var lower = findBone(rootObj, ['lowerarml']);
    var guard = g.userData.guard;
    if (!guard && gun) {
      gun.traverse(function (o) { if (o.userData && o.userData.part === 'guard') guard = o; });
    }
    if (!upper || !lower || !guard) return;
    g.updateMatrixWorld(true);
    var target = new THREE.Vector3();
    guard.getWorldPosition(target);
    lookBoneAt(upper, target);
    lower.updateMatrixWorld(true);
    lookBoneAt(lower, target);
  }

  function bindAnim(rootObj, clips, armed) {
    var idle = armed
      ? pickClip(clips, ['idle_gun', 'gun_idle', 'shoot_onehanded', 'gun_shoot', 'idle_aim', '|idle', 'idle'])
      : pickClip(clips, ['|idle', 'idle']);
    var walk = armed
      ? pickClip(clips, ['run_gun', 'walk_gun', 'walk_aim', 'walk', '|walk'])
      : pickClip(clips, ['|walk', 'walk']);
    var shoot = pickClip(clips, ['gun_shoot', 'shoot_onehanded', 'shoot', 'punch']);
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
    return { mixer: mixer, setAnim: setAnim, getAnim: function () { return cur; }, acts: acts };
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
    var armed = !!(spec && spec.gun);
    var anim = bindAnim(rootObj, gltf.animations || [], armed);
    return { root: rootObj, skin: skin, anim: anim, ys: ys };
  }

  function attachWorldGun(g) {
    if (!g || !g.userData) return null;
    var id = (g.userData.spec && g.userData.spec.gun) || 't91';
    var gun = g.userData.gun;
    if (gun && gun.parent) gun.parent.remove(gun);
    if (!gun) {
      gun = makeGun(id);
      if (!gun) return null;
      gun.traverse(function (m) { if (m.isMesh) m.userData.side = g.userData.side; });
      g.userData.gun = gun;
    }
    applyHold(gun, GUN_HOLD[id] || GUN_HOLD.t91);
    var hand = findBone(g.userData.root, ['fistr', 'fist.r', 'handr', 'hand.r', 'righthand', 'right_hand']);
    if (hand) hand.add(gun);
    else g.add(gun);
    var hold = GUN_HOLD[id] || GUN_HOLD.t91;
    var muzzle = g.userData.muzzle;
    if (!muzzle) {
      muzzle = new THREE.Object3D();
      g.userData.muzzle = muzzle;
    }
    if (muzzle.parent) muzzle.parent.remove(muzzle);
    muzzle.position.set((hold.muzzle || 2.8), 0, 0);
    gun.add(muzzle);
    var guard = g.userData.guard;
    if (!guard) {
      guard = new THREE.Object3D();
      g.userData.guard = guard;
    }
    if (guard.parent) guard.parent.remove(guard);
    guard.position.set((hold.guard || 1.4), 0, 0);
    guard.userData.part = 'guard';
    gun.add(guard);
    return gun;
  }

  function wrapMixer(g, mixer) {
    if (!mixer || mixer.userData && mixer.userData.posed) return mixer;
    var rawUp = mixer.update.bind(mixer);
    mixer.update = function (dt) {
      rawUp(dt);
      poseSupport(g);
    };
    mixer.userData = { posed: true };
    return mixer;
  }

  function instantiate(model, spec, side) {
    var built = buildRoot(model, spec, side);
    if (!built) return null;
    var g = new THREE.Group();
    g.add(built.root);
    var arrow = null;
    if (side === 'ally') arrow = addArrow(g);
    var muzzle = new THREE.Object3D();
    g.userData = { root: built.root, spec: spec, side: side, muzzle: muzzle };
    var gun = attachWorldGun(g);
    var hit = [];
    g.traverse(function (m) {
      if (m.isMesh && !m.userData.iff) { m.userData.side = side; hit.push(m); }
    });
    var tri = countTris(g);
    noteTris(tri);
    g.userData = {
      mixer: built.anim.mixer, setAnim: built.anim.setAnim, getAnim: built.anim.getAnim,
      model: true, modelKey: model, spec: spec, side: side,
      tri: tri, muzzle: g.userData.muzzle || muzzle, guard: g.userData.guard || null,
      hit: hit, arrow: arrow, nameSpr: null, noMerge: true,
      root: built.root, skin: built.skin, gun: gun,
      legL: dummy(), legR: dummy(), armL: dummy(), armR: dummy(),
      dispose: function () {
        forget(g);
        disposeNode(g);
      }
    };
    if (arrow) placeArrow(g);
    if (built.anim.mixer) {
      g.userData.mixer = wrapMixer(g, built.anim.mixer);
      g.userData.mixer.update(0.2);
    }
    C.live.push(g);
    return g;
  }

  function swapLiveLod(g) {
    if (!g || !g.userData || !g.userData.model || g.userData.dead) return;
    var prev = g.userData.getAnim ? g.userData.getAnim() : 'idle';
    var gun = g.userData.gun;
    if (gun && gun.parent) gun.parent.remove(gun);
    var built = buildRoot(g.userData.modelKey, g.userData.spec, g.userData.side);
    if (!built) return;
    var old = g.userData.root;
    if (old && old.parent) old.parent.remove(old);
    disposeNode(old);
    g.add(built.root);
    g.userData.root = built.root;
    g.userData.skin = built.skin;
    g.userData.mixer = wrapMixer(g, built.anim.mixer);
    g.userData.setAnim = built.anim.setAnim;
    g.userData.getAnim = built.anim.getAnim;
    attachWorldGun(g);
    if (prev && g.userData.setAnim) g.userData.setAnim(prev);
    if (g.userData.mixer) g.userData.mixer.update(0.15);
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
    if (id === 't75') return '#5a4a38';
    if (id === 't65') return '#3a4238';
    if (id === 'm9') return '#4a4c46';
    return '#4a4e46';
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
    applyHold(g, GUN_HOLD[id] || GUN_HOLD.t91);
    void ys;
    return g;
  }
  function makeViewmodel() {
    var vm = new THREE.Group();
    var hand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 0.08), new THREE.MeshLambertMaterial({ color: '#3f6a2c' }));
    hand.position.set(0.16, -0.18, -0.22); vm.add(hand);
    var guns = {};
    ['t91', 't75', 't65', 'm9'].forEach(function (id) {
      var g = makeGun(id);
      if (!g) return;
      applyHold(g, VM_HOLD[id] || VM_HOLD.t91);
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
      if (!m.isMesh || m.visible === false) return;
      if (m.userData.iff === 'gun' || m.userData.part === 'gun') return;
      n++;
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
    setGunHold: function (id, hold) {
      if (!GUN_HOLD[id] || !hold) return;
      Object.keys(hold).forEach(function (k) { GUN_HOLD[id][k] = hold[k]; });
      C.live.forEach(function (g) {
        if (g.userData && g.userData.spec && g.userData.spec.gun === id) attachWorldGun(g);
      });
    },
    gunHold: function (id) { return GUN_HOLD[id]; },
    countTris: countTris,
    charCalls: charCalls,
    forget: forget,
    live: function () { return C.live.slice(); },
    models: function () { return Object.keys(MODELS); }
  };
})(typeof self !== 'undefined' ? self : this);
