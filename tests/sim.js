/* 大量隨機遊玩模擬：用同一份 engine.js，在邏輯層模擬整個義務役一年。 */
var fs = require('fs'), path = require('path');
var Engine = require('../js/engine.js');
var root = path.join(__dirname, '..', 'data');
var story = JSON.parse(fs.readFileSync(path.join(root, 'story.json'), 'utf8'));
var fpsSys = JSON.parse(fs.readFileSync(path.join(root, 'fps-system.json'), 'utf8'));
var beachStory = JSON.parse(fs.readFileSync(path.join(root, 'story_beach.json'), 'utf8'));
var rpg = JSON.parse(fs.readFileSync(path.join(root, 'rpg-system.json'), 'utf8'));
var tuning = JSON.parse(fs.readFileSync(path.join(root, 'tuning.json'), 'utf8'));
Engine.init(story, rpg, tuning, { fps: fpsSys, beach: beachStory });
var D = Engine.data();

var POLICIES = {
  random: { pDo: 0.55, pMain: 0.7, mu: 55, sigma: 25, pTimer: 0.85, pVol: 0.5, pContra: 0.45, smart: 0, pDown: 0.22, pRetry: 0.75, pCarry: 0.6, pTreat: 0.9, pCourt: 0.04, pRehabFail: 0.42 },
  casual: { pDo: 0.35, pMain: 0.6, mu: 45, sigma: 25, pTimer: 0.75, pVol: 0.4, pContra: 0.35, smart: 0, pDown: 0.32, pRetry: 0.65, pCarry: 0.5, pTreat: 0.72, pCourt: 0.045, pRehabFail: 0.55 },
  diligent: { pDo: 0.9, pMain: 1, mu: 70, sigma: 18, pTimer: 0.95, pVol: 0.5, pContra: 0.12, smart: 1, pDown: 0.12, pRetry: 0.85, pCarry: 0.85, pTreat: 0.92, pCourt: 0.032, pRehabFail: 0.28 },
  reckless: { pDo: 0.8, pMain: 0.5, mu: 50, sigma: 25, pTimer: 0.8, pVol: 0.5, pContra: 0.85, smart: 0, pDown: 0.3, pRetry: 0.45, pCarry: 0.5, pTreat: 0.55, pCourt: 0.05, pRehabFail: 0.6 }
};
var BGS = ['uni', 'office', 'site', 'gamer'];

function gauss(r) { var u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

function playOne(seed, P) {
  var r = Engine.mulberry(seed);
  Engine.setRng(r);
  var s = Engine.newState('測試', BGS[Math.floor(r() * 4)]);
  var guard = 0;
  function spendSkills() {
    var ids = Object.keys(D.skills);
    while (s.sp > 0) {
      var ok = ids.filter(function (i) { return Engine.skillAvailable(s, i) && Engine.skillRank(s, i) < D.skills[i].maxRank; });
      if (!ok.length) break;
      var pick = P.smart ? (Engine.skillRank(s, 'sk_social') < 2 && Engine.skillAvailable(s, 'sk_social') ? 'sk_social' : ok[Math.floor(r() * ok.length)]) : ok[Math.floor(r() * ok.length)];
      Engine.learnSkill(s, pick);
    }
  }
  function maintain() {
    spendSkills();
    var o = Engine.newOut();
    if (s.money > 300 && r() < 0.3) {
      var shop = Engine.shopList();
      var it = shop[Math.floor(r() * shop.length)];
      Engine.buy(s, it.id);
    }
    if (s.fatigue > 60 && s.items.it_salonpas) Engine.useItem(s, 'it_salonpas', o);
    if (s.hp < 30 && s.items.it_energy) Engine.useItem(s, 'it_energy', o);
    if (P.smart && s.honor > 0 && s.fatigue > 50 && s.day >= 31) Engine.takeLeave(s, o);
  }
  function mgRaw() { return Math.max(0, Math.min(100, P.mu + gauss(r) * P.sigma)); }
  function doQuest(q) {
    var o = Engine.newOut();
    if (!Engine.accept(s, q.id)) return;
    var i, ok = true;
    for (i = 0; i < q.objectives.length && ok; i++) {
      var ob = q.objectives[i], t = ob.type;
      if (t === 'check') ok = Engine.rollCheck(s, ob.target, q).ok;
      else if (t === 'minigame') {
        if (ob.target === 'lottery') Engine.lottery(s, o);
        else if (ob.target === 'cover_tutorial') Engine.minigameResult(s, q.id, ob.target, 90, o);
        else if (ob.target === 'rehab') {
          function rehabScore(failP) {
            if (failP && r() < failP) return 20;
            return Math.max(0, Math.min(100, (P.pTreat > 0.8 ? 88 : 50) + gauss(r) * 12));
          }
          var rh = Engine.minigameResult(s, q.id, ob.target, rehabScore(P.pRehabFail), o);
          if (rh.tier === 'fail' && q.id === 'ch5_beach_rehab' && Engine.canRehabRetry(s, q.id) && Engine.offerRehabRetry(s, q.id, o).retry) {
            rh = Engine.minigameResult(s, q.id, ob.target, rehabScore(Math.min(0.85, (P.pRehabFail || 0) + 0.12)), o);
          }
          ok = rh.tier !== 'fail';
        }
        else ok = Engine.minigameResult(s, q.id, ob.target, mgRaw(), o).tier !== 'fail';
      } else if (t === 'rhythm') ok = Engine.minigameResult(s, q.id, 'rhythm', mgRaw(), o).tier !== 'fail';
      else if (t === 'timed' || t === 'stealth' || t === 'defend') ok = Engine.mgFinal(s, 'timed', mgRaw()) >= 60;
      else if (ob.timeLimit && typeof ob.timeLimit === 'number') ok = r() < P.pTimer;
      else if (t === 'decide') { if (q.decision) Engine.decide(s, q.id, r() < P.pVol ? 0 : 1, o); else if (q.id === 'ch5_beach_memorial') Engine.addAttr(s, 'm', r() < 0.5 ? 2 : 1, o, q.id); }
      if (q.id === 'ch1_main_02' && t === 'inspect' && r() < P.pContra * 0.3) Engine.packContraband(s);
      if (q.id === 'ch2_main_01' && t === 'inspect' && ob.target === 'bag_check') ok = Engine.bagCheck(s);
      if (q.id === 'ch4_side_02' && i === 0 && r() < P.pContra) Engine.takeContraband(s, o);
      if (q.id === 'ch4_side_02' && t === 'carry') ok = ok && Engine.deliverCheck(s, o);
      if (ok) Engine.stepDone(s, q.id, o);
      if (s.over) return;
    }
    if (!ok) { Engine.fail(s, q.id, o); return; }
    Engine.complete(s, q.id, o);
  }

  function simBeach() {
    var o = Engine.newOut(), b, q, guard = 0;
    Engine.startBeach(s, { diff: 'hardcore', aim: r() < 0.4 });
    b = s.beach;
    if (r() < (P.pCourt || 0)) {
      Engine.setFlag(s, 'court', Engine.newOut(), true);
      return;
    }
    var order = fpsSys.questOrder;
    function finish(q2) { Engine.complete(s, q2.id, Engine.newOut()); }
    function steps(q2, n) { for (var i = 0; i < n; i++) Engine.stepDone(s, q2.id, Engine.newOut()); }
    function wave(id, q2) {
      // 回傳 'clear'｜'lin'｜'skip'
      if (b.medevac) return 'skip';
      var tries = 0;
      while (tries++ < 4) {
        var pDown = Math.max(0.03, Math.min(0.8, P.pDown + (id === 'wave4' ? 0.08 : 0) + (id === 'wave3' ? -0.05 : 0) - tries * 0.05 + (b.cmd === 'counter' ? 0.08 : 0) - (b.cmd === 'fallback' ? 0.08 : 0)));
        if (s.flags.radio_fixed && id === 'wave4') pDown *= 0.75;
        if (r() < pDown) {
          if (id === 'wave4') b.hpZeroW4 = true;
          if (r() < P.pRetry && tries < 3) { Engine.retryWave(s, id); s.hp = Engine.hpMax(s) * 0.8; continue; }
          Engine.medevac(s, Engine.newOut()); return 'skip';
        }
        if (id === 'wave3' && r() < Math.max(0.05, 0.3 - (P.mu - 50) / 160)) return 'lin';
        Engine.waveClear(s, id, Engine.newOut()); s.hp = Math.max(s.hp, 1); return 'clear';
      }
      return 'skip';
    }
    while (Engine.beachActive(s) && guard++ < 20) {
      q = guard === 1 ? Engine.data().q.ch4_beach_prep : Engine.beachNext(s);
      if (!q) break;
      if (guard > 1) Engine.accept(s, q.id);
      var fo = Engine.newOut(), ok = true;
      switch (q.id) {
        case 'ch4_beach_prep': steps(q, q.objectives.length); break;
        case 'ch4_beach_alert': steps(q, 2); ok = Engine.rollCheck(s, 'check.endure', q).ok; if (ok) steps(q, 1); break;
        case 'ch4_beach_armory':
          steps(q, 1);
          ok = Engine.mgFinal(s, 'timed', Math.max(0, Math.min(100, P.mu + gauss(r) * P.sigma))) >= 60;
          if (ok) { steps(q, 1); var crates = Math.floor(r() * 5); b.crates = crates; b.mags = Math.min(6, 2 + crates); Engine.addFatigue(s, crates * 8, Engine.newOut(), true); steps(q, 1); }
          break;
        case 'ch4_beach_wave1': wave('wave1', q); steps(q, 1); break;
        case 'ch4_beach_rescue': {
          // 先決定救援，再打第 2 波
          if (!b.medevac) {
            if (r() < P.pCarry) { if (r() < 0.8) { s.flags.saved_civilian = 1; Engine.addAttr(s, 'o', 2, Engine.newOut(), q.id); } else { Engine.inflictInjury(s, 'inj_sprain', Engine.newOut()); } }
            else { Engine.addAttr(s, 'd', 1, Engine.newOut(), q.id); Engine.civilianStay(s); }
          }
          var rs = wave('wave2', q);
          if (rs === 'clear' && !s.flags.saved_civilian && false) { /* 保留 */ }
          steps(q, 2); break;
        }
        case 'ch4_beach_radio': {
          var rr = wave('wave3', q);
          if (rr === 'lin') ok = false; else { steps(q, 3); }
          if (rr === 'skip' && !b.medevac) ok = false;
          break;
        }
        case 'ch4_beach_aid': {
          var treat = r() < P.pTreat, score = null;
          if (treat) { var res = Engine.minigameResult(s, q.id, 'first_aid', Math.max(0, Math.min(100, 85 + (P.mu - 55) * 0.4 + gauss(r) * 14)), Engine.newOut()); score = res.score; b.tough = false; } else b.tough = true;
          var af = Engine.akaiFate(s, score, !treat, Engine.newOut());
          if (af.kia) ok = false; else steps(q, 2);
          break;
        }
        case 'ch4_beach_command': {
          var u = r(), cm = u < 0.3 ? 'hold' : u < 0.7 ? 'fallback' : 'counter'; b.cmd = cm;
          if (cm === 'hold') { Engine.addAttr(s, 'd', 2, Engine.newOut(), q.id); s.honor = Math.min(10, s.honor + 1); }
          else if (cm === 'fallback') s.flags.beach_fallback = 1; else { Engine.addAttr(s, 'b', 2, Engine.newOut(), q.id); Engine.addAttr(s, 'o', 1, Engine.newOut(), q.id); }
          wave('wave4', q); Engine.wangFate(s, Engine.newOut()); steps(q, 3); break;
        }
        case 'ch4_beach_relief': steps(q, 4); break;
        default: steps(q, q.objectives.length);
      }
      if (!ok) Engine.fail(s, q.id, fo); else if (q.id === 'ch4_beach_relief') { finish(q); } else finish(q);
      if (s.over) return;
    }
  }

  while (!s.over && guard++ < 5000) {
    maintain();
    if (Engine.beachPending(s)) { simBeach(); continue; }
    var av = Engine.listAvailable(s);
    var o = Engine.newOut();
    if (s.flags.hospitalized) {
      av = av.filter(function (q) { return q.id === 'ch5_beach_rehab' || q.type === 'main' || r() < 0.22; });
    }
    if (av.length && r() < (s.flags.hospitalized ? P.pDo * 0.45 : P.pDo)) {
      var mains = av.filter(function (q) { return q.type === 'main'; });
      var rehabQ = av.filter(function (q) { return q.id === 'ch5_beach_rehab'; });
      var q = rehabQ.length && r() < 0.85 ? rehabQ[0] : ((mains.length && r() < P.pMain) ? mains[0] : av[Math.floor(r() * av.length)]);
      doQuest(q);
    } else if (!av.length) {
      var nx = Engine.nextQuestDay(s);
      if (nx && nx.day - s.day > 0 && (r() < 0.8)) Engine.skipDays(s, Math.min(nx.day - s.day, 60), o);
      else Engine.sleep(s, o);
    } else Engine.sleep(s, o);
  }
  // 志願役選擇如果完全沒遇到（例如錯過說明會），視為未簽
  var e = s.ending || Engine.evalEnding(s);
  return { end: e, s: s };
}

function run(n, P, name) {
  var cnt = {}, tot = { b: 0, m: 0, d: 0, o: 0, lv: 0, dem: 0, q: 0, vol: 0 }, i;
  for (i = 0; i < n; i++) {
    var res = playOne(1000 + i, P), s = res.s;
    cnt[res.end] = (cnt[res.end] || 0) + 1;
    ['b', 'm', 'd', 'o'].forEach(function (k) { tot[k] += s.a[k]; });
    tot.lv += s.level; tot.dem += s.demerit; tot.q += s.stats.qDone; tot.vol += s.flags.vol ? 1 : 0;
  }
  var ids = Engine.allEndings().map(function (e) { return e.id; });
  var out = { policy: name, n: n, dist: {}, avg: {} };
  ids.forEach(function (id) { out.dist[id] = +(100 * (cnt[id] || 0) / n).toFixed(1); });
  ['b', 'm', 'd', 'o', 'lv', 'dem', 'q', 'vol'].forEach(function (k) { out.avg[k] = +(tot[k] / n).toFixed(1); });
  return out;
}

if (require.main === module) {
  var n = +process.argv[2] || 2000, only = process.argv[3];
  var results = [];
  Object.keys(POLICIES).forEach(function (k) {
    if (only && only !== k) return;
    var rr = run(n, POLICIES[k], k);
    results.push(rr);
    console.log(JSON.stringify(rr));
  });
  if (!only) {
    var mix = {}, tot = 0;
    results.forEach(function (rr) { Object.keys(rr.dist).forEach(function (id) { mix[id] = (mix[id] || 0) + rr.dist[id]; }); tot++; });
    Object.keys(mix).forEach(function (id) { mix[id] = +(mix[id] / tot).toFixed(1); });
    console.log('MIX ' + JSON.stringify(mix));
  }
}
module.exports = { playOne: playOne, run: run, POLICIES: POLICIES };
