/* 海灘第二輪：掩體數值、復健 clearFlags、後送旗標、結局門檻。 */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var Engine = require('../js/engine.js');
var Places = require('../js/places.js');
var root = path.join(__dirname, '..', 'data');
var story = JSON.parse(fs.readFileSync(path.join(root, 'story.json'), 'utf8'));
var fps = JSON.parse(fs.readFileSync(path.join(root, 'fps-system.json'), 'utf8'));
var beach = JSON.parse(fs.readFileSync(path.join(root, 'story_beach.json'), 'utf8'));
var rpg = JSON.parse(fs.readFileSync(path.join(root, 'rpg-system.json'), 'utf8'));
var tuning = JSON.parse(fs.readFileSync(path.join(root, 'tuning.json'), 'utf8'));
Engine.init(story, rpg, tuning, { fps: fps, beach: beach });
var D = Engine.data();
var n = 0;
function ok(cond, msg) { n++; assert(cond, msg); }

ok(fps.cover.crouched.enemyAccMul === 0.05, '蹲下命中率 5%');
ok(fps.cover.crouched.dmgTakenMul.sandbag === 0.1, '沙包減傷 10%');
ok(fps.cover.crouched.dmgTakenMul.rock === 0 && fps.cover.crouched.dmgTakenMul.bunker === 0, '礁岩碉堡不受傷');
ok(fps.cover.peeking.enemyAccMul === 0.7 && fps.cover.peeking.dmgTakenMul === 0.5, '探頭 0.7 / 0.5');
ok(fps.cover.types.sandbag.hp === 600 && fps.cover.types.sandbag.damagedOnlyOnHit === true, '沙包 600 只在打中時扣');
ok(fps.cover.rusher.meleeNeedsHitRoll && fps.cover.rusher.accMulBehindCover === 0.5 && fps.cover.rusher.noDoubleDamage, '衝鋒近身');
ok(fps.difficulty.modes.hardcore.enemyAccMul === 1.15, '硬派 enemyAccMul 1.15');
ok(fps.cover.feedback.blockedHint === '掩體擋下', '掩體擋下提示');
ok(fps.health.medevacRecovery.pass === 60 && fps.health.medevacRecovery.great === 85, '復健門檻');
var CR = fps.npcFate.civilian.carryRules;
ok(CR && CR.enemyAccMul === 0.5 && CR.dmgTakenMul === 0.6, '背人命中 0.5／傷害 0.6');
ok(CR.smokeOnStart && CR.smokeSec === 6, '煙霧彈 6 秒');
ok(/4\s*秒/.test(CR.buddyCoverFire), '阿凱壓制 4 秒');

ok(D.barks && D.barks.triggers.on_first_hit_while_peeking, 'bark peek');
ok(D.barks.triggers.on_sandbag_30pct && D.barks.triggers.on_first_rock_cover, 'bark sandbag/rock');
ok(D.barks.triggers.on_first_hit_while_peeking.fallback.length >= 2, '班長倒下後 fallback');
ok(D.q.ch4_beach_prep.objectives.some(function (o) { return o.uiHint === 'hint_cover_peek'; }), 'hint_cover_peek');
ok(D.q.ch5_beach_rehab && D.q.ch5_beach_rehab.dialogue.great, 'ch5_beach_rehab great');
ok(D.q.ch5_beach_rehab.requirements.flags.indexOf('hospitalized') >= 0, 'rehab 需 hospitalized');
ok(D.npc.npc_rehab_therapist, 'npc_rehab_therapist');
ok(Places.PL.military_hospital_rehab, 'military_hospital_rehab');
ok(/b < 40/.test(D.tune.endingOverrides.bad_injury), 'bad_injury b<40');
ok(D.tune.beach.akaiKia.tough === 10, '硬撐 +10');

function st(bg) {
  var s = Engine.newState('測', bg || 'uni');
  s.day = 240; s.unit = 'infantry'; s.flags.unit_assigned = 1;
  return s;
}

var s = st();
ok(Engine.startBeach(s, { diff: 'hardcore' }), 'startBeach');
var out = Engine.newOut();
Engine.medevac(s, out);
ok(s.beach.medevac && s.flags.beach_medevac && s.flags.hospitalized, 'medevac 設旗標');
ok(s.injury && s.injury.id === 'inj_fracture', '後送骨折');

s = st(); s.flags.hospitalized = 1; s.flags.beach_medevac = 1; s.a.b = 45;
out = Engine.newOut();
var rh = Engine.applyRehab(s, 90, out);
ok(rh.tier === 'great' && s.flags.rehab_done && !s.flags.hospitalized && s.a.b === 48, '優秀：清 hospitalized、b+3');
ok(s.a.m === D.tune.backgrounds.uni.s.m + 2, '優秀 m+2');

s = st(); s.flags.hospitalized = 1; s.a.b = 45;
rh = Engine.applyRehab(s, 70, Engine.newOut());
ok(rh.tier === 'pass' && s.flags.rehab_done && !s.flags.hospitalized && s.a.b === 47, '及格 b+2');

s = st(); s.flags.hospitalized = 1; s.a.b = 45;
rh = Engine.applyRehab(s, 20, Engine.newOut());
ok(rh.tier === 'fail' && s.flags.hospitalized && !s.flags.rehab_done && s.a.b === 45, '不及格保留 hospitalized');

s = st(); s.flags.hospitalized = 1; s.a.b = 45;
Engine.minigameResult(s, 'ch5_side_06', 'rehab', 90, Engine.newOut());
ok(s.flags.hospitalized && !s.flags.rehab_done, '舊復健任務不套用 medevacRecovery');

s = st(); s.flags.hospitalized = 1; s.a.b = 39;
ok(Engine.evalEnding(s) === 'bad_injury', 'hospitalized 且 b<40 → bad_injury');
s.a.b = 40;
ok(Engine.evalEnding(s) !== 'bad_injury', 'b>=40 不走 bad_injury');

s = st(); Engine.startBeach(s, {}); s.beach.cmd = 'hold'; s.beach.hpZeroW4 = true;
ok(Engine.wangChance(s, 'hold', true) === 40, 'wang hold 倒下 40');
s.flags.radio_fixed = 1;
ok(Engine.wangChance(s, 'hold', true) === 20, '有無線電 20');
ok(Engine.wangChance(s, 'hold', false) === 5, '有無線電沒倒下 5');
ok(Engine.wangChance(s, 'counter', false) === 12, '反衝鋒有無線電 12');
ok(Engine.wangChance(s, 'fallback', false) === 3, '退守有無線電 3');

s = st(); s.a.o = 50;
Engine.setRng(function () { return 0; });
var af = Engine.akaiFate(s, null, true, Engine.newOut());
ok(af.p === 50, '硬撐 clamp(40,8,50)+10 = 50');
ok(af.kia && s.flags.akai_kia, 'rng=0 陣亡');
s = st(); s.a.o = 50;
af = Engine.akaiFate(s, 80, false, Engine.newOut());
ok(!af.kia && s.flags.akai_injured && af.p === 0, '包紮及格只受傷');

s = st(); s.flags.sgt_wang_kia = 1;
var q = D.q.ch5_beach_memorial;
ok(Engine.questTitle(s, q).indexOf('王班長') >= 0 || Engine.questTitle(s, q) === q.title, 'titleVariants 可解析');

s = st(); s.flags.hospitalizedNow = 1; s.flags.beach_medevac = 1; s.flags.hospitalized = 1; s.day = 300;
s.quests.ch4_beach_relief = { state: 'done' };
ok(Engine.availability(s, D.q.ch5_beach_rehab).ok, '住院中仍可接復健');

s = st(); s.flags.akai_kia = 1;
var pl = Places.plan(D.q.ch5_beach_rehab, 3, { D: D, S: s, map: 'unit', unit: 'infantry', prev: null });
ok(pl.pts && pl.pts[0] && (pl.pts[0].npc === 'npc_signal_lin' || /小林|電話/.test(pl.text)), '阿凱不在時探病改小林');

console.log('unit-beach ok', n);
