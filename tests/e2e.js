/* headless Chrome E2E：用真實 UI 從頭玩到結局。
 * 用法：node e2e.js desktop|mobile [sign|decline] [sideRate]
 * 小遊戲啟用內建自動遊玩（走同一套輸入處理函式），其餘動作都透過畫面上的按鈕與互動完成。 */
const puppeteer = require('puppeteer-core');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME || '/usr/local/bin/google-chrome';
const mode = process.argv[2] || 'desktop';
const volChoice = process.argv[3] || (mode === 'desktop' ? 'sign' : 'decline');
const sideRate = +(process.argv[4] || (mode === 'desktop' ? 0.5 : 0.3));
const BEACH = process.env.BEACH || 'survive', CMD = process.env.CMD || 'hold', RESCUE = process.env.RESCUE || 'carry', AID = process.env.AID || 'treat', FATE = process.env.FATE || '', DIFF = process.env.DIFF || 'hardcore';
const DIE_WAVE = process.env.DIE_WAVE || 'wave2', DOWN = (process.env.DOWN || (BEACH === 'medevac' ? 'medevac' : 'retry')).split(',');
const STOP = process.env.STOP_AFTER || '';
const REHAB = process.env.REHAB || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };

function serve(port) {
  return new Promise(res => {
    const s = http.createServer((q, r) => {
      let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
      if (f.endsWith('/')) f += 'index.html';
      fs.readFile(f, (e, d) => {
        if (e) { r.writeHead(404); r.end('nf'); return; }
        r.writeHead(200, { 'content-type': (MIME[path.extname(f)] || 'application/octet-stream') + '; charset=utf-8' }); r.end(d);
      });
    }).listen(port, () => res(s));
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(`[${mode}]`, ...a);

async function main() {
  const BASE = process.env.BASE_URL;
  const port = 8800 + Math.floor(Math.random() * 100);
  const srv = BASE ? { close() {} } : await serve(port);
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  const mobile = mode === 'mobile';
  if (mobile) await page.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36' });
  else await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('console', m => { const t = m.type(); if (t === 'error' || t === 'warning') errors.push(t + ': ' + m.text()); });
  page.on('pageerror', e => { errors.push('PAGEERROR: ' + e.message); log('PAGEERROR', e.message, (e.stack || '').split('\n').slice(0, 4).join(' / ')); });
  page.on('error', e => log('PAGE CRASH', e.message));
  page.on('framenavigated', f => { if (f === page.mainFrame()) log('NAVIGATED', f.url()); });
  page.on('requestfailed', r => errors.push('REQFAIL: ' + r.url()));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });

  await page.goto(BASE ? BASE + (BASE.includes('?') ? '&' : '?') + 'auto=1' : `http://localhost:${port}/index.html?auto=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && __game.phase() === 'title', { timeout: 20000 });
  await sleep(600);
  const autoOk = await page.evaluate(() => ({ bot: __game.FPS && __game.FPS.bot, renderer: typeof __game.renderer === 'function' && !!__game.renderer() }));
  log('auto=1：', JSON.stringify(autoOk));
  if (autoOk.bot !== 'aim') throw new Error('?auto=1 沒有開啟 FPS.bot');
  if (REHAB === 'fail') {
    await page.evaluate(() => {
      const orig = __game.MG.run.bind(__game.MG);
      __game.MG.run = function (id, opts, cb) {
        __game.MG.forceScore = id === 'rehab' ? 20 : null;
        return orig(id, opts, cb);
      };
    });
    log('復健小遊戲強制 20 分（不及格）');
  }
  await page.screenshot({ path: path.join(__dirname, 'out', `${mode}-01-title.png`) });

  const tap = async (el) => { if (mobile) await el.tap(); else await el.click(); };
  let act = '';
  async function clickIn(sel, pred) {
    act = 'clickIn ' + sel;
    const hs = await page.$$(sel + ' button'); act = 'clickIn-got ' + hs.length;
    const info = await Promise.all(hs.map(h => h.evaluate(b => ({ t: b.textContent, c: b.className, d: b.disabled, vis: !!(b.offsetWidth || b.offsetHeight) }))));
    let idx = -1;
    for (let i = 0; i < info.length; i++) if (!info[i].d && info[i].vis && pred(info[i], i, info)) { idx = i; break; }
    if (idx < 0) return false;
    act = 'tapping ' + info[idx].t; await tap(hs[idx]); act = 'tapped'; return info[idx].t;
  }

  if (process.env.START_DAY) {
    const day = +process.env.START_DAY;
    await page.evaluate((day) => {
      const E = __game.E, G = E.newState('除錯', 'uni');
      G.day = day; G.unit = 'infantry'; const lv = day > 200 ? 8 : 4; G.level = lv; G.xp = E.xpTotalFor(lv); G.flags.unit_assigned = 1; G.sp = 3;
      G.items.it_camo = 1; G.equip.body = 'it_camo';
      localStorage.setItem('abg2-save-0', JSON.stringify({ G, map: E.baseMap(G), pos: { x: -2, z: 10.5 }, t: Date.now() }));
    }, day);
    await page.evaluate(() => __game.load(0));
    await page.waitForFunction(() => __game.phase() === 'play', { timeout: 10000 });
    log('從第 ' + day + ' 天的存檔開始（除錯用）');
  } else {
  // 輸入名字、選背景，開始新遊戲
  await page.$eval('#nm', el => { el.value = ''; });
  await page.type('#nm', '測試兵');
  await tap(await page.$(mobile ? '#bg-gamer' : '#bg-site'));
  await sleep(200);
  await page.screenshot({ path: path.join(__dirname, 'out', `${mode}-02-title-filled.png`) });
  await clickIn('#cIn', b => /開始新遊戲/.test(b.t));
  await page.waitForFunction(() => __game.phase() === 'play', { timeout: 10000 });
  log('開始新遊戲');
  }

  const snap = () => page.evaluate(() => {
    const g = __game, G = g.G, R = g.R, vis = s => { const e = document.querySelector(s); return !!e && !e.hidden; };
    let av = [];
    if (G) av = g.E.listAvailable(G).map(q => ({ id: q.id, type: q.type, giver: q.giver, here: g.W.hasNpc(q.giver) }));
    return {
      phase: g.phase(), busy: g.busy(), map: g.map(), card: vis('#card'), dlg: vis('#dlg'), panel: vis('#panel'), mg: vis('#mg'), hold: g.holdOn(),
      day: G && G.day, period: G && G.period, level: G && G.level, over: G && G.over, ending: G && G.ending, active: G ? g.E.activeQuests(G).map(q => q.id) : [],
      av, track: G && G.track, fps: !!(g.FPS && g.FPS.active()), fpsInfo: g.FPS && g.FPS.debug() ? { k: g.FPS.debug().kills, q: g.FPS.debug().queue, hp: G.hp } : null, beachFlags: G && { akai_kia: !!G.flags.akai_kia, akai_injured: !!G.flags.akai_injured, wang: !!G.flags.sgt_wang_kia, saved: !!G.flags.saved_civilian, radio: !!G.flags.radio_fixed, hero: !!G.flags.beach_hero, medevac: !!G.flags.beach_medevac, court: !!G.flags.court },
      R: R && {
        q: R.q.id, ready: !!R.ready, kind: R.plan && R.plan.kind, idx: R.idx, phase: R.phase, timer: R.timer && Math.round(R.timer.left), giver: R.q.giver,
        pts: (R.pts || []).map(p => ({ x: p.x, z: p.z, done: p.done, npc: p.npc || null })),
        inter: (R.inter || []).map(i => ({ x: i.x, z: i.z, label: i.label })), dst: R.plan && R.plan.dst && { x: R.plan.dst.x, z: R.plan.dst.z, npc: R.plan.dst.npc || null }, dstNpc: R.plan && R.plan.dstNpc,
        pickup: R.pickupPt || null, waveStarted: !!R.waveStarted, rescueCarry: !!R.rescueCarry, wave: R.plan && R.plan.wave, which: R.plan && R.plan.which, seq: R.plan && R.plan.seq, tmap: R.plan && R.plan.map
      },
      pos: g.W.pos(), pickups: g.W.S.pickups.map(p => ({ x: p.x, z: p.z })),
      npcs: Object.keys(g.W.S.npcs).filter(k => !g.W.S.npcs[k].deco).reduce((o, k) => { o[k] = { x: g.W.S.npcs[k].x, z: g.W.S.npcs[k].z }; return o; }, {})
    };
  });
  const tp = async (x, z) => { await page.evaluate((x, z) => __game.teleport(x, z), x, z); await sleep(110); };
  const interact = () => page.evaluate(() => { const n = __game.near(); __game.interact(); return n && n.label; });

  // 真實走路：以鍵盤（桌機）或虛擬搖桿（手機）朝目標走，逾時就瞬移補上
  async function walkTo(x, z, maxMs) {
    const t0 = Date.now(); let moved = 0;
    if (mobile) {
      const box = await (await page.$('#joy')).boundingBox();
      if (!box) return 0;
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      const th = await page.touchscreen.touchStart(cx, cy);
      try {
        while (Date.now() - t0 < maxMs) {
          const s = await page.evaluate((x, z) => { const W = __game.W, p = W.pos(); W.S.yaw = Math.atan2(-(x - p.x), -(z - p.z)); W.S.pitch = 0.5; return Math.hypot(x - p.x, z - p.z); }, x, z);
          if (s < 2.0) break;
          await th.move(cx, cy - 45); await sleep(80); moved++;
        }
      } finally { await th.end(); }
    } else {
      await page.keyboard.down('KeyW');
      try {
        while (Date.now() - t0 < maxMs) {
          const s = await page.evaluate((x, z) => { const W = __game.W, p = W.pos(); W.S.yaw = Math.atan2(-(x - p.x), -(z - p.z)); W.S.pitch = 0.5; return Math.hypot(x - p.x, z - p.z); }, x, z);
          if (s < 2.0) break;
          await sleep(60); moved++;
        }
      } finally { await page.keyboard.up('KeyW'); }
    }
    return moved;
  }
  let walkBudget = 8;
  async function goTo(x, z) {
    if (walkBudget > 0) {
      const d = await page.evaluate((x, z) => { const p = __game.W.pos(); return Math.hypot(x - p.x, z - p.z); }, x, z);
      if (d < 22) { walkBudget--; await walkTo(x, z, 900 + d / 5.4 * 1700); }
    }
    await tp(x, z);
  }

  let stats = { steps: 0, cards: 0, dialogs: 0, quests: new Set(), shots: 0 };
  let last = '', lastChange = Date.now(), failTested = false, shotDone = {};
  const shot = async (name) => { if (shotDone[name]) return; shotDone[name] = 1; await page.screenshot({ path: path.join(__dirname, 'out', `${mode}-${name}.png`) }); };
  const R0 = s => !!s.R;
  const t0 = Date.now(), LIMIT = 28 * 60 * 1000;
  let sleepRound = 0, toured = 0, shopped = false, downCount = 0; const attempts = {}; let rngSet = false;
  async function closePanelIfAny() { await page.evaluate(() => __game.UI.closePanel()); await sleep(150); }
  async function panelsTour() {
    // 技能：把所有技能點花掉（優先「做人圓融」）；背包：使用一個消耗品；角色與日誌：確認能開啟
    await tap(await page.$('#side button[data-p="skills"]')); await sleep(250);
    for (let k = 0; k < 12; k++) {
      const hs = await page.$$('#pBody button[data-s]');
      let pick = null;
      for (const h of hs) { const info = await h.evaluate(b => ({ d: b.disabled, s: b.dataset.s })); if (!info.d && (!pick || info.s === 'sk_social')) pick = h; if (!info.d && info.s === 'sk_social') break; }
      if (!pick) break;
      await tap(pick); await sleep(120);
    }
    await shot(`06-skills`);
    await closePanelIfAny();
    await tap(await page.$('#side button[data-p="bag"]')); await sleep(250);
    await shot(`07-bag`);
    const use = await page.$('#pBody button[data-a="use"]');
    if (use) { await tap(use); await sleep(300); }
    await closePanelIfAny();
    await tap(await page.$('#side button[data-p="char"]')); await sleep(250); await shot('08-char'); await closePanelIfAny();
    await tap(await page.$('#side button[data-p="journal"]')); await sleep(250); await shot('09-journal'); await closePanelIfAny();
  }
  async function shopTour(s) {
    const a = s.npcs['npc_auntie']; if (!a) return;
    await tp(a.x, a.z + 1.0); await interact(); await sleep(300);
    const opened = await clickIn('#dBtns', b => /買東西/.test(b.t));
    if (!opened) { await clickIn('#dBtns', b => /離開/.test(b.t)); return; }
    await sleep(300);
    await shot('10-shop');
    for (let k = 0; k < 3; k++) { const hs = await page.$$('#pBody button[data-i]'); let done = false; for (const h of hs) { const d = await h.evaluate(b => b.disabled); if (!d) { await tap(h); done = true; break; } } if (!done) break; await sleep(200); }
    await closePanelIfAny(); shopped = true;
  }

  while (Date.now() - t0 < LIMIT) {
    const s = await snap();
    const key = JSON.stringify([s.fpsInfo, s.day, s.period, s.active, s.R && [s.R.q, s.R.idx, s.R.phase, s.R.pts.filter(p => p.done).length], s.card, s.dlg, s.panel, s.mg, s.phase, s.level]);
    if (key !== last) { last = key; lastChange = Date.now(); }
    if (Date.now() - (global.__lp || 0) > 15000) { global.__lp = Date.now(); log('進度 day', s.day, 'p', s.period, 'lv', s.level, 'active', s.active.join(','), 'R', s.R ? s.R.q + '#' + s.R.idx + ':' + s.R.kind : '-', 'card', s.card, 'dlg', s.dlg, 'mg', s.mg, 'busy', s.busy, 'act', act); }
    if (Date.now() - lastChange > (s.fps ? 150000 : 45000)) { log('卡住了', JSON.stringify(s).slice(0, 1500)); await page.screenshot({ path: path.join(__dirname, 'out', `${mode}-stuck.png`) }); throw new Error('stuck'); }
    if (s.beachFlags && s.beachFlags.medevac && s.fps) {
      throw new Error('後送後戰鬥沒停：queue=' + (s.fpsInfo && s.fpsInfo.q) + ' hp=' + (s.fpsInfo && s.fpsInfo.hp));
    }
    if (STOP) {
      const stopNow = await page.evaluate((stop) => {
        const G = __game.G, E = __game.E;
        if (!G) return false;
        if (stop === 'beach') return !E.beachActive(G) && G.quests.ch4_beach_relief && (G.quests.ch4_beach_relief.state === 'done' || G.quests.ch4_beach_relief.state === 'failed');
        if (stop === 'rehab') {
          const rh = G.quests.ch5_beach_rehab;
          if (rh && (rh.state === 'done' || rh.state === 'failed')) return true;
          if (G.day > 335) return true;
        }
        if (stop === 'rescue') {
          const R = __game.R;
          return !!(G.flags.saved_civilian) && !(R && R.rescueCarry);
        }
        return false;
      }, STOP);
      if (stopNow) { log('STOP_AFTER ' + STOP); await shot('90-stop'); break; }
    }
    if (s.phase === 'end' && s.card) break;
    if (s.phase === 'end') { await sleep(500); continue; }
    if (s.mg) { await sleep(200); continue; }
    if (s.card) {
      stats.cards++;
      const title = await page.$eval('#cIn h2', e => e.textContent).catch(() => '');
      if (/結局|第.*章|任務|升/.test(title)) { /* ok */ }
      if (s.level >= 3) await shot('05-card-sample');
      const r = await clickIn('#cIn', (b, i) => (/硬派/.test(b.t) ? DIFF === 'hardcore' : /^標準/.test(b.t) ? DIFF === 'standard' : /^劇情向/.test(b.t) ? DIFF === 'story' : true));
      if (!r) await sleep(100);
      await sleep(80); continue;
    }
    if (s.dlg) {
      stats.dialogs++;
      const names = await page.$eval('#dName', e => e.textContent);
      if (names === '志願役說明會' || /簽，還是不簽/.test(names) || (s.R && s.R.q === 'ch4_main_07' && s.R.kind === 'decide')) {
        let r0 = await clickIn('#dBtns', b => volChoice === 'sign' ? /簽志願役/.test(b.t) : /^不簽/.test(b.t));
        if (!r0) await clickIn('#dBtns', b => /go/.test(b.c));
      } else {
        let r = await clickIn('#dBtns', b => CMD === 'hold' ? /^死守碉堡/.test(b.t) : CMD === 'fallback' ? /^退守第二線/.test(b.t) : /^帶隊反衝鋒/.test(b.t));
        if (!r) r = await clickIn('#dBtns', b => RESCUE === 'carry' ? /^衝出去把阿伯背回來/.test(b.t) : /^大喊叫他趴下別動/.test(b.t));
        if (!r) r = await clickIn('#dBtns', b => /^重玩這一波|^受傷後送/.test(b.t) && (DOWN[Math.min(downCount, DOWN.length - 1)] === 'retry' ? /^重玩這一波/.test(b.t) : /^受傷後送/.test(b.t)) && (downCount++ || true));
        if (!r) r = await clickIn('#dBtns', b => AID === 'treat' ? /^放下槍幫他包紮/.test(b.t) : /^叫他自己壓住/.test(b.t));
        if (!r) r = await clickIn('#dBtns', b => /^接受任務/.test(b.t));
        if (!r) r = await clickIn('#dBtns', b => /go/.test(b.c) && !/放進去/.test(b.t));
        if (!r) r = await clickIn('#dBtns', b => !/dim/.test(b.c) && !/離開|聊聊/.test(b.t));
        if (!r) r = await clickIn('#dBtns', b => /離開/.test(b.t));
        if (!r) r = await clickIn('#dBtns', b => true);
      }
      await sleep(60); continue;
    }
    if (s.panel) { await page.evaluate(() => __game.UI.closePanel()); continue; }
    if (s.busy || s.hold) { await sleep(150); continue; }
    if (!R0(s) && s.level >= 3 && toured < Math.floor(s.level / 3)) { toured = Math.floor(s.level / 3); await panelsTour(); continue; }
    if (!R0(s) && !shopped && s.level >= 3 && s.npcs['npc_auntie']) { await shopTour(s); continue; }

    const R = s.R;
    // 測試失敗後果：第一個有時限的任務故意不做，等時間到
    if (R && R.timer != null && !failTested && R.q === 'ch1_main_02') {
      failTested = true; log('測試失敗路徑：故意讓「' + R.q + '」逾時');
      await shot('03-timer');
      const hp0 = await page.evaluate(() => ({ d: __game.G.a.d, m: __game.G.a.m }));
      let n = 0;
      while (n++ < 400) { await sleep(500); const t = await page.evaluate(() => __game.R && __game.R.timer ? Math.round(__game.R.timer.left) : null); if (t == null) break; }
      await sleep(600);
      const q = await page.evaluate(() => __game.G.quests['ch1_main_02'] && __game.G.quests['ch1_main_02'].state);
      const hp1 = await page.evaluate(() => ({ d: __game.G.a.d, m: __game.G.a.m }));
      log('逾時結果：任務狀態=' + q + '，軍紀 ' + hp0.d + '→' + hp1.d);
      if (q !== 'failed') throw new Error('逾時沒有導致任務失敗：' + q);
      await shot('04-fail-card');
      continue;
    }
    if (R && R.ready) {
      const n = s.npcs[R.giver];
      if (n) { await goTo(n.x, n.z + 1.0); await interact(); await sleep(200); }
      else await sleep(300);
      continue;
    }
    if (R) {
      stats.quests.add(R.q);
      const pend = R.pts.filter(p => !p.done);
      const near = async (x, z, dz) => { await goTo(x, z + (dz == null ? 0.9 : dz)); };
      switch (R.kind) {
        case 'reach': case 'escort': {
          const p = (R.seq ? pend[0] : pend[0]); if (p) await goTo(p.x, p.z); else await sleep(200);
          break;
        }
        case 'collect': {
          if (s.pickups.length) { const p = s.pickups[0]; await tp(p.x, p.z); } else await sleep(200);
          break;
        }
        case 'talk': {
          const p = pend[0];
          if (!p) { await sleep(200); break; }
          if (p.npc) { const n = s.npcs[p.npc]; await near(n.x, n.z, 1.0); }
          else { await near(p.x, p.z, 1.0); }
          await interact(); await sleep(150); break;
        }
        case 'phone': case 'inspect': case 'overlay': case 'rest': case 'decide': {
          const it = R.inter[0];
          if (!it) { await sleep(200); break; }
          if (R.kind === 'overlay') await tp(it.x, it.z);
          else await near(it.x, it.z, 0.8);
          await interact(); await sleep(150);
          break;
        }
        case 'wave': {
          if (FATE && !rngSet) { rngSet = true; await page.evaluate((f) => __game.E.setRng(f === 'kia' ? () => 0.0 : () => 0.999), FATE); }
          if (s.fps) {
            if (R.rescueCarry && STOP !== 'rescue') await tp(-10, -5.95);
            if (R.rescueCarry && STOP === 'rescue' && !global.__carryShot) {
              global.__carryShot = true; await shot('20-carry-smoke');
              const raise = await page.$('#bRaise');
              if (raise) { await tap(raise); await sleep(400); await shot('21-carry-raise'); }
            }
            await sleep(300); break;
          }
          if (!R.waveStarted) {
            attempts[R.wave] = (attempts[R.wave] || 0) + 1;
            const die = (DOWN.indexOf('retry') >= 0 && DOWN.indexOf('medevac') >= 0)
              ? ((R.wave === 'wave1' || R.wave === 'wave2') && attempts[R.wave] === 1)
              : (BEACH !== 'survive' && R.wave === DIE_WAVE && attempts[R.wave] === 1);
            await page.evaluate((m) => { __game.FPS.bot = m; }, die ? 'idle' : 'aim');
            if (die) log('這一波故意不還擊：' + R.wave);
            await tp(R.pts[0].x, R.pts[0].z); await sleep(400);
          } else await sleep(300);
          break;
        }
        case 'auto': case 'radio': case 'bdecide': case 'fate': await sleep(400); break;
        case 'carry': {
          if (R.phase === 1 && R.pickup) { await tp(R.pickup.x, R.pickup.z); await sleep(200); }
          else if (R.dst) {
            if (R.dstNpc) { const n = s.npcs[R.dst.npc]; await near(n.x, n.z, 1.0); await interact(); await sleep(200); }
            else { await tp(R.dst.x, R.dst.z); await sleep(200); }
          } else await sleep(200);
          break;
        }
        default: await sleep(250);
      }
      stats.steps++;
      continue;
    }
    // 沒有執行中的任務：接任務或休息
    const activeN = s.active.length;
    const cands = s.av.filter(q => q.type === 'main' || Math.random() < sideRate);
    if (cands.length && activeN < 3) {
      cands.sort((a, b) => (a.type === 'main' ? 0 : 1) - (b.type === 'main' ? 0 : 1));
      const q = cands[0];
      if (q.here) { const n = s.npcs[q.giver]; await goTo(n.x, n.z + 1.0); await interact(); }
      else {
        const b = await page.evaluate(() => { const i = __game.inter().filter(x => x.label === '布告欄')[0]; return i; });
        await goTo(b.x, b.z); await interact();
      }
      await sleep(200); continue;
    }
    if (activeN) { await sleep(300); continue; }
    // 去寢室
    const bed = await page.evaluate(() => __game.inter().filter(x => /寢室/.test(x.label))[0]);
    await goTo(bed.x, bed.z); await interact(); await sleep(250);
    if (await page.evaluate(() => !document.querySelector('#dlg').hidden)) {
      sleepRound++;
      const hasAvail = s.av.length > 0 && sleepRound % 3 !== 0;
      let r = await clickIn('#dBtns', b => hasAvail ? /^睡覺/.test(b.t) : /^快轉/.test(b.t));
      if (!r) r = await clickIn('#dBtns', b => /睡覺|快轉/.test(b.t));
    }
    await sleep(300);
  }

  // 結局（STOP_AFTER 時只紀錄目前狀態）
  const fin = await page.evaluate(() => {
    const G = __game.G;
    const titleEl = document.querySelector('#cIn h2');
    return {
      ending: G && (G.ending || __game.E.evalEnding(G)), day: G && G.day, level: G && G.level, a: G && G.a, stats: G && G.stats,
      flags: G ? Object.keys(G.flags) : [], demerit: G && G.demerit, title: titleEl ? titleEl.textContent : '',
      rehab: G && G.quests.ch5_beach_rehab && G.quests.ch5_beach_rehab.state,
      hospitalized: !!(G && G.flags.hospitalized), rehab_done: !!(G && G.flags.rehab_done), medevac: !!(G && G.flags.beach_medevac),
      saved: !!(G && G.flags.saved_civilian), hp: G && G.hp,
      fps: !!(__game.FPS && __game.FPS.active())
    };
  });
  await page.screenshot({ path: path.join(__dirname, 'out', `${mode}-99-ending.png`) });
  log(STOP ? 'STOP_AFTER 狀態：' : '抵達結局：', JSON.stringify(fin), '，完成的任務(經手)數 ', stats.quests.size, '，用時 ' + Math.round((Date.now() - t0) / 1000) + ' 秒');
  if (STOP) {
    if (STOP !== 'rescue' && fin.fps) throw new Error('停止時 FPS 仍在進行');
    if (STOP === 'rescue') {
      if (!fin.saved) throw new Error('沒有把阿伯背回碉堡');
      if (!(fin.hp > 0)) throw new Error('背阿伯時倒下了 hp=' + fin.hp);
    }
    const bad = errors.filter(e => !/favicon/.test(e));
    log('console error/warning 數：', bad.length); bad.slice(0, 10).forEach(e => log('  ', e));
    if (bad.length) process.exitCode = 2;
    fs.writeFileSync(path.join(__dirname, 'out', `${mode}-result.json`), JSON.stringify({ mode, volChoice, STOP, BEACH, REHAB, fin, errors: bad, steps: stats.steps, quests: stats.quests.size, seconds: Math.round((Date.now() - t0) / 1000) }, null, 1));
    await browser.close(); srv.close();
    return;
  }

  // 結局後：回到標題
  await clickIn('#cIn', b => /再服一次役/.test(b.t));
  await page.waitForFunction(() => __game.phase() === 'title', { timeout: 8000 });
  log('結局後可回到標題');

  // 其他檢查：靜音、存讀檔、WebGL context lost
  await clickIn('#cIn', b => /開始新遊戲/.test(b.t));
  await page.waitForFunction(() => __game.phase() === 'play', { timeout: 8000 });
  await sleep(1500);
  while (await page.evaluate(() => !document.querySelector('#card').hidden)) { await clickIn('#cIn', () => true); await sleep(300); }
  await page.evaluate(() => { document.querySelector('#mute').click(); });
  const muted = await page.evaluate(() => ({ t: document.querySelector('#mute').textContent, ls: localStorage.getItem('abg2-mute') }));
  await page.evaluate(() => { document.querySelector('#mute').click(); });
  log('靜音開關：', JSON.stringify(muted));
  if (muted.t !== '音效關' || muted.ls !== '1') throw new Error('靜音開關異常');
  const saved = await page.evaluate(() => __game.save(1));
  const hasSave = await page.evaluate(() => !!localStorage.getItem('abg2-save-1'));
  log('存檔：', saved, hasSave);
  await page.evaluate(() => {
    const gl = document.querySelector('#gl').getContext('webgl2') || document.querySelector('#gl').getContext('webgl');
    window.__ext = gl.getExtension('WEBGL_lose_context'); window.__ext.loseContext();
  });
  await sleep(500);
  const lostShown = await page.evaluate(() => !document.querySelector('#lost').hidden);
  await page.evaluate(() => window.__ext.restoreContext());
  await sleep(1200);
  const lostHidden = await page.evaluate(() => document.querySelector('#lost').hidden);
  log('WebGL context lost 提示：', lostShown, '恢復後隱藏：', lostHidden);
  if (!lostShown || !lostHidden) throw new Error('context lost 處理異常');
  await page.screenshot({ path: path.join(__dirname, 'out', `${mode}-98-after-restore.png`) });

  // 版面：對話面板高度、面板捲動重設
  const lay = await page.evaluate(async () => {
    const out = {};
    __game.UI.dialog({ name: '測試', lines: ['這是一段很長的測試文字。'.repeat(30)], btn: '好' });
    await new Promise(r => setTimeout(r, 300));
    out.dlgH = document.querySelector('#dlg').offsetHeight; out.vh = window.innerHeight;
    __game.UI.closeDialog();
    document.querySelector('#side button[data-p="journal"]').click();
    await new Promise(r => setTimeout(r, 200));
    const b = document.querySelector('#pBody'); b.innerHTML += '<div style="height:3000px"></div>'; b.scrollTop = 500;
    const before = b.scrollTop;
    document.querySelectorAll('#pTabs button')[1].click();
    await new Promise(r => setTimeout(r, 200));
    out.scrollBefore = before; out.scrollAfter = document.querySelector('#pBody').scrollTop;
    __game.UI.closePanel();
    out.hudH = document.querySelector('#hud').offsetHeight;
    return out;
  });
  log('版面：', JSON.stringify(lay));
  if (lay.dlgH > lay.vh * 0.46) throw new Error('對話面板太高 ' + lay.dlgH + '/' + lay.vh);
  if (lay.scrollAfter !== 0) throw new Error('切換分頁後沒有捲回頂端');

  await browser.close(); srv.close();
  const bad = errors.filter(e => !/favicon/.test(e));
  log('console error/warning 數：', bad.length); bad.slice(0, 10).forEach(e => log('  ', e));
  if (bad.length) { process.exitCode = 2; }
  fs.writeFileSync(path.join(__dirname, 'out', `${mode}-result.json`), JSON.stringify({ mode, volChoice, fin, errors: bad, steps: stats.steps, quests: stats.quests.size, seconds: Math.round((Date.now() - t0) / 1000), layout: lay }, null, 1));
}
main().catch(e => { console.error('E2E 失敗：', e); process.exit(1); });
