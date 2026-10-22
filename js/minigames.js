/* 小遊戲：以通用的計時、點擊、節奏玩法實作。每個小遊戲回報 0-100 的原始表現分，加成與判定由 Engine 處理。 */
(function (root) {
  'use strict';
  var M = { auto: false, active: null };
  var $ = function (s) { return document.querySelector(s); };
  function sfx(n, a) { if (root.Sfx) root.Sfx.sfx(n, a); }
  function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  var INFO = {
    pushup: ['伏地挺身', '十秒內狂點「壓」。越快越好。'],
    shooting: ['實彈射擊', '準心會晃動。看準時機按「擊發」，共三發，環數越高越好。'],
    lottery: ['抽籤', '伸手抽一張籤，決定下部隊的單位。'],
    fold_blanket: ['折棉被（豆腐乾）', '每一折，都要在指標經過中間綠區的瞬間按下「折」。共五折。'],
    rifle_assembly: ['步槍分解結合', '依提示的順序，點選正確的零件，限時內完成結合。點錯會扣分。'],
    fire_calc: ['射擊諸元計算', '依題目算出正確的數值，選出答案。每題限時。'],
    inventory_count: ['庫存清點', '貨架只會亮幾秒。記住指定顏色的箱子有幾個，然後作答。'],
    duty_roster: ['勤務排班', '依每個人的需求，把四個人排進四個班次。排得越多人滿意，分數越高。'],
    cooking: ['伙房幫廚', '記住食材下鍋的順序，然後照順序點一遍。越來越長。'],
    essay: ['寫心得（莒光作文）', '每一段挑一句最誠懇、最有內容的話。四段寫完交卷。'],
    rehab: ['復健', '慢慢來。指標通過綠色區域時按下「用力」。次數依任務而定。'],
    rope_coil: ['收纜繩', '看準節奏，在指標進入綠區時按「收」，纜繩收得整齊才能過關。'],
    military_song: ['軍歌比賽', '音符落到底線時，按下對應的按鈕（鍵盤可用 A S D F）。'],
    gun_commands: ['砲班口令', '口令的節奏要準。音符落到底線時，按下對應的按鈕（鍵盤可用 A S D F）。'],
    dress_up: ['緊急著裝', '依序點選裝備，在時限內穿戴完畢。點錯會扣時間。'],
    emplace_gun: ['砲兵放列', '依序完成放列步驟，在時限內完成。點錯會扣時間。'],
    watch_duty: ['值更警戒', '光點亮起時快點按下去。不要漏掉太多。'],
    lights_out: ['熄燈後潛行', '按住「前進」往床位移動；值星官轉頭看時要立刻放開。被抓到三次就失敗。'],
    duty_officer_patrol: ['躲過值星官', '按住「前進」往目標移動；值星官轉頭看時要立刻放開。被抓到三次就失敗。'],
    first_aid: ['包紮止血', '阿凱的腿在流血！依序點選：止血帶 → 加壓 → 包紮。限時 15 秒，點錯會扣時間。'],
    load_magazines: ['壓彈與上膛', '連點「壓彈」把子彈一顆一顆壓進彈匣，兩個彈匣都壓滿才算完成。限時 120 秒。'],
    objective: ['守住目標', '敵情光點出現時趕快點掉它，不要讓它們靠近。漏掉太多就失守。'],
    position: ['守住陣地', '敵情光點出現時趕快點掉它，不要讓它們靠近。漏掉太多就失守。']
  };
  var VARIANT_ENGINE = {
    pushup: 'mash', shooting: 'shoot', lottery: 'lottery', fold_blanket: 'meter', rifle_assembly: 'ordered', fire_calc: 'calc',
    inventory_count: 'count', duty_roster: 'assign', cooking: 'memory', essay: 'essay', rehab: 'meter', rope_coil: 'meter',
    military_song: 'rhythm', gun_commands: 'rhythm', dress_up: 'ordered', emplace_gun: 'ordered', watch_duty: 'targets',
    first_aid: 'ordered', load_magazines: 'load', lights_out: 'stealth', duty_officer_patrol: 'stealth', objective: 'targets', position: 'targets'
  };

  var host, cardT, cardD, cardA, cardS, curCleanup, alive = false, finishCb = null;

  function build() {
    host = $('#mg');
    cardT = $('#mgT'); cardD = $('#mgD'); cardA = $('#mgA'); cardS = $('#mgS');
  }
  function close() {
    alive = false;
    if (curCleanup) { try { curCleanup(); } catch (e) { /* ignore */ } curCleanup = null; }
    host.hidden = true; cardA.innerHTML = ''; M.active = null;
  }
  function btn(txt, cls, fn) {
    var b = document.createElement('button');
    b.className = cls || 'mg-btn'; b.textContent = txt; b.type = 'button';
    b.addEventListener('click', function (e) { e.preventDefault(); fn(e); });
    return b;
  }
  function onTap(el, fn) {
    el.addEventListener('pointerdown', function (e) { e.preventDefault(); fn(e); });
    el.addEventListener('click', function (e) { if (e.detail === 0) fn(e); });
  }

  /* 對外：開始一個小遊戲 */
  M.run = function (id, opts, cb) {
    if (!host) build();
    opts = opts || {};
    var info = INFO[id] || [id, ''];
    var eng = VARIANT_ENGINE[id];
    if (!eng) { cb(60, {}); return; }
    finishCb = cb; alive = true; M.active = id;
    host.hidden = false; host.scrollTop = 0;
    cardT.textContent = info[0]; cardD.textContent = info[1]; cardA.innerHTML = ''; cardS.textContent = '';
    var api = {
      area: cardA, opts: opts, id: id,
      stat: function (t) { cardS.textContent = t; },
      alive: function () { return alive; },
      cleanup: function (f) { var old = curCleanup; curCleanup = function () { if (old) old(); f(); }; },
      done: function (raw, msg, extra) {
        if (!alive) return;
        alive = false;
        cardS.textContent = msg || '';
        sfx(raw >= 60 ? 'success' : 'fail');
        setTimeout(function () {
          var c = finishCb; finishCb = null; close();
          if (c) c(clamp(Math.round(raw), 0, 100), extra || {});
        }, M.auto ? 80 : 1100);
      }
    };
    var start = btn('開始', 'mg-btn mg-go', function () { start.remove(); sfx('confirm'); ENG[eng](api); });
    cardA.appendChild(start);
    if (M.auto) setTimeout(function () { if (start.parentNode) start.click(); }, 30);
    setTimeout(function () { if (start.parentNode) start.focus(); }, 50);
  };
  M.abort = function () { if (alive) { finishCb = null; close(); } };

  var ENG = {};

  /* 連點 */
  ENG.mash = function (api) {
    var n = 0, t0 = 0, done = false;
    api.area.innerHTML = '<div class="mg-count" id="mgN">0</div><div class="mg-timer"><u id="mgTm"></u></div>';
    var b = btn('壓', 'mg-big', function () {});
    api.area.appendChild(b);
    var cnt = $('#mgN'), tm = $('#mgTm');
    api.stat('點一下開始計時，十秒內越快越好');
    function loop(now) {
      if (done || !api.alive()) return;
      var e = (now - t0) / 10000;
      tm.style.transform = 'scaleX(' + Math.max(0, 1 - e) + ')';
      if (e >= 1) { done = true; api.done(n * 1.8, '時間到！共 ' + n + ' 下'); return; }
      requestAnimationFrame(loop);
    }
    function tap() {
      if (done) return;
      if (!t0) { t0 = performance.now(); api.stat('壓！壓！壓！'); requestAnimationFrame(loop); }
      n++; cnt.textContent = n; sfx('hit');
    }
    onTap(b, tap);
    if (M.auto) { var iv = setInterval(function () { if (done || !api.alive()) clearInterval(iv); else { tap(); tap(); } }, 50); api.cleanup(function () { clearInterval(iv); }); }
  };

  /* 射擊 */
  ENG.shoot = function (api) {
    var sway = api.opts.sway || 1;
    api.area.innerHTML = '<div class="mg-range" id="rg"><i class="mg-cross" id="cr"></i></div>';
    var fb = btn('擊發', 'mg-fire', function () {});
    api.area.appendChild(fb);
    var rg = $('#rg'), cr = $('#cr'), shot = 0, total = 0, t = 0, u = 0, v = 0, run = true, last = performance.now();
    api.stat('已射 0 / 3　累計 0 環');
    function step(now) {
      if (!run || !api.alive()) return;
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      t += dt * (1 + shot * 0.25) * sway;
      u = Math.sin(t * 1.7) * 0.95; v = Math.sin(t * 2.3 + 1.1) * 0.95;
      cr.style.left = (50 + u * 50) + '%'; cr.style.top = (50 + v * 50) + '%';
      if (M.auto && Math.hypot(u, v) < 0.28) fire();
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    function fire() {
      if (!run) return;
      var d = Math.hypot(u, v), pts = Math.max(0, 10 - Math.floor(d * 10));
      total += pts; shot++; sfx('shot');
      var h = document.createElement('i'); h.className = 'mg-hole';
      h.style.left = (50 + u * 50) + '%'; h.style.top = (50 + v * 50) + '%'; rg.appendChild(h);
      api.stat('已射 ' + shot + ' / 3　累計 ' + total + ' 環（這發 ' + pts + ' 環）');
      if (shot >= 3) { run = false; fb.disabled = true; api.done(total * 3.5, '三發共 ' + total + ' 環'); }
      else if (M.auto) { last = performance.now(); t += 0.7; }
    }
    onTap(fb, fire);
  };

  /* 抽籤 */
  ENG.lottery = function (api) {
    api.area.innerHTML = '<div class="mg-slips" id="slips"></div>';
    var box = $('#slips'), picked = false, i;
    for (i = 0; i < 3; i++) {
      (function () {
        var b = btn('籤', 'mg-slip', function () {
          if (picked) return; picked = true; sfx('confirm');
          b.textContent = '展開…';
          setTimeout(function () {
            var r = api.opts.onDraw ? api.opts.onDraw() : { name: '?', vibe: '' };
            api.area.innerHTML = '<p class="mg-big-text">紙條上寫著：「' + r.name + '」</p><p class="mg-note">' + r.vibe + '</p>';
            api.done(100, '抽籤完成', r);
          }, M.auto ? 30 : 700);
        });
        box.appendChild(b);
      })();
    }
    api.stat('三張籤，隨便挑一張');
    if (M.auto) setTimeout(function () { if (box.firstChild) box.firstChild.click(); }, 30);
  };

  /* 指標停綠區（折棉被、收纜繩、復健） */
  ENG.meter = function (api) {
    var cfg = { fold_blanket: { n: 5, spd: 0.9, zone: 0.07 }, rope_coil: { n: 4, spd: 1.1, zone: 0.08 }, rehab: { n: Math.max(1, api.opts.count || 3), spd: 0.6, zone: 0.1 } }[api.id];
    var n = cfg.n, k = 0, pos = 0, dir = 1, scores = [], run = true, last = performance.now();
    api.area.innerHTML = '<div class="mg-meter"><i class="mg-zone" style="left:' + (50 - cfg.zone * 100) + '%;width:' + (cfg.zone * 200) + '%"></i><i class="mg-needle" id="nd"></i></div>';
    var b = btn({ fold_blanket: '折', rope_coil: '收', rehab: '用力' }[api.id], 'mg-fire', function () {});
    api.area.appendChild(b);
    var nd = $('#nd');
    api.stat('第 1 / ' + n + ' 次');
    function step(now) {
      if (!run || !api.alive()) return;
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      pos += dir * dt * cfg.spd * (1 + k * 0.12);
      if (pos > 1) { pos = 1; dir = -1; } else if (pos < 0) { pos = 0; dir = 1; }
      nd.style.left = (pos * 100) + '%';
      if (M.auto && Math.abs(pos - 0.5) < 0.012) press();
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    function press() {
      if (!run) return;
      var d = Math.abs(pos - 0.5), s = clamp(1 - (d - 0.03) / 0.3, 0, 1) * 100;
      scores.push(s); k++; sfx(s >= 60 ? 'confirm' : 'cancel');
      api.stat('第 ' + Math.min(k + 1, n) + ' / ' + n + ' 次　上一次 ' + Math.round(s) + ' 分');
      if (k >= n) { run = false; b.disabled = true; var avg = scores.reduce(function (a, c) { return a + c; }, 0) / n; api.done(avg, '平均 ' + Math.round(avg) + ' 分'); }
      else if (M.auto) { pos = 0; dir = 1; }
    }
    onTap(b, press);
  };

  /* 依序點選 */
  var ORDER = {
    rifle_assembly: { items: ['槍機', '複進簧', '槍管護木', '彈匣', '槍托', '照門', '準星', '保險'], limit: 60, t: '依序結合：' },
    dress_up: { items: ['內衣', '迷彩褲', '軍靴', '迷彩上衣', '腰帶', '鋼盔'], limit: 22, t: '依序穿戴：' },
    first_aid: { items: ['止血帶', '加壓', '包紮'], limit: 15, t: '依序處置：' },
    emplace_gun: { items: ['卸下砲衣', '展開架腳', '架設砲身', '調整方位', '裝定射角', '裝填準備'], limit: 24, t: '依序放列：' }
  };
  ENG.ordered = function (api) {
    var cfg = ORDER[api.id], seq = cfg.items.slice(), order = shuffle(seq), k = 0, errs = 0, t0 = performance.now(), left = cfg.limit, run = true;
    api.area.innerHTML = '<div class="mg-prompt" id="pr"></div><div class="mg-timer"><u id="tm"></u></div><div class="mg-grid" id="gr"></div>';
    var gr = $('#gr'), pr = $('#pr'), tm = $('#tm');
    function prompt() { pr.textContent = cfg.t + '第 ' + (k + 1) + ' 步　' + seq[k]; }
    order.forEach(function (name) {
      var b = btn(name, 'mg-cell', function () {
        if (!run || b.disabled) return;
        if (name === seq[k]) { b.disabled = true; b.classList.add('ok'); k++; sfx('pickup'); if (k >= seq.length) finish(true); else prompt(); }
        else { errs++; t0 -= 2500; sfx('cancel'); b.classList.add('bad'); setTimeout(function () { b.classList.remove('bad'); }, 250); }
      });
      b.dataset.name = name; gr.appendChild(b);
    });
    prompt();
    api.stat('錯誤 0 次');
    var iv = setInterval(function () {
      if (!run || !api.alive()) { clearInterval(iv); return; }
      var e = (performance.now() - t0) / 1000; tm.style.transform = 'scaleX(' + Math.max(0, 1 - e / cfg.limit) + ')';
      api.stat('錯誤 ' + errs + ' 次　剩 ' + Math.max(0, Math.ceil(cfg.limit - e)) + ' 秒');
      if (e >= cfg.limit) finish(false);
    }, 100);
    api.cleanup(function () { clearInterval(iv); });
    function finish(ok) {
      run = false; clearInterval(iv);
      var e = (performance.now() - t0) / 1000;
      if (!ok) { api.done(Math.max(15, 55 - (seq.length - k) * 6), '時間到了…'); return; }
      var frac = clamp(1 - e / cfg.limit, 0, 1), raw = 55 + frac * 55 - errs * 4;
      api.done(raw, '完成！用了 ' + Math.round(e) + ' 秒，錯 ' + errs + ' 次');
    }
    if (M.auto) {
      var bi = setInterval(function () {
        if (!run || !api.alive()) { clearInterval(bi); return; }
        var target = gr.querySelector('[data-name="' + seq[k] + '"]'); if (target) target.click();
      }, 25);
      api.cleanup(function () { clearInterval(bi); });
    }
  };

  /* 壓彈：連點把兩個彈匣壓滿 */
  ENG.load = function (api) {
    var need = 60, n = 0, t0 = performance.now(), lim = 120000, done = false;
    api.area.innerHTML = '<div class="mg-count" id="mgN">0 / 60</div><div class="mg-timer"><u id="mgTm"></u></div>';
    var b = btn('壓彈', 'mg-big', function () {});
    api.area.appendChild(b);
    var cnt = $('#mgN'), tm = $('#mgTm');
    api.stat('第 1 個彈匣（30 發）');
    function loop() {
      if (done || !api.alive()) return;
      var e = (performance.now() - t0) / lim;
      tm.style.transform = 'scaleX(' + Math.max(0, 1 - e) + ')';
      if (e >= 1) { done = true; api.done(Math.max(20, 40 + n), '時間到了…只壓了 ' + n + ' 發'); return; }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    function tap() {
      if (done) return;
      n++; cnt.textContent = n + ' / ' + need; sfx('hit');
      api.stat(n < 30 ? '第 1 個彈匣（' + n + '/30）' : '第 2 個彈匣（' + (n - 30) + '/30）');
      if (n >= need) { done = true; var sec = (performance.now() - t0) / 1000; api.done(clamp(100 - Math.max(0, sec - 14) * 1.2, 62, 100), '兩個彈匣都壓滿了，用了 ' + Math.round(sec) + ' 秒'); }
    }
    onTap(b, tap);
    if (M.auto) { var iv = setInterval(function () { if (done || !api.alive()) clearInterval(iv); else for (var k = 0; k < 6; k++) tap(); }, 40); api.cleanup(function () { clearInterval(iv); }); }
  };

  /* 選擇題（射擊諸元計算） */
  ENG.calc = function (api) {
    var qs = [], k = 0, ok = 0, i, tmo = null;
    for (i = 0; i < 5; i++) {
      var dist = rnd(12, 36) * 100, base = rnd(8, 30), per = rnd(1, 3), wind = rnd(1, 9), kind = i % 3;
      var q, ans;
      if (kind === 0) { q = '目標距離 ' + dist + ' 公尺。基準仰角 ' + base + ' 密位，每增加 100 公尺加 ' + per + ' 密位（自 1000 公尺起算）。仰角應為多少密位？'; ans = base + Math.floor((dist - 1000) / 100) * per; }
      else if (kind === 1) { q = '風偏 ' + wind + ' 公尺/秒，每 1 公尺/秒需修正 ' + per + ' 密位，向右偏。方向應向左修正幾密位？'; ans = wind * per; }
      else { var x = rnd(3, 9), y = rnd(2, 8); q = '同一個目標觀測員報告了 ' + x + ' 次，每次修正 ' + y + ' 密位，累計共需修正多少密位？'; ans = x * y; }
      var opts = [ans], g = 0;
      while (opts.length < 4 && g++ < 50) { var c = ans + rnd(-9, 9); if (c > 0 && opts.indexOf(c) < 0) opts.push(c); }
      qs.push({ q: q, a: ans, o: shuffle(opts) });
    }
    function show() {
      var Q = qs[k];
      api.area.innerHTML = '<div class="mg-prompt">第 ' + (k + 1) + ' / 5 題</div><p class="mg-q">' + Q.q + '</p><div class="mg-timer"><u id="tm"></u></div><div class="mg-opts" id="op"></div>';
      var op = $('#op'), tm = $('#tm'), t0 = performance.now(), lim = 14000, answered = false;
      Q.o.forEach(function (v) {
        var b = btn(String(v), 'mg-cell', function () {
          if (answered) return; answered = true; clearInterval(tmo);
          if (v === Q.a) { ok++; sfx('confirm'); b.classList.add('ok'); } else { sfx('cancel'); b.classList.add('bad'); }
          setTimeout(next, M.auto ? 20 : 450);
        });
        b.dataset.ok = v === Q.a ? '1' : '0'; op.appendChild(b);
      });
      tmo = setInterval(function () {
        if (!api.alive()) { clearInterval(tmo); return; }
        var e = performance.now() - t0; tm.style.transform = 'scaleX(' + Math.max(0, 1 - e / lim) + ')';
        if (e >= lim && !answered) { answered = true; clearInterval(tmo); sfx('cancel'); next(); }
      }, 100);
      if (M.auto) setTimeout(function () { var c = op.querySelector('[data-ok="1"]'); if (c) c.click(); }, 20);
      api.stat('答對 ' + ok + ' 題');
    }
    function next() { k++; if (k >= qs.length) api.done(ok / qs.length * 100, '答對 ' + ok + ' / ' + qs.length + ' 題'); else show(); }
    api.cleanup(function () { clearInterval(tmo); });
    show();
  };

  /* 記憶＋計數（庫存清點） */
  ENG.count = function (api) {
    var COLORS = [['紅', '#d9503a'], ['藍', '#3f7fb5'], ['黃', '#e2bb4f'], ['綠', '#5ea05a']];
    var round = 0, ok = 0, tmo = null;
    function nextRound() {
      if (round >= 3) { api.done(ok / 3 * 100, '答對 ' + ok + ' / 3 輪'); return; }
      var target = COLORS[rnd(0, 3)], cells = [], cnt = 0, i;
      for (i = 0; i < 20; i++) { var c = COLORS[rnd(0, 3)]; if (c === target) cnt++; cells.push(c); }
      if (cnt === 0) { cells[0] = target; cnt = 1; }
      api.area.innerHTML = '<p class="mg-q">記住「' + target[0] + '色」箱子的數量</p><div class="mg-shelf" id="sh">' +
        cells.map(function (c) { return '<i style="background:' + c[1] + '"></i>'; }).join('') + '</div>';
      api.stat('第 ' + (round + 1) + ' / 3 輪，貨架即將收起來');
      tmo = setTimeout(function () {
        if (!api.alive()) return;
        var opts = [cnt], g = 0;
        while (opts.length < 4 && g++ < 40) { var v = cnt + rnd(-3, 3); if (v >= 0 && opts.indexOf(v) < 0) opts.push(v); }
        api.area.innerHTML = '<p class="mg-q">「' + target[0] + '色」箱子有幾個？</p><div class="mg-opts" id="op"></div>';
        shuffle(opts).forEach(function (v) {
          var b = btn(String(v), 'mg-cell', function () {
            if (v === cnt) { ok++; sfx('confirm'); } else if (Math.abs(v - cnt) === 1) { ok += 0.4; sfx('tick'); } else sfx('cancel');
            round++; setTimeout(nextRound, M.auto ? 10 : 300);
          });
          b.dataset.ok = v === cnt ? '1' : '0'; $('#op').appendChild(b);
        });
        if (M.auto) setTimeout(function () { var c = $('#op [data-ok="1"]'); if (c) c.click(); }, 20);
      }, M.auto ? 40 : 3500);
    }
    api.cleanup(function () { clearTimeout(tmo); });
    nextRound();
  };

  /* 排班 */
  ENG.assign = function (api) {
    var P = ['阿凱', '老周', '小蕭', '你的同梯'], S = ['早班', '午班', '晚班', '夜哨'], perm = shuffle([0, 1, 2, 3]), stm = [], i, j;
    for (i = 0; i < 4; i++) {
      var s = perm[i];
      stm.push({ p: i, s: s, want: true, text: P[i] + '想排' + S[s] });
      var other = [0, 1, 2, 3].filter(function (x) { return x !== s; });
      var t = other[rnd(0, 2)];
      stm.push({ p: i, s: t, want: false, text: P[i] + '不能排' + S[t] });
    }
    var sel = null, asg = {};
    api.area.innerHTML = '<ul class="mg-list">' + stm.map(function (x) { return '<li>' + x.text + '</li>'; }).join('') + '</ul><div class="mg-opts" id="pp"></div><div class="mg-opts" id="ss"></div>';
    var pp = $('#pp'), ss = $('#ss'), pb = [], sb = [];
    function refresh() {
      pb.forEach(function (b, k) { b.className = 'mg-cell' + (sel === k ? ' sel' : '') + (asg[k] != null ? ' ok' : ''); b.textContent = P[k] + (asg[k] != null ? '→' + S[asg[k]] : ''); });
      sb.forEach(function (b, k) { var used = Object.keys(asg).some(function (p) { return asg[p] === k; }); b.className = 'mg-cell' + (used ? ' ok' : ''); });
    }
    P.forEach(function (n, k) { var b = btn(n, 'mg-cell', function () { sel = k; sfx('click'); refresh(); }); pb.push(b); pp.appendChild(b); });
    S.forEach(function (n, k) {
      var b = btn(n, 'mg-cell', function () {
        if (sel == null) return;
        Object.keys(asg).forEach(function (p) { if (asg[p] === k) delete asg[p]; });
        asg[sel] = k; sel = null; sfx('pickup'); refresh();
      });
      sb.push(b); ss.appendChild(b);
    });
    var sub = btn('交班表', 'mg-btn mg-go', function () {
      if (Object.keys(asg).length < 4) { api.stat('還有人沒排班'); sfx('cancel'); return; }
      var sat = 0;
      stm.forEach(function (x) { if ((asg[x.p] === x.s) === x.want) sat++; });
      api.done(sat / stm.length * 100 * 1.0, '滿足 ' + sat + ' / ' + stm.length + ' 項需求');
    });
    api.area.appendChild(sub);
    refresh();
    api.stat('先點人，再點班次');
    if (M.auto) setTimeout(function () { for (j = 0; j < 4; j++) { asg[j] = perm[j]; } refresh(); sub.click(); }, 30);
  };

  /* 記憶順序（伙房幫廚） */
  ENG.memory = function (api) {
    var ING = [['高麗菜', '#7fb05a'], ['紅蘿蔔', '#e08a3a'], ['豬肉', '#d9867a'], ['豆腐', '#e8e2c8']];
    var lens = [3, 4, 5], r = 0, correct = 0, total = lens.reduce(function (a, c) { return a + c; }, 0), tmo = [], seq, input, locked = true;
    api.area.innerHTML = '<p class="mg-q" id="mq"></p><div class="mg-grid" id="gr"></div>';
    var gr = $('#gr'), mq = $('#mq'), bs = [];
    ING.forEach(function (it, k) {
      var b = btn(it[0], 'mg-cell', function () { press(k); }); b.style.borderColor = it[1]; bs.push(b); gr.appendChild(b);
    });
    function flash(k, on) { bs[k].classList.toggle('sel', on); }
    function play() {
      locked = true; input = [];
      seq = []; for (var i = 0; i < lens[r]; i++) seq.push(rnd(0, 3));
      mq.textContent = '看清楚食材下鍋的順序（第 ' + (r + 1) + ' / 3 輪，共 ' + lens[r] + ' 個）';
      var gap = M.auto ? 15 : 650;
      seq.forEach(function (k, i) {
        tmo.push(setTimeout(function () { flash(k, true); sfx('note', k); }, 500 + i * gap));
        tmo.push(setTimeout(function () { flash(k, false); }, 500 + i * gap + gap * 0.6));
      });
      tmo.push(setTimeout(function () { locked = false; mq.textContent = '換你了，照順序點一遍'; if (M.auto) bot(); }, 500 + seq.length * gap + 100));
    }
    function bot() { seq.forEach(function (k, i) { tmo.push(setTimeout(function () { bs[k].click(); }, 10 + i * 8)); }); }
    function press(k) {
      if (locked) return;
      sfx('note', k);
      if (k === seq[input.length]) { input.push(k); correct++; if (input.length === seq.length) { locked = true; r++; tmo.push(setTimeout(nextRound, M.auto ? 10 : 500)); } }
      else { locked = true; sfx('cancel'); mq.textContent = '順序錯了！'; r++; tmo.push(setTimeout(nextRound, M.auto ? 10 : 700)); }
      api.stat('正確 ' + correct + ' / ' + total);
    }
    function nextRound() { if (r >= lens.length) api.done(correct / total * 100, '做對了 ' + correct + ' / ' + total + ' 個步驟'); else play(); }
    api.cleanup(function () { tmo.forEach(clearTimeout); });
    play();
  };

  /* 心得作文 */
  var ESSAY = [
    ['開頭', ['入伍第一個月，我發現自己最大的改變，是學會了準時。', '當兵很累，不過還好啦。', '我覺得軍隊是一個很偉大的地方，國家需要我們。']],
    ['經過', ['有一次夜行軍，同袍的腳起水泡，我們一起放慢腳步，最後全班一起到達。', '訓練很多，每天都很忙，然後一天就過了。', '班長常常罵人，但是我覺得他很辛苦。']],
    ['反省', ['我發現自己遇到困難時，會先想怎麼靠自己，也學到開口求助不丟臉。', '以後我要更努力，更加努力，繼續努力。', '希望下次可以不要被罵。']],
    ['結尾', ['接下來的日子，我想把每個細節做好，因為這是我能為這個團體做的事。', '以上是我的心得，謝謝大家。', '當兵使我成長，成長使我進步，進步使我快樂。']]
  ];
  ENG.essay = function (api) {
    var k = 0, pts = 0;
    function show() {
      var E = ESSAY[k], idx = shuffle([0, 1, 2]);
      api.area.innerHTML = '<div class="mg-prompt">第 ' + (k + 1) + ' / 4 段：' + E[0] + '</div><div class="mg-sent" id="se"></div>';
      idx.forEach(function (i) {
        var b = btn(E[1][i], 'mg-sentence', function () {
          pts += 2 - i; sfx('click'); k++;
          if (k >= 4) api.done(pts / 8 * 100, '心得寫完了'); else show();
        });
        b.dataset.ok = i === 0 ? '1' : '0';
        $('#se').appendChild(b);
      });
      api.stat('目前這份心得已有 ' + k + ' 段');
      if (M.auto) setTimeout(function () { var c = api.area.querySelector('[data-ok="1"]'); if (c) c.click(); }, 20);
    }
    show();
  };

  /* 節奏 */
  ENG.rhythm = function (api) {
    var LANES = ['預備', '放', '穩', '收'], KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF'];
    if (api.id === 'military_song') LANES = ['團', '結', '就', '是'];
    var FALL = 1.5, N = 20, notes = [], i, t0 = 0, run = true, hits = 0, score = 0, combo = 0, last = 0;
    for (i = 0; i < N; i++) notes.push({ t: 1.8 + i * 0.62 + (i % 3 === 2 ? 0.15 : 0), lane: rnd(0, 3), el: null, done: false });
    api.area.innerHTML = '<div class="mg-lanes" id="ln">' + LANES.map(function () { return '<div class="lane"></div>'; }).join('') + '<i class="hitline"></i></div><div class="mg-pads" id="pd"></div>';
    var ln = $('#ln'), lanes = ln.querySelectorAll('.lane'), pd = $('#pd');
    notes.forEach(function (n) { var e = document.createElement('i'); e.className = 'note'; e.style.display = 'none'; lanes[n.lane].appendChild(e); n.el = e; });
    LANES.forEach(function (name, k) { var b = btn(name, 'mg-pad', function () {}); onTap(b, function () { press(k); }); pd.appendChild(b); });
    function onKey(e) { var k = KEYS.indexOf(e.code); if (k >= 0) press(k); }
    document.addEventListener('keydown', onKey);
    api.cleanup(function () { document.removeEventListener('keydown', onKey); });
    function press(k) {
      if (!run) return;
      var now = (performance.now() - t0) / 1000, best = null;
      notes.forEach(function (n) { if (!n.done && n.lane === k && Math.abs(n.t - now) < 0.26 && (!best || Math.abs(n.t - now) < Math.abs(best.t - now))) best = n; });
      var padBtn = pd.children[k]; padBtn.classList.add('on'); setTimeout(function () { padBtn.classList.remove('on'); }, 90);
      if (!best) { combo = 0; sfx('hit'); return; }
      var d = Math.abs(best.t - now); best.done = true; best.el.style.display = 'none';
      score += d < 0.13 ? 1 : 0.6; hits++; combo++; sfx('note', k);
      api.stat('命中 ' + hits + ' / ' + N + '　連擊 ' + combo);
    }
    t0 = performance.now();
    api.stat('準備…');
    function frame() {
      if (!run || !api.alive()) return;
      var now = (performance.now() - t0) / 1000, H = ln.clientHeight || 260;
      notes.forEach(function (n) {
        if (n.done) return;
        var dt = n.t - now;
        if (dt < -0.27) { n.done = true; n.el.style.display = 'none'; combo = 0; return; }
        if (dt > FALL) return;
        n.el.style.display = 'block'; n.el.style.top = ((1 - dt / FALL) * (H - 40)) + 'px';
        if (M.auto && Math.abs(dt) < 0.03) press(n.lane);
      });
      if (now > notes[N - 1].t + 0.6) { run = false; api.done(score / N * 100, '命中 ' + hits + ' / ' + N); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  /* 點擊目標（守住陣地、值更警戒） */
  ENG.targets = function (api) {
    var watch = api.id === 'watch_duty', total = watch ? 8 : 14, spawned = 0, hit = 0, miss = 0, lives = watch ? 99 : 3, run = true, tmo = [];
    api.area.innerHTML = '<div class="mg-field" id="fd"></div>';
    var fd = $('#fd');
    api.stat('擊中 0 / ' + total);
    function spawn() {
      if (!run || !api.alive()) return;
      if (spawned >= total) { tmo.push(setTimeout(finish, 1400)); return; }
      spawned++;
      var e = document.createElement('button'); e.className = 'mg-target'; e.type = 'button';
      e.style.left = rnd(8, 82) + '%'; e.style.top = rnd(8, 78) + '%'; e.setAttribute('aria-label', watch ? '光點' : '敵情');
      var dead = false;
      onTap(e, function () { if (dead) return; dead = true; hit++; e.remove(); sfx('shot'); api.stat('擊中 ' + hit + ' / ' + total); });
      fd.appendChild(e);
      tmo.push(setTimeout(function () {
        if (dead) return; dead = true; e.remove(); miss++; sfx('alarm');
        if (!watch) { lives--; api.stat('擊中 ' + hit + ' / ' + total + '　失守 ' + miss); if (lives <= 0) finish(); }
      }, watch ? 1500 : 1300));
      if (M.auto) tmo.push(setTimeout(function () { if (!dead && e.parentNode) e.click(); }, 15));
      tmo.push(setTimeout(spawn, M.auto ? 25 : rnd(600, 1000)));
    }
    function finish() {
      if (!run) return; run = false;
      var raw = hit / total * 100;
      if (!watch && miss >= 3) raw = Math.min(raw, 45);
      api.done(raw, '擊中 ' + hit + ' / ' + total);
    }
    api.cleanup(function () { run = false; tmo.forEach(clearTimeout); });
    spawn();
  };

  /* 潛行（紅綠燈） */
  ENG.stealth = function (api) {
    api.area.innerHTML = '<div class="mg-guard" id="gd">值星官背對著你</div><div class="mg-timer"><u id="pg"></u></div><p class="mg-note">前進進度</p>';
    var gd = $('#gd'), pg = $('#pg'), prog = 0, strikes = 0, holding = false, state = 'back', run = true, t0 = performance.now(), lim = 30000;
    var go = btn('按住前進', 'mg-fire mg-hold', function () {});
    api.area.appendChild(go);
    function setHold(v) { holding = v; go.classList.toggle('on', v); }
    go.addEventListener('pointerdown', function (e) { e.preventDefault(); setHold(true); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { go.addEventListener(ev, function () { setHold(false); }); });
    function onKey(e, v) { if (e.code === 'Space') { e.preventDefault(); setHold(v); } }
    var kd = function (e) { onKey(e, true); }, ku = function (e) { onKey(e, false); };
    document.addEventListener('keydown', kd); document.addEventListener('keyup', ku);
    var phaseT = performance.now() + 1500, last = performance.now(), tmo = [];
    api.cleanup(function () { document.removeEventListener('keydown', kd); document.removeEventListener('keyup', ku); });
    function setState(s) {
      state = s;
      gd.className = 'mg-guard ' + s;
      gd.textContent = s === 'back' ? '值星官背對著你' : s === 'warn' ? '他要轉頭了！' : '他在看！別動！';
      if (s === 'warn') sfx('whistle');
    }
    api.stat('被抓到 0 / 3 次');
    function frame(now) {
      if (!run || !api.alive()) return;
      var dt = (now - last) / 1000; last = now;
      if (now >= phaseT) {
        if (state === 'back') { setState('warn'); phaseT = now + 700; }
        else if (state === 'warn') { setState('look'); phaseT = now + rnd(900, 1500); }
        else { setState('back'); phaseT = now + rnd(1200, 2400); }
      }
      if (holding && state === 'look') {
        strikes++; setHold(false); sfx('alarm'); prog = Math.max(0, prog - 0.15);
        api.stat('被抓到 ' + strikes + ' / 3 次');
        if (strikes >= 3) { run = false; api.done(30, '被抓到三次了…'); return; }
        phaseT = now + 600; setState('back');
      }
      if (holding) prog += dt * 0.11;
      pg.style.transform = 'scaleX(' + clamp(prog, 0, 1) + ')';
      if (prog >= 1) { run = false; var tf = 1 - (performance.now() - t0) / lim; api.done(72 + clamp(tf, 0, 1) * 28 - strikes * 12, '成功潛回！被抓 ' + strikes + ' 次'); return; }
      if (performance.now() - t0 > lim) { run = false; api.done(35, '來不及了…'); return; }
      if (M.auto) setHold(state !== 'look' && !(state === 'warn'));
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    void tmo;
  };

  root.Minigames = M;
  M.info = INFO;
})(typeof self !== 'undefined' ? self : this);
