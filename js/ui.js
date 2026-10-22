/* 介面元件：HUD、對話面板、卡片、全螢幕面板、提示。 */
(function (root) {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var E = root.Engine;
  var UI = {};
  var LBL = { xp: '經驗', b: '體能', m: '士氣', d: '軍紀', o: '袍澤', hp: '體力', fatigue: '疲勞', money: '薪餉', honor: '榮譽假', demerit: '違規點數' };
  var BAD_UP = { fatigue: 1, demerit: 1 };

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  UI.esc = esc;
  UI.label = function (k) { return LBL[k] || k; };

  UI.chips = function (fx) {
    var items = (fx || []).filter(function (x) { return x.v; });
    if (!items.length) return '';
    return '<ul class="chips">' + items.map(function (x) {
      var good = BAD_UP[x.k] ? x.v < 0 : x.v > 0;
      return '<li class="' + (good ? 'up' : 'dn') + '">' + LBL[x.k] + ' ' + (x.v > 0 ? '+' : '−') + Math.abs(x.v) + (x.k === 'money' ? ' 元' : '') + (x.k === 'honor' ? ' 天' : '') + '</li>';
    }).join('') + '</ul>';
  };

  /* ---------- HUD ---------- */
  UI.hud = function (G) {
    var h = $('#hud');
    if (!G) { h.hidden = true; return; }
    h.hidden = false;
    var D = E.data(), hm = E.hpMax(G), xn = E.xpNeed(G);
    $('#hWho').textContent = 'Lv' + G.level + ' ' + E.rankOf(G) + ' ' + G.name;
    $('#hDay').textContent = '第 ' + G.day + ' 天 ' + E.PERIODS[G.period];
    $('#hRes').textContent = '饅頭 ' + Math.max(0, 365 - G.day) + ' · $' + G.money;
    $('#bHp').style.width = (100 * G.hp / hm) + '%'; $('#tHp').textContent = '體力 ' + G.hp + '/' + hm;
    $('#bFa').style.width = G.fatigue + '%'; $('#tFa').textContent = '疲勞 ' + G.fatigue;
    $('#bXp').style.width = xn ? (100 * E.xpInLevel(G) / xn) + '%' : '100%'; $('#tXp').textContent = xn ? '經驗 ' + E.xpInLevel(G) + '/' + xn : '已滿級';
    $('#hAttr').innerHTML = E.ATTRS.map(function (k) { return '<i>' + E.ANAME[k] + ' <b>' + E.eff(G, k) + '</b></i>'; }).join('');
    var st = [];
    if (G.injury) st.push((D.inj[G.injury.id] || {}).name + ' 剩 ' + G.injury.left + ' 天');
    if (G.confine > 0) st.push('禁閉中');
    if (G.demerit > 0) st.push('違規 ' + G.demerit);
    if (E.fatiguePenalty(G) < 0) st.push(E.fatiguePenalty(G) <= -20 ? '快撐不住了' : '精神不濟');
    $('#hStat').innerHTML = st.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('');
    var hh = h.offsetHeight;
    document.documentElement.style.setProperty('--hudh', hh + 'px');
  };

  /* ---------- 提示 ---------- */
  UI.toast = function (msg, cls, ms) {
    var box = $('#toasts'), t = document.createElement('div');
    t.className = 'toast' + (cls ? ' ' + cls : ''); t.textContent = msg; box.appendChild(t);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, ms || 2600);
  };
  UI.toastFx = function (fx) {
    (fx || []).forEach(function (x) {
      if (!x.v) return;
      var good = BAD_UP[x.k] ? x.v < 0 : x.v > 0;
      UI.toast(LBL[x.k] + ' ' + (x.v > 0 ? '+' : '−') + Math.abs(x.v), good ? 'up' : 'dn', 2200);
    });
  };

  /* ---------- 底部對話 ---------- */
  var dlgOn = false;
  UI.dialogOpen = function () { return dlgOn; };
  UI.dialog = function (spec) {
    var dlg = $('#dlg'), lines = (spec.lines && spec.lines.length ? spec.lines : ['…']), i = 0;
    dlgOn = true; dlg.hidden = false;
    if (root.World && root.World.ok) root.World.setMode('ui');
    function render() {
      $('#dName').textContent = spec.name || '';
      $('#dText').innerHTML = '<p>' + esc(lines[i]).replace(/\n/g, '<br>') + '</p>';
      var b = $('#dBtns'); b.innerHTML = '';
      function add(t, cls, fn) {
        var el = document.createElement('button'); el.type = 'button'; el.textContent = t; if (cls) el.className = cls;
        el.addEventListener('click', function () { root.Sfx.sfx('click'); fn(); }); b.appendChild(el); return el;
      }
      if (i < lines.length - 1) add('繼續', 'go', function () { i++; render(); });
      else if (spec.choices && spec.choices.length) spec.choices.forEach(function (c) { add(c.t, c.cls, function () { if (c.keep !== true) UI.closeDialog(); c.fn && c.fn(); }); });
      else add(spec.btn || '好', 'go', function () { UI.closeDialog(); spec.done && spec.done(); });
      dlg.scrollTop = 0;
      requestAnimationFrame(function () { if (root.World && root.World.ok) root.World.setSheet(dlg.offsetHeight); });
    }
    render();
  };
  UI.closeDialog = function () {
    dlgOn = false; $('#dlg').hidden = true;
    if (root.World && root.World.ok) root.World.setSheet(0);
  };

  /* ---------- 置中卡片 ---------- */
  var cardOn = false;
  UI.cardOpen = function () { return cardOn; };
  UI.card = function (spec) {
    var c = $('#card'), inner = $('#cIn');
    cardOn = true; c.hidden = false;
    var html = '';
    if (spec.kicker) html += '<p class="kick">' + esc(spec.kicker) + '</p>';
    html += '<h2>' + esc(spec.title || '') + '</h2>';
    (spec.body || []).forEach(function (p) { html += spec.html ? p : '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; });
    if (spec.fx) html += UI.chips(spec.fx);
    if (spec.extra) html += spec.extra;
    inner.innerHTML = html;
    var row = document.createElement('div'); row.className = 'dbtns'; row.style.marginTop = '14px';
    (spec.buttons && spec.buttons.length ? spec.buttons : [{ t: '繼續' }]).forEach(function (b, idx, arr) {
      var el = document.createElement('button'); el.type = 'button'; el.textContent = b.t; el.className = b.cls || (idx === 0 && arr.length === 1 ? 'go' : '');
      el.addEventListener('click', function () { root.Sfx.sfx('click'); UI.closeCard(); b.fn && b.fn(); });
      row.appendChild(el);
    });
    inner.appendChild(row);
    inner.scrollTop = 0;
    if (spec.sfx) root.Sfx.sfx(spec.sfx);
  };
  UI.closeCard = function () { cardOn = false; $('#card').hidden = true; };

  /* ---------- 全螢幕面板 ---------- */
  var panelOn = false, panelCloseCb = null;
  UI.panelOpen = function () { return panelOn; };
  UI.panel = function (title, onClose) {
    panelOn = true; panelCloseCb = onClose || null;
    $('#panel').hidden = false; $('#pTitle').textContent = title;
    if (root.World && root.World.ok) root.World.setMode('ui');
    UI.panelTabs(null);
  };
  UI.panelTabs = function (tabs, cur, fn) {
    var t = $('#pTabs'); t.innerHTML = '';
    t.hidden = !tabs;
    if (!tabs) return;
    tabs.forEach(function (x) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = x[1]; b.className = x[0] === cur ? 'on' : '';
      b.addEventListener('click', function () { root.Sfx.sfx('click'); fn(x[0]); }); t.appendChild(b);
    });
  };
  UI.panelBody = function (html) {
    var b = $('#pBody'); b.innerHTML = html; b.scrollTop = 0;
    return b;
  };
  UI.closePanel = function () {
    if (!panelOn) return;
    panelOn = false; $('#panel').hidden = true;
    var cb = panelCloseCb; panelCloseCb = null;
    if (cb) cb();
  };

  UI.fadeText = function (t, on) { var e = $('#fadeTxt'); e.textContent = t || ''; e.classList.toggle('on', !!on); };
  UI.fade = function (on) { $('#fade').classList.toggle('on', !!on); };

  /* 對話與卡片可用鍵盤 Enter / 空白鍵 / E 繼續 */
  window.addEventListener('keydown', function (e) {
    if (e.code !== 'Enter' && e.code !== 'Space' && e.code !== 'KeyE') return;
    var t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'BUTTON' && document.activeElement === e.target) return;
    var box = null;
    if (!$('#card').hidden) box = $('#cIn');
    else if (!$('#mg').hidden || !$('#panel').hidden) return;
    else if (!$('#dlg').hidden) box = $('#dBtns');
    if (!box) return;
    var btns = box.querySelectorAll('button');
    var go = box.querySelector('button.go') || (btns.length === 1 ? btns[0] : null);
    if (go) { e.preventDefault(); go.click(); }
  });

  root.UI = UI;
})(typeof self !== 'undefined' ? self : this);
