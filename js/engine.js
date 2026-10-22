/* 阿兵哥日記 RPG 核心邏輯（純邏輯，瀏覽器與 Node 模擬共用） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ATTRS = ['b', 'm', 'd', 'o'];
  var ANAME = { b: '體能', m: '士氣', d: '軍紀', o: '袍澤' };
  var PERIODS = ['上午', '下午', '晚上'];
  var D = null;
  var rng = Math.random;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function ri(a, b) { return a + Math.floor(rng() * (b - a + 1)); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function setRng(f) { rng = f; }
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- 資料初始化 ---------- */
  function init(story, rpg, tuning, extras) {
    var t = tuning || {};
    extras = extras || {};
    D = { story: clone(story), rpg: clone(rpg), tune: t, fps: extras.fps ? clone(extras.fps) : null, npcVar: {} };
    var bt = t.beach || {};
    if (extras.beach) {
      var bs = clone(extras.beach);
      bs.quests.forEach(function (q) { if (q.id.indexOf('ch4_beach_') === 0) q.event = true; });
      D.story.quests = D.story.quests.concat(bs.quests);
      var have = {};
      D.story.npcs.forEach(function (n) { have[n.id] = 1; });
      function cleanVar(v) {
        if (!v) return {};
        Object.keys(v).forEach(function (k) { if (!Array.isArray(v[k])) delete v[k]; });
        return v;
      }
      bs.npcs.forEach(function (n) { n.variants = cleanVar(n.variants); if (!have[n.id]) D.story.npcs.push(n); D.npcVar[n.id] = n.variants || {}; });
      (bs.npcOverrides || []).forEach(function (o) { D.npcVar[o.id] = cleanVar(o.variants || {}); });
      D.beachItems = bs.newItems || [];
      D.barks = bs.barks || null;
    }
    // tuning.json 為準：重複的新結局與 it_t91 以 tuning 定義，忽略 rpg-system.json 裡的版本
    var newIds = (bt.newEndings || []).map(function (e) { return e.id; });
    ['conscript', 'volunteer'].forEach(function (k) {
      D.rpg.endings[k] = D.rpg.endings[k].filter(function (e) { return newIds.indexOf(e.id) < 0; });
    });
    var itemIds = (bt.newItems || []).map(function (i) { return i.id; });
    D.rpg.items.list = D.rpg.items.list.filter(function (i) { return itemIds.indexOf(i.id) < 0; }).concat(clone(bt.newItems || [])).concat(clone(D.beachItems || []));
    if (D.fps && D.fps.minigames) {
      Object.keys(D.fps.minigames).forEach(function (k) {
        var m = D.fps.minigames[k];
        if (!D.rpg.minigames[k]) D.rpg.minigames[k] = { name: m.name, attr: m.attr, check: m.skill, cost: 'training' };
      });
    }
    if (!D.rpg.minigames.cover_tutorial) D.rpg.minigames.cover_tutorial = { name: '掩體與探頭', attr: 'd', cost: 'training' };
    D.tune.aliases = t.aliases || {};
    D.q = {}; D.qList = [];
    D.npc = {}; D.items = {}; D.skills = {}; D.inj = {}; D.ev = {}; D.units = {};
    D.story.npcs.forEach(function (n) { D.npc[n.id] = n; });
    D.rpg.items.list.forEach(function (i) { D.items[i.id] = i; });
    D.rpg.skills.list.forEach(function (s) { D.skills[s.id] = s; });
    D.rpg.failure.injuries.forEach(function (i) { D.inj[i.id] = i; });
    Object.keys(D.rpg.units).forEach(function (k) { if (k.charAt(0) !== '_') D.units[k] = D.rpg.units[k]; });
    Object.keys(D.rpg.failure.events).forEach(function (k) { D.ev[k] = D.rpg.failure.events[k]; });
    D.story.events.forEach(function (e) { D.ev[e.id] = Object.assign({}, D.ev[e.id] || {}, { title: e.title, description: e.description, dialogue: e.dialogue }); });
    D.endText = {};
    D.story.endings.forEach(function (e) { D.endText[e.id] = e; });
    (bt.newEndings || []).forEach(function (e) { D.endText[e.id] = { id: e.id, title: e.title || e.n, description: e.description || '' }; });
    var al = D.tune.aliases, extra = D.tune.extraRewards || {};
    D.story.quests.forEach(function (q, i) {
      q.index = i;
      q.giver = al[q.giver] || q.giver;
      q.objectives.forEach(function (o) {
        if (o.type === 'carry') {
          var p = o.target.split(':');
          p[0] = al[p[0]] || p[0];
          p[1] = al[p[1]] || p[1];
          o.target = p.join(':');
        } else if (al[o.target]) o.target = al[o.target];
      });
      var r = q.reward || (q.reward = {});
      if (r.choice) {
        q.decision = [
          { label: '簽志願役', flags: (r.choice.sign || {}).flags || ['vol'] },
          { label: '不簽', flags: (r.choice.decline || {}).flags || ['declined'] }
        ];
      }
      if (r.flags) r.flags = r.flags.filter(function (f) { return f.indexOf('?') < 0; });
      if (extra[q.id]) {
        var ex = extra[q.id];
        if (ex.items) r.items = (r.items || []).concat(ex.items);
      }
      D.q[q.id] = q;
      D.qList.push(q);
    });
    var dec = D.rpg.questRewards.decisionFlags;
    if (dec && D.q[dec.appliesTo] && !D.q[dec.appliesTo].decision) D.q[dec.appliesTo].decision = dec.format.choice;
    return D;
  }
  function data() { return D; }

  /* ---------- 狀態 ---------- */
  function bgStats(bg) {
    var m = (D.tune.backgrounds || {})[bg];
    return m ? Object.assign({}, m.s) : { b: 45, m: 50, d: 50, o: 45 };
  }
  function newState(name, bg) {
    var s = {
      ver: 2, name: name, bg: bg, day: 0, period: 0, unit: null,
      a: bgStats(bg), hp: 0, fatigue: 0, money: D.rpg.resources.money.start, honor: 0, demerit: 0,
      xp: 0, level: 1, sp: 0, skills: {}, flags: {}, badges: [],
      items: {}, equip: {}, quests: {}, rep: {}, repGain: 0, qgain: {},
      injury: null, injHist: 0, confine: 0, nextCheck: {}, aff: {}, affDay: {},
      carry: null, beach: null, dmStage: 0, brokenCount: 0, ending: null, over: false,
      stats: { qDone: 0, qFail: 0, mg: 0, mgGreat: 0, checks: 0, checksOk: 0 }, log: []
    };
    s.hp = hpMax(s);
    s.fatigue = 0;
    return s;
  }
  function newOut() { return { fx: [], events: [], msgs: [], days: [], ups: [] }; }

  function equipEffect(s, key) {
    var v = 0;
    Object.keys(s.equip).forEach(function (sl) {
      var it = D.items[s.equip[sl]];
      if (it && it.effect && it.effect[key]) v += it.effect[key];
    });
    return v;
  }
  function skillRank(s, id) { return s.skills[id] || 0; }
  function skillEffect(s, key) {
    var v = 0;
    Object.keys(s.skills).forEach(function (id) {
      var sk = D.skills[id];
      if (sk && sk.perRank && sk.perRank[key]) v += sk.perRank[key] * s.skills[id];
    });
    return v;
  }
  function eff(s, k) { return clamp(s.a[k] + equipEffect(s, k), 0, 100); }
  function hpMax(s) {
    return 60 + Math.floor(eff(s, 'b') * 0.4) + (s.level - 1) * D.rpg.leveling.perLevel.hpMaxAdd + skillEffect(s, 'hpMaxAdd');
  }
  function fatigueGainPct(s) {
    var u = s.unit && D.units[s.unit] ? (D.units[s.unit].fatigueGainPct || 0) : 0;
    return u + skillEffect(s, 'fatigueGainPct');
  }
  function chapterOfDay(day) { return day <= 3 ? 1 : day <= 5 ? 2 : day <= 30 ? 3 : day <= 285 ? 4 : 5; }
  function baseMap(s) { var c = chapterOfDay(s.day); return c === 1 ? 'home' : c <= 3 ? 'camp1' : 'unit'; }
  function questMap(q) { if (q.id.indexOf('ch4_beach_') === 0) return 'beach'; return q.chapter === 1 ? 'home' : q.chapter <= 3 ? 'camp1' : 'unit'; }
  function rankOf(s) {
    var r = '二兵', rs = D.rpg.leveling.ranks;
    rs.forEach(function (x) {
      if (s.level >= x.level && (!x.requires || s.flags[x.requires.flag])) r = x.rank;
    });
    return r.replace('（僅志願役）', '');
  }
  function xpNeed(s) {
    var arr = D.rpg.leveling.xpToNext;
    return s.level >= D.rpg.leveling.maxLevel ? null : arr[s.level - 1];
  }
  function xpTotalFor(level) {
    var arr = D.rpg.leveling.xpToNext, t = 0, i;
    for (i = 0; i < level - 1; i++) t += arr[i];
    return t;
  }
  function xpInLevel(s) { return s.xp - xpTotalFor(s.level); }

  /* ---------- 數值變化 ---------- */
  function fx(out, k, v) {
    if (!out || !v) return;
    for (var i = 0; i < out.fx.length; i++) if (out.fx[i].k === k) { out.fx[i].v += v; return; }
    out.fx.push({ k: k, v: v });
  }
  function addXp(s, n, out) {
    if (n <= 0) return;
    s.xp += n; fx(out, 'xp', n);
    var max = D.rpg.leveling.maxLevel;
    while (s.level < max && s.xp >= xpTotalFor(s.level + 1)) {
      s.level++; s.sp += D.rpg.leveling.perLevel.skillPoints;
      s.hp = Math.min(hpMax(s), s.hp + D.rpg.leveling.perLevel.hpMaxAdd);
      if (out) out.ups.push(s.level);
    }
  }
  function addAttr(s, k, v, out, qid) {
    if (!v) return 0;
    if (v > 0 && qid) {
      var g = s.qgain[qid] || (s.qgain[qid] = { t: 0 });
      var cap = D.rpg.questRewards.attrCapPerQuest, capT = D.tune.attrCapTotalPerQuest || 8;
      v = Math.min(v, cap - (g[k] || 0), capT - g.t);
      if (v <= 0) return 0;
      g[k] = (g[k] || 0) + v; g.t += v;
    }
    var before = s.a[k];
    s.a[k] = clamp(s.a[k] + v, 0, 100);
    var d = s.a[k] - before;
    fx(out, k, d);
    return d;
  }
  function addHp(s, v, out) {
    var b = s.hp; s.hp = clamp(s.hp + v, 0, hpMax(s)); fx(out, 'hp', s.hp - b);
  }
  function addFatigue(s, v, out, scaled) {
    if (scaled && v > 0) v = Math.round(v * (1 + fatigueGainPct(s) / 100));
    var b = s.fatigue; s.fatigue = clamp(s.fatigue + v, 0, 100); fx(out, 'fatigue', s.fatigue - b);
  }
  function addMoney(s, v, out) {
    var b = s.money; s.money = Math.max(0, s.money + v); fx(out, 'money', s.money - b);
  }
  function addHonor(s, v, out) {
    var b = s.honor; s.honor = clamp(s.honor + v, 0, D.rpg.resources.honor.max); fx(out, 'honor', s.honor - b);
  }
  function addDemerit(s, v, out) {
    var b = s.demerit; s.demerit = clamp(s.demerit + v, 0, D.rpg.resources.demerit.max); fx(out, 'demerit', s.demerit - b);
  }
  function addBadge(s, b, out) {
    if (b && s.badges.indexOf(b) < 0) { s.badges.push(b); if (out) out.msgs.push('獲得徽章：' + (D.tune.badges || {})[b]); }
  }

  /* ---------- 物品 ---------- */
  function bagUsed(s) { return Object.keys(s.items).length; }
  function bagSize() { return D.rpg.items.bagSize; }
  function isQuestItem(id) { return !!(D.items[id] && D.items[id].type === 'quest'); }
  function addItem(s, id, n, out) {
    var it = D.items[id];
    if (!it || it.type === 'quest') return false;
    n = n || 1;
    if (it.type === 'equip') {
      if (!s.items[id]) s.items[id] = 1;
      if (!s.equip[it.slot] || !it.issued) s.equip[it.slot] = id;
    } else s.items[id] = (s.items[id] || 0) + n;
    if (out) out.msgs.push('獲得：' + it.name + (n > 1 ? ' ×' + n : ''));
    return true;
  }
  function removeItem(s, id, n) {
    n = n || 1;
    if (!s.items[id]) return false;
    s.items[id] -= n;
    if (s.items[id] <= 0) {
      delete s.items[id];
      Object.keys(s.equip).forEach(function (sl) { if (s.equip[sl] === id) delete s.equip[sl]; });
    }
    return true;
  }
  function equip(s, id) {
    var it = D.items[id];
    if (!it || it.type !== 'equip' || !s.items[id]) return false;
    s.equip[it.slot] = id; return true;
  }
  function unequip(s, slot) { delete s.equip[slot]; }
  function shopList() {
    return D.rpg.items.list.filter(function (i) { return i.shop; });
  }
  function buy(s, id) {
    var it = D.items[id];
    if (!it || !it.shop) return { ok: false, msg: '這個東西不賣。' };
    if (s.money < it.price) return { ok: false, msg: '薪餉不夠。' };
    if (!s.items[id] && bagUsed(s) >= bagSize()) return { ok: false, msg: '背包滿了。' };
    if (it.type === 'equip' && s.items[id]) return { ok: false, msg: '已經有了。' };
    s.money -= it.price;
    addItem(s, id, 1);
    if (it.type === 'equip') equip(s, id);
    return { ok: true, msg: '購買了' + it.name + '。' };
  }
  function useItem(s, id, out) {
    var it = D.items[id];
    if (!it || it.type !== 'consumable' || !s.items[id]) return false;
    var u = it.use || {};
    Object.keys(u).forEach(function (k) {
      var v = u[k];
      if (k === 'hp') addHp(s, v, out);
      else if (k === 'fatigue') addFatigue(s, v, out, false);
      else if (ATTRS.indexOf(k) >= 0) addAttr(s, k, v, out);
      else if (k.indexOf('nextCheck.') === 0) { s.nextCheck[k.slice(10)] = v; out.msgs.push('下一次' + (D.rpg.checks.types['check.' + k.slice(10)] || {}).name + '判定 +' + v + '%'); }
    });
    if (it.risk && rng() * 100 < it.risk.caughtChance) {
      out.msgs.push('被抓到了！');
      addDemerit(s, it.risk.demerit, out);
      s.caughtContraband = (s.caughtContraband || 0) + 1;
      if (s.caughtContraband >= 2) setFlag(s, 'court', out, true);
    }
    removeItem(s, id, 1);
    afterChange(s, out);
    return true;
  }

  function setFlag(s, f, out, trigger) {
    s.flags[f] = 1;
    if (f === 'court' && trigger) triggerEvent(s, 'event_court', out);
  }

  /* ---------- 技能 ---------- */
  function skillAvailable(s, id) {
    var sk = D.skills[id];
    if (!sk) return false;
    return !sk.unit || s.unit === sk.unit;
  }
  function learnSkill(s, id, out) {
    var sk = D.skills[id];
    if (!sk || !skillAvailable(s, id) || s.sp < 1 || skillRank(s, id) >= sk.maxRank) return false;
    s.sp--; s.skills[id] = skillRank(s, id) + 1;
    if (sk.badge && s.skills[id] >= sk.maxRank) addBadge(s, sk.badge, out || newOut());
    return true;
  }

  /* ---------- 判定 ---------- */
  function fatiguePenalty(s) {
    var p = 0, i, pen = D.rpg.resources.fatigue.penalties;
    for (i = 0; i < pen.length; i++) {
      if (s.fatigue >= pen[i].atLeast && pen[i].effect && pen[i].effect.allChecks) p = Math.min(p, pen[i].effect.allChecks);
    }
    return p;
  }
  function injuryAdd(s) {
    var v = equipEffect(s, 'injuryChanceAdd'), pen = D.rpg.resources.fatigue.penalties, i;
    for (i = 0; i < pen.length; i++) if (s.fatigue >= pen[i].atLeast && pen[i].effect && pen[i].effect.injuryChanceAdd) v = Math.max(v, pen[i].effect.injuryChanceAdd + equipEffect(s, 'injuryChanceAdd'));
    return v;
  }
  function checkInfo(s, typeKey, q) {
    var ty = D.rpg.checks.types[typeKey] || { attr: 'd', name: typeKey };
    var ch = q ? q.chapter : chapterOfDay(s.day);
    var dc = D.rpg.checks.dcByChapter[String(ch)];
    var base = D.rpg.checks.base;
    var attr = eff(s, ty.attr);
    var parts = [{ l: '基礎', v: base }, { l: ANAME[ty.attr] + ' ' + attr + ' 對 難度 ' + dc, v: (attr - dc) * 2 }];
    var bonus = skillEffect(s, typeKey) + equipEffect(s, typeKey);
    if (bonus) parts.push({ l: '技能與裝備', v: bonus });
    var sh = s.nextCheck[typeKey.replace('check.', '')];
    if (sh) parts.push({ l: '消耗品加成', v: sh });
    if (q && q.id === 'ch4_side_navy_02' && typeKey === 'check.endure') {
      var sea = skillRank(s, 'sk_navy_sea') * 10;
      if (sea) parts.push({ l: '海上平衡（抗暈船）', v: sea });
    }
    var fp = fatiguePenalty(s);
    if (fp) parts.push({ l: '疲勞', v: fp });
    var tot = 0;
    parts.forEach(function (p) { tot += p.v; });
    var tn = D.tune.checkClamp || [5, 95];
    return { name: ty.name, chance: clamp(Math.round(tot), tn[0], tn[1]), parts: parts };
  }
  function rollCheck(s, typeKey, q) {
    var info = checkInfo(s, typeKey, q);
    var r = Math.floor(rng() * 100) + 1;
    var ok = r <= info.chance;
    delete s.nextCheck[typeKey.replace('check.', '')];
    s.stats.checks++; if (ok) s.stats.checksOk++;
    return { ok: ok, roll: r, chance: info.chance, name: info.name, parts: info.parts };
  }

  /* ---------- 小遊戲 ---------- */
  function mgDef(id) { return D.rpg.minigames[id]; }
  function mgAssist(s, id) {
    var m = mgDef(id) || {}, a = 0;
    if (m.attr) a += Math.max(0, Math.floor((eff(s, m.attr) - 50) / 10)) * 3;
    if (m.check && m.check.indexOf('sk_') === 0) a += skillRank(s, m.check) * 4;
    var fp = fatiguePenalty(s);
    a += Math.round(fp / 2);
    return a;
  }
  function mgFinal(s, id, raw) { return clamp(Math.round(raw + mgAssist(s, id)), 0, 100); }
  function mgTier(score) { return score >= 85 ? 'great' : score >= 60 ? 'pass' : 'fail'; }
  function applyBundle(s, b, out, qid, mult) {
    mult = mult == null ? 1 : mult;
    Object.keys(b).forEach(function (k) {
      var v = b[k];
      if (k === 'xp') addXp(s, Math.round(v * mult), out);
      else if (ATTRS.indexOf(k) >= 0) {
        var vv = Math.round(v * mult);
        if (qid && D.q[qid] && D.q[qid].reward && D.q[qid].reward.repeatable) {
          var room = (D.rpg.questRewards.repeatable.attrCapTotal || 6) - s.repGain;
          if (vv > 0) { vv = Math.min(vv, Math.max(0, room)); s.repGain += vv; }
        }
        addAttr(s, k, vv, out, qid);
      }
      else if (k === 'hp') addHp(s, v, out);
      else if (k === 'fatigue') addFatigue(s, v, out, v > 0);
      else if (k === 'money') addMoney(s, Math.round(v * mult), out);
      else if (k === 'honor') addHonor(s, Math.round(v * mult), out);
      else if (k === 'demerit') addDemerit(s, v, out);
      else if (k === 'badge') addBadge(s, v, out);
      else if (k === 'flags' && Array.isArray(v)) v.forEach(function (f) { s.flags[f] = 1; });
      else if (k === 'clearFlags' && Array.isArray(v)) v.forEach(function (f) { delete s.flags[f]; });
    });
  }
  function applyClearFlags(s, list) {
    (list || []).forEach(function (f) { delete s.flags[f]; if (f === 'hospitalized') delete s.flags.hospitalizedNow; });
  }
  function applyRehab(s, score, out) {
    var rec = D.fps && D.fps.health && D.fps.health.medevacRecovery;
    if (!rec) return { tier: mgTier(score) };
    var tier = score >= rec.great ? 'great' : score >= rec.pass ? 'pass' : 'fail';
    var pack = tier === 'great' ? rec.onGreat : tier === 'pass' ? rec.onPass : rec.onFail;
    if (pack) {
      applyClearFlags(s, pack.clearFlags);
      (pack.flags || []).forEach(function (f) { s.flags[f] = 1; });
      var b = {};
      ATTRS.forEach(function (k) { if (pack[k]) b[k] = pack[k]; });
      applyBundle(s, b, out);
    }
    return { tier: tier };
  }
  function minigameResult(s, qid, id, raw, out) {
    var m = mgDef(id) || {}, score = mgFinal(s, id, raw), tier = mgTier(score);
    s.stats.mg++;
    if (tier === 'great') s.stats.mgGreat++;
    var mult = qid ? repMult(s, qid) : 1;
    if (id === 'rehab' && qid === 'ch5_beach_rehab') {
      var rh = applyRehab(s, score, out);
      tier = rh.tier;
    } else if (tier === 'great' && m.greatReward) applyBundle(s, m.greatReward, out, qid, mult);
    else if (tier !== 'fail' && m.passReward) applyBundle(s, m.passReward, out, qid, mult);
    return { score: score, tier: tier, raw: Math.round(raw), assist: mgAssist(s, id) };
  }
  function lottery(s, out) {
    var ids = Object.keys(D.units), id = ids[Math.floor(rng() * ids.length)];
    setUnit(s, id, out);
    return id;
  }
  function setUnit(s, id, out) {
    s.unit = id;
    var u = D.units[id];
    Object.keys(u.start || {}).forEach(function (k) { addAttr(s, k, u.start[k], out); });
  }

  /* ---------- 任務 ---------- */
  function qstate(s, id) { return s.quests[id] ? s.quests[id].state : null; }
  function resolved(s, id) {
    var st = qstate(s, id);
    return st === 'done' || st === 'failed' || st === 'expired';
  }
  function hasObj(q, pred) { return q.objectives.some(pred); }
  function cmpCond(str, val) {
    var m = /^\s*([<>]=?)\s*(\d+)/.exec(str);
    if (!m) return true;
    var n = +m[2];
    return m[1] === '<' ? val < n : m[1] === '<=' ? val <= n : m[1] === '>' ? val > n : val >= n;
  }
  function blockedReason(s, q) {
    if (q.event) return null;
    if (beachActive(s)) return '戰況緊急';
    if (q.id === 'ch4_side_03' && s.flags.akai_kia) return '少了一個人';
    if (s.confine > 0) return '禁閉中';
    var inj = s.injury && D.inj[s.injury.id];
    if (s.flags.hospitalizedNow && q.id !== 'ch5_side_06' && q.id !== 'ch5_beach_rehab') return '住院中';
    if (inj && inj.blocks) {
      var blocks = inj.blocks;
      var bad = hasObj(q, function (o) {
        return blocks.indexOf(o.type) >= 0 || (o.type === 'check' && blocks.indexOf(o.target.replace('check.', '')) >= 0);
      });
      if (bad) return inj.name + '，不能跑步或行軍';
    }
    if (s.injury && q.id === 'ch4_main_06') return '受傷期間不能參加';
    return null;
  }
  function availability(s, q) {
    var st = qstate(s, q.id);
    if (st) return { ok: false, reason: st };
    var r = q.dayRange;
    if (s.day < r[0]) return { ok: false, reason: '未開放', wait: true };
    if (s.day > r[1]) return { ok: false, reason: '已過期' };
    if (q.unit && q.unit !== s.unit) return { ok: false, reason: '非本單位' };
    var i;
    for (i = 0; i < q.prerequisites.length; i++) if (!resolved(s, q.prerequisites[i])) return { ok: false, reason: '前置任務未完成' };
    var rq = q.requirements || {};
    if (rq.flags) for (i = 0; i < rq.flags.length; i++) if (!s.flags[rq.flags[i]]) return { ok: false, reason: '條件不足' };
    if (rq.fatigue && !cmpCond(rq.fatigue, s.fatigue)) return { ok: false, reason: '太累了，疲勞要低於 85' };
    if (rq.items) for (i = 0; i < rq.items.length; i++) if (!s.items[rq.items[i]]) return { ok: false, reason: '需要：' + (D.items[rq.items[i]] || {}).name, need: rq.items[i] };
    if (q.id === 'ch5_side_06' && !s.flags.hospitalized && !s.injHist) return { ok: false, reason: '沒有傷病紀錄' };
    if (q.reward.money < 0 && s.money < -q.reward.money) return { ok: false, reason: '薪餉不足（需 ' + (-q.reward.money) + ' 元）' };
    if (q.reward.repeatable) {
      var rp = s.rep[q.id];
      if (rp && s.day - rp.last < D.rpg.questRewards.repeatable.cooldownDays) return { ok: false, reason: '冷卻中（' + (D.rpg.questRewards.repeatable.cooldownDays - (s.day - rp.last)) + ' 天後）' };
    }
    var b = blockedReason(s, q);
    if (b) return { ok: false, reason: b };
    return { ok: true };
  }
  function listAvailable(s) {
    return D.qList.filter(function (q) { return !q.event && availability(s, q).ok; });
  }
  function activeQuests(s) {
    return D.qList.filter(function (q) { var st = qstate(s, q.id); return st === 'active' || st === 'ready'; });
  }
  function accept(s, id) {
    var q = D.q[id];
    if (!q || !availability(s, q).ok) return false;
    if (!q.event && activeQuests(s).length >= 4) return false;
    s.quests[id] = { state: 'active', step: 0, start: s.day, costs: {} };
    if (!s.track || !(qstate(s, s.track) === 'active' || qstate(s, s.track) === 'ready')) s.track = id;
    return true;
  }
  function abandon(s, id) {
    var st = qstate(s, id);
    if (st !== 'active' && st !== 'ready') return false;
    delete s.quests[id];
    if (s.carry && s.carry.quest === id) s.carry = null;
    if (s.track === id) { var a = activeQuests(s)[0]; s.track = a ? a.id : null; }
    return true;
  }
  var COST_KEY = {
    run: 'run3000', march: 'march', patrol: 'sentry', inspect: 'inspection', clean: 'detail', clear: 'detail',
    carry: 'detail', escort: 'detail', move: 'training', defend: 'training', stealth: 'sentry', timed: 'training',
    rhythm: 'training', rest: 'rest', collect: 'detail'
  };
  function costKeyOf(o) {
    if (o.type === 'minigame') { var m = mgDef(o.target); return m && m.cost; }
    return COST_KEY[o.type];
  }
  function applyCost(s, q, o, out) {
    var key = costKeyOf(o);
    var st = s.quests[q.id];
    if (q.event) return;
    if (!key || !st || st.costs[key]) return;
    st.costs[key] = 1;
    var c = D.rpg.fatigueCosts[key];
    if (!c) return;
    if (c.hp) addHp(s, c.hp, out);
    if (c.fatigue) addFatigue(s, c.fatigue, out, true);
    if (c.m) addAttr(s, 'm', c.m, out);
  }
  function stepDone(s, id, out) {
    var q = D.q[id], st = s.quests[id];
    if (!q || !st) return;
    applyCost(s, q, q.objectives[st.step], out);
    st.step++;
    if (st.step >= q.objectives.length) st.state = 'ready';
    afterChange(s, out);
  }
  function repMult(s, id) {
    var q = D.q[id];
    if (!q || !q.reward.repeatable) return 1;
    var n = (s.rep[id] && s.rep[id].n) || 0, dc = D.rpg.questRewards.repeatable.decay;
    return n >= dc.length ? 0 : dc[n];
  }
  function mergedReward(q) {
    var r = clone(q.reward), tier = (D.rpg.questRewards.tiers || {})[r.tier] || {};
    if (r.xp == null && tier.xp) r.xp = tier.xp;
    if (r.money == null && tier.money) r.money = tier.money;
    if (r.honor == null && tier.honor) r.honor = tier.honor;
    return r;
  }
  function periodsOf(q) { if (q.event) return q.id === 'ch4_beach_relief' ? 3 : 0; return q.reward && q.reward.tier === 'big' ? 2 : 1; }
  function complete(s, id, out) {
    var q = D.q[id], st = s.quests[id];
    if (!q || !st) return;
    var r = mergedReward(q), mult = repMult(s, id);
    var b = {};
    ['xp', 'money', 'honor'].concat(ATTRS).forEach(function (k) { if (r[k]) b[k] = r[k]; });
    applyBundle(s, b, out, id, mult);
    if (mult > 0) {
      (r.items || []).forEach(function (it) { addItem(s, it, 1, out); });
      if (r.badge) addBadge(s, r.badge, out);
    }
    (r.flags || []).forEach(function (f) { if (f === 'radio_fixed' && s.beach && s.beach.medevac) return; s.flags[f] = 1; });
    applyClearFlags(s, r.clearFlags);
    if (id === 'ch4_beach_relief') beachFinish(s, out);
    if (id === 'ch2_main_01') addItem(s, 'it_dogtag', 1, out);
    if (id === 'ch2_side_02') removeItem(s, 'it_phonecard', 1);
    if (id === 'ch3_main_07' && !s.unit) lottery(s, out);
    if (s.carry && s.carry.quest === id) s.carry = null;
    s.stats.qDone++;
    if (q.reward.repeatable) {
      var rp = s.rep[id] || (s.rep[id] = { n: 0, last: -99 });
      rp.n++; rp.last = s.day;
      delete s.quests[id];
      s.flags['rep_' + id] = rp.n;
    } else {
      st.state = 'done'; st.doneDay = s.day;
    }
    if (s.track === id) { var a = activeQuests(s)[0]; s.track = a ? a.id : null; }
    out.completed = (out.completed || []).concat([id]);
    afterChange(s, out);
    consumePeriod(s, periodsOf(q), out);
  }
  function chanceOf(s, f) {
    var c = f.chance;
    if (c == null) return 100;
    var p;
    if (typeof c === 'number') p = c;
    else {
      var cond = /(fatigue|hp)\s*(>=|<)\s*(\d+)/.exec(c), pc = /(\d+)\s*%/.exec(c);
      p = pc ? +pc[1] : 40;
      if (cond) {
        var v = cond[1] === 'hp' ? s.hp : s.fatigue, n = +cond[3];
        if (!(cond[2] === '>=' ? v >= n : v < n)) return 0;
      }
    }
    p += injuryAdd(s) - Math.max(0, (eff(s, 'b') - 50)) * 0.2;
    return clamp(p, 0, 100);
  }
  function pickInjury(s) {
    var r = rng();
    return r < 0.55 ? 'inj_sprain' : r < 0.8 ? 'inj_heatstroke' : 'inj_fracture';
  }
  function inflictInjury(s, id, out) {
    var inj = D.inj[id];
    if (!inj) return;
    var days = Math.max(1, Math.round(inj.days * (1 + skillEffect(s, 'injuryDaysPct') / 100)));
    if (s.injury && s.injury.left >= days && id !== 'inj_fracture') return;
    s.injury = { id: id, left: days };
    s.injHist++;
    Object.keys(inj.effect || {}).forEach(function (k) { addAttr(s, k, inj.effect[k], out); });
    out.events.push({ type: 'injury', id: id, days: days });
    if (inj.flag) { s.flags[inj.flag] = 1; s.flags.hospitalizedNow = 1; s.pendingDays = (s.pendingDays || 0) + days; }
  }
  function triggerEvent(s, id, out) {
    var ev = D.ev[id];
    if (!ev) return;
    var e = ev.effect || {};
    out.events.push({ type: 'event', id: id });
    Object.keys(e).forEach(function (k) {
      var v = e[k];
      if (typeof v === 'string' && v.indexOf('set:') === 0) {
        var n = +v.slice(4);
        if (k === 'hp') { s.hp = Math.min(n, hpMax(s)); out.fx.push({ k: 'hp', v: 0, set: s.hp }); }
        else if (k === 'fatigue') s.fatigue = n;
        else if (k === 'honor') s.honor = n;
        else if (ATTRS.indexOf(k) >= 0) s.a[k] = n;
      } else if (k === 'hp') addHp(s, v, out);
      else if (ATTRS.indexOf(k) >= 0) addAttr(s, k, v, out);
    });
    if (ev.flag) { s.flags[ev.flag] = 1; if (id === 'event_court') endGame(s); }
    if (ev.days) {
      s.confine = ev.days; s.pendingDays = (s.pendingDays || 0) + ev.days;
    }
    if (id === 'event_collapse') {
      s.pendingDays = (s.pendingDays || 0) + 1;
      if (rng() * 100 < ev.injuryChance) inflictInjury(s, pickInjury(s), out);
    }
    if (id === 'event_morale_breakdown') {
      s.brokenCount++;
      if (s.brokenCount >= 2) s.flags.broken = 1;
    }
  }
  function applyFailure(s, q, out, lenient) {
    var f = q.failure || {};
    ['hp', 'b', 'm', 'd', 'o', 'fatigue'].forEach(function (k) {
      if (!f[k]) return;
      if (k === 'hp') addHp(s, f[k], out);
      else if (k === 'fatigue') addFatigue(s, f[k], out, true);
      else addAttr(s, k, f[k], out);
    });
    if (lenient) { afterChange(s, out); return; }
    if (f.demerit) addDemerit(s, f.demerit, out);
    (f.flags || []).forEach(function (fl) { s.flags[fl] = 1; });
    if (f.injury && !s.over && rng() * 100 < chanceOf(s, f)) inflictInjury(s, f.injury, out);
    if (f.trigger && !(s.flags.court && f.trigger === 'event_court')) triggerEvent(s, f.trigger, out);
    afterChange(s, out);
  }
  function fail(s, id, out) {
    var q = D.q[id];
    if (!q || !s.quests[id]) return;
    s.stats.qFail++;
    if (s.carry && s.carry.quest === id) s.carry = null;
    if (q.reward.repeatable) {
      delete s.quests[id];
      (s.rep[id] || (s.rep[id] = { n: 0, last: -99 })).last = s.day;
    } else s.quests[id].state = 'failed';
    applyFailure(s, q, out, false);
    if (s.track === id) { var a = activeQuests(s)[0]; s.track = a ? a.id : null; }
    out.failed = (out.failed || []).concat([id]);
    consumePeriod(s, q.event ? periodsOf(q) : 1, out);
  }
  function expireQuests(s, out) {
    D.qList.forEach(function (q) {
      var st = qstate(s, q.id);
      if (st === 'done' || st === 'failed' || st === 'expired') return;
      if (s.day <= q.dayRange[1]) return;
      if (st === 'active' || st === 'ready') {
        if (q.type === 'main') { s.quests[q.id].state = 'failed'; s.stats.qFail++; applyFailure(s, q, out, true); out.failed = (out.failed || []).concat([q.id]); }
        else if (q.reward.repeatable) delete s.quests[q.id];
        else s.quests[q.id].state = 'expired';
        if (s.carry && s.carry.quest === q.id) s.carry = null;
      } else if (q.type === 'main') {
        s.quests[q.id] = { state: 'expired' };
        applyFailure(s, q, out, true);
        out.msgs.push('錯過了主線任務「' + q.title + '」');
      } else if (!q.reward.repeatable) s.quests[q.id] = { state: 'expired' };
    });
    if (s.track && !(qstate(s, s.track) === 'active' || qstate(s, s.track) === 'ready')) { var a = activeQuests(s)[0]; s.track = a ? a.id : null; }
  }
  function decide(s, id, idx, out) {
    var q = D.q[id], c = q.decision[idx];
    c.flags.forEach(function (f) { s.flags[f] = 1; });
    return c;
  }

  /* ---------- 觸發條件（崩潰、士氣、違規） ---------- */
  function afterChange(s, out) {
    if (s.over) return;
    var th = D.rpg.resources.demerit.thresholds, i;
    for (i = 0; i < th.length; i++) {
      if (s.demerit >= th[i].atLeast && s.dmStage < i + 1) {
        s.dmStage = i + 1;
        triggerEvent(s, th[i].trigger, out);
      }
    }
    if ((s.hp <= 0 || s.fatigue >= 100) && !s.flags.collapsing && !beachActive(s)) {
      s.flags.collapsing = 1;
      triggerEvent(s, 'event_collapse', out);
      delete s.flags.collapsing;
    }
    if (s.a.m <= 0) triggerEvent(s, 'event_morale_breakdown', out);
  }

  /* ---------- 時間 ---------- */
  function consumePeriod(s, n, out) {
    if (s.over) return;
    s.period += n;
    while (s.period >= 3 && !s.over) { s.period -= 3; dayTick(s, out); }
    settle(s, out);
  }
  function settle(s, out) {
    if (beachActive(s)) return;
    while (s.pendingDays > 0 && !s.over) {
      var n = s.pendingDays; s.pendingDays = 0;
      for (var i = 0; i < n && !s.over; i++) { s.period = 0; dayTick(s, out); }
    }
  }
  function inSummer(day) { return day >= 100 && day <= 190; }
  function dayTick(s, out) {
    if (beachPending(s) || (beachActive(s) && s.day === beachDay())) return;
    var T = D.tune.daily || {}, note = [];
    var confined = s.confine > 0;
    if (!confined && s.day >= 4) {
      addHp(s, -(T.routineHp || 10), null);
      addFatigue(s, T.routineFatigue || 8, null, true);
      addXp(s, D.rpg.leveling.xpSources.dailyRoutine, out);
    }
    var rec = D.rpg.resources.hp.dailyRecover + (s.flags.leaveToday ? 20 : 0);
    var dec = D.rpg.resources.fatigue.dailyDecay + Math.floor((eff(s, 'm') - 50) / 10);
    delete s.flags.leaveToday;
    addHp(s, rec, null);
    s.fatigue = clamp(s.fatigue - dec, 0, 100);
    if (s.injury) {
      s.injury.left--;
      if (s.injury.left <= 0) { note.push('「' + D.inj[s.injury.id].name + '」痊癒了'); if (s.injury.id === 'inj_fracture') delete s.flags.hospitalizedNow; s.injury = null; }
    }
    if (s.confine > 0) { s.confine--; if (s.confine === 0) note.push('禁閉結束'); }
    if (s.day >= 5 && !confined) {
      var p = clamp((T.demeritBase || 0.006) - (eff(s, 'd') - 50) * (T.demeritSlope || 0.0001), T.demeritMin || 0.001, T.demeritMax || 0.02);
      if (rng() < p) { addDemerit(s, 1, out); note.push('一時疏忽被記了違規（違規 +1）'); }
      if (inSummer(s.day) && s.fatigue >= 60 && rng() < (T.heatChance || 0.08)) inflictInjury(s, 'inj_heatstroke', out);
    }
    if (!confined && !s.injury && s.day >= 5 && s.day % (T.routineBEvery || 25) === 0) addAttr(s, 'b', 1, out);
    if (equipEffect(s, 'dailyMoraleAdd') && s.day % 10 === 0 && s.a.m < 70) addAttr(s, 'm', 1, out);
    if (s.day === 50 && !s.items.it_familyletter) { addItem(s, 'it_familyletter', 1, out); out.msgs.push('收到一封家書（士氣每隔幾天會回升）'); note.push('收到家書'); }
    s.day++; s.period = 0;
    if (s.day % 30 === 0) { var pay = D.rpg.resources.money.monthlyPay; addMoney(s, pay, out); note.push('發餉 ' + pay + ' 元'); }
    if (s.day >= 31 && !s.unit) { var u = lottery(s, out); note.push('未抽籤，由部隊分發至' + D.units[u].name); }
    expireQuests(s, out);
    afterChange(s, out);
    out.days.push({ day: s.day, note: note });
    if (s.day >= 365) endGame(s);
  }
  function endGame(s) { s.over = true; s.ending = evalEnding(s); }
  function skipDays(s, n, out) {
    for (var i = 0; i < n && !s.over; i++) { s.period = 0; dayTick(s, out); settle(s, out); }
  }
  function nextQuestDay(s) {
    var best = null;
    D.qList.forEach(function (q) {
      if (qstate(s, q.id) && !(q.reward.repeatable)) return;
      if (q.dayRange[0] <= s.day) return;
      if (q.unit && q.unit !== s.unit && !(s.day < 31 && !s.unit)) return;
      if (q.id === 'ch5_side_05' && !s.flags.vol) return;
      if (q.id === 'ch5_side_06') return;
      if (!best || q.dayRange[0] < best.day || (q.dayRange[0] === best.day && q.type === 'main' && best.q.type !== 'main')) best = { day: q.dayRange[0], q: q };
    });
    return best;
  }
  function takeLeave(s, out) {
    if (s.honor < 1 || s.confine > 0) return false;
    s.honor--; fx(out, 'honor', -1);
    var c = D.rpg.fatigueCosts.leave;
    addHp(s, c.hp, out); addFatigue(s, c.fatigue, out, false); addAttr(s, 'm', c.m, out);
    s.flags.leaveToday = 1;
    skipDays(s, 1, out);
    return true;
  }
  function sleep(s, out) {
    var left = 3 - s.period;
    consumePeriod(s, left, out);
  }

  /* ---------- NPC 好感 ---------- */
  function talkNpc(s, npcId, out) {
    var d = s.affDay[npcId];
    if (d === s.day) return null;
    s.affDay[npcId] = s.day;
    var gain = Math.round((2 + Math.floor(eff(s, 'o') / 25)) * (1 + skillEffect(s, 'npcAffinityPct') / 100));
    s.aff[npcId] = clamp((s.aff[npcId] || 0) + gain, 0, 100);
    var gifts = [[20, '小禮物', { money: 80 }], [50, '好感贈禮', { item: 'it_energy' }], [80, '深厚交情', { xp: 30, m: 1 }]], i, res = null;
    for (i = 0; i < gifts.length; i++) {
      var key = 'aff_' + npcId + '_' + gifts[i][0];
      if (s.aff[npcId] >= gifts[i][0] && !s.flags[key]) {
        s.flags[key] = 1;
        var g = gifts[i][2];
        if (g.money) addMoney(s, g.money, out);
        if (g.item) addItem(s, g.item, 1, out);
        if (g.xp) addXp(s, g.xp, out);
        if (g.m) addAttr(s, 'm', g.m, out);
        res = (D.npc[npcId] ? D.npc[npcId].name : '') + '送了你' + gifts[i][1];
      }
    }
    return res;
  }

  /* ---------- 結局 ---------- */
  function evalCond(s, expr) {
    if (expr === 'true') return true;
    var src = expr.replace(/且/g, '&&').replace(/或/g, '||')
      .replace(/skill\s+(\w+)\s*>=\s*(\d+)/g, 'sk("$1")>=$2')
      .replace(/flag\s+(\w+)/g, 'fl("$1")');
    var env = { b: eff(s, 'b'), m: eff(s, 'm'), d: eff(s, 'd'), o: eff(s, 'o'), demerit: s.demerit, level: s.level };
    /* eslint-disable no-new-func */
    var f = new Function('b', 'm', 'd', 'o', 'demerit', 'level', 'sk', 'fl', 'return !!(' + src + ')');
    return f(env.b, env.m, env.d, env.o, env.demerit, env.level, function (id) { return skillRank(s, id); }, function (n) { return !!s.flags[n]; });
  }
  function endingList(kind) {
    var ov = D.tune.endingOverrides || {};
    return D.rpg.endings[kind].map(function (e) { return { id: e.id, n: e.n, cond: ov[e.id] || e.if, bad: !!e.new }; });
  }
  function beachEndings() {
    var ov = D.tune.endingOverrides || {};
    return ((D.tune.beach || {}).newEndings || []).map(function (e) { return { id: e.id, n: e.n, cond: ov[e.id] || e.if, beach: true }; });
  }
  function allEndings() {
    var seen = {}, out = [];
    endingList('conscript').filter(function (e) { return e.bad; }).concat(beachEndings()).concat(endingList('conscript').filter(function (e) { return !e.bad; })).concat(endingList('volunteer')).forEach(function (e) {
      if (!seen[e.id]) { seen[e.id] = 1; out.push(e); }
    });
    return out;
  }
  function evalEnding(s) {
    var list = endingList('conscript').filter(function (e) { return e.bad; }).concat(beachEndings());
    var i, e;
    for (i = 0; i < list.length; i++) if (evalCond(s, list[i].cond)) return list[i].id;
    list = endingList(s.flags.vol ? 'volunteer' : 'conscript').filter(function (e) { return !e.bad; });
    for (i = 0; i < list.length; i++) { e = list[i]; if (evalCond(s, e.cond)) return e.id; }
    return 'phew';
  }
  function endingInfo(id) {
    var t = D.endText[id] || {};
    return { id: id, title: t.title || id, description: t.description || '' };
  }

  /* ---------- 漢光：海岸（強制章節） ---------- */
  function beachDay() { return (D.tune.beach || {}).startDay || 240; }
  function beachActive(s) {
    if (!D || !D.q.ch4_beach_prep) return false;
    var p = s.quests.ch4_beach_prep;
    if (!p) return false;
    var r = s.quests.ch4_beach_relief;
    return !(r && (r.state === 'done' || r.state === 'failed'));
  }
  function beachPending(s) { return !!(D && D.q.ch4_beach_prep) && s.day >= beachDay() && !s.quests.ch4_beach_prep; }
  function startBeach(s, opts) {
    opts = opts || {};
    s.beach = { diff: opts.diff || (D.fps ? D.fps.difficulty.default : 'hardcore'), aim: !!opts.aim, mags: 2, crates: 0, retries: {}, played: {}, hpZeroW4: false, cmd: null, tough: false, medevac: false, kills: 0, wavesCleared: 0 };
    return accept(s, 'ch4_beach_prep');
  }
  function beachNext(s) {
    if (!beachActive(s) || !D.fps) return null;
    var order = D.fps.questOrder, i;
    for (i = 0; i < order.length; i++) {
      var q = D.q[order[i]];
      if (!q) continue;
      if (!qstate(s, q.id)) {
        var ok = q.prerequisites.every(function (p) { return resolved(s, p); });
        return ok ? q : null;
      }
    }
    return null;
  }
  function diffMode(s) { return D.fps.difficulty.modes[(s.beach && s.beach.diff) || D.fps.difficulty.default]; }
  function beachXpMul(s) {
    var m = 1;
    if (s.beach && s.beach.aim && s.beach.diff === 'hardcore') m *= D.fps.difficulty.aimAssist.hardcorePenalty.xpMul;
    if (s.beach && s.beach.cmd === 'counter') m *= 1.3;
    return m;
  }
  function beachKill(s, out) {
    s.beach.kills++;
    addXp(s, Math.max(1, Math.round(D.fps.rewards.perKill.xp * beachXpMul(s))), out);
  }
  function waveClear(s, id, out) {
    s.beach.played[id] = 1; s.beach.wavesCleared++;
    var w = D.fps.rewards.waveClear;
    addXp(s, Math.round(w.xp * beachXpMul(s)), out);
    addAttr(s, 'm', w.m, out);
    var heal = Math.round(hpMax(s) * 0.2);
    s.hp = Math.min(hpMax(s), s.hp + heal); fx(out, 'hp', heal);
  }
  function waveEnemies(s, id) {
    var w = D.fps.waves.filter(function (x) { return x.id === id; })[0], mul = 1, out = {};
    if (id === 'wave4') {
      var mod = (w.modByCommandChoice || {})[s.beach.cmd];
      if (mod) mul *= mod.enemiesMul;
      if (s.flags.radio_fixed) mul *= w.artillerySupport.enemiesMul;
    }
    Object.keys(w.enemies).forEach(function (k) { out[k] = Math.max(1, Math.round(w.enemies[k] * mul)); });
    return { wave: w, enemies: out };
  }
  function retryWave(s, id) { s.beach.retries[id] = (s.beach.retries[id] || 0) + 1; }
  function medevac(s, out) {
    s.beach.medevac = true;
    s.flags.beach_medevac = 1;
    inflictInjury(s, 'inj_fracture', out);
    s.hp = Math.max(1, Math.round(hpMax(s) * 0.3));
  }
  function wavesNoRetry(s) {
    var n = 0;
    ['wave1', 'wave2', 'wave3', 'wave4'].forEach(function (w) { if (s.beach.played[w] && !s.beach.retries[w]) n++; });
    return n;
  }
  function akaiFate(s, score, tough, out) {
    var A = (D.tune.beach || {}).akaiKia || { base: 40, perO: 1, perFirstAid: 15, min: 8, max: 50, tough: 10 };
    var kia = false, p = 0;
    if (!(score != null && score >= 60)) {
      p = clamp(A.base - A.perO * (eff(s, 'o') - 50) - A.perFirstAid * skillRank(s, 'sk_firstaid'), A.min, A.max) + (tough ? A.tough : 0);
      kia = rng() * 100 < p;
    }
    s.flags[kia ? 'akai_kia' : 'akai_injured'] = 1;
    return { kia: kia, p: p };
  }
  function wangChance(s, cmd, hpZero) {
    var W = (D.tune.beach || {}).wangKia, fixed = s.flags.radio_fixed ? 1 : 0;
    var row = cmd === 'hold' ? (hpZero ? W.hold_zero : W.hold) : (W[cmd] || W.hold);
    return row[fixed];
  }
  function wangFate(s, out) {
    var p = wangChance(s, s.beach.cmd || 'hold', s.beach.hpZeroW4);
    var kia = rng() * 100 < p;
    if (kia) s.flags.sgt_wang_kia = 1;
    return { kia: kia, p: p };
  }
  function civilianStay(s) {
    var hurt = rng() * 100 < ((D.tune.beach || {}).uncleHurtChance || 50);
    if (hurt) s.flags.civilian_hurt = 1;
    return hurt;
  }
  function beachFinish(s, out) {
    var cr = D.fps.rewards.chapterClear, tier = D.rpg.questRewards.tiers[cr.tier] || {};
    applyBundle(s, { xp: tier.xp || 0, honor: cr.honor }, out);
    s.flags.beach_survived = 1;
    if (s.flags.saved_civilian && s.flags.radio_fixed && !s.flags.beach_fallback && !s.flags.beach_medevac && wavesNoRetry(s) >= 3) s.flags.beach_hero = 1;
    removeItem(s, 'it_t91', 1);
  }
  function giverOf(s, q) {
    if (q.giver === 'npc_akai' && s.flags.akai_kia) return 'npc_senior_chou';
    return q.giver;
  }
  function npcVariantLine(s, id) {
    var v = D.npcVar[id];
    if (!v) return null;
    var keys = Object.keys(v), i;
    for (i = 0; i < keys.length; i++) if (keys[i] !== 'default' && s.flags[keys[i]]) return v[keys[i]];
    return null;
  }
  function npcPresent(s, id) {
    if (id === 'npc_akai' && s.flags.akai_kia) return false;
    return true;
  }
  function flagExpr(s, expr) {
    if (!expr || expr === 'true') return true;
    function tok(t) {
      t = String(t || '').trim();
      if (!t) return true;
      var neg = t.charAt(0) === '!';
      var f = neg ? t.slice(1).trim() : t;
      return neg ? !s.flags[f] : !!s.flags[f];
    }
    return String(expr).split(/\s*\|\|\s*/).some(function (orP) {
      return orP.split(/\s*&&\s*/).every(tok);
    });
  }
  function pickVariant(s, list, field) {
    if (!list) return null;
    var i, v;
    for (i = 0; i < list.length; i++) {
      v = list[i];
      if (flagExpr(s, v.if)) return v[field] != null ? v[field] : (v.line || v.title || null);
    }
    return null;
  }
  function questTitle(s, q) {
    if (!q) return '';
    return pickVariant(s, q.titleVariants, 'title') || q.title;
  }
  function questStart(s, q) {
    if (!q) return '';
    return pickVariant(s, q.startVariants, 'line') || (q.dialogue && q.dialogue.start) || '';
  }

  /* ---------- 違禁品誘惑 ---------- */
  function packContraband(s) { s.flags.packedContraband = 1; }
  function bagCheck(s) {
    if (s.flags.packedContraband) { delete s.flags.packedContraband; return false; }
    return true;
  }
  function takeContraband(s, out) {
    if (s.items.it_contraband) return false;
    s.items.it_contraband = 1;
    if (out) out.msgs.push('獲得：私帶違禁品');
    return true;
  }
  function deliverCheck(s, out) {
    if (!s.items.it_contraband) return true;
    var risk = D.items.it_contraband.risk;
    removeItem(s, 'it_contraband', 1);
    if (rng() * 100 < risk.caughtChance) {
      addDemerit(s, risk.demerit, out);
      s.caughtContraband = (s.caughtContraband || 0) + 1;
      if (s.caughtContraband >= 2) setFlag(s, 'court', out, true);
      return false;
    }
    addAttr(s, 'm', D.items.it_contraband.use.m, out);
    return true;
  }

  /* ---------- 存檔 ---------- */
  function serialize(s) { return JSON.stringify(s); }
  function deserialize(str) {
    var s = JSON.parse(str);
    if (!s || s.ver !== 2 || !s.a) return null;
    return s;
  }

  return {
    ATTRS: ATTRS, ANAME: ANAME, PERIODS: PERIODS,
    init: init, data: data, setRng: setRng, mulberry: mulberry,
    newState: newState, newOut: newOut,
    eff: eff, hpMax: hpMax, rankOf: rankOf, xpNeed: xpNeed, xpInLevel: xpInLevel, xpTotalFor: xpTotalFor,
    chapterOfDay: chapterOfDay, baseMap: baseMap, questMap: questMap,
    addXp: addXp, addAttr: addAttr, addHp: addHp, addFatigue: addFatigue, addMoney: addMoney, addDemerit: addDemerit,
    addItem: addItem, removeItem: removeItem, equip: equip, unequip: unequip, shopList: shopList, buy: buy, useItem: useItem,
    bagUsed: bagUsed, bagSize: bagSize, isQuestItem: isQuestItem,
    skillAvailable: skillAvailable, learnSkill: learnSkill, skillRank: skillRank,
    checkInfo: checkInfo, rollCheck: rollCheck,
    mgDef: mgDef, mgAssist: mgAssist, mgFinal: mgFinal, mgTier: mgTier, minigameResult: minigameResult, lottery: lottery, setUnit: setUnit,
    availability: availability, listAvailable: listAvailable, activeQuests: activeQuests, accept: accept, abandon: abandon,
    stepDone: stepDone, complete: complete, fail: fail, decide: decide, qstate: qstate, mergedReward: mergedReward, repMult: repMult,
    consumePeriod: consumePeriod, skipDays: skipDays, sleep: sleep, takeLeave: takeLeave, nextQuestDay: nextQuestDay, settle: settle,
    talkNpc: talkNpc, triggerEvent: triggerEvent, afterChange: afterChange, inflictInjury: inflictInjury, setFlag: setFlag,
    evalEnding: evalEnding, endingInfo: endingInfo, allEndings: allEndings, endGame: endGame,
    beachActive: beachActive, beachPending: beachPending, startBeach: startBeach, beachNext: beachNext, diffMode: diffMode, beachKill: beachKill,
    waveClear: waveClear, waveEnemies: waveEnemies, retryWave: retryWave, medevac: medevac, wavesNoRetry: wavesNoRetry, akaiFate: akaiFate, wangFate: wangFate,
    wangChance: wangChance, civilianStay: civilianStay, beachFinish: beachFinish, giverOf: giverOf, npcVariantLine: npcVariantLine, npcPresent: npcPresent, beachXpMul: beachXpMul,
    flagExpr: flagExpr, questTitle: questTitle, questStart: questStart, applyClearFlags: applyClearFlags, applyRehab: applyRehab,
    packContraband: packContraband, bagCheck: bagCheck, takeContraband: takeContraband, deliverCheck: deliverCheck,
    serialize: serialize, deserialize: deserialize, periodsOf: periodsOf, costKeyOf: costKeyOf, fatiguePenalty: fatiguePenalty
  };
});
