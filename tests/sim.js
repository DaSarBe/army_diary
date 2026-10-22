/* 大量隨機遊玩模擬：用同一份 engine.js，在邏輯層模擬整個義務役一年。 */
var fs = require('fs'), path = require('path');
var Engine = require('../js/engine.js');
var root = path.join(__dirname, '..', 'data');
var story = JSON.parse(fs.readFileSync(path.join(root, 'story.json'), 'utf8'));
var rpg = JSON.parse(fs.readFileSync(path.join(root, 'rpg-system.json'), 'utf8'));
var tuning = JSON.parse(fs.readFileSync(path.join(root, 'tuning.json'), 'utf8'));
Engine.init(story, rpg, tuning);
var D = Engine.data();

var POLICIES = {
  random: { pDo: 0.55, pMain: 0.7, mu: 55, sigma: 25, pTimer: 0.85, pVol: 0.5, pContra: 0.3, smart: 0 },
  casual: { pDo: 0.35, pMain: 0.6, mu: 45, sigma: 25, pTimer: 0.75, pVol: 0.4, pContra: 0.2, smart: 0 },
  diligent: { pDo: 0.9, pMain: 1, mu: 70, sigma: 18, pTimer: 0.95, pVol: 0.5, pContra: 0.0, smart: 1 },
  reckless: { pDo: 0.8, pMain: 0.5, mu: 50, sigma: 25, pTimer: 0.8, pVol: 0.5, pContra: 0.8, smart: 0 }
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
        else ok = Engine.minigameResult(s, q.id, ob.target, mgRaw(), o).tier !== 'fail';
      } else if (t === 'rhythm') ok = Engine.minigameResult(s, q.id, 'rhythm', mgRaw(), o).tier !== 'fail';
      else if (t === 'timed' || t === 'stealth' || t === 'defend') ok = Engine.mgFinal(s, 'timed', mgRaw()) >= 60;
      else if (ob.timeLimit && typeof ob.timeLimit === 'number') ok = r() < P.pTimer;
      else if (t === 'decide') { var c = Engine.decide(s, q.id, r() < P.pVol ? 0 : 1, o); }
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
  while (!s.over && guard++ < 5000) {
    maintain();
    var av = Engine.listAvailable(s);
    var o = Engine.newOut();
    if (av.length && r() < P.pDo) {
      var mains = av.filter(function (q) { return q.type === 'main'; });
      var q = (mains.length && r() < P.pMain) ? mains[0] : av[Math.floor(r() * av.length)];
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
