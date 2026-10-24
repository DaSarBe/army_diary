/* Kenney CC0 角色：GLTF + AnimationMixer（待機／走路）。只在營區試做場景使用。 */
(function (root) {
  'use strict';
  var THREE = root.THREE;
  var C = { ready: false, gltf: null, tex: { male: null, female: null }, err: null, wait: [], tri: 0 };
  var FEMALE = { mom: 1, cook: 1, gma: 1, fr3: 1 };
  var TINT = {
    sgt: '#c5d2a4', cpt: '#b8c48c', rec: '#cfe0b0', kai: '#c8d6a8', sen: '#c2d09a',
    mom: '#f0c4cc', dad: '#c5d4ea', gpa: '#dce4c8', fr1: '#e8c48a', fr2: '#b8ddd8',
    fr3: '#deb0d8', med: '#f2f2ee', cook: '#f3ead4', barber: '#ecece6', post: '#b7c8a4',
    gma: '#e6c8b4'
  };

  function done(err) {
    C.err = err || null;
    C.ready = !err && !!C.gltf;
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

  function pickClip(clips, name) {
    var best = null, i, c, nm;
    for (i = 0; i < (clips || []).length; i++) {
      c = clips[i]; nm = (c.name || '').toLowerCase();
      if (nm === name || nm.indexOf(name) >= 0) {
        if (!best || c.duration > best.duration) best = c;
      }
    }
    return best;
  }

  function loadTex(url) {
    return new Promise(function (resolve, reject) {
      new THREE.TextureLoader().load(url, function (t) {
        t.flipY = false;
        if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
        t.needsUpdate = true;
        resolve(t);
      }, undefined, reject);
    });
  }

  function start() {
    if (!THREE || !THREE.GLTFLoader) { done(new Error('no-gltf')); return; }
    var loader = new THREE.GLTFLoader();
    Promise.all([
      new Promise(function (resolve, reject) {
        loader.load('assets/characters/kenney/character.glb', resolve, undefined, reject);
      }),
      loadTex('assets/characters/kenney/humanMaleA.png'),
      loadTex('assets/characters/kenney/humanFemaleA.png')
    ]).then(function (all) {
      C.gltf = all[0];
      C.tex.male = all[1];
      C.tex.female = all[2];
      C.tri = countTris(C.gltf.scene);
      done(null);
    }).catch(function (e) { done(e); });
  }

  function dummy() { return { rotation: { x: 0, y: 0, z: 0 } }; }

  function make(spec) {
    spec = spec || {};
    if (!C.ready || !C.gltf || !THREE.SkeletonUtils) return null;
    var rootObj = THREE.SkeletonUtils.clone(C.gltf.scene);
    var female = !!(spec.long || FEMALE[spec.preset] || (spec.hair && spec.long));
    var tex = female ? C.tex.female : C.tex.male;
    var tint = spec.tint || TINT[spec.preset] || spec.shirt || '#d4d0c4';
    rootObj.traverse(function (m) {
      if (!m.isMesh) return;
      var map = (m.material && m.material.map) || tex;
      m.material = new THREE.MeshLambertMaterial({
        map: tex || map,
        color: tint,
        skinning: true
      });
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
    });
    var box = new THREE.Box3().setFromObject(rootObj);
    var h = Math.max(0.2, box.max.y - box.min.y);
    var s = 1.68 / h;
    rootObj.scale.setScalar(s);
    if (box.min.y) rootObj.position.y -= box.min.y * s;
    var clips = (C.gltf.animations || []).slice();
    var idle = pickClip(clips, 'idle');
    var walk = pickClip(clips, 'walk') || pickClip(clips, 'run');
    var mixer = new THREE.AnimationMixer(rootObj);
    var acts = {
      idle: idle ? mixer.clipAction(idle) : null,
      walk: walk ? mixer.clipAction(walk) : null
    };
    Object.keys(acts).forEach(function (k) {
      if (acts[k]) { acts[k].enabled = true; acts[k].setEffectiveWeight(0); acts[k].play(); }
    });
    if (acts.idle) acts.idle.setEffectiveWeight(1);
    if (acts.walk) acts.walk.timeScale = 0.72;
    var cur = 'idle';
    function setMove(mv) {
      var next = mv > 0.18 ? 'walk' : 'idle';
      if (next === cur) return;
      cur = next;
      if (acts.idle) acts.idle.setEffectiveWeight(next === 'idle' ? 1 : 0);
      if (acts.walk) acts.walk.setEffectiveWeight(next === 'walk' ? 1 : 0);
    }
    var g = new THREE.Group();
    g.add(rootObj);
    g.userData = {
      mixer: mixer, setMove: setMove, model: true, tri: C.tri,
      legL: dummy(), legR: dummy(), armL: dummy(), armR: dummy()
    };
    return g;
  }

  if (THREE) start();

  root.Chars = {
    ready: function () { return C.ready; },
    error: function () { return C.err; },
    triCount: function () { return C.tri; },
    whenReady: function (fn) { if (C.ready || C.err) fn(C.err); else C.wait.push(fn); },
    make: make,
    countTris: countTris
  };
})(typeof self !== 'undefined' ? self : this);
