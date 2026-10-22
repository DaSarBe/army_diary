/* 以模擬出的終局狀態搜尋結局門檻，讓每個正常結局 >= 3%。結果寫入 data/tuning.json 的 endingOverrides。 */
var sim = require('./sim.js'), Engine = require('../js/engine.js');
var N = +process.argv[2] || 4000, polName = process.argv[3] || 'random';
var P = sim.POLICIES[polName], states = [], i;
for (i = 0; i < N; i++) {
  var s = sim.playOne(9000 + i, P).s;
  states.push({ b: Engine.eff(s, 'b'), m: Engine.eff(s, 'm'), d: Engine.eff(s, 'd'), o: Engine.eff(s, 'o'), dem: s.demerit, lv: s.level,
    soc: Engine.skillRank(s, 'sk_social'), vol: !!s.flags.vol, court: !!s.flags.court, hosp: !!s.flags.hospitalized, surv: !!(s.flags.akai_kia || s.flags.sgt_wang_kia), hero: !!s.flags.beach_hero });
}
function ending(x, t) {
  if (x.court) return 'bad_court';
  if (x.hosp && x.b < t.injB) return 'bad_injury';
  if (x.surv) return 'survivor';
  if (x.hero && x.dem <= 2) return 'beach_hero';
  if (x.vol) {
    if (x.d >= t.vsD && x.b >= t.vsB && x.lv >= 9) return 'vstar';
    if (x.o >= t.vlO && x.soc >= 2) return 'vlead';
    return 'vstep';
  }
  if (x.d >= t.exD && x.b >= t.exB && x.o >= t.exO && x.m >= t.exM && x.dem === 0) return 'exemplar';
  if (x.o >= t.To) return 'brother';
  if (x.b >= t.Tb) return 'iron';
  if (x.d >= t.Td && x.dem <= 1) return 'rule';
  if (x.m >= t.Tm) return 'sunny';
  if (x.b + x.m + x.d + x.o >= t.Ts && x.dem <= 2) return 'calm';
  return 'phew';
}
function dist(t) {
  var c = {};
  states.forEach(function (x) { var e = ending(x, t); c[e] = (c[e] || 0) + 1; });
  Object.keys(c).forEach(function (k) { c[k] = +(100 * c[k] / states.length).toFixed(1); });
  return c;
}
var NORMAL = ['survivor', 'beach_hero', 'exemplar', 'brother', 'iron', 'rule', 'sunny', 'calm', 'phew', 'vstar', 'vlead', 'vstep'];
function score(d) { return Math.min.apply(null, NORMAL.map(function (k) { return d[k] || 0; })); }
function toOverrides(t) {
  return {
    bad_injury: 'flag hospitalized 且 b < ' + t.injB,
    exemplar: 'd>=' + t.exD + ' && b>=' + t.exB + ' && o>=' + t.exO + ' && m>=' + t.exM + ' && demerit==0',
    brother: 'o>=' + t.To, iron: 'b>=' + t.Tb, rule: 'd>=' + t.Td + ' && demerit<=1', sunny: 'm>=' + t.Tm,
    calm: 'b+m+d+o>=' + t.Ts + ' && demerit<=2',
    vstar: 'd>=' + t.vsD + ' && b>=' + t.vsB + ' && level>=9', vlead: 'o>=' + t.vlO + ' && skill sk_social>=2'
  };
}
module.exports = { dist: dist, toOverrides: toOverrides, states: states };
if (require.main === module) {
  var orig = { injB: 35, exD: 62, exB: 58, exO: 58, exM: 55, To: 68, Tb: 68, Td: 68, Tm: 68, Ts: 200, vsD: 64, vsB: 56, vlO: 62 };
  console.log('原始門檻', JSON.stringify(dist(orig)));
  var r = Engine.mulberry(11), best = null;
  function rnd(a, b) { return a + Math.floor(r() * (b - a + 1)); }
  var RANGE = { injB: [36, 52], exD: [50, 68], exB: [48, 66], exO: [54, 72], exM: [52, 70], To: [68, 88], Tb: [58, 78], Td: [56, 76], Tm: [62, 84], Ts: [208, 262], vsD: [52, 70], vsB: [50, 66], vlO: [54, 70] };
  function evalT(t) { var d = dist(t); return { sc: score(d) - 0.05 * Math.max(0, (d.vstar || 0) - 10) - 0.05 * Math.max(0, (d.vstep || 0) - 25), t: t, d: d }; }
  for (var k = 0; k < 50000; k++) {
    var t = {}; Object.keys(RANGE).forEach(function (key) { t[key] = rnd(RANGE[key][0], RANGE[key][1]); });
    var e = evalT(t); if (!best || e.sc > best.sc) best = e;
  }
  for (k = 0; k < 40000; k++) {
    var t2 = Object.assign({}, best.t), key2 = Object.keys(RANGE)[rnd(0, Object.keys(RANGE).length - 1)];
    t2[key2] = Math.max(RANGE[key2][0], Math.min(RANGE[key2][1], t2[key2] + rnd(-3, 3)));
    var e2 = evalT(t2); if (e2.sc >= best.sc) best = e2;
  }
  console.log(JSON.stringify(best));
  console.log(JSON.stringify(toOverrides(best.t)));
}
