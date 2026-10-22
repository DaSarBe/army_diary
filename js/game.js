/* 遊戲控制器：任務執行、NPC 對話、面板、存讀檔、結局。 */
(function (root) {
  'use strict';
  var E = root.Engine, P = root.Places, W = root.World, UI = root.UI, Sfx = root.Sfx, MG = root.Minigames, FPS = root.FPS || { active: function () { return false; }, stop: function () { }, init: function () { } };
  var $ = function (s) { return document.querySelector(s); };
  var esc = UI.esc;
  var D = null, G = null, R = null, mapNow = null, phase = 'boot', busy = 0, lastChapter = 1, lastTalk = null, holdOn = false;
  var lastName = '王小明', lastBg = 'uni', tracked = '';
  var MAPNAME = { home: '家附近', camp1: '新訓中心', unit: '營區', beach: '海岸據點' };
  var SAVE = 'abg2-save-', ENDK = 'abg2-endings';
  var STATIC = {
    home: { bed: [-14, 1.5], board: [-8, -3.6], shops: [[-4, -18.4, '便利商店']] },
    camp1: { bed: [16, -1.0], board: [-4.2, 4.8], shops: [] },
    unit: { bed: [14, -9.5], board: [-4.8, 6.2], shops: [[-12, 16.6, '營外小店']] },
    beach: { bed: null, board: null, shops: [] }
  };
  var PHONE = { camp1: [9.5, 2.7], unit: [7, -4.2] };
  var UNIT_VIBE = {
    infantry: '聽說這裡的日常是跑步、戰技和野外，床板很硬，但同梯很熱。',
    artillery: '這裡的口號是「準確」。每個動作都要算數，連打掃都要量尺寸。',
    airforce: '飛機起降的聲音比鬧鐘還準時。這裡的人說話都很輕，做事都很準。',
    navy: '你要學會在搖晃的甲板上站穩，也要學會在狹小的艙房裡跟同梯和平共處。',
    logistics: '清點、登記、運送。這裡沒有槍林彈雨，卻有永遠數不完的箱子。'
  };
  var VERB = { talk: '交談', goto: '前往', inspect: '檢查', carry: '搬運', collect: '收集', minigame: '挑戰', escort: '護送', run: '跑步', march: '行軍', patrol: '巡邏', move: '移動', clean: '打掃', clear: '清除', defend: '防守', stealth: '潛行', timed: '限時', rhythm: '節奏', rest: '休息', decide: '抉擇', report: '報告', check: '判定' };
  var GEN_TALK = ['「照規矩來就好。」', '「辛苦了，慢慢來。」', '「這邊交給我。」', '「你有什麼事嗎？」', '「注意安全。」'];
  var CHAP_TEXT = {
    2: '入伍日。營門口擠滿了和你一樣拎著行李的年輕人，空氣裡有點緊張。',
    3: '新訓開始了。每天的起床號都比你想像的早。',
    4: '結訓了。分發的車子駛進新的營區，這裡就是接下來大半年的家。',
    5: '義務役剩下最後一段路。你已經不是「新來的」了。'
  };

  function now() { return Date.now(); }
  function gv(q) { return G ? E.giverOf(G, q) : q.giver; }
  function qTitle(q) { return G ? E.questTitle(G, q) : (q && q.title) || ''; }
  function npcName(id) { return D.npc[id] ? D.npc[id].name : id; }
  function curQ() { return R && R.q; }
  function overlays() { return UI.dialogOpen() || UI.cardOpen() || UI.panelOpen() || (MG && MG.active) || holdOn || busy > 0; }

  /* ---------- 文字輔助 ---------- */
  function tlTarget(t) { return D.npc[t] ? D.npc[t].name : P.tl(t); }
  function objText(o) {
    var t = o.target, n = typeof o.count === 'number' && o.count > 1 ? '（' + o.count + '）' : '';
    switch (o.type) {
      case 'talk': case 'report': return '與' + tlTarget(t) + '交談' + n;
      case 'goto': return '前往' + tlTarget(t) + n;
      case 'carry': var p = t.split(':'); return '把' + ((D.items[p[0]] && D.items[p[0]].name) || (D.tune.tempItems || {})[p[0]] || P.tl(p[0])) + (typeof o.count === 'number' && o.count > 1 ? '×' + o.count : '') + '送到' + tlTarget(p[1]);
      case 'check': return '通過判定：' + ((D.rpg.checks.types[t] || {}).name || t);
      case 'decide': return '做出決定';
      case 'rest': return t === 'home' ? '回家休息' : '休息';
      case 'minigame': case 'rhythm': case 'timed': case 'stealth': case 'defend': return VERB[o.type] + '：' + P.tl(t);
      default: return VERB[o.type] + tlTarget(t) + n;
    }
  }
  function effText(obj) {
    if (!obj) return '';
    var out = [];
    Object.keys(obj).forEach(function (k) {
      var v = obj[k], c;
      if (k === 'injuryChanceAdd') out.push('受傷機率 ' + (v > 0 ? '+' : '') + v + '%');
      else if (k.indexOf('check.') === 0) out.push(((D.rpg.checks.types[k] || {}).name || k) + '判定 ' + (v > 0 ? '+' : '') + v + '%');
      else if (k.indexOf('nextCheck.') === 0) out.push('下一次' + ((D.rpg.checks.types['check.' + k.slice(10)] || {}).name || '') + '判定 +' + v + '%');
      else if (E.ATTRS.indexOf(k) >= 0) out.push(E.ANAME[k] + ' ' + (v > 0 ? '+' : '') + v);
      else if (k === 'dailyMoraleAdd') out.push('士氣緩慢回升');
      else if (k === 'hp') out.push('體力 ' + (v > 0 ? '+' : '') + v);
      else if (k === 'fatigue') out.push('疲勞 ' + (v > 0 ? '+' : '') + v);
      else if (k === 'hpMaxAdd') out.push('體力上限 +' + v);
      else if (k === 'fatigueGainPct') out.push('疲勞累積 ' + v + '%');
      else if (k === 'shootingSwayPct') out.push('射擊準心晃動 ' + v + '%');
      else if (k === 'npcAffinityPct') out.push('NPC 好感成長 +' + v + '%');
      else if (k === 'injuryDaysPct') out.push('傷病天數 ' + v + '%');
      else if (k === 'seasickPct') out.push('暈船機率 ' + v + '%');
      else { c = k; out.push(c + ' ' + v); }
    });
    return out.join('、');
  }
  function rewardText(q) {
    var r = E.mergedReward(q), s = [];
    if (r.xp) s.push('經驗 +' + r.xp);
    E.ATTRS.forEach(function (k) { if (r[k]) s.push(E.ANAME[k] + ' +' + r[k]); });
    if (r.money) s.push('薪餉 ' + (r.money > 0 ? '+' : '') + r.money);
    if (r.honor) s.push('榮譽假 +' + r.honor);
    (r.items || []).forEach(function (i) { s.push('獲得' + (D.items[i] ? D.items[i].name : i)); });
    if (r.badge) s.push('徽章「' + (D.tune.badges || {})[r.badge] + '」');
    if (q.decision) s.push('（需要做出決定）');
    if (r.repeatable) s.push('可重複，獎勵遞減');
    return s.join('、');
  }
  function where(id) {
    var maps = ['home', 'camp1', 'unit'], i;
    for (i = 0; i < maps.length; i++) if (P.npcSpot(id, maps[i], G.unit)) return MAPNAME[maps[i]];
    return null;
  }

  /* ---------- 儲存 ---------- */
  function saveGame(slot, quiet) {
    if (!G || G.over) return false;
    if (FPS.active()) { if (!quiet) UI.toast('戰鬥中不能存檔'); return false; }
    try {
      var p = W.pos();
      localStorage.setItem(SAVE + slot, JSON.stringify({ G: G, map: mapNow, pos: p, t: now() }));
      if (!quiet) { UI.toast('已存檔（欄位 ' + (slot || '自動') + '）'); Sfx.sfx('save'); }
      return true;
    } catch (e) { if (!quiet) UI.toast('無法存檔：瀏覽器不允許儲存資料'); return false; }
  }
  function readSave(slot) {
    try {
      var raw = localStorage.getItem(SAVE + slot);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || !d.G || d.G.ver !== 2) return null;
      return d;
    } catch (e) { return null; }
  }
  function saveInfo(d) {
    if (!d) return '（空）';
    var g = d.G, dt = new Date(d.t || 0);
    return g.name + '　Lv' + g.level + '　第 ' + g.day + ' 天　' + (dt.getMonth() + 1) + '/' + dt.getDate() + ' ' + ('0' + dt.getHours()).slice(-2) + ':' + ('0' + dt.getMinutes()).slice(-2);
  }
  function unlocked() { try { return JSON.parse(localStorage.getItem(ENDK) || '[]'); } catch (e) { return []; } }
  function unlock(id) { try { var u = unlocked(); if (u.indexOf(id) < 0) { u.push(id); localStorage.setItem(ENDK, JSON.stringify(u)); } } catch (e) { /* ignore */ } }

  /* ---------- 外觀與色調 ---------- */
  function outfit() {
    var body = G.equip.body, uni = (body === 'it_camo' || body === 'it_camo_ironed') && G.day >= 4;
    if (!uni) {
      var C = { uni: ['#4a78a8', '#3a4258'], office: ['#e9ebee', '#4b4f58'], site: ['#d98a2f', '#4a4a42'], gamer: ['#2b2b33', '#3a3f55'] }[G.bg] || ['#4a78a8', '#3a4258'];
      return { sig: 'c-' + G.bg, spec: { shirt: C[0], pants: C[1], hair: '#2a2220', skin: '#e2b48c', shoes: '#e8e8e8' } };
    }
    var hat = G.day >= 31;
    return { sig: 'u' + (hat ? 'h' : ''), spec: { shirt: '#5b6b3c', pants: '#4d5a33', skin: '#d9a77a', shoes: '#1f1f1f', hat: hat ? '#4d5a33' : null, pack: G.day >= 31 ? '#4d5a33' : null } };
  }
  function dressNow() { if (!G) return; var o = outfit(); W.dress(o.sig, o.spec); }
  function toneNow(now0) { W.setTone(G && E.beachActive(G) ? 'dusk' : (G && G.period === 2 ? 'night' : (G && G.period === 1 ? 'dusk' : 'day')), now0); }

  /* ---------- 地圖進出 ---------- */
  function showPlayUI(on) {
    $('#side').hidden = !on; $('#track').hidden = !on;
    if (!on) { $('#act').hidden = true; $('#timer').hidden = true; }
    UI.hud(on ? G : null);
  }
  function enterMap(map, opts, cb) {
    opts = opts || {};
    busy++;
    UI.fade(true); if (opts.text) UI.fadeText(opts.text, true);
    setTimeout(function () {
      cleanupStep();
      W.loadMap(map, G ? G.unit : null, G && G.flags.vol);
      mapNow = map;
      var sp = opts.pos || W.spawn();
      W.place(sp.x, sp.z);
      if (!opts.pos) { var st = STATIC[map]; if (st.bed) { W.lookAt(st.bed[0], st.bed[1]); W.S.yaw = W.S.face + Math.PI; } else { W.lookAt(0, -20); W.S.yaw = W.S.face + Math.PI; } }
      dressNow(); toneNow(true);
      W.setMode('world');
      rebuildInteract(); refreshMarks();
      if (map !== 'beach') beachMode(false);
      UI.fadeText('', false); UI.fade(false);
      setTimeout(function () { busy--; refreshHud(); updateTrack(true); if (cb) cb(); }, 500);
    }, 560);
  }
  function syncMap(cb) {
    var base = E.baseMap(G);
    if (E.beachActive(G)) return false;
    if ((!R || !G.quests[R.q.id] || (G.quests[R.q.id].state !== 'active' && !R.ready)) && mapNow !== base && !G.over) {
      var ch = E.chapterOfDay(G.day), txt = null;
      if (ch !== lastChapter) txt = '第 ' + ch + ' 章　' + D.story.chapters[ch - 1].title + '\n' + (CHAP_TEXT[ch] || '');
      enterMap(base, { text: txt }, cb);
      return true;
    }
    return false;
  }
  function chapterCheck(done) {
    var ch = E.chapterOfDay(G.day);
    if (ch === lastChapter) { done(); return; }
    lastChapter = ch;
    var c = D.story.chapters[ch - 1];
    UI.card({ kicker: '第 ' + ch + ' 章', title: c.title, body: [c.summary, CHAP_TEXT[ch] || ''], buttons: [{ t: '繼續', fn: done }], sfx: 'whistle' });
  }

  /* ---------- 互動點 ---------- */
  var statInter = [];
  function rebuildInteract() {
    var list = [], st = STATIC[mapNow];
    if (!st || !G) { W.setInteract([]); return; }
    if (st.bed) list.push({ x: st.bed[0], z: st.bed[1], r: 2.2, label: '寢室', prompt: mapNow === 'home' ? '回家休息' : '休息', act: bedMenu });
    if (st.board) list.push({ x: st.board[0], z: st.board[1], r: 2.4, label: '布告欄', prompt: '看布告欄', act: boardMenu });
    st.shops.forEach(function (s) { list.push({ x: s[0], z: s[1], r: 2.4, label: s[2], prompt: '買東西', act: openShop }); });
    if (PHONE[mapNow]) list.push({ x: PHONE[mapNow][0], z: PHONE[mapNow][1], r: 2.4, label: '電話亭', prompt: '打電話', act: phoneCall, phoneBase: true });
    Object.keys(W.S.npcs).forEach(function (id) {
      var n = W.S.npcs[id];
      if (n.deco || n.temp) return;
      list.push({ x: n.x, z: n.z, r: 2.7, label: n.name, prompt: '對話', npc: id, act: function () { npcInteract(id); } });
    });
    statInter = list;
    applyInteract();
  }
  function applyInteract() {
    var extra = ((R && R.inter) || []).map(function (i) { i.prio = 1.8; return i; });
    var base = statInter;
    if (R && R.plan && R.plan.kind === 'phone') base = statInter.filter(function (i) { return !i.phoneBase; });
    W.setInteract(extra.concat(base));
  }
  function refreshMarks() {
    W.clearNpcMarks();
    E.activeQuests(G).forEach(function (q) { if (E.qstate(G, q.id) === 'ready' && W.hasNpc(gv(q))) W.setNpcMark(gv(q), '?'); });
    E.listAvailable(G).forEach(function (q) { if (W.hasNpc(gv(q)) && !W.S.npcs[gv(q)].mark) W.setNpcMark(gv(q), '!'); });
  }
  function updateAct() {
    var a = $('#act'), it = W.S.near;
    if (it && !overlays() && W.S.mode === 'world' && phase === 'play') { a.hidden = false; a.textContent = it.prompt || '互動'; } else a.hidden = true;
  }

  /* ---------- HUD 與追蹤 ---------- */
  function refreshHud() { UI.hud(G); updateTrack(true); }
  var lastTrackTxt = '';
  function boardQuests() { return E.listAvailable(G).filter(function (q) { return !W.hasNpc(gv(q)); }); }
  function trackTarget() {
    var q = R && R.q, txt = '', tgt = null;
    if (R && R.plan && !R.ready) {
      txt = (q.type === 'main' ? '[主線] ' : '[支線] ') + qTitle(q) + '：' + (R.hint || R.plan.text);
      tgt = R.target || null;
    } else if (R && R.ready) {
      txt = '[回報] ' + qTitle(q) + '：找「' + npcName(gv(q)) + '」';
      tgt = W.npcPos(gv(q));
    } else {
      var av = E.listAvailable(G), pres = av.filter(function (x) { return W.hasNpc(gv(x)); })[0];
      if (pres) { txt = '可接任務：找頭上有「!」的人（' + npcName(gv(pres)) + '）'; tgt = W.npcPos(gv(pres)); }
      else if (boardQuests().length && STATIC[mapNow].board) { txt = '布告欄有新任務'; tgt = { x: STATIC[mapNow].board[0], z: STATIC[mapNow].board[1] }; }
      else if (STATIC[mapNow].bed) { txt = '沒有可接的任務。到寢室休息，或快轉到下一個任務日'; tgt = { x: STATIC[mapNow].bed[0], z: STATIC[mapNow].bed[1] }; }
      else { txt = '戰況緊急'; tgt = null; }
    }
    return { txt: txt, tgt: tgt };
  }
  function updateTrack(force) {
    if (!G || !mapNow) return;
    var t = trackTarget(), meta = W.pos();
    var d = t.tgt ? Math.round(Math.hypot(t.tgt.x - meta.x, t.tgt.z - meta.z)) : null;
    var s = t.txt + (d != null ? ' · ' + d + ' 公尺' : '');
    if (force || s !== lastTrackTxt) { $('#trTxt').textContent = s; lastTrackTxt = s; }
    if (t.tgt) { $('#trArr').style.visibility = 'visible'; $('#trArr').style.transform = 'rotate(' + W.arrow(t.tgt.x, t.tgt.z) + 'rad)'; } else $('#trArr').style.visibility = 'hidden';
    tracked = t.txt;
  }
  function updateTimer() {
    var el = $('#timer');
    if (R && R.timer) {
      var l = Math.max(0, Math.ceil(R.timer.left));
      el.hidden = false; el.textContent = '剩餘 ' + Math.floor(l / 60) + ':' + ('0' + (l % 60)).slice(-2);
      el.classList.toggle('low', l <= 10);
    } else el.hidden = true;
  }

  /* ---------- 任務執行器 ---------- */
  function cleanupStep(keepR) {
    W.clearTemps(); W.setMarks([]); W.clearFollowers(); W.setCarry(false);
    if (G && G.carry && !(R && G.quests[R.q.id] && G.quests[R.q.id].state === 'active' && keepR)) { /* 搬運物在步驟間不保留 */ }
    if (!keepR) { /* 保留 R 由呼叫端決定 */ }
    $('#timer').hidden = true;
  }
  function resetRunner() { cleanupStep(); R = null; if (G) G.carry = null; applyInteract(); }
  function startTracked() {
    resetRunner();
    var q = G.track ? D.q[G.track] : null;
    if (!q || !G.quests[q.id]) { refreshMarks(); updateTrack(true); return; }
    var st = G.quests[q.id];
    if (st.state === 'ready') { R = { q: q, ready: true }; readyFlow(q); }
    else if (st.state === 'active') beginQuestStep(q);
    updateTrack(true);
  }
  function beginQuestStep(q, prevEnd) {
    var st = G.quests[q.id];
    if (!st || st.state !== 'active') return;
    var idx = st.step;
    var ctxMap = prevEnd ? prevEnd.map : E.questMap(q);
    var plan = P.plan(q, idx, { D: D, S: G, map: ctxMap, unit: G.unit, prev: prevEnd || null });
    R = { q: q, idx: idx, plan: plan, pts: [], inter: [], timer: null, phase: 0, prevEnd: prevEnd || null, hint: '', target: null, done: 0 };
    if (mapNow !== plan.map) {
      var q0 = q;
      enterMap(plan.map, { text: '前往：' + MAPNAME[plan.map] }, function () { if (R && R.q === q0) setupStep(); });
    } else setupStep();
  }
  function placePts(plan) {
    return (plan.pts || []).map(function (p) {
      var x = p.x, z = p.z;
      if (p.free) { var f = W.freeSpot(x, z); x = f[0]; z = f[1]; }
      return Object.assign({}, p, { x: x, z: z, done: false });
    });
  }
  function updateMarks() {
    if (!R || !R.pts) return;
    var pl = R.plan, ms = [], first = -1;
    R.pts.forEach(function (p, i) { if (!p.done && first < 0) first = i; });
    R.pts.forEach(function (p, i) {
      if (p.done) return;
      if (pl.seq && i !== first) { return; }
      ms.push({ x: p.x, z: p.z });
    });
    if (R.plan.kind === 'carry') {
      var tp = R.phase === 1 ? R.pickupPt : R.plan.dst;
      ms = tp ? [{ x: tp.x, z: tp.z }] : [];
    }
    W.setMarks(ms);
    R.target = ms[0] || null;
    var left = R.pts.filter(function (p) { return !p.done; }).length;
    var tot = R.pts.length;
    var pl2 = R.plan;
    if (pl2.kind === 'carry') R.hint = R.phase === 1 ? '去拿「' + pl2.itemName + '」' : '搬運「' + pl2.itemName + '」到' + pl2.dst.label;
    else if (pl2.kind === 'collect') R.hint = pl2.text.replace(/（\d+）/, '') + '（' + (tot - left) + '/' + tot + '）';
    else if (tot > 1) R.hint = pl2.text.replace(/（\d+）/, '') + '（' + (tot - left) + '/' + tot + '）';
    else R.hint = pl2.text;
    updateTrack(true);
  }
  function setupStep() {
    var pl = R.plan, q = R.q;
    R.pts = placePts(pl);
    R.inter = [];
    if (q.id === 'ch4_beach_command') W.setNpcLying('npc_sgt_wang', true);
    if (pl.limit) R.timer = { left: pl.limit + (pl.kind === 'reach' || pl.kind === 'carry' || pl.kind === 'escort' ? travelTime(pl) : 0), total: 0 };
    if (R.timer) R.timer.total = R.timer.left;
    switch (pl.kind) {
      case 'reach': break;
      case 'talk':
        R.pts.forEach(function (p, i) {
          if (p.tempNpc) {
            W.tempNpc('t' + i, p.tempNpc.preset, p.x, p.z, p.tempNpc.name);
            R.inter.push({ x: p.x, z: p.z, r: 2.7, label: p.tempNpc.name, prompt: '交談', act: function () { talkStep(i); }, tmp: i });
          }
        });
        break;
      case 'phone':
        R.inter.push({ x: R.pts[0].x, z: R.pts[0].z, r: 2.6, label: '電話亭', prompt: '打電話', act: function () { phoneStep(); } });
        break;
      case 'inspect':
        R.pts.forEach(function (p, i) {
          if (p.prop) W.addProp(p.prop, p.x, p.z, null);
          R.inter.push({ x: p.x, z: p.z, r: 2.7, label: p.label, prompt: pl.verb, act: function () { inspectStep(i); }, ins: i });
        });
        break;
      case 'collect':
        R.pts.forEach(function (p, i) { W.addPickup(p.x, p.z, i, 'item'); });
        break;
      case 'carry': setupCarry(); break;
      case 'escort':
        var s = (pl.start && !W.blocked(pl.start.x, pl.start.z, 0.2)) ? pl.start : W.pos();
        W.setFollowers(pl.followers, W.pos().x, W.pos().z);
        void s;
        break;
      case 'overlay':
        R.pts.forEach(function (p) { if (p.prop) W.addProp(p.prop, p.x, p.z, null); });
        R.inter.push({ x: R.pts[0].x, z: R.pts[0].z, r: 2.8, label: R.pts[0].label, prompt: '開始', act: runOverlay });
        break;
      case 'check': break;
      case 'wave': setupWaveStep(); break;
      case 'auto': setTimeout(function () { if (R && R.plan === pl) stepSuccess(); }, 60); break;
      case 'radio': setTimeout(function () { if (R && R.plan === pl) radioStep(); }, 300); break;
      case 'bdecide': setTimeout(function () { if (R && R.plan === pl) bdecideStep(); }, 450); break;
      case 'fate': setTimeout(function () { if (R && R.plan === pl) fateStep(); }, 450); break;
      case 'decide':
        R.inter.push({ x: R.pts[0].x, z: R.pts[0].z, r: 3, label: '決定', prompt: '做決定', act: decideStep });
        break;
      case 'rest':
        R.inter.push({ x: R.pts[0].x, z: R.pts[0].z, r: 2.8, label: R.pts[0].label, prompt: pl.verb, act: restStep });
        break;
    }
    if (pl.kind !== 'carry' && pl.kind !== 'bdecide' && pl.kind !== 'fate') updateMarks();
    applyInteract();
    updateTimer();
    if (pl.kind === 'check') setTimeout(function () { if (R && R.plan === pl) doCheck(); }, 350);
    if (pl.kind === 'decide') { R.target = R.pts[0]; W.setMarks([{ x: R.pts[0].x, z: R.pts[0].z }]); }
    if (pl.text && pl.kind !== 'wave' && pl.kind !== 'auto' && pl.kind !== 'fate') UI.toast(pl.text, '', 2600);
  }
  function travelTime(pl) {
    var p = W.pos(), t = 0, last = p;
    (pl.pts || []).forEach(function (q) { t += Math.hypot(q.x - last.x, q.z - last.z); last = q; });
    if (pl.dst) t += Math.hypot(pl.dst.x - last.x, pl.dst.z - last.z);
    return Math.round(t / 4.2) + 6;
  }

  /* 步驟完成與失敗 */
  function stepSuccess() {
    var q = R.q, st = G.quests[q.id], plan = R.plan, out = E.newOut();
    if (!st || st.state !== 'active') { resetRunner(); updateTrack(true); return; }
    var last = plan.kind === 'carry' ? plan.dst : (R.pts && R.pts.length ? R.pts[R.pts.length - 1] : W.pos());
    var prevEnd = { map: mapNow, x: last.x, z: last.z };
    G.carry = null;
    Sfx.sfx('confirm');
    E.stepDone(G, q.id, out);
    E.settle(G, out);
    W.clearTemps(); W.setMarks([]); W.clearFollowers(); W.setCarry(false);
    R.timer = null; $('#timer').hidden = true; R.inter = []; applyInteract();
    presentOut(out, {}, function () {
      var s2 = G.quests[q.id];
      if (!s2) { resetRunner(); refreshMarks(); updateTrack(true); return; }
      if (s2.state === 'ready') { R = { q: q, ready: true }; readyFlow(q); }
      else if (s2.state === 'active') beginQuestStep(q, prevEnd);
      else { resetRunner(); refreshMarks(); updateTrack(true); }
    });
  }
  function failQuest(reason) {
    if (!R) return;
    var q = R.q, out = E.newOut();
    if (!G.quests[q.id] || G.quests[q.id].state !== 'active') { resetRunner(); return; }
    Sfx.sfx('fail');
    E.fail(G, q.id, out);
    resetRunner();
    var lines = [reason || '任務沒有完成。', (q.dialogue && q.dialogue.fail) || ''];
    UI.card({ kicker: '任務失敗', title: qTitle(q), body: lines.filter(Boolean), fx: out.fx, buttons: [{ t: '繼續', fn: function () { presentOut(out, { noFx: true, day: true }, function () { afterQuestEnd(); }); } }], sfx: 'fail' });
  }
  function afterQuestEnd() {
    saveGame(0, true);
    if (E.beachActive(G)) { chainNext(); return; }
    var moved = syncMap(function () { startTracked(); });
    if (!moved) startTracked();
  }
  function readyFlow(q) {
    R = { q: q, ready: true, inter: [], pts: [] };
    if (q.event || !W.hasNpc(gv(q)) || lastTalk === gv(q)) { turnIn(q, true); return; }
    refreshMarks(); applyInteract(); updateTrack(true);
    UI.toast('任務目標完成，回去找「' + npcName(gv(q)) + '」回報', '', 3200);
  }
  function turnIn(q, auto) {
    var line = (q.dialogue && q.dialogue.complete) || '任務完成。';
    var go = function () { completeQuest(q); };
    if (auto) { go(); return; }
    UI.dialog({ name: npcName(gv(q)), lines: [line], btn: '回報完成', done: go });
  }
  function completeQuest(q) {
    var out = E.newOut(), done = (q.dialogue && q.dialogue.complete) || '';
    var wasDecision = !!q.decision;
    E.complete(G, q.id, out);
    lastTalk = null;
    var body = [done].filter(Boolean);
    if (q.id === 'ch4_beach_relief') body = body.concat(reliefSummary());
    (out.msgs || []).forEach(function (m) { body.push(m); });
    resetRunner();
    Sfx.sfx('success');
    UI.card({ kicker: wasDecision ? '做出決定' : '任務完成', title: qTitle(q), body: body, fx: out.fx, buttons: [{ t: '繼續', fn: function () { presentOut(out, { noFx: true, day: true }, function () { afterQuestEnd(); }); } }], sfx: 'success' });
  }

  /* 各步驟處理 */
  function variantOk(cond) { return E.flagExpr(G, cond); }
  function memorialLines() {
    var q = R.q, lines = [E.questStart(G, q)];
    (q.dialogueVariants || []).forEach(function (v) { if (variantOk(v.if)) lines.push(v.line); });
    return lines;
  }
  function talkLines(name, npcId, first) {
    var N = npcId && D.npc[npcId], vv = npcId ? E.npcVariantLine(G, npcId) : null;
    if (!vv && npcId && G.flags.beach_survived && D.npcVar[npcId] && D.npcVar[npcId].default) vv = D.npcVar[npcId].default;
    var pool = vv || (N && N.lines && N.lines.length ? N.lines : null);
    var l = pool ? pool[Math.floor(Math.random() * pool.length)] : GEN_TALK[Math.floor(Math.random() * GEN_TALK.length)];
    var lines = [/^（/.test(String(l)) ? String(l) : name + '：「' + String(l).replace(/^「|」$/g, '') + '」'];
    if (first && R.q.dialogue && R.q.dialogue.progress && !R.progressShown) { lines.push(R.q.dialogue.progress); R.progressShown = true; }
    return lines;
  }
  function talkStep(i) {
    var p = R.pts[i];
    if (!p || p.done) return;
    var name = p.npc ? npcName(p.npc) : p.tempNpc.name, pid = p.npc;
    if (pid) W.faceNpc(pid);
    G.flagsTalk = null;
    var firstTalk = R.q.objectives.slice(0, R.idx).every(function (o) { return o.type !== 'talk'; });
    UI.dialog({
      name: name, lines: (R.q.id === 'ch5_beach_memorial' && pid === 'npc_counselor_lee') ? memorialLines() : talkLines(name, pid, !firstTalk || R.idx > 0 || true), btn: '好', done: function () {
        p.done = true; R.done++;
        if (pid) lastTalk = pid;
        var aff = pid ? E.talkNpc(G, pid, E.newOut()) : null;
        if (aff) UI.toast(aff);
        if (p.tempNpc) { W.removeNpc('t' + i); R.inter = R.inter.filter(function (x) { return x.tmp !== i; }); applyInteract(); }
        updateMarks();
        if (R.pts.every(function (x) { return x.done; })) stepSuccess();
      }
    });
  }
  function phoneStep() {
    var id = R.plan.npcId, name = npcName(id);
    Sfx.sfx('tick');
    UI.dialog({
      name: name + '（電話）', lines: ['嘟…嘟…電話接通了。'].concat(talkLines(name, id, true)), btn: '掛斷', done: function () {
        lastTalk = id; stepSuccess();
      }
    });
  }
  function hold(text, ms, done) {
    holdOn = true; W.setMode('ui');
    $('#hold').hidden = false; $('#holdTx').textContent = text;
    var bar = $('#holdBar'), t0 = performance.now();
    bar.style.transform = 'scaleX(0)';
    (function loop(n) {
      var e = Math.min(1, (n - t0) / ms);
      bar.style.transform = 'scaleX(' + e + ')';
      if (e < 1) requestAnimationFrame(loop);
      else { $('#hold').hidden = true; holdOn = false; Sfx.sfx('pickup'); done(); }
    })(t0);
    Sfx.sfx('click');
  }
  function inspectStep(i) {
    var p = R.pts[i], pl = R.plan;
    if (!p || p.done) return;
    hold(pl.verb + '：' + p.label + '…', 900, function () {
      p.done = true; R.done++;
      R.inter = R.inter.filter(function (x) { return x.ins !== i; }); applyInteract(); updateMarks();
      var finish = function () { if (R.pts.every(function (x) { return x.done; })) stepSuccess(); };
      if (pl.special === 'bag' && R.pts.every(function (x) { return x.done; })) {
        UI.dialog({
          name: '', lines: ['行李袋裡塞好了所有東西。櫃子深處，還躺著一包朋友偷偷給你的「違禁零食」，據說可以安慰想家的夜晚。', '要不要夾帶進去？被搜出來是要被記過的。'],
          choices: [{ t: '放進去（賭一把）', fn: function () { E.packContraband(G); UI.toast('你把它藏進了行李最底層'); finish(); } }, { t: '不帶，守規矩', cls: 'go', fn: function () { finish(); } }]
        });
        return;
      }
      if (pl.special === 'bagcheck') {
        if (!E.bagCheck(G)) {
          UI.dialog({ name: '林班長', lines: ['翻到了行李袋最底層的東西。', '「這是什麼？違禁品。你的名字我記住了。」'], btn: '…', done: function () { failQuest('行李被搜出了違禁品。'); } });
          return;
        }
      }
      if (pl.special === 'radar') { radarReport(finish); return; }
      if (pl.special === 'rollcall') { rollCall(finish); return; }
      var first = i === 0 && R.pts.length === 1 ? true : false;
      UI.toast(pl.verb + '了「' + p.label + '」', '', 1800);
      void first;
      finish();
    });
  }
  function onPickup(pk) {
    if (pk.id === 'supply') { supplyPick(pk); return; }
    if (!R || !R.plan) return;
    if (R.plan.kind === 'collect' && typeof pk.id === 'number') {
      var p = R.pts[pk.id];
      if (!p || p.done) return;
      p.done = true; R.done++; W.removePickup(pk); Sfx.sfx('pickup');
      updateMarks();
      if (R.pts.every(function (x) { return x.done; })) stepSuccess();
    } else if (R.plan.kind === 'carry' && pk.id === 'carry' && R.phase === 1) {
      W.removePickup(pk); Sfx.sfx('pickup'); startCarry();
    }
  }
  function setupCarry() {
    var pl = R.plan;
    if (pl.crates && !R.crateChosen) { chooseCrates(); return; }
    if (pl.pickup) {
      R.phase = 1; R.pickupPt = { x: pl.pickup.x, z: pl.pickup.z };
      var f = W.freeSpot(pl.pickup.x, pl.pickup.z); R.pickupPt = { x: f[0], z: f[1] };
      W.addPickup(f[0], f[1], 'carry', 'pile');
      updateMarks();
    } else startCarry();
    if (R.q.id === 'ch4_side_02') {
      UI.dialog({
        name: '周學長', lines: ['周學長塞給你一個小包裹：「幫我帶回來給我就好，別問。」', '他壓低聲音：「欸，順便幫我夾帶一包違禁品，我分你一半，好不好？」被查到可是要記過、甚至關禁閉的。'],
        choices: [{ t: '只帶包裹，不夾帶', cls: 'go', fn: function () { } }, { t: '答應夾帶（賭 35% 被抓）', fn: function () { E.takeContraband(G, E.newOut()); UI.toast('你把違禁品塞進口袋'); } }]
      });
    }
  }
  function startCarry() {
    var pl = R.plan;
    R.phase = 2; G.carry = { item: pl.item, name: pl.itemName, qty: pl.qty, quest: R.q.id };
    W.setCarry(true);
    var f = pl.dst.free ? W.freeSpot(pl.dst.x, pl.dst.z) : [pl.dst.x, pl.dst.z];
    pl.dst.x = f[0]; pl.dst.z = f[1];
    if (pl.dst.prop) W.addProp(pl.dst.prop, f[0], f[1], pl.dst.label);
    if (R.plan.dstNpc) { /* 交給 NPC */ }
    UI.toast('拿起了「' + pl.itemName + '」' + (pl.qty > 1 ? ' ×' + pl.qty : ''), '', 2400);
    updateMarks();
  }
  function deliver() {
    var pl = R.plan, out = E.newOut();
    var ok = true;
    if (R.q.id === 'ch4_side_02') ok = E.deliverCheck(G, out);
    if (!ok) {
      UI.dialog({ name: '', lines: ['營門的安檢人員攔下了你，翻出了口袋裡的違禁品。', '「這是什麼？跟我來一趟。」'], btn: '…', done: function () { UI.toastFx(out.fx); failQuest('夾帶違禁品被查獲。'); } });
      return;
    }
    if (out.fx.length) UI.toastFx(out.fx);
    if (pl.crates) crateDelivered();
    var name = pl.dstNpc ? npcName(pl.dst.npc) : pl.dst.label;
    if (pl.dstNpc) {
      W.faceNpc(pl.dst.npc);
      UI.dialog({ name: name, lines: ['你把「' + pl.itemName + '」交給了' + name + '。', talkLines(name, pl.dst.npc, true)[0]], btn: '好', done: function () { lastTalk = pl.dst.npc; stepSuccess(); } });
    } else { UI.toast('把「' + pl.itemName + '」送到了' + name); stepSuccess(); }
  }
  function decideStep() {
    var q = R.q;
    UI.dialog({
      name: qTitle(q), lines: ['這是一個重要的決定，沒有標準答案。', '簽下志願役，會繼續留在部隊；不簽，就按時退伍。'],
      choices: q.decision.map(function (c, i) {
        return { t: c.label, cls: i === 0 ? '' : '', fn: function () { E.decide(G, q.id, i, E.newOut()); UI.toast('你選擇了：' + c.label); stepSuccess(); } };
      })
    });
  }
  function restStep() {
    var pl = R.plan;
    busy++; UI.fade(true); UI.fadeText(pl.home ? '回到家，好好睡了一覺…' : '休息了一會兒…', true);
    setTimeout(function () {
      var out = E.newOut();
      if (pl.home && pl.days) { for (var i = 0; i < pl.days && !G.over; i++) E.skipDays(G, 1, out); }
      UI.fadeText('', false); UI.fade(false);
      setTimeout(function () {
        busy--; refreshHud(); toneNow(); UI.toastFx(out.fx);
        if (out.events.length || G.over) presentOut(out, { noFx: true }, function () { if (R && R.plan === pl && G.quests[R.q.id] && G.quests[R.q.id].state === 'active') stepSuccess(); else afterQuestEnd(); });
        else stepSuccess();
      }, 500);
    }, 700);
  }
  function doCheck() {
    var q = R.q, key = R.plan.target, info = E.checkInfo(G, key, q), pl = R.plan;
    var html = '<p class="note">成功率＝基礎 50 +（屬性 − 難度）× 2 + 技能裝備 + 疲勞懲罰，限制在 5% 到 95%。</p><ul>' +
      info.parts.map(function (p) { return '<li>' + esc(p.l) + '：' + (p.v > 0 ? '+' : '') + Math.round(p.v) + '</li>'; }).join('') + '</ul>';
    UI.card({
      kicker: '判定', title: info.name + '　成功率 ' + info.chance + '%', body: [html], html: true,
      buttons: [{
        t: '擲骰', cls: 'go', fn: function () {
          Sfx.sfx('dice');
          var r = E.rollCheck(G, key, q);
          setTimeout(function () {
            UI.card({
              kicker: '判定結果', title: r.ok ? '成功' : '失敗', body: ['擲出 ' + r.roll + '（需要 ≤ ' + r.chance + '）'], sfx: r.ok ? 'success' : 'fail',
              buttons: [{ t: '繼續', fn: function () { if (!R || R.plan !== pl) return; if (r.ok) stepSuccess(); else failQuest('「' + info.name + '」判定沒過。'); } }]
            });
          }, 350);
        }
      }]
    });
  }
  function runOverlay() {
    var pl = R.plan, q = R.q, o = q.objectives[pl.idx], id = o.target;
    var def = o.type === 'minigame' ? id : (o.type === 'rhythm' ? 'rhythm' : 'timed');
    var opts = { count: o.count, sway: Math.max(0.3, 1 + (E.mgDef('shooting') ? (function () { var v = 0; var sk = D.skills.sk_marksman; if (sk) v = sk.perRank.shootingSwayPct * E.skillRank(G, 'sk_marksman'); return v; })() / 100 : 0)) };
    var lotOut = null;
    if (id === 'lottery') {
      opts.onDraw = function () { lotOut = E.newOut(); var uid = E.lottery(G, lotOut); return { name: D.units[uid].name, vibe: UNIT_VIBE[uid] }; };
    }
    if (id === 'duty_roster' && E.skillRank(G, 'sk_social') > 0) opts.hint = true;
    if (o.uiHint === 'hint_cover_peek') UI.toast('蹲低才安全。探頭才開槍，打完就縮回來。', '', 4200);
    W.setMode('ui');
    MG.run(id, opts, function (raw) {
      if (!R || R.plan !== pl) return;
      if (id === 'lottery') {
        dressNow();
        UI.card({ kicker: '抽籤結果', title: D.units[G.unit].name, body: [UNIT_VIBE[G.unit], '結訓典禮上，班長第一次露出了笑容。他說：「到了新單位，別給我丟臉。」'], fx: lotOut.fx, buttons: [{ t: '繼續', fn: stepSuccess }], sfx: 'success' });
        return;
      }
      var out = E.newOut(), res = E.minigameResult(G, q.id, def, raw, out), tn = { great: '優秀', pass: '及格', fail: '不及格' }[res.tier];
      var body = ['表現 ' + res.raw + ' 分' + (res.assist ? '，屬性與技能加成 ' + (res.assist > 0 ? '+' : '') + res.assist : '') + '，總分 ' + res.score + '（及格 60／優秀 85）。'];
      if (q.dialogue) {
        if (res.tier === 'great' && q.dialogue.great) body.push(q.dialogue.great);
        else if (res.tier === 'fail' && q.dialogue.fail) body.push(q.dialogue.fail);
        else if (res.tier !== 'fail' && q.dialogue.complete) body.push(q.dialogue.complete);
      }
      UI.card({
        kicker: '小遊戲', title: P.tl(id) + '：' + tn, body: body, fx: out.fx, sfx: res.tier === 'fail' ? 'fail' : 'success',
        buttons: [{ t: '繼續', fn: function () { if (res.tier === 'fail') failQuest('「' + P.tl(id) + '」沒有達到及格分數。'); else { refreshHud(); stepSuccess(); } } }]
      });
    });
  }

  /* 每幀更新 */
  var trackAcc = 0;
  function onTick(dt) {
    if (!G || !R || phase !== 'play') return;
    trackAcc += dt;
    var p = W.pos();
    if (R.timer) {
      R.timer.left -= dt; updateTimer();
      if (R.timer.left <= 0) { R.timer = null; $('#timer').hidden = true; failQuest('時間到了。'); return; }
    }
    var pl = R.plan;
    if (pl && !R.ready) {
      if (pl.kind === 'reach' || pl.kind === 'escort') {
        var first = -1, i;
        for (i = 0; i < R.pts.length; i++) if (!R.pts[i].done) { first = i; break; }
        if (first >= 0) {
          var cand = pl.seq ? [first] : R.pts.map(function (_, k) { return k; }).filter(function (k) { return !R.pts[k].done; });
          cand.forEach(function (k) {
            var q = R.pts[k];
            if (Math.hypot(p.x - q.x, p.z - q.z) < (pl.kind === 'escort' ? 3 : 2.6)) { q.done = true; Sfx.sfx('pickup'); }
          });
          updateMarks();
          if (R.pts.every(function (x) { return x.done; })) { stepSuccess(); return; }
        }
      } else if (pl.kind === 'wave' && !R.waveStarted && R.pts[0] && Math.hypot(p.x - R.pts[0].x, p.z - R.pts[0].z) < 3.4) {
        if (G.beach && G.beach.medevac) { R.waveStarted = true; setTimeout(function () { if (R && R.plan === pl) stepSuccess(); }, 200); return; }
        startWaveNow(); return;
      } else if (pl.kind === 'wave' && R.rescueCarry) {
        R.carryT += dt;
        if (Math.hypot(p.x - BUNKER[0], p.z - BUNKER[1]) < 3) { rescueDone(true); return; }
        if (R.carryT > 28) { rescueDone(false); return; }
      } else if (pl.kind === 'carry' && R.phase === 2 && !pl.dstNpc) {
        if (Math.hypot(p.x - pl.dst.x, p.z - pl.dst.z) < 2.6) { R.phase = 3; deliver(); return; }
      }
    }
    if (trackAcc > 0.25) { trackAcc = 0; updateTrack(); }
  }

  /* ---------- 結果呈現（升級、事件、換日、結局） ---------- */
  function eventCard(ev, next) {
    var def = D.ev[ev.id] || {}, body = [];
    if (def.description) body.push(def.description);
    if (def.dialogue) { if (def.dialogue.start) body.push(def.dialogue.start); if (def.dialogue.end) body.push(def.dialogue.end); }
    var title = def.title || ev.id;
    if (ev.type === 'injury') { body.push('預計休養 ' + ev.days + ' 天。' + ((D.inj[ev.id] && D.inj[ev.id].blocks) ? '期間不能跑步或行軍。' : '')); }
    UI.card({ kicker: ev.type === 'injury' ? '受傷' : '事件', title: title, body: body, buttons: [{ t: '繼續', fn: next }], sfx: 'alarm' });
  }
  function presentOut(out, opt, done) {
    opt = opt || {};
    (out.msgs || []).forEach(function (m) { UI.toast(m, '', 3200); });
    if (!opt.noFx) UI.toastFx(out.fx);
    var seq = [];
    (out.ups || []).forEach(function (lv) {
      seq.push(function (n) { UI.card({ kicker: '升級', title: '升到 ' + lv + ' 級', body: ['軍階：' + E.rankOf(G) + '。獲得 1 點技能點，體力上限提高。到「技能」頁面把它用掉吧。'], buttons: [{ t: '繼續', fn: n }], sfx: 'levelup' }); });
    });
    (out.events || []).forEach(function (ev) { seq.push(function (n) { eventCard(ev, n); }); });
    if (opt.day && out.days && out.days.length) {
      var notes = [];
      out.days.forEach(function (d) { notes = notes.concat(d.note); });
      if (notes.length) UI.toast(notes.slice(-2).join('；'), '', 3600);
    }
    function step() {
      var f = seq.shift();
      if (f) { refreshHud(); f(step); return; }
      refreshHud();
      if (G.over) { endGameFlow(); return; }
      chapterCheck(function () { refreshMarks(); toneNow(); dressNow(); if (E.beachPending(G) && !beachBusy) { maybeStartBeach(); return; } done && done(); });
    }
    step();
  }
  function endGameFlow() {
    resetRunner(); phase = 'end';
    var id = G.ending || E.evalEnding(G), info = E.endingInfo(id);
    unlock(id);
    try { localStorage.removeItem(SAVE + 0); } catch (e) { /* ignore */ }
    busy++;
    UI.fade(true);
    setTimeout(function () {
      W.loadMap('exit', G.unit, !!G.flags.vol); mapNow = 'exit';
      var sp = W.spawn(); W.place(sp.x, sp.z - 2); dressNow(); W.setTone('day', true); W.setMode('end');
      showPlayUI(false); $('#joy').hidden = true;
      UI.fade(false);
      setTimeout(function () { busy--; showEnding(id, info); }, 400);
    }, 520);
  }
  function showEnding(id, info) {
    var bars = E.ATTRS.map(function (k) {
      var c = { b: 'var(--m-b)', m: 'var(--m-m)', d: 'var(--m-d)', o: 'var(--m-o)' }[k];
      return '<div class="stat"><span>' + E.ANAME[k] + '</span><div class="b"><u style="width:' + E.eff(G, k) + '%;background:' + c + '"></u></div><b>' + E.eff(G, k) + '</b></div>';
    }).join('');
    var all = E.allEndings(), u = unlocked();
    var bad = id.indexOf('bad_') === 0;
    var badges = G.badges.length ? '<h3>徽章</h3><div class="chips">' + G.badges.map(function (b) { return '<li class="ne">' + esc((D.tune.badges || {})[b] || b) + '</li>'; }).join('') + '</div>' : '';
    var vol = !!G.flags.vol;
    var epi = bad ? '這段經歷會成為你人生的一部分。重新開始，你會做出不一樣的選擇嗎？' :
      vol ? '簽約後的第一個新兵入伍日，' + G.name + '站在營門口，看著一群表情僵硬的年輕人拎著行李排成隊。想起自己的第一天，忽然笑了出來。' :
        '退伍後的第二年，信箱裡又出現一封掛號信。這次是「教育召集令」。' + G.name + '拿著信站在樓梯間，忽然笑了出來。';
    var html = '<p>' + esc(info.description) + '</p><div style="margin-top:10px">' + bars + '</div>' +
      '<p class="note">等級 ' + G.level + '（' + E.rankOf(G) + '）　完成任務 ' + G.stats.qDone + '　失敗 ' + G.stats.qFail + '　違規點數 ' + G.demerit + '　榮譽假 ' + G.honor + ' 天　薪餉 ' + G.money + ' 元</p>' + badges +
      '<p class="note" style="margin-top:10px">' + esc(epi) + '</p><p class="note">已解鎖結局 ' + u.length + ' / ' + all.length + '</p>';
    Sfx.sfx(bad ? 'fail' : 'levelup');
    UI.card({ kicker: '結局 · 第 ' + Math.min(G.day, 365) + ' 天', title: info.title, body: [html], html: true, buttons: [{ t: '再服一次役', cls: 'go', fn: title }, { t: '查看結局圖鑑', fn: function () { endingsBook(function () { showEnding(id, info); }); } }] });
  }
  function endingsBook(back) {
    var u = unlocked(), html = '';
    E.allEndings().forEach(function (e) {
      var t = D.endText[e.id] || {};
      html += '<div class="item"><div class="d"><b>' + (u.indexOf(e.id) >= 0 ? esc(e.n) : '？？？') + '</b><small>' + (u.indexOf(e.id) >= 0 ? esc(t.description || '') : '尚未解鎖') + '</small></div></div>';
    });
    UI.card({ kicker: '結局圖鑑', title: '已解鎖 ' + u.length + ' / ' + E.allEndings().length, body: [html], html: true, buttons: [{ t: '返回', fn: back }] });
  }

  /* ---------- NPC 與接任務 ---------- */
  function questDialogue(q) { return E.questStart(G, q) || q.description; }
  function acceptDialog(q, npcId) {
    var name = npcId ? npcName(npcId) : npcName(gv(q));
    var objs = q.objectives.map(function (o, i) { return (i + 1) + '. ' + objText(o); }).join('\n');
    UI.dialog({
      name: name, lines: [questDialogue(q), '【' + (q.type === 'main' ? '主線' : '支線') + '任務】' + qTitle(q) + '\n' + q.description, '目標：\n' + objs + '\n\n獎勵：' + rewardText(q)],
      choices: [{ t: '接受任務', cls: 'go', fn: function () { doAccept(q); } }, { t: '再想想', fn: function () { } }]
    });
  }
  function doAccept(q) {
    if (!E.accept(G, q.id)) { UI.toast('同時最多只能接 4 個任務，或條件不符。'); return; }
    Sfx.sfx('confirm'); UI.toast('接受任務：' + qTitle(q));
    G.track = q.id;
    startTracked(); refreshHud();
  }
  function npcInteract(id) {
    if (R && R.plan && !R.ready) {
      var pl = R.plan;
      if (pl.kind === 'talk') {
        var k = -1; R.pts.forEach(function (p, i) { if (k < 0 && p.npc === id && !p.done) k = i; });
        if (k >= 0) { talkStep(k); return; }
      }
      if (pl.kind === 'carry' && R.phase === 2 && pl.dstNpc && pl.dst.npc === id) { R.phase = 3; deliver(); return; }
    }
    var rq = E.activeQuests(G).filter(function (q) { return E.qstate(G, q.id) === 'ready' && gv(q) === id; })[0];
    if (rq) { W.faceNpc(id); turnIn(rq, false); return; }
    W.faceNpc(id);
    var N = D.npc[id] || {}, name = npcName(id);
    var avail = E.listAvailable(G).filter(function (q) { return gv(q) === id; });
    var blocked = D.qList.filter(function (q) {
      if (gv(q) !== id) return false;
      var a = E.availability(G, q);
      return !a.ok && a.reason && /^(需要|薪餉不足|太累|冷卻|受傷|禁閉|住院)|不能/.test(a.reason);
    });
    var choices = [];
    avail.forEach(function (q) { choices.push({ t: (q.type === 'main' ? '【主線】' : '【支線】') + qTitle(q), cls: 'go', fn: function () { acceptDialog(q, id); } }); });
    blocked.forEach(function (q) { choices.push({ t: '（' + E.availability(G, q).reason + '）' + qTitle(q), cls: 'dim', keep: true, fn: function () { UI.toast(E.availability(G, q).reason); } }); });
    if (id === 'npc_auntie') choices.push({ t: '買東西', fn: openShop });
    choices.push({
      t: '聊聊', fn: function () {
        var out = E.newOut(), g = E.talkNpc(G, id, out);
        var l = N.lines && N.lines.length ? N.lines[Math.floor(Math.random() * N.lines.length)] : GEN_TALK[0];
        UI.dialog({ name: name, lines: ['「' + String(l).replace(/^「|」$/g, '') + '」'].concat(g ? [g] : []), btn: '好', done: function () { refreshHud(); } });
      }
    });
    choices.push({ t: '離開', fn: function () { } });
    var greet = N.role ? name + '（' + N.role + '）' : name;
    UI.dialog({ name: greet, lines: [(N.personality ? '（' + N.personality + '）' : '') + '\n' + '「' + (N.lines && N.lines[0] ? String(N.lines[0]).replace(/^「|」$/g, '') : '有事嗎？') + '」'], choices: choices });
  }
  function boardMenu() {
    var qs = boardQuests();
    var choices = qs.map(function (q) { return { t: '【' + (q.type === 'main' ? '主線' : '支線') + '】' + qTitle(q) + '（來自' + npcName(gv(q)) + '）', cls: 'go', fn: function () { acceptDialog(q, gv(q)); } }; });
    choices.push({ t: '離開', fn: function () { } });
    UI.dialog({ name: '布告欄', lines: [qs.length ? '貼著幾張通知與來信，有幾件事需要你去處理。' : '布告欄上目前沒有新的通知。'], choices: choices });
  }
  function phoneCall() {
    if (G.items.it_phonecard) {
      var out = E.newOut(); E.useItem(G, 'it_phonecard', out);
      UI.dialog({ name: '電話亭', lines: ['你插入電話卡，撥了回家的號碼。', '媽媽：「有吃飯嗎？衣服帶夠沒？」你聽著聽著，心裡暖了起來。'], btn: '掛斷', done: function () { UI.toastFx(out.fx); refreshHud(); } });
    } else UI.dialog({ name: '電話亭', lines: ['需要電話卡才能打電話。福利社有賣。'], btn: '好' });
  }

  /* ---------- 睡覺與快轉 ---------- */
  function bedMenu() {
    var nx = E.nextQuestDay(G), choices = [];
    choices.push({ t: '睡覺，結束今天（第 ' + G.day + ' 天 ' + E.PERIODS[G.period] + '）', cls: 'go', fn: function () { sleepFlow('night'); } });
    if (nx) choices.push({ t: '快轉到第 ' + nx.day + ' 天（下一個任務：' + qTitle(nx.q) + '）', fn: function () { sleepFlow('skip', nx.day - G.day); } });
    else choices.push({ t: '快轉到退伍日（第 365 天）', fn: function () { sleepFlow('skip', 365 - G.day); } });
    if (G.honor >= 1 && G.day >= 31) choices.push({ t: '請榮譽假回家放一天（剩 ' + G.honor + ' 天）', fn: function () { sleepFlow('leave'); } });
    choices.push({ t: '存檔', fn: function () { saveGame(1); } });
    choices.push({ t: '離開', fn: function () { } });
    var avail = E.listAvailable(G).length;
    UI.dialog({ name: '休息', lines: ['現在是第 ' + G.day + ' 天' + E.PERIODS[G.period] + '。' + (avail ? '還有 ' + avail + ' 件任務可以接。' : '目前沒有可接的任務。') + '\n睡一覺會恢復體力與疲勞；過日子也會累積日常訓練經驗。'], choices: choices });
  }
  function sleepFlow(kind, n) {
    var d0 = G.day, out = E.newOut();
    busy++; UI.fade(true);
    UI.fadeText(kind === 'skip' ? '日子一天一天過去…' : kind === 'leave' ? '請了榮譽假，回家放鬆一天…' : '熄燈號響了，一天結束…', true);
    resetRunner();
    setTimeout(function () {
      if (kind === 'night') E.sleep(G, out);
      else if (kind === 'leave') E.takeLeave(G, out);
      else { for (var i = 0; i < n && !G.over; i++) { E.skipDays(G, 1, out); if (out.events.length) break; } }
      var notes = {}, order = [];
      out.days.forEach(function (d) { d.note.forEach(function (t) { var key = t.replace(/\d+/g, 'N'); if (!notes[key]) { notes[key] = { t: t, c: 0 }; order.push(key); } notes[key].c++; }); });
      var body = ['第 ' + d0 + ' 天 → 第 ' + G.day + ' 天（' + (G.day - d0) + ' 天過去了）'];
      order.slice(0, 8).forEach(function (k) { body.push(notes[k].t + (notes[k].c > 1 ? '（共 ' + notes[k].c + ' 次）' : '')); });
      (out.msgs || []).slice(0, 4).forEach(function (m) { body.push(m); });
      UI.fadeText('', false);
      setTimeout(function () {
        busy--; UI.fade(false);
        saveGame(0, true);
        var after = function () {
          presentOut(out, { noFx: true }, function () {
            if (G.over) return;
            var moved = syncMap(function () { startTracked(); });
            if (!moved) { toneNow(); startTracked(); }
          });
        };
        if (G.over && out.events.length === 0) { endGameFlow(); return; }
        UI.card({ kicker: kind === 'skip' ? '快轉' : '新的一天', title: '第 ' + G.day + ' 天', body: body, fx: out.fx, buttons: [{ t: '繼續', fn: after }] });
        refreshHud();
      }, 600);
    }, 700);
  }

  /* ---------- 面板：任務日誌 ---------- */
  function openPanel(which) {
    if (!G || busy) return;
    Sfx.sfx('open');
    ({ journal: journalPanel, bag: bagPanel, skills: skillsPanel, char: charPanel, menu: menuPanel }[which] || journalPanel)('');
  }
  function journalPanel(tab) {
    tab = tab || 'active';
    if (!UI.panelOpen()) UI.panel('任務日誌', function () { W.setMode('world'); });
    UI.panelTabs([['active', '進行中'], ['avail', '可接'], ['done', '紀錄']], tab, journalPanel);
    var h = '';
    if (tab === 'active') {
      var act = E.activeQuests(G);
      if (!act.length) h = '<p class="note">目前沒有進行中的任務。到「可接」分頁看看哪裡可以接任務。</p>';
      act.forEach(function (q) {
        var st = G.quests[q.id], isTrack = G.track === q.id;
        h += '<div class="qcard' + (isTrack ? ' tr' : '') + '"><h4><span class="tag ' + q.type + '">' + (q.type === 'main' ? '主線' : '支線') + '</span>' + esc(qTitle(q)) + (isTrack ? '（追蹤中）' : '') + '</h4>' +
          '<div class="note">第 ' + q.chapter + ' 章 · 期限第 ' + q.dayRange[1] + ' 天 · 委託人：' + esc(npcName(gv(q))) + '</div><p>' + esc(q.description) + '</p><ul>' +
          q.objectives.map(function (o, i) { return '<li class="' + (i < st.step ? 'done' : i === st.step && st.state === 'active' ? 'cur' : '') + '">' + esc(objText(o)) + '</li>'; }).join('') + '</ul>' +
          (st.state === 'ready' ? '<p class="note">目標已完成，回去找「' + esc(npcName(gv(q))) + '」回報。</p>' : '') +
          '<div class="note">獎勵：' + esc(rewardText(q)) + '</div><div class="row"><button data-a="track" data-q="' + q.id + '"' + (isTrack ? ' disabled' : '') + '>追蹤</button><button data-a="drop" data-q="' + q.id + '">放棄任務</button></div></div>';
      });
    } else if (tab === 'avail') {
      var av = E.listAvailable(G);
      if (!av.length) h += '<p class="note">現在沒有可接的任務。時間過去、章節推進，或抽到單位之後，會有新的任務出現。</p>';
      av.forEach(function (q) {
        var present = W.hasNpc(gv(q));
        h += '<div class="qcard"><h4><span class="tag ' + q.type + '">' + (q.type === 'main' ? '主線' : '支線') + '</span>' + esc(qTitle(q)) + '</h4>' +
          '<div class="note">期限第 ' + q.dayRange[1] + ' 天 · ' + (present ? '在這裡找「' + esc(npcName(gv(q))) + '」' : (where(gv(q)) ? '到布告欄接取（來自' + esc(npcName(gv(q))) + '）' : '到布告欄接取')) + '</div>' +
          '<p>' + esc(q.description) + '</p><div class="note">獎勵：' + esc(rewardText(q)) + '</div></div>';
      });
      var blocked = D.qList.filter(function (q) {
        var a = E.availability(G, q);
        return !a.ok && a.reason && /^(需要|薪餉不足|太累|冷卻|受傷|禁閉|住院)|不能/.test(a.reason);
      });
      if (blocked.length) {
        h += '<h3>暫時不能接</h3>';
        blocked.forEach(function (q) { h += '<div class="qcard"><h4>' + esc(qTitle(q)) + '</h4><div class="note">' + esc(E.availability(G, q).reason) + '</div></div>'; });
      }
    } else {
      var rec = D.qList.filter(function (q) { var s = E.qstate(G, q.id); return s === 'done' || s === 'failed' || s === 'expired'; });
      if (!rec.length) h = '<p class="note">還沒有任何紀錄。</p>';
      rec.forEach(function (q) {
        var s = E.qstate(G, q.id);
        h += '<div class="qcard"><h4>' + esc(qTitle(q)) + '</h4><div class="note">' + ({ done: '已完成', failed: '失敗', expired: '錯過' }[s]) + ' · 第 ' + q.chapter + ' 章</div></div>';
      });
      var reps = Object.keys(G.rep);
      if (reps.length) h += '<h3>可重複任務</h3>' + reps.map(function (id) { return '<div class="note">' + esc(D.q[id].title) + '：已完成 ' + G.rep[id].n + ' 次，目前獎勵 ' + Math.round(E.repMult(G, id) * 100) + '%</div>'; }).join('');
    }
    var b = UI.panelBody(h);
    b.querySelectorAll('button[data-a]').forEach(function (el) {
      el.addEventListener('click', function () {
        Sfx.sfx('click');
        var qid = el.dataset.q;
        if (el.dataset.a === 'track') { G.track = qid; UI.closePanel(); startTracked(); }
        else { E.abandon(G, qid); if (R && R.q.id === qid) resetRunner(); if (G.track === qid) startTracked(); UI.toast('放棄了任務'); journalPanel('active'); refreshMarks(); }
      });
    });
  }
  /* ---------- 面板：背包 ---------- */
  function bagPanel(tab) {
    if (!UI.panelOpen()) UI.panel('背包與裝備', function () { W.setMode('world'); refreshHud(); });
    UI.panelTabs(null);
    var h = '<p class="note">背包 ' + E.bagUsed(G) + ' / ' + E.bagSize() + ' 格　薪餉 ' + G.money + ' 元' + (G.carry ? '　搬運中：' + esc(G.carry.name) : '') + '</p><h3>裝備</h3><div class="grid2">';
    var slots = { head: '頭部', body: '身上', feet: '腳部', accessory: '配件', weapon: '武器' };
    D.rpg.items.equipSlots.forEach(function (sl) {
      var id = G.equip[sl], it = id && D.items[id];
      h += '<div class="slot"><b>' + slots[sl] + '</b>' + (it ? esc(it.name) + '<small class="note"> ' + esc(effText(it.effect) || '無加成') + '</small>' : '（空）') + (it ? '<div class="row"><button data-a="un" data-s="' + sl + '">卸下</button></div>' : '') + '</div>';
    });
    h += '</div><h3>物品</h3>';
    var ids = Object.keys(G.items);
    if (!ids.length) h += '<p class="note">背包是空的。福利社可以用薪餉買東西。</p>';
    ids.forEach(function (id) {
      var it = D.items[id], eq = G.equip[it.slot] === id;
      var desc = it.type === 'equip' ? effText(it.effect) : effText(it.use) + (it.risk ? '（有 ' + it.risk.caughtChance + '% 被抓，記違規 ' + it.risk.demerit + ' 點）' : '');
      h += '<div class="item"><div class="d"><b>' + esc(it.name) + (G.items[id] > 1 ? ' ×' + G.items[id] : '') + '</b><small>' + esc(desc || '') + (it.note ? '　' + esc(it.note) : '') + '</small></div>' +
        (it.type === 'equip' ? '<button class="btn" style="width:auto" data-a="eq" data-i="' + id + '"' + (eq ? ' disabled' : '') + '>' + (eq ? '已裝備' : '裝備') + '</button>' : '<button class="btn" style="width:auto" data-a="use" data-i="' + id + '">使用</button>') + '</div>';
    });
    var b = UI.panelBody(h);
    b.querySelectorAll('button[data-a]').forEach(function (el) {
      el.addEventListener('click', function () {
        Sfx.sfx('click');
        var a = el.dataset.a;
        if (a === 'un') E.unequip(G, el.dataset.s);
        else if (a === 'eq') E.equip(G, el.dataset.i);
        else if (a === 'use') {
          var out = E.newOut(); E.useItem(G, el.dataset.i, out); UI.toastFx(out.fx); (out.msgs || []).forEach(function (m) { UI.toast(m); });
          var q = R; void q;
          if (out.events.length) { UI.closePanel(); presentOut(out, { noFx: true }, function () { }); return; }
        }
        dressNow(); refreshHud(); bagPanel();
      });
    });
  }
  /* ---------- 面板：技能 ---------- */
  function skillsPanel() {
    if (!UI.panelOpen()) UI.panel('技能', function () { W.setMode('world'); refreshHud(); });
    UI.panelTabs(null);
    var h = '<p>可用技能點：<b style="color:var(--brass)">' + G.sp + '</b>　<span class="note">每升一級得 1 點，每個技能最多 3 級（單位專屬最多 2 級）。</span></p>';
    D.rpg.skills.list.forEach(function (sk) {
      var rk = E.skillRank(G, sk.id), ok = E.skillAvailable(G, sk.id), un = sk.unit ? D.units[sk.unit].name : null;
      h += '<div class="qcard"><h4>' + esc(sk.name) + '　' + '●'.repeat(rk) + '○'.repeat(sk.maxRank - rk) + '</h4><div class="note">每級：' + esc(effText(sk.perRank)) + (un ? '　（' + esc(un) + '專屬' + (ok ? '' : '，需抽到該單位') + '）' : '') + '</div>' +
        '<div class="row"><button data-s="' + sk.id + '"' + (G.sp > 0 && ok && rk < sk.maxRank ? '' : ' disabled') + ' class="go">升級</button></div></div>';
    });
    var b = UI.panelBody(h);
    b.querySelectorAll('button[data-s]').forEach(function (el) {
      el.addEventListener('click', function () {
        var out = E.newOut();
        if (E.learnSkill(G, el.dataset.s, out)) { Sfx.sfx('levelup'); (out.msgs || []).forEach(function (m) { UI.toast(m); }); }
        var top = $('#pBody').scrollTop; refreshHud(); skillsPanel(); $('#pBody').scrollTop = top;
      });
    });
  }
  /* ---------- 面板：角色 ---------- */
  function charPanel() {
    if (!UI.panelOpen()) UI.panel('角色', function () { W.setMode('world'); });
    UI.panelTabs(null);
    var h = '<div class="qcard"><h4>' + esc(G.name) + '　Lv' + G.level + '　' + esc(E.rankOf(G)) + '</h4><div class="note">' + esc(D.tune.backgrounds[G.bg].n) + (G.unit ? '　單位：' + esc(D.units[G.unit].name) : '　單位：尚未分發') + (G.flags.vol ? '　已簽志願役' : G.flags.declined ? '　不簽志願役' : '') + '</div>';
    var colors = { b: 'var(--m-b)', m: 'var(--m-m)', d: 'var(--m-d)', o: 'var(--m-o)' };
    E.ATTRS.forEach(function (k) {
      var bonus = E.eff(G, k) - G.a[k];
      h += '<div class="stat"><span>' + E.ANAME[k] + '</span><div class="b"><u style="width:' + E.eff(G, k) + '%;background:' + colors[k] + '"></u></div><b>' + E.eff(G, k) + '</b></div>' + (bonus ? '<div class="note" style="margin:-3px 0 0 3.4em">含裝備加成 ' + (bonus > 0 ? '+' : '') + bonus + '</div>' : '');
    });
    var hm = E.hpMax(G), xn = E.xpNeed(G);
    h += '<h3>狀態</h3><p>體力 ' + G.hp + ' / ' + hm + '　疲勞 ' + G.fatigue + ' / 100' + (E.fatiguePenalty(G) ? '（判定 ' + E.fatiguePenalty(G) + '%）' : '') + '</p>' +
      '<p>經驗 ' + G.xp + (xn ? '（下一級還差 ' + (xn - E.xpInLevel(G)) + '）' : '（已滿級）') + '</p>' +
      '<p>薪餉 ' + G.money + ' 元　榮譽假 ' + G.honor + ' 天　違規點數 ' + G.demerit + ' / 10</p>' +
      '<p class="note">違規 3 點：輔導長約談；6 點：禁閉；10 點：移送法辦。</p>';
    if (G.injury) h += '<p style="color:var(--bad)">傷病：' + esc(D.inj[G.injury.id].name) + '，還要 ' + G.injury.left + ' 天。</p>';
    if (G.badges.length) h += '<h3>徽章</h3><div class="chips">' + G.badges.map(function (b) { return '<li class="ne">' + esc((D.tune.badges || {})[b] || b) + '</li>'; }).join('') + '</div>';
    var aff = Object.keys(G.aff);
    if (aff.length) h += '<h3>人脈（好感度）</h3>' + aff.map(function (id) { return '<div class="note">' + esc(npcName(id)) + '：' + G.aff[id] + ' / 100</div>'; }).join('');
    h += '</div>';
    UI.panelBody(h);
  }
  /* ---------- 面板：福利社 ---------- */
  function openShop() {
    if (!G) return;
    if (!UI.panelOpen()) UI.panel('福利社', function () { W.setMode('world'); refreshHud(); });
    UI.panelTabs(null);
    var h = '<p class="note">薪餉 ' + G.money + ' 元　背包 ' + E.bagUsed(G) + ' / ' + E.bagSize() + ' 格</p>';
    E.shopList().forEach(function (it) {
      var have = G.items[it.id] || 0, canBuy = G.money >= it.price && (have || E.bagUsed(G) < E.bagSize()) && !(it.type === 'equip' && have);
      h += '<div class="item"><div class="d"><b>' + esc(it.name) + (have ? '（持有 ' + have + '）' : '') + '</b><small>' + esc(it.type === 'equip' ? effText(it.effect) : effText(it.use)) + (it.note ? '　' + esc(it.note) : '') + '</small></div>' +
        '<button class="btn" style="width:auto" data-i="' + it.id + '"' + (canBuy ? '' : ' disabled') + '>' + it.price + ' 元</button></div>';
    });
    var b = UI.panelBody(h);
    b.querySelectorAll('button[data-i]').forEach(function (el) {
      el.addEventListener('click', function () {
        var r = E.buy(G, el.dataset.i);
        UI.toast(r.msg, r.ok ? 'up' : 'dn'); if (r.ok) Sfx.sfx('coin'); else Sfx.sfx('cancel');
        var top = $('#pBody').scrollTop; refreshHud(); dressNow(); openShop(); $('#pBody').scrollTop = top;
      });
    });
  }
  /* ---------- 面板：選單 ---------- */
  function menuPanel() {
    if (!UI.panelOpen()) UI.panel('選單', function () { W.setMode('world'); });
    UI.panelTabs(null);
    var h = '<h3>存檔</h3>';
    [1, 2, 3].forEach(function (s) { h += '<div class="item"><div class="d"><b>欄位 ' + s + '</b><small>' + esc(saveInfo(readSave(s))) + '</small></div><button class="btn" style="width:auto" data-sv="' + s + '">存檔</button></div>'; });
    var au = readSave(0);
    h += '<div class="item"><div class="d"><b>自動存檔</b><small>' + esc(saveInfo(au)) + '（每次完成任務與過夜時更新）</small></div></div>';
    h += '<h3>設定</h3><div class="item"><div class="d"><b>音效</b><small>用瀏覽器即時合成，不需要音檔</small></div><button class="btn" style="width:auto" id="mt">' + (Sfx.isMuted() ? '已靜音' : '開啟中') + '</button></div>';
    h += '<h3>操作說明</h3><p class="note">移動：左下搖桿，或電腦 W A S D／方向鍵。轉視角：拖曳畫面。互動：右下按鈕，或按 E／空白鍵。找頭上有「!」的人接任務，「?」表示可以回報。到寢室休息、過日子。</p>';
    h += '<h3>結局</h3><div class="row"><button data-a="book">結局圖鑑（' + unlocked().length + ' / ' + E.allEndings().length + '）</button></div>';
    h += '<h3>其他</h3><div class="row"><button data-a="title">回到標題畫面</button></div>';
    var b = UI.panelBody(h);
    b.querySelectorAll('[data-sv]').forEach(function (el) { el.addEventListener('click', function () { var t = $('#pBody').scrollTop; saveGame(+el.dataset.sv); menuPanel(); $('#pBody').scrollTop = t; }); });
    $('#mt').addEventListener('click', function () { Sfx.setMuted(!Sfx.isMuted()); syncMute(); var t = $('#pBody').scrollTop; menuPanel(); $('#pBody').scrollTop = t; });
    b.querySelector('[data-a="book"]').addEventListener('click', function () { UI.closePanel(); endingsBook(function () { }); });
    b.querySelector('[data-a="title"]').addEventListener('click', function () {
      UI.closePanel();
      UI.card({ kicker: '確認', title: '回到標題畫面？', body: ['未存檔的進度會遺失（自動存檔不受影響）。'], buttons: [{ t: '回到標題', fn: title }, { t: '取消' }] });
    });
  }
  function syncMute() { $('#mute').textContent = Sfx.isMuted() ? '音效關' : '音效開'; }

  /* ---------- 新遊戲、標題、讀檔 ---------- */
  function title() {
    phase = 'title'; G = null; R = null; busy = 0;
    UI.closeCard(); UI.closeDialog(); UI.closePanel(); MG.abort(); FPS.stop(true); document.body.classList.remove('combat'); beachBusy = false;
    showPlayUI(false); $('#hold').hidden = true; holdOn = false;
    cleanupStep();
    W.loadMap('camp1', 'infantry', false); mapNow = 'camp1';
    W.place(0, -8); W.S.px = 0; W.S.pz = -8;
    var C = ['#4a78a8', '#3a4258'];
    W.dress('c-title', { shirt: C[0], pants: C[1], hair: '#2a2220', skin: '#e2b48c', shoes: '#e8e8e8' });
    W.setTone('day', true); W.setMode('title'); W.setSheet(0);
    UI.fade(false); UI.fadeText('', false);
    var bgs = D.tune.backgrounds, u = unlocked().length, total = E.allEndings().length;
    var saves = [0, 1, 2, 3].map(function (s) { return { s: s, d: readSave(s) }; }).filter(function (x) { return x.d; });
    var latest = saves.sort(function (a, b) { return (b.d.t || 0) - (a.d.t || 0); })[0];
    var extra = '<div class="tagcard"><div class="no">中華民國國軍 · 義務役</div><h1>阿兵哥日記</h1><p>從一封入伍通知，到一張退伍令。<br>三百六十五天，接任務、練本事、扛後果。</p></div>' +
      '<label class="field" for="nm">你的名字</label><input class="text" id="nm" maxlength="6" value="' + esc(lastName) + '" autocomplete="off">' +
      '<label class="field">入伍前，你是…</label><div class="bgs">' + Object.keys(bgs).map(function (k) {
        return '<label class="bgcard' + (k === lastBg ? ' on' : '') + '"><input type="radio" name="bg" id="bg-' + k + '" value="' + k + '"' + (k === lastBg ? ' checked' : '') + '><b>' + bgs[k].n + '</b><span>' + bgs[k].hint + '　體能' + bgs[k].s.b + ' 士氣' + bgs[k].s.m + ' 軍紀' + bgs[k].s.d + ' 袍澤' + bgs[k].s.o + '</span></label>';
      }).join('') + '</div><p class="note" style="text-align:center;margin-top:10px">已解鎖結局 ' + u + ' / ' + total + '</p>';
    var btns = [{ t: '開始新遊戲', cls: 'go', fn: function () { var nm = ($('#nm').value || '').trim().slice(0, 6) || '王小明'; var r = document.querySelector('input[name="bg"]:checked'); lastName = nm; lastBg = r ? r.value : 'uni'; newGame(lastName, lastBg); } }];
    if (latest) btns.push({ t: '繼續遊戲　' + saveInfo(latest.d), fn: function () { loadGame(latest.s); } });
    if (saves.length) btns.push({ t: '讀取存檔…', fn: loadMenu });
    btns.push({ t: '結局圖鑑', fn: function () { endingsBook(title); } });
    UI.card({ title: '', body: [extra], html: true, buttons: btns });
    var cards = document.querySelectorAll('#cIn .bgcard');
    cards.forEach(function (c) { c.querySelector('input').addEventListener('change', function () { cards.forEach(function (x) { x.classList.toggle('on', x.querySelector('input').checked); }); }); });
    $('#cIn h2').hidden = true;
  }
  function loadMenu() {
    var h = '';
    [0, 1, 2, 3].forEach(function (s) { var d = readSave(s); h += '<div class="item"><div class="d"><b>' + (s ? '欄位 ' + s : '自動存檔') + '</b><small>' + esc(saveInfo(d)) + '</small></div>' + (d ? '<button class="btn" style="width:auto" data-l="' + s + '">讀取</button>' : '') + '</div>'; });
    UI.card({ kicker: '讀取存檔', title: '選擇存檔', body: [h], html: true, buttons: [{ t: '返回', fn: title }] });
    document.querySelectorAll('#cIn [data-l]').forEach(function (el) { el.addEventListener('click', function () { UI.closeCard(); loadGame(+el.dataset.l); }); });
  }
  function startPlay(cb) {
    phase = 'play'; showPlayUI(true); lastTalk = null;
    lastChapter = E.chapterOfDay(G.day);
    if (cb) cb();
  }
  function newGame(name, bg) {
    G = E.newState(name, bg);
    UI.closeCard(); startPlay();
    enterMap('home', { text: '' }, function () {
      UI.card({
        kicker: '第 1 章', title: '平民', body: [D.story.chapters[0].summary,
          '操作：左下搖桿（或 W A S D）移動，拖曳畫面轉視角，右下按鈕（或 E／空白鍵）互動。\n找頭上有「!」的人接任務，到寢室休息來過日子。屬性、技能、裝備都會影響判定的成功率。'],
        buttons: [{ t: '出發', fn: function () { startTracked(); } }]
      });
    });
    saveGame(0, true);
  }
  function loadGame(slot) {
    var d = readSave(slot);
    if (!d) { UI.toast('找不到存檔'); title(); return; }
    G = d.G; G.flags = G.flags || {}; G.carry = null;
    UI.closeCard(); startPlay();
    enterMap(d.map && STATIC[d.map] ? d.map : E.baseMap(G), { pos: d.pos, text: '讀取存檔…' }, function () { applyFlagWorld(); if (E.beachPending(G)) { maybeStartBeach(); return; } startTracked(); UI.toast('讀取完成'); });
  }


  /* ================= 漢光：海岸（強制章節） ================= */
  var beachBusy = false, BUNKER = [-10, -5.95];
  var ZONES = { wave1: { x: -10, z: -6, r: 32 }, wave2: { x: 6, z: -14, r: 44 }, wave3: { x: -31, z: 8, r: 28 }, wave4: { x: -10, z: -6, r: 32 } };
  var ANCHORS = { wave1: BUNKER, wave2: null, wave3: [-29.4, 10.5], wave4: BUNKER };
  function applyFlagWorld() { W.npcFilter = function (id) { return !G || E.npcPresent(G, id); }; }
  function beachMode(on) { document.body.classList.toggle('combat', !!on); if (on) $('#act').hidden = true; }
  function blackRadio(lines, cb) {
    busy++; UI.fade(true);
    var i = 0, gap = MG.auto ? 260 : 2400;
    setTimeout(function next() {
      if (i >= lines.length) {
        UI.fadeText('', false);
        setTimeout(function () { UI.fade(false); setTimeout(function () { busy--; if (cb) cb(); }, 520); }, 260);
        return;
      }
      UI.fadeText(lines[i++], true); Sfx.sfx('radio'); setTimeout(next, gap);
    }, 820);
  }
  function maybeStartBeach() {
    if (beachBusy || !E.beachPending(G) || G.over) return false;
    beachBusy = true; resetRunner();
    var chap = D.beach ? D.beach.chapter : null, mobile = W.isMobileLike();
    function go(diff) {
      var aim = !!($('#aimChk') && $('#aimChk').checked);
      E.startBeach(G, { diff: diff, aim: aim }); G.track = 'ch4_beach_prep';
      Sfx.sfx('alarm');
      enterMap('beach', { text: '漢光演習 · 第 240 天\n海岸據點' }, function () {
        beachBusy = false; lastChapter = E.chapterOfDay(G.day);
        UI.dialog({ name: '漢光演習', lines: [D.q.ch4_beach_prep.dialogue.start], btn: '繼續', done: startTracked });
      });
    }
    UI.card({
      kicker: '第 240 天 · 漢光演習', title: '漢光：海岸',
      body: [(chap && chap.summary) || '漢光演習中海岸據點遭不明敵軍突襲。', '所有兵種都被調來支援海岸據點，這一章不能跳過。約一半是射擊，一半是劇情：平常是第三人稱，按「舉槍」才會切成第一人稱射擊。你可能在戰鬥中倒下，身邊的人也可能犧牲。', '選擇難度。硬派是預設：彈藥數不顯示、敵人更準、傷害更高。劇情向不會倒下。輔助瞄準可以隨時開關（硬派開輔助的經驗值打 9 折）。'],
      extra: '<label class="field" style="display:flex;gap:8px;align-items:center;color:var(--fg)"><input type="checkbox" id="aimChk"' + (mobile ? ' checked' : '') + '> 開啟輔助瞄準</label>',
      buttons: [{ t: '硬派（預設）', cls: 'go', fn: function () { go('hardcore'); } }, { t: '標準', fn: function () { go('standard'); } }, { t: '劇情向（不會倒下）', fn: function () { go('story'); } }], sfx: 'alarm'
    });
    return true;
  }
  function chainNext() {
    var q = E.beachNext(G);
    if (!q) { startTracked(); return; }
    E.accept(G, q.id); G.track = q.id;
    var line = E.questStart(G, q);
    if (line) UI.dialog({ name: '【' + qTitle(q) + '】', lines: [line], btn: '繼續', done: startTracked }); else startTracked();
  }
  function waveNum(id) { return +id.replace('wave', ''); }
  function setupWaveStep() {
    var pl = R.plan; R.waveStarted = false; R.rescueCarry = false;
    if (G.beach.medevac) {
      R.waveStarted = true;
      UI.toast('你在後送途中，這一波由其他人守住了。', '', 3000);
      setTimeout(function () { if (R && R.plan === pl) stepSuccess(); }, 500);
      return;
    }
    if (pl.wave !== 'wave1') spawnSupplies(pl);
    updateMarks();
    UI.toast('到定位後，戰鬥會自動開始。平常用第三人稱，按「舉槍」切成第一人稱射擊。', '', 4000);
  }
  function spawnSupplies(pl) {
    var n = 1 + Math.floor(Math.random() * 2), a = pl.pts[0];
    for (var i = 0; i < n; i++) {
      var f = W.freeSpot(a.x + (i ? 3.2 : -3.2), a.z + 3.4);
      W.addPickup(f[0], f[1], 'supply', 'pile');
    }
    UI.toast('補給箱送到了（每箱 +2 個彈匣），可以先去拿。', '', 3200);
  }
  function supplyPick(pk) {
    if (holdOn || busy) return;
    var b = G.beach; if (!b.ammo) b.ammo = { mag: 30, mags: Math.max(0, b.mags - 1) };
    hold('補給彈匣…', 2000, function () {
      W.removePickup(pk);
      b.ammo.mags = Math.min(D.fps.ammo.maxMags - 1, b.ammo.mags + D.fps.ammo.resupply.perCrate);
      if (FPS.active()) FPS.addMags(D.fps.ammo.resupply.perCrate);
      UI.toast('補到了彈匣', 'up');
    });
  }
  function startWaveNow() {
    var pl = R.plan, id = pl.wave, b = G.beach;
    if (b && b.medevac) { R.waveStarted = true; UI.toast('你在後送途中，這一波由其他人守住了。', '', 2800); setTimeout(function () { if (R && R.plan === pl) stepSuccess(); }, 400); return; }
    var info = E.waveEnemies(G, id), w = info.wave;
    R.waveStarted = true; W.setMarks([]);
    if (!b.ammo) b.ammo = { mag: 30, mags: Math.max(0, b.mags - 1) };
    R.snap = { hp: G.hp, ammo: { mag: b.ammo.mag, mags: b.ammo.mags }, saved: G.flags.saved_civilian, hurt: G.flags.civilian_hurt };
    var zone = ZONES[id];
    if (id === 'wave4' && b.cmd === 'fallback') zone = { x: 0, z: 14, r: 46 };
    beachMode(true); W.setMode('world');
    FPS.startWave({ id: id, num: waveNum(id), name: w.name, enemies: info.enemies, holdSec: w.holdSec || 0, zone: zone, anchor: ANCHORS[id], lin: id === 'wave3', mag: b.ammo.mag, mags: b.ammo.mags, carrying: !!pl.rescue, grace: id === 'wave1' ? 5 : 4 });
    if (pl.rescue) rescueStart();
  }
  function rescueStart() {
    var q = R.q;
    UI.dialog({
      name: '海邊阿伯', lines: [q.dialogue.start, '火線就在阿伯身後。揹他回碉堡，移動速度會慢 40%，而且是在子彈底下；或是喊他趴下，自己守住位置。阿伯不會陣亡，最多受傷。'],
      choices: [
        { t: '衝出去把阿伯背回來', cls: 'go', fn: function () { carryUncle(); } },
        { t: '大喊叫他趴下別動', fn: function () { stayDown(); } }
      ]
    });
  }
  function carryUncle() {
    var p = W.pos();
    W.hideNpc('npc_uncle_fisher', true);
    W.setFollowers([{ preset: 'gpa', name: '海邊阿伯' }], p.x, p.z);
    W.speed(0.6);
    R.rescueCarry = true; R.carryT = 0; FPS.setCarrying(true);
    W.setMarks([{ x: BUNKER[0], z: BUNKER[1] }]); R.target = { x: BUNKER[0], z: BUNKER[1] }; R.hint = '把阿伯背回碉堡'; updateTrack(true);
    UI.toast('把阿伯背回碉堡！（移動速度 −40%）', '', 3000);
  }
  function rescueDone(ok) {
    var out = E.newOut(), q = R.q;
    R.rescueCarry = false; W.speed(1); W.clearFollowers(); W.setMarks([]); FPS.setCarrying(false);
    if (ok) {
      G.flags.saved_civilian = 1; E.addAttr(G, 'o', 2, out, q.id); G.honor = Math.min(10, G.honor + 1);
      UI.toast('把阿伯背回碉堡了！', 'up'); Sfx.sfx('success');
      W.moveNpc('npc_uncle_fisher', -4.5, -3.2); W.hideNpc('npc_uncle_fisher', false);
    } else {
      G.hp = Math.max(1, G.hp - 25); E.inflictInjury(G, 'inj_sprain', out);
      UI.toast('腳下一滑，阿伯摔在地上，你也扭傷了腳踝', 'dn', 3600);
      W.moveNpc('npc_uncle_fisher', -4.5, -3.2); W.hideNpc('npc_uncle_fisher', false);
    }
    refreshHud(); W.place(BUNKER[0], BUNKER[1]); FPS.enterCover();
    if (out.events.length) presentOut(out, { noFx: true }, function () { });
  }
  function stayDown() {
    var out = E.newOut(), q = R.q;
    E.addAttr(G, 'd', 1, out, q.id);
    var hurt = E.civilianStay(G);
    UI.toast(hurt ? '阿伯沒能躲過流彈，腿受了傷（不會陣亡）' : '阿伯趴低躲過了這一輪火力', hurt ? 'dn' : 'up', 3200);
    W.place(BUNKER[0], BUNKER[1]); FPS.setCarrying(false); FPS.enterCover(); refreshHud();
  }

  function installBeachHooks() {
    FPS.init({
      G: function () { return G; },
      onKill: function () { var o = E.newOut(); E.beachKill(G, o); UI.hud(G); },
      onHp: function () { UI.hud(G); },
      onWaveEnd: waveEnded,
      onDesertion: desertion,
      onLinDown: function () { },
      carryTarget: function () { return R && R.rescueCarry ? { x: BUNKER[0], z: BUNKER[1] } : null; }
    });
  }
  /* 倒下 → 黑畫面與無線電 → 兩種選擇 */
  function waveDown(s) {
    var pl = R.plan, id = pl.wave;
    W.clearFollowers(); W.speed(1); R.rescueCarry = false;
    updateTrack(true);
    blackRadio(['（畫面轉暗）', '無線電：「……一名弟兄倒下了，重複，一名弟兄倒下了……」', '連長：「醫護兵，過去！其他人，守住！」'], function () {
      UI.dialog({
        name: '倒下', lines: ['你的視線慢慢暗下來，耳邊只剩無線電的雜訊。', '要怎麼辦？'],
        choices: [
          { t: '重玩這一波（回到這一波開頭，彈藥與體力恢復）', cls: 'go', fn: function () { retryWaveNow(id); } },
          { t: '受傷後送（劇情繼續，跳過剩下的波次；結局會受影響）', fn: function () { medevacNow(); } }
        ]
      });
    });
  }
  function retryWaveNow(id) {
    var pl = R.plan, b = G.beach;
    E.retryWave(G, id);
    G.hp = R.snap.hp; b.ammo = { mag: R.snap.ammo.mag, mags: R.snap.ammo.mags };
    G.flags.saved_civilian = R.snap.saved; G.flags.civilian_hurt = R.snap.hurt;
    if (!R.snap.saved) delete G.flags.saved_civilian; if (!R.snap.hurt) delete G.flags.civilian_hurt;
    W.hideNpc('npc_uncle_fisher', false);
    var a = pl.pts[0];
    busy++; UI.fade(true);
    setTimeout(function () {
      W.place(a.x, a.z); W.reviveCovers();
      UI.fade(false); setTimeout(function () { busy--; refreshHud(); R.waveStarted = false; startWaveNow(); }, 450);
    }, 600);
  }
  function medevacNow() {
    var out = E.newOut(), pl = R.plan;
    FPS.stop(true); beachMode(false); W.speed(1); W.setCrouch(false);
    E.medevac(G, out); W.clearFollowers(); W.hideNpc('npc_uncle_fisher', false);
    R.rescueCarry = false; R.waveStarted = true;
    refreshHud(); updateTrack(true);
    presentOut(out, { noFx: true }, function () { updateTrack(true); if (R && R.plan === pl) stepSuccess(); });
  }
  function waveEnded(how, s) {
    if (!R || !R.plan || R.plan.kind !== 'wave') { FPS.stop(true); beachMode(false); return; }
    var pl = R.plan, id = pl.wave, b = G.beach;
    b.ammo = { mag: s.mag, mags: s.mags };
    FPS.stop(true); beachMode(false); W.speed(1); W.setCrouch(false); W.clearFollowers(); R.rescueCarry = false; updateTrack(true);
    if (how === 'clear') {
      var out = E.newOut(); E.waveClear(G, id, out); UI.toastFx(out.fx); Sfx.sfx('success');
      UI.toast('第 ' + waveNum(id) + ' 波守住了', 'up', 2600); refreshHud();
      setTimeout(function () { if (R && R.plan === pl) stepSuccess(); }, 900);
    } else if (how === 'lin') {
      blackRadio(['（耳機裡只剩雜訊）', '小林倒在線盤旁。通訊沒有接通。'], function () { failQuest('小林重傷撤離（不會陣亡），通訊沒有接通，叫不到砲兵支援。'); });
    } else if (how === 'down') waveDown(s);
  }
  function desertion() {
    FPS.stop(true); beachMode(false); resetRunner(); W.speed(1);
    UI.card({
      kicker: '軍紀', title: '擅自撤離', body: ['你離開戰區超過 10 秒，而且沒有向上回報。', '連長在無線電裡只說了一句：「憲兵會處理。」'], buttons: [{
        t: '繼續', fn: function () {
          var out = E.newOut(); E.triggerEvent(G, 'event_court', out); presentOut(out, {}, function () { });
        }
      }], sfx: 'alarm'
    });
  }
  /* 劇情橋段 */
  function radioStep() {
    var q = R.q, pl = R.plan;
    Sfx.sfx('radio');
    UI.dialog({ name: '無線電', lines: [q.dialogue.progress, '小林：「通了！連長，請求砲兵支援！」', '連長（無線電）：「砲兵支援已出發，再撐一下。」'], btn: '繼續', done: function () { if (R && R.plan === pl) stepSuccess(); } });
  }
  function bdecideStep() {
    var w = R.plan.which;
    if (w === 'aid') aidDecide(); else if (w === 'command') cmdDecide(); else memorialDecide();
  }
  function aidDecide() {
    var q = R.q, pl = R.plan;
    UI.dialog({
      name: '阿凱', lines: [q.dialogue.start, q.description],
      choices: [
        {
          t: '放下槍幫他包紮', cls: 'go', fn: function () {
            W.setMode('ui');
            MG.run('first_aid', {}, function (raw) {
              if (!R || R.plan !== pl) return;
              var out = E.newOut(), res = E.minigameResult(G, q.id, 'first_aid', raw, out);
              G.beach.aidScore = res.score; G.beach.tough = false;
              UI.card({ kicker: '包紮止血', title: res.score >= 60 ? (res.score >= 85 ? '處理得很漂亮' : '血止住了') : '手忙腳亂', body: [q.dialogue.progress, '表現 ' + res.raw + ' 分，總分 ' + res.score + '（60 分以上阿凱只會受傷）。'], fx: out.fx, buttons: [{ t: '繼續', fn: function () { stepSuccess(); } }], sfx: res.score >= 60 ? 'success' : 'fail' });
            });
          }
        },
        { t: '叫他自己壓住，繼續射擊（阿凱陣亡機率 +' + ((D.tune.beach && D.tune.beach.akaiKia && D.tune.beach.akaiKia.tough) || 10) + '%）', fn: function () { G.beach.tough = true; G.beach.aidScore = null; E.addXp(G, 5, E.newOut()); UI.toast('阿凱咬著牙：「我、我自己來……」'); stepSuccess(); } }
      ]
    });
  }
  function cmdDecide() {
    if (G.beach) G.beach.wangDown = true; W.setNpcLying('npc_sgt_wang', true);
    var q = R.q, pl = R.plan, opts = q.objectives[0].options;
    UI.dialog({
      name: '代理指揮', lines: [q.dialogue.progress, '王班長倒在擔架上，所有人都在看你。選擇會改變敵人的數量，也會影響王班長的生死。'],
      choices: opts.map(function (o) {
        var tip = o.id === 'hold' ? '（敵人 ×1.0，軍紀 +2、榮譽假 +1）' : o.id === 'fallback' ? '（敵人 ×0.7，經無線電回報後退守第二線）' : '（敵人 ×1.2，經驗 ×1.3，體能 +2、袍澤 +1）';
        return {
          t: o.label + tip, cls: o.id === 'hold' ? 'go' : '', fn: function () {
            var out = E.newOut(); G.beach.cmd = o.id;
            if (o.id === 'hold') { E.addAttr(G, 'd', 2, out, q.id); G.honor = Math.min(10, G.honor + 1); }
            else if (o.id === 'fallback') { G.flags.beach_fallback = 1; }
            else { E.addAttr(G, 'b', 2, out, q.id); E.addAttr(G, 'o', 1, out, q.id); }
            UI.toastFx(out.fx); refreshHud();
            if (R && R.plan === pl) stepSuccess();
          }
        };
      })
    });
  }
  function memorialDecide() {
    var q = R.q, pl = R.plan;
    UI.dialog({
      name: qTitle(q), lines: [q.dialogue.progress],
      choices: [
        { t: '上台說幾句', cls: 'go', fn: function () { var out = E.newOut(); E.addAttr(G, 'm', 2, out, q.id); E.addAttr(G, 'o', 1, out, q.id); UI.toastFx(out.fx); if (R && R.plan === pl) stepSuccess(); } },
        { t: '默默敬禮', fn: function () { var out = E.newOut(); E.addAttr(G, 'm', 1, out, q.id); UI.toastFx(out.fx); if (R && R.plan === pl) stepSuccess(); } }
      ]
    });
  }
  function fateStep() {
    var q = R.q, pl = R.plan, out = E.newOut();
    if (pl.which === 'akai') {
      var res = E.akaiFate(G, G.beach.aidScore, !!G.beach.tough, out);
      if (res.kia) {
        W.hideNpc('npc_akai', true);
        blackRadio(['（黑畫面）', q.dialogue.fail.replace('［黑畫面］', ''), '「……阿凱。」'], function () { failQuest('阿凱沒有撐過來。'); });
      } else UI.dialog({ name: '阿凱', lines: [q.dialogue.complete], btn: '繼續', done: function () { if (R && R.plan === pl) stepSuccess(); } });
    } else {
      var rw = E.wangFate(G, out);
      W.setNpcLying('npc_sgt_wang', false);
      if (rw.kia) {
        W.hideNpc('npc_sgt_wang', true);
        blackRadio(['（黑畫面）', q.dialogue.fail.replace('［黑畫面］', ''), '連長：「……收到。所有人，繼續守住。」'], function () { if (R && R.plan === pl) stepSuccess(); });
      } else UI.dialog({ name: '王班長', lines: [q.dialogue.complete], btn: '繼續', done: function () { if (R && R.plan === pl) stepSuccess(); } });
    }
  }
  function chooseCrates() {
    var pl = R.plan;
    UI.dialog({
      name: '王班長', lines: [R.q.dialogue.start, '每搬一箱，稍後多 1 個彈匣，但疲勞 +8。目前疲勞 ' + G.fatigue + '，疲勞太高準心會晃得更厲害。要搬幾箱到碉堡？'],
      choices: [
        { t: '2 箱（建議）', cls: 'go', fn: function () { crateChosen(2); } }, { t: '4 箱（最多）', fn: function () { crateChosen(4); } },
        { t: '3 箱', fn: function () { crateChosen(3); } }, { t: '1 箱', fn: function () { crateChosen(1); } }, { t: '不搬', fn: function () { crateChosen(0); } }
      ]
    });
    void pl;
  }
  function crateChosen(n) {
    var pl = R.plan; R.crateChosen = true; pl.qty = n;
    if (n === 0) { G.beach.crates = 0; G.beach.mags = D.fps.ammo.startMagsBase; stepSuccess(); return; }
    setupCarry();
  }
  function crateDelivered() {
    var pl = R.plan, n = pl.qty;
    G.beach.crates = n; G.beach.mags = Math.min(D.fps.ammo.maxMags, D.fps.ammo.startMagsBase + n * D.fps.ammo.fromCarry.perCrate);
    var out = E.newOut(); E.addFatigue(G, n * D.fps.ammo.fromCarry.fatiguePerCrate, out, true); UI.toastFx(out.fx);
    UI.toast('碉堡裡現在有 ' + G.beach.mags + ' 個彈匣', 'up');
  }
  function radarReport(cb) {
    var q = R.q; Sfx.sfx('alarm');
    UI.dialog({ name: '無線電', lines: [q.dialogue.start, q.dialogue.progress], btn: '全員戰備', done: function () { Sfx.sfx('alarm'); cb(); } });
  }
  function rollCall(cb) {
    var q = R.q, lines = [q.dialogue.start, q.dialogue.progress], F = G.flags;
    lines.push(F.akai_kia ? '「阿凱。」……沒有人回答。' : '「阿凱！」「到……」他在擔架上舉起了手。');
    lines.push(F.sgt_wang_kia ? '「王班長。」……沒有人回答。' : '「王班長！」「……到。」他的聲音很小，但全連都聽見了。');
    if (F.civilian_hurt) lines.push('海邊阿伯坐在救護車旁，腿上包著紗布，對你揮了揮手。');
    UI.dialog({ name: '點名', lines: lines, btn: '繼續', done: cb });
  }
  function reliefSummary() {
    var F = G.flags, s = [];
    s.push(F.akai_kia ? '阿凱沒有回來。' : '阿凱活下來了，腿上留了傷。');
    s.push(F.sgt_wang_kia ? '王班長沒有撐過來。' : '王班長被送上直升機，活下來了。');
    s.push(F.saved_civilian ? '海邊阿伯被你揹回了碉堡。' : (F.civilian_hurt ? '阿伯受了傷，但還活著。' : '阿伯平安無事。'));
    s.push(F.radio_fixed ? '通訊接通，砲兵支援及時抵達。' : '通訊沒有接通，沒能叫到砲兵支援。');
    if (F.beach_hero) s.push('你被記了大功，連長說要在退伍那天公開表揚你。');
    return s;
  }

  /* ---------- 啟動 ---------- */
  function fatal(msg) {
    UI.card({ title: '載入失敗', body: [msg, '請確認是透過網頁伺服器（例如 GitHub Pages）開啟，而不是直接開啟檔案。'], buttons: [{ t: '重新載入', fn: function () { location.reload(); } }] });
  }
  function initWorld() {
    var ok = W.init($('#gl'), {
      onNear: function () { updateAct(); },
      onInteractKey: function () { if (!overlays()) W.interact(); },
      onPickup: onPickup, onTick: onTick,
      onFrame: function (dt) { FPS.update(dt); }, onCombatKey: function (c) { FPS.onKey(c); },
      onFireDown: function () { FPS.fireDown(); }, onFireUp: function () { FPS.fireUp(); }, onAim: function (dx, dy, t) { FPS.onAim(dx, dy, t); },
      onAds: function (v) { FPS.setAds(v); }, onAimJoy: function (x, y, dt) { FPS.onAimJoy(x, y, dt); },
      onStep: function () { Sfx.sfx('step'); },
      onLost: function () { $('#lost').hidden = false; },
      onRestored: function () { $('#lost').hidden = true; rebuildInteract(); }
    });
    return ok;
  }
  function bindUi() {
    $('#act').addEventListener('click', function () { Sfx.ensure(); Sfx.sfx('click'); W.interact(); });
    document.querySelectorAll('#side button[data-p]').forEach(function (b) { b.addEventListener('click', function () { Sfx.ensure(); openPanel(b.dataset.p); }); });
    $('#mute').addEventListener('click', function () { Sfx.ensure(); Sfx.setMuted(!Sfx.isMuted()); syncMute(); Sfx.sfx('click'); });
    $('#pClose').addEventListener('click', function () { Sfx.sfx('cancel'); UI.closePanel(); });
    $('#track').addEventListener('click', function () { openPanel('journal'); });
    $('#glRetry').addEventListener('click', function () { location.reload(); });
    document.addEventListener('pointerdown', function () { Sfx.ensure(); }, { once: true });
    window.addEventListener('keydown', function (e) { if (e.code === 'Escape') { if (UI.panelOpen()) UI.closePanel(); else if (phase === 'play' && !overlays()) openPanel('menu'); } });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { W.pause(); Sfx.suspend(); } else { W.resume(); Sfx.resume(); }
    });
    syncMute();
    setInterval(function () {
      if (phase === 'play' && W.ok) {
        var ov = overlays();
        if (!ov && W.S.mode === 'ui') { W.setMode(W.S.fps.on ? 'fps' : 'world'); }
        else if (ov && (W.S.mode === 'world' || W.S.mode === 'fps')) W.setMode('ui');
        updateAct();
      }
    }, 120);
    if ('visualViewport' in window) window.visualViewport.addEventListener('resize', function () { var el = document.activeElement; if (el && el.tagName === 'INPUT') el.scrollIntoView({ block: 'center' }); });
  }
  function boot() {
    bindUi();
    var files = ['story', 'rpg-system', 'tuning', 'fps-system', 'story_beach'];
    Promise.all(files.map(function (f) { return fetch('data/' + f + '.json').then(function (r) { if (!r.ok) throw new Error(f); return r.json(); }); })).then(function (a) {
      E.init(a[0], a[1], a[2], { fps: a[3], beach: a[4] }); D = E.data(); D.beach = a[4]; W.story = D.story;
      if (!initWorld()) { $('#glerr').hidden = false; return; }
      installBeachHooks(); applyFlagWorld();
      if (/[?&]auto=1/.test(location.search)) { MG.auto = true; FPS.bot = 'aim'; }
      title();
    }).catch(function (e) { fatal('資料檔讀取失敗（' + (e && e.message) + '）。'); });
  }

  /* 測試用介面 */
  root.__game = {
    get G() { return G; }, get R() { return R; }, FPS: FPS, startTracked: function () { startTracked(); }, beachStart: function () { return maybeStartBeach(); }, blackRadio: blackRadio, E: E, P: P, W: W, MG: MG, UI: UI,
    phase: function () { return phase; }, map: function () { return mapNow; }, busy: function () { return busy + (overlays() ? 1 : 0); },
    overlays: overlays, track: trackTarget, save: saveGame, load: loadGame, title: title,
    auto: function (v) { MG.auto = !!v; },
    teleport: function (x, z) { W.place(x, z); },
    near: function () { return W.S.near; },
    interact: function () { W.interact(); },
    inter: function () { return (W.S.inter || []).map(function (i) { return { x: i.x, z: i.z, label: i.label, prompt: i.prompt }; }); },
    holdOn: function () { return holdOn; },
    renderer: function () { return W.renderer && W.renderer(); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof self !== 'undefined' ? self : this);
