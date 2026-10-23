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

function pinJsonTable() {
  const sys = JSON.parse(fs.readFileSync(path.join(ROOT, 'island/data/island-fps-system.json'), 'utf8'));
  const g = sys.graphics;
  must(g && g.defaultPref === 'auto', '預設畫質應為自動');
  must(g.autoStartTier === 'mid', '自動應從中檔起跳');
  must(g.autoNeverHigh === true, '自動不得升到高檔');
  must(g.autoDropFps === 40, '降級門檻應為 40fps');
  must(g.autoSampleSec === 3, '取樣應約 3 秒');
  must(g.autoCooldownSec === 10, '降級冷卻應至少 10 秒');
  TIERS.forEach(t => {
    TABLE_KEYS.forEach(k => must(g.tiers[t][k] != null, t + ' 缺少 ' + k));
    must(g.budget[t].triangles > 0 && g.budget[t].drawCalls > 0, t + ' 缺少預算');
  });
  must(g.tiers.low.sky === 'flat', '低檔天空應最便宜');
  must(g.tiers.low.heightFog === false && g.tiers.low.clouds === 0, '低檔不應有高度霧／雲');
  must(g.tiers.mid.heightFog === true && g.tiers.high.heightFog === true, '中高檔應有高度霧');
  must(g.tiers.low.maxTex === 512 && g.tiers.high.maxTex === 1024, '貼圖上限 低512／高1024');
  must(g.budget.low.triangles === 60000 && g.budget.mid.triangles === 120000 && g.budget.high.triangles === 200000, '三角面預算不符');
  must(g.budget.low.drawCalls === 80 && g.budget.mid.drawCalls === 120 && g.budget.high.drawCalls === 180, 'draw call 預算不符');
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
      keys: Object.keys(G.table.tiers.low),
      hud: G.hudOn(),
      hudHidden: document.getElementById('gfxHud').hidden
    };
  });
  must(table.pref === 'auto', '預設偏好應為 auto，實際 ' + table.pref);
  must(table.applied === 'mid', '自動啟動應套用中檔，實際 ' + table.applied);
  must(table.neverHigh === true, 'autoNeverHigh 應開啟');
  TABLE_KEYS.forEach(k => must(table.keys.indexOf(k) >= 0, '設定表缺少 ' + k));
  must(table.hud === true, '?fpshud=1 應開啟 FPS 顯示');
  must(table.hudHidden === false, 'FPS 疊層應可見');
  console.log('gfx-defaults ok', table.applied, 'keys=' + table.keys.length);

  const autoLogic = await page.evaluate(() => {
    const G = window.Gfx;
    const log = [];
    function rec(tag) { log.push(tag + ':' + G.applied()); }
    G.freezeAuto(false);
    G.configure({ autoNeverHigh: true, autoStartTier: 'high', autoSampleSec: 3, autoCooldownSec: 10, autoDropFps: 40 });
    G.setPref('auto');
    const clamped = G.applied();
    G.configure({ autoNeverHigh: true, autoStartTier: 'mid', autoSampleSec: 3, autoCooldownSec: 10, autoDropFps: 40 });
    G.setPref('auto');
    rec('start');
    let t = performance.now() + 11000;
    for (let i = 0; i < 70; i++) { t += 50; G.tick(t, 0.05); }
    rec('drop');
    const afterDrop = G.applied();
    for (let i = 0; i < 80; i++) { t += 50; G.tick(t, 1 / 120); }
    rec('noUp');
    const noUpgrade = G.applied();
    G.configure({ autoNeverHigh: false, autoStartTier: 'high', autoSampleSec: 3, autoCooldownSec: 10, autoDropFps: 40 });
    G.setPref('auto');
    rec('high');
    t = performance.now() + 11000;
    for (let i = 0; i < 70; i++) { t += 50; G.tick(t, 0.05); }
    rec('toMid');
    const midNow = G.applied();
    const tMid = t;
    for (let i = 0; i < 70; i++) { t += 50; G.tick(t, 0.05); }
    rec('cool');
    const duringCool = G.applied();
    t = tMid + 11000;
    for (let i = 0; i < 70; i++) { t += 50; G.tick(t, 0.05); }
    rec('toLow');
    const afterCool = G.applied();
    G.configure(window.__island.cfg().raw.graphics);
    G.setPref('auto');
    G.freezeAuto(true);
    return { clamped, afterDrop, noUpgrade, midNow, duringCool, afterCool, log };
  });
  must(autoLogic.clamped === 'mid', '自動即使 autoStartTier=high 也不得套用高檔，實際 ' + autoLogic.clamped);
  must(autoLogic.afterDrop === 'low', '低於 40fps 應從中檔降到低檔，實際 ' + autoLogic.afterDrop);
  must(autoLogic.noUpgrade === 'low', '自動不得回升，實際 ' + autoLogic.noUpgrade);
  must(autoLogic.midNow === 'mid', '高檔低幀應降一級到中，實際 ' + autoLogic.midNow);
  must(autoLogic.duringCool === 'mid', '10 秒冷卻內不得再降，實際 ' + autoLogic.duringCool);
  must(autoLogic.afterCool === 'low', '冷卻後可再降一級，實際 ' + autoLogic.afterCool);
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
        const dump = window.__island.dumpGfx();
        return { level: levelId, tier: gfxTier, info: g, dumpCalls: dump && dump.calls };
      }, id, tier);
      reports.push(info);
      const g = info.info;
      console.log('[island-gfx]', JSON.stringify({
        level: info.level, pref: g.pref, applied: g.applied,
        calls: g.calls, triangles: g.triangles, textures: g.textures,
        budget: g.budget, over: g.over, sky: g.spec && g.spec.sky
      }));
      must(g.applied === tier, info.level + ' 畫質應為 ' + tier + '，實際 ' + g.applied);
      must(g.calls > 0 && g.triangles > 0, info.level + '@' + tier + ' renderer.info 沒有輸出');
      must(!g.over.triangles, info.level + '@' + tier + ' 三角面超預算 ' + g.triangles + '>' + g.budget.triangles);
      must(!g.over.drawCalls, info.level + '@' + tier + ' draw calls 超預算 ' + g.calls + '>' + g.budget.drawCalls);
      must((g.spec.maxTex || 0) <= g.budget.maxTex, info.level + '@' + tier + ' 貼圖上限超過預算');
      if (tier === 'low') must(g.spec.sky === 'flat' && !g.spec.heightFog, '低檔應走便宜天空');
      if (tier === 'mid' || tier === 'high') must(g.spec.sky === 'dome' && g.spec.heightFog, tier + ' 應有穹頂與高度霧');
    }
  }

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
