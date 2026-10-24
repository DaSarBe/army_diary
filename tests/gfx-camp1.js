/* 主遊戲 camp1 畫面升級：畫質表、自動降級、角色面數、場景預算、互動點。 */
const puppeteer = require('puppeteer-core');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME || '/usr/local/bin/google-chrome';
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.fbx': 'application/octet-stream'
};

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

const TIERS = ['low', 'mid', 'high'];
const TABLE_KEYS = ['pixelRatio', 'antialias', 'shadows', 'bloom', 'vignette', 'toneMapping', 'shadowFilter', 'maxTex'];
const BUDGET = {
  low: { triangles: 60000, drawCalls: 80 },
  mid: { triangles: 120000, drawCalls: 120 },
  high: { triangles: 200000, drawCalls: 180 }
};

function pinJsonTable() {
  const g = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/army-gfx.json'), 'utf8'));
  must(g && g.defaultPref === 'auto', '預設畫質應為自動');
  must(g.autoStartTier === 'mid', '自動應從中檔起跳');
  must(g.autoNeverHigh === true, '自動不得升到高檔');
  must(g.autoDropFps === 32, '降級門檻應為 32fps');
  must(g.autoSampleSec === 3, '取樣應約 3 秒');
  must(g.autoWarmupSec === 4, '可操作後應再等 4 秒才開始取樣');
  must(g.autoDropStrikes === 2, '應連續兩次低於門檻才降級');
  must(g.autoCooldownSec === 10, '降級冷卻應至少 10 秒');
  must(g.characterTriangles === 3000, '單個角色三角面上限應為 3000');
  TIERS.forEach(t => {
    TABLE_KEYS.forEach(k => must(g.tiers[t][k] != null, t + ' 缺少 ' + k));
    must(g.budget[t].triangles === BUDGET[t].triangles, t + ' 三角面預算被放寬或改動');
    must(g.budget[t].drawCalls === BUDGET[t].drawCalls, t + ' draw call 預算被放寬或改動');
  });
  must(g.tiers.low.shadows === false && g.tiers.low.bloom === false && g.tiers.low.vignette === false, '低檔應關陰影與後製');
  must(g.tiers.low.pixelRatio === 1, '低檔像素比應為 1');
  must(g.tiers.low.shadowFilter === 'none', '低檔陰影濾鏡應為 none');
  must(g.tiers.mid.shadows === true && g.tiers.high.shadows === true, '中高檔應有陰影');
  must(g.tiers.mid.bloom === false && g.tiers.mid.vignette === true && g.tiers.mid.toneMapping === true, '中檔應關泛光、只留暗角與色調');
  must(g.tiers.mid.shadowFilter === 'pcf', '中檔陰影應為 PCFShadowMap');
  must(g.tiers.high.bloom === true && g.tiers.high.vignette === true, '高檔應有泛光與暗角');
  must(g.tiers.high.shadowFilter === 'pcfsoft', '高檔陰影應為 PCFSoftShadowMap');
  console.log('json-graphics-table ok');
}

async function main() {
  pinJsonTable();
  const port = 9060 + Math.floor(Math.random() * 40);
  const srv = await serve(port);
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage();
  const pageErrs = [];
  page.on('pageerror', e => pageErrs.push(e.message));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`http://localhost:${port}/index.html?test=1&fpshud=1&gfx=mid`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && __game.phase() === 'title' && __game.W && __game.W.ok && window.Gfx, { timeout: 25000 });
  await page.waitForFunction(() => window.Chars && (Chars.ready() || Chars.error()), { timeout: 25000 });
  const charErr = await page.evaluate(() => window.Chars && Chars.error() && String(Chars.error()));
  must(!charErr, '角色 GLB 載入失敗：' + charErr);

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
      hudHidden: document.getElementById('gfxHud').hidden,
      charTri: window.Chars.triCount()
    };
  });
  must(table.neverHigh === true, 'autoNeverHigh 應開啟');
  must(table.dropFps === 32, '門檻應為 32fps');
  must(table.warmup === 4 && table.strikes === 2, '應為 4 秒暖機、連續 2 次才降');
  TABLE_KEYS.forEach(k => must(table.keys.indexOf(k) >= 0, '設定表缺少 ' + k));
  must(table.hud === true, '?fpshud=1 應開啟 FPS 顯示');
  must(table.hudHidden === false, 'FPS 疊層應可見');
  must(table.charTri > 0 && table.charTri <= 3000, '單個角色應 ≤3000 三角面，實際 ' + table.charTri);
  const tex = await page.evaluate(() => window.Chars.texInfo());
  must(tex.flipY === true, '軍服 PNG 應對齊 Kenney UV，flipY 應為 true，實際 ' + tex.flipY);
  must(tex.keys.indexOf('ua') >= 0 && tex.keys.indexOf('ub') >= 0 && tex.keys.indexOf('uc') >= 0, '應載入 3 種軍服 skin');
  must(tex.w === 256, 'skin 應為 256 圖集，實際 ' + tex.w);
  console.log('gfx-defaults ok charTri=' + table.charTri, 'tex', JSON.stringify(tex));

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
    t = pump(t, 90, 0.05);
    rec('warm');
    const afterWarm = G.applied();
    t = pump(t, 70, 0.05);
    rec('one');
    const afterOne = G.applied();
    t = pump(t, 70, 0.05);
    rec('two');
    const afterDrop = G.applied();

    t = pump(t, 80, 1 / 120);
    rec('noUp');
    const noUpgrade = G.applied();

    G.setPref('auto');
    rec('reset');
    t = performance.now() + 20000;
    t = pump(t, 90, 0.05);
    function spikeWindow() {
      t = pump(t, 180, 1 / 60);
      t = pump(t, 1, 0.2);
    }
    spikeWindow();
    spikeWindow();
    rec('spike');
    const afterSpike = G.applied();

    t = performance.now() + 20000;
    G.resetPlay();
    t = pump(t, 45, 0.05);
    t = pump(t, 90, 0.05, { mode: 'play', paused: true, hidden: false });
    t = pump(t, 90, 0.05, { mode: 'play', paused: false, hidden: true });
    t = pump(t, 90, 0.05, { mode: 'talk', paused: false, hidden: false });
    rec('paused');
    const duringPause = G.applied();
    t = pump(t, 45, 0.05);
    t = pump(t, 70, 0.05);
    rec('stillWarm');
    const stillNeedTwo = G.applied();
    t = pump(t, 70, 0.05);
    rec('afterPause');
    const afterPause = G.applied();

    G.configure({ autoNeverHigh: false, autoStartTier: 'high', autoSampleSec: 3, autoWarmupSec: 4, autoDropStrikes: 2, autoCooldownSec: 10, autoDropFps: 32 });
    G.setPref('auto');
    rec('high');
    t = performance.now() + 20000;
    t = pump(t, 90, 0.05);
    t = pump(t, 70, 0.05);
    t = pump(t, 70, 0.05);
    rec('toMid');
    const midNow = G.applied();
    const tMid = t;
    t = pump(t, 70, 0.05);
    t = pump(t, 70, 0.05);
    rec('cool');
    const duringCool = G.applied();
    t = tMid + 11000;
    t = pump(t, 70, 0.05);
    t = pump(t, 70, 0.05);
    rec('toLow');
    const afterCool = G.applied();

    fetch('data/army-gfx.json').then(function () { /* restore happens below */ });
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

  await page.evaluate(async () => {
    const raw = await fetch('data/army-gfx.json').then(r => r.json());
    Gfx.configure(raw);
    Gfx.freezeAuto(true);
    Gfx.setPref('mid', function (s) { if (window.World && World.applyGfx) World.applyGfx(s); });
  });

  const reports = [];
  for (const tier of TIERS) {
    const info = await page.evaluate(async (gfxTier) => {
      Gfx.setPref(gfxTier, function (s) { if (World.applyGfx) World.applyGfx(s); });
      __game.title();
      await new Promise(function (r) {
        if (Chars.ready()) r();
        else Chars.whenReady(r);
      });
      if (World.onCharsReady) World.onCharsReady();
      World.place(0, -8);
      World.S.yaw = 0.55; World.S.pitch = 0.32;
      World.renderOnce(); World.renderOnce();
      return { tier: gfxTier, info: World.gfxInfo(), models: Object.keys(World.S.npcs).filter(id => World.S.npcs[id].g && World.S.npcs[id].g.userData && World.S.npcs[id].g.userData.model).length };
    }, tier);
    reports.push(info);
    const g = info.info;
    const cap = BUDGET[tier];
    console.log('[camp1-gfx]', JSON.stringify({
      tier: info.tier, calls: g.calls, triangles: g.triangles,
      sceneCalls: g.sceneCalls, sceneTriangles: g.sceneTriangles,
      capTriangles: cap.triangles, capCalls: cap.drawCalls,
      charTriangles: g.charTriangles, models: info.models,
      shadowFilter: g.shadowFilter, bloom: g.spec.bloom, vignette: g.spec.vignette, over: g.over
    }));
    must(g.applied === tier, 'camp1 畫質應為 ' + tier + '，實際 ' + g.applied);
    must(g.calls > 0 && g.triangles > 0, 'camp1@' + tier + ' renderer.info 整幀計數為 0');
    must(g.charTriangles <= 3000, '角色三角面超標 ' + g.charTriangles);
    must(info.models > 0, 'camp1@' + tier + ' 應有 GLTF 角色');
    must(g.triangles <= cap.triangles, 'camp1@' + tier + ' 整幀三角面超預算 ' + g.triangles + '>' + cap.triangles + '（不放寬）');
    must(g.calls <= cap.drawCalls, 'camp1@' + tier + ' 整幀 draw calls 超預算 ' + g.calls + '>' + cap.drawCalls + '（不放寬）');
    if (tier === 'low') {
      must(g.spec.shadows === false && g.spec.bloom === false && g.spec.pixelRatio === 1, '低檔應關陰影／後製且像素比 1');
      must(g.shadowFilter === 'none', '低檔實際陰影濾鏡應為 none，實際 ' + g.shadowFilter);
    }
    if (tier === 'mid') {
      must(g.spec.shadows === true && g.spec.bloom === false && g.spec.vignette === true && g.spec.toneMapping === true, '中檔應有陰影、關泛光、留暗角與色調');
      must(g.shadowFilter === 'pcf', '中檔實際陰影應為 PCF，實際 ' + g.shadowFilter);
    }
    if (tier === 'high') {
      must(g.spec.shadows === true && g.spec.bloom === true && g.spec.vignette === true, '高檔應有陰影、泛光與暗角');
      must(g.shadowFilter === 'pcfsoft', '高檔實際陰影應為 PCFSoft，實際 ' + g.shadowFilter);
    }
  }

  const reach = await page.evaluate(() => {
    const W = World, P = Places;
    const badCol = [], badNpc = [];
    const places = P.mapPlaces('camp1') || [];
    const solids = (W.S.cols || []).filter(c => !c.noRay);
    const npcs = Object.keys(W.S.npcs).map(id => W.S.npcs[id]);
    places.forEach(p => {
      solids.forEach(c => {
        if (p.x > c.x0 - 0.2 && p.x < c.x1 + 0.2 && p.z > c.z0 - 0.2 && p.z < c.z1 + 0.2) {
          badCol.push(p.label + '@' + p.x + ',' + p.z);
        }
      });
      npcs.forEach(n => {
        if (!n.col) return;
        const c = n.col;
        const hx = (c.x1 - c.x0) / 2, hz = (c.z1 - c.z0) / 2;
        if (Math.abs(hx - 0.35) > 0.02 || Math.abs(hz - 0.35) > 0.02) badNpc.push('extent ' + n.id);
        if (p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1) badNpc.push(p.label + ' inside ' + (n.id || n.preset));
      });
    });
    const flag = { red: 0, blue: 0, whiteSun: 0 };
    W.scene().traverse(m => {
      if (!m.isMesh || !m.material || !m.material.color) return;
      const hex = m.material.color.getHexString();
      if (hex === 'c8312b') flag.red++;
      if (hex === '1f3f8f') flag.blue++;
    });
    return { badCol: badCol.slice(0, 8), badNpc: badNpc.slice(0, 8), npcCol: npcs.filter(n => n.col).length, flag };
  });
  must(reach.badCol.length === 0, '互動點落入建築碰撞：' + reach.badCol.join('; '));
  must(reach.badNpc.length === 0, '互動點落入 NPC 碰撞或碰撞變大：' + reach.badNpc.join('; '));
  must(reach.flag.blue === 0, 'camp1 不應再出現藍白太陽旗色');
  console.log('interact-and-flag ok npcs=' + reach.npcCol);

  const hudText = await page.evaluate(() => {
    window.Gfx.paintHud({ fps: 48, calls: 12, triangles: 3400 });
    return document.getElementById('gfxHud').textContent;
  });
  must(/FPS/.test(hudText) && /dc/.test(hudText) && /tri/.test(hudText), 'HUD 應顯示 FPS／draw calls／三角面：' + hudText);

  await browser.close();
  srv.close();
  if (pageErrs.length) console.warn('page errors', pageErrs.slice(0, 6));
  reports.forEach(r => {
    console.log('camp1\t' + r.tier + '\ttri=' + r.info.triangles + '/' + BUDGET[r.tier].triangles + '\tdc=' + r.info.calls + '/' + BUDGET[r.tier].drawCalls + '\tfilter=' + r.info.shadowFilter + '\tbloom=' + r.info.spec.bloom);
  });
  console.log('gfx-camp1 ok', reports.length, 'samples');
}

main().catch(e => { console.error(e); process.exit(1); });
