/* 畫質表、自動降級、FPS HUD、renderer.info 預算（三角面／draw calls）。 */
const puppeteer = require('puppeteer-core');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CHROME = process.env.CHROME || '/usr/local/bin/google-chrome';
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

function must(cond, msg) { if (!cond) throw new Error(msg); }

const LEVELS = ['op1_landing', 'op2_radar', 'op3_ridge', 'op4_tunnel', 'op5_hq'];
const TIERS = ['low', 'mid', 'high'];
const TABLE_KEYS = ['pixelRatio', 'antialias', 'sky', 'fog', 'heightFog', 'clouds', 'sunDisc', 'sunHalo', 'maxTex'];
const BUDGET = {
  low: { triangles: 60000, drawCalls: 80 },
  mid: { triangles: 120000, drawCalls: 120 },
  high: { triangles: 200000, drawCalls: 180 }
};

function pinJsonTable() {
  const sys = JSON.parse(fs.readFileSync(path.join(ROOT, 'island/data/island-fps-system.json'), 'utf8'));
  const g = sys.graphics;
  must(g && g.defaultPref === 'auto', '預設畫質應為自動');
  must(g.autoStartTier === 'mid', '自動應從中檔起跳');
  must(g.autoNeverHigh === true, '自動不得升到高檔');
  must(g.autoDropFps === 32, '降級門檻應為 32fps');
  must(g.autoSampleSec === 3, '取樣應約 3 秒');
  must(g.autoWarmupSec === 4, '可操作後應再等 4 秒才開始取樣');
  must(g.autoDropStrikes === 2, '應連續兩次低於門檻才降級');
  must(g.autoCooldownSec === 10, '降級冷卻應至少 10 秒');
  TIERS.forEach(t => {
    TABLE_KEYS.forEach(k => must(g.tiers[t][k] != null, t + ' 缺少 ' + k));
    must(g.budget[t].triangles === BUDGET[t].triangles, t + ' 三角面預算被放寬或改動');
    must(g.budget[t].drawCalls === BUDGET[t].drawCalls, t + ' draw call 預算被放寬或改動');
  });
  must(g.tiers.low.sky === 'flat', '低檔天空應最便宜');
  must(g.tiers.low.heightFog === false && g.tiers.low.clouds === 0, '低檔不應有高度霧／雲');
  must(g.tiers.mid.heightFog === true && g.tiers.high.heightFog === true, '中高檔應有高度霧');
  must(g.tiers.low.maxTex === 512 && g.tiers.high.maxTex === 1024, '貼圖上限 低512／高1024');
  console.log('json-graphics-table ok');
}

async function main() {
  pinJsonTable();
  const port = 9040 + Math.floor(Math.random() * 40);
  const srv = await serve(port);
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage();
  const pageErrs = [];
  page.on('pageerror', e => pageErrs.push(e.message));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`http://localhost:${port}/island/index.html?test=1&fpshud=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__island && __island.loadMapOnly && __island.World && __island.World.ok && window.Gfx, { timeout: 20000 });

  const table = await page.evaluate(() => {
    const G = window.Gfx;
    return {
      pref: G.pref(),
      applied: G.applied(),
      autoStart: G.table.autoStartTier,
      neverHigh: G.table.autoNeverHigh,
      dropFps: G.table.autoDropFps,
      warmup: G.table.autoWarmupSec,
      strikes: G.table.autoDropStrikes,
      keys: Object.keys(G.table.tiers.low),
      hud: G.hudOn(),
      hudHidden: document.getElementById('gfxHud').hidden
    };
  });
  must(table.pref === 'auto', '預設偏好應為 auto，實際 ' + table.pref);
  must(table.applied === 'mid', '自動啟動應套用中檔，實際 ' + table.applied);
  must(table.neverHigh === true, 'autoNeverHigh 應開啟');
  must(table.dropFps === 32, '門檻應為 32fps');
  must(table.warmup === 4 && table.strikes === 2, '應為 4 秒暖機、連續 2 次才降');
  TABLE_KEYS.forEach(k => must(table.keys.indexOf(k) >= 0, '設定表缺少 ' + k));
  must(table.hud === true, '?fpshud=1 應開啟 FPS 顯示');
  must(table.hudHidden === false, 'FPS 疊層應可見');
  console.log('gfx-defaults ok', table.applied, 'keys=' + table.keys.length);

  const autoLogic = await page.evaluate(() => {
    const G = window.Gfx;
    const play = { mode: 'play', paused: false, hidden: false };
    const log = [];
    function rec(tag) { log.push(tag + ':' + G.applied()); }
    function pump(t, n, dt, ctx) {
      let i;
      for (i = 0; i < n; i++) { t += dt * 1000; G.tick(t, dt, null, ctx || play); }
      return t;
    }
    G.freezeAuto(false);
    G.configure({ autoNeverHigh: true, autoStartTier: 'high', autoSampleSec: 3, autoWarmupSec: 4, autoDropStrikes: 2, autoCooldownSec: 10, autoDropFps: 32 });
    G.setPref('auto');
    const clamped = G.applied();

    G.configure({ autoNeverHigh: true, autoStartTier: 'mid', autoSampleSec: 3, autoWarmupSec: 4, autoDropStrikes: 2, autoCooldownSec: 10, autoDropFps: 32 });
    G.setPref('auto');
    rec('start');
    let t = performance.now() + 20000;
    t = pump(t, 80, 0.05); /* 4s 暖機，20fps 也不該降 */
    rec('warm');
    const afterWarm = G.applied();
    t = pump(t, 60, 0.05); /* 第一次 3s 低於門檻 */
    rec('one');
    const afterOne = G.applied();
    t = pump(t, 60, 0.05); /* 連續第二次才降 */
    rec('two');
    const afterDrop = G.applied();

    t = pump(t, 80, 1 / 120);
    rec('noUp');
    const noUpgrade = G.applied();

    G.setPref('auto');
    rec('reset');
    t = performance.now() + 20000;
    t = pump(t, 80, 0.05); /* 暖機 */
    function spikeWindow() {
      t = pump(t, 170, 1 / 60);
      t = pump(t, 1, 0.2);
    }
    spikeWindow();
    spikeWindow();
    rec('spike');
    const afterSpike = G.applied();

    t = performance.now() + 20000;
    G.resetPlay();
    t = pump(t, 40, 0.05); /* 暖機 2 秒 */
    t = pump(t, 80, 0.05, { mode: 'play', paused: true, hidden: false });
    t = pump(t, 80, 0.05, { mode: 'play', paused: false, hidden: true });
    t = pump(t, 80, 0.05, { mode: 'talk', paused: false, hidden: false });
    rec('paused');
    const duringPause = G.applied();
    t = pump(t, 40, 0.05); /* 再 2 秒暖機才滿 */
    t = pump(t, 60, 0.05);
    rec('stillWarm');
    const stillNeedTwo = G.applied();
    t = pump(t, 60, 0.05);
    rec('afterPause');
    const afterPause = G.applied();

    G.configure({ autoNeverHigh: false, autoStartTier: 'high', autoSampleSec: 3, autoWarmupSec: 4, autoDropStrikes: 2, autoCooldownSec: 10, autoDropFps: 32 });
    G.setPref('auto');
    rec('high');
    t = performance.now() + 20000;
    t = pump(t, 80, 0.05);
    t = pump(t, 60, 0.05);
    t = pump(t, 60, 0.05);
    rec('toMid');
    const midNow = G.applied();
    const tMid = t;
    t = pump(t, 60, 0.05);
    t = pump(t, 60, 0.05);
    rec('cool');
    const duringCool = G.applied();
    t = tMid + 11000;
    t = pump(t, 60, 0.05);
    t = pump(t, 60, 0.05);
    rec('toLow');
    const afterCool = G.applied();

    G.configure(window.__island.cfg().raw.graphics);
    G.setPref('auto');
    G.freezeAuto(true);
    return { clamped, afterWarm, afterOne, afterDrop, noUpgrade, afterSpike, duringPause, stillNeedTwo, afterPause, midNow, duringCool, afterCool, log };
  });
  must(autoLogic.clamped === 'mid', '自動即使 autoStartTier=high 也不得套用高檔，實際 ' + autoLogic.clamped);
  must(autoLogic.afterWarm === 'mid', '暖機 4 秒內不得降級，實際 ' + autoLogic.afterWarm);
  must(autoLogic.afterOne === 'mid', '只低於門檻一次不得降級，實際 ' + autoLogic.afterOne);
  must(autoLogic.afterDrop === 'low', '連續兩次中位數低於 32fps 才降到低檔，實際 ' + autoLogic.afterDrop);
  must(autoLogic.noUpgrade === 'low', '自動不得回升，實際 ' + autoLogic.noUpgrade);
  must(autoLogic.afterSpike === 'mid', '偶發卡頓不應靠平均誤判降級，實際 ' + autoLogic.afterSpike);
  must(autoLogic.duringPause === 'mid', '暫停／切分頁／對白不得取樣，實際 ' + autoLogic.duringPause);
  must(autoLogic.stillNeedTwo === 'mid', '暫停時間不得算進暖機或取樣，實際 ' + autoLogic.stillNeedTwo);
  must(autoLogic.afterPause === 'low', '恢復操作後仍須連續兩次才降，實際 ' + autoLogic.afterPause);
  must(autoLogic.midNow === 'mid', '高檔連續兩次低幀應降一級到中，實際 ' + autoLogic.midNow);
  must(autoLogic.duringCool === 'mid', '10 秒冷卻內不得再降，實際 ' + autoLogic.duringCool);
  must(autoLogic.afterCool === 'low', '冷卻後連續兩次可再降一級，實際 ' + autoLogic.afterCool);
  console.log('auto-drop ok', autoLogic.log.join('→'));

  const hudToggle = await page.evaluate(() => {
    const G = window.Gfx;
    G.setHud(false);
    const off = document.getElementById('gfxHud').hidden;
    G.setHud(true);
    const on = !document.getElementById('gfxHud').hidden;
    window.__island.setFpsHud(true);
    return { off, on, hudOn: G.hudOn() };
  });
  must(hudToggle.off === true && hudToggle.on === true && hudToggle.hudOn === true, 'FPS HUD 開關失效');
  console.log('fps-hud-toggle ok');

  const reports = [];
  const over = [];
  for (const tier of TIERS) {
    for (const id of LEVELS) {
      const info = await page.evaluate(async (levelId, gfxTier) => {
        window.__island.setGfx(gfxTier);
        await window.__island.loadMapOnly(levelId);
        const W = window.__island.World;
        W.place(W.S.spawn[0], W.S.spawn[1]);
        W.renderOnce();
        W.renderOnce();
        const g = W.gfxInfo();
        window.__island.dumpGfx();
        return { level: levelId, tier: gfxTier, info: g };
      }, id, tier);
      reports.push(info);
      const g = info.info;
      const cap = BUDGET[tier];
      const row = {
        level: info.level, tier: info.tier,
        sceneTriangles: g.sceneTriangles, sceneCalls: g.sceneCalls,
        capTriangles: cap.triangles, capCalls: cap.drawCalls,
        rendererTriangles: g.triangles, rendererCalls: g.calls
      };
      console.log('[island-gfx]', JSON.stringify(row));
      must(g.applied === tier, info.level + ' 畫質應為 ' + tier + '，實際 ' + g.applied);
      must(g.sceneCalls > 0 && g.sceneTriangles > 0, info.level + '@' + tier + ' 場景計數為 0');
      if (g.sceneTriangles > cap.triangles) {
        over.push(info.level + '@' + tier + ' 三角面 ' + g.sceneTriangles + '>' + cap.triangles);
      }
      if (g.sceneCalls > cap.drawCalls) {
        over.push(info.level + '@' + tier + ' draw calls ' + g.sceneCalls + '>' + cap.drawCalls);
      }
      must(g.sceneTriangles <= cap.triangles, info.level + '@' + tier + ' 三角面超預算 ' + g.sceneTriangles + '>' + cap.triangles + '（不得放寬預算）');
      must(g.sceneCalls <= cap.drawCalls, info.level + '@' + tier + ' draw calls 超預算 ' + g.sceneCalls + '>' + cap.drawCalls + '（不得放寬預算）');
      must((g.spec.maxTex || 0) <= g.budget.maxTex, info.level + '@' + tier + ' 貼圖上限超過預算');
      if (tier === 'low') must(g.spec.sky === 'flat' && !g.spec.heightFog, '低檔應走便宜天空');
      if (tier === 'mid' || tier === 'high') must(g.spec.sky === 'dome' && g.spec.heightFog, tier + ' 應有穹頂與高度霧');
    }
  }
  if (over.length) throw new Error('預算超標（未放寬）：' + over.join('; '));
  console.log('budget-assert ok');
  reports.forEach(r => {
    console.log(r.level + '\t' + r.tier + '\ttri=' + r.info.sceneTriangles + '/' + BUDGET[r.tier].triangles + '\tdc=' + r.info.sceneCalls + '/' + BUDGET[r.tier].drawCalls);
  });

  const hudText = await page.evaluate(() => {
    window.Gfx.paintHud({ fps: 48, calls: 12, triangles: 3400 });
    return document.getElementById('gfxHud').textContent;
  });
  must(/FPS/.test(hudText) && /dc/.test(hudText) && /tri/.test(hudText), 'HUD 應顯示 FPS／draw calls／三角面：' + hudText);
  console.log('hud-text ok', hudText);

  await browser.close();
  srv.close();
  if (pageErrs.length) console.warn('page errors', pageErrs.slice(0, 4));
  console.log('gfx ok', reports.length, 'samples');
}

main().catch(e => { console.error(e); process.exit(1); });
