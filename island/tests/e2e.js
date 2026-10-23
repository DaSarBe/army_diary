/* 島嶼守備 E2E：桌機 1280×800 與手機 390×844 各跑第 1 到 5 關。 */
const puppeteer = require('puppeteer-core');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CHROME = process.env.CHROME || '/usr/local/bin/google-chrome';
const mode = process.argv[2] || 'desktop';
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
const log = (...a) => console.log(`[island ${mode}]`, ...a);

async function main() {
  const port = 8900 + Math.floor(Math.random() * 80);
  const srv = await serve(port);
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
  page.on('pageerror', e => { errors.push('PAGEERROR: ' + e.message); log('PAGEERROR', e.message); });
  page.on('requestfailed', r => errors.push('REQFAIL: ' + r.url()));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });

  const extra = process.argv[3] || 'route=bike&antenna=ridge';
  const url = `http://localhost:${port}/island/index.html?auto=1&diff=story&${extra}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__island, { timeout: 20000 });
  await sleep(800);
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `${mode}-01-title.png`) });

  await page.waitForFunction(() => window.__island && __island.phase() === 'play', { timeout: 20000 });
  await sleep(400);
  await page.screenshot({ path: path.join(outDir, `${mode}-02-play.png`) });

  const spec = await page.evaluate(() => {
    const c = __island.cfg();
    return {
      t65sway: c && c.weapons && c.weapons.t65 && c.weapons.t65.swayMul,
      jeepSeats: !!(__island.World && __island.World.cycleSeat),
      jeepGun: !!(__island.Combat && __island.Combat.jeepGun)
    };
  });
  if (spec.t65sway !== 0.6) throw new Error('T65K2 swayMul 應為 0.6，實際 ' + spec.t65sway);
  if (!spec.jeepSeats) throw new Error('吉普車沒有 cycleSeat');

  const ch4Shot = page.waitForFunction(() => {
    const lv = window.__island && __island.level && __island.level();
    return lv && lv.id === 'op4_tunnel';
  }, { timeout: extra.indexOf('down=1') >= 0 ? 320000 : 280000 }).then(async () => {
    await sleep(700);
    await page.screenshot({ path: path.join(outDir, `${mode}-04-tunnel.png`) });
  });
  const ch5Shot = page.waitForFunction(() => {
    const lv = window.__island && __island.level && __island.level();
    return lv && lv.id === 'op5_hq';
  }, { timeout: extra.indexOf('down=1') >= 0 ? 360000 : 320000 }).then(async () => {
    await sleep(700);
    await page.screenshot({ path: path.join(outDir, `${mode}-05-hq.png`) });
  });

  await page.waitForFunction(() => {
    const s = window.__island && __island.save && __island.save();
    return s && s.flags && s.flags.isl_05_clear;
  }, { timeout: extra.indexOf('down=1') >= 0 ? 400000 : 360000 });

  await ch4Shot.catch(() => {});
  await ch5Shot.catch(() => {});
  await sleep(500);
  await page.screenshot({ path: path.join(outDir, `${mode}-99-done.png`) });

  const info = await page.evaluate(() => {
    const s = __island.save();
    return {
      phase: __island.phase(),
      flags: s && s.flags,
      fates: s && s.companionFates,
      rolls: s && s.fateRolls,
      ending: s && s.ending,
      diff: s && s.diff,
      downSeen: !!(s && s.downSeen),
      o: s && s.o,
      renderer: !!(__island.World && __island.World.renderer && __island.World.renderer()),
      combat: !!(__island.Combat && __island.Combat.session && __island.Combat.session())
    };
  });
  info.spec = spec;
  log('result', JSON.stringify(info));
  const fatal = errors.filter(e => /PAGEERROR|HTTP 4|HTTP 5|REQFAIL|error:/i.test(e) && !/favicon|AudioContext|pointer lock/i.test(e));
  if (fatal.length) {
    log('errors', fatal);
    throw new Error('console errors: ' + fatal.slice(0, 8).join(' | '));
  }
  if (!info.flags || !info.flags.isl_01_clear) throw new Error('第 1 關沒有打完');
  if (!info.flags.isl_02_clear) throw new Error('第 2 關沒有打完');
  if (!info.flags.isl_03_clear) throw new Error('第 3 關沒有打完');
  if (!info.flags.isl_04_clear) throw new Error('第 4 關沒有打完');
  if (!info.flags.isl_05_clear) throw new Error('第 5 關沒有打完');
  if (!info.ending) throw new Error('沒有結局');
  if (!info.flags.isl_commander_captured && !info.flags.isl_commander_killed) throw new Error('沒有指揮官旗標');
  if (!info.rolls['lin:op5_hq'] || !info.rolls['akai:op5_hq']) throw new Error('第 5 關小林／阿凱擲骰沒寫入');
  if (extra.indexOf('ending=silent') >= 0 && info.ending !== 'silent_island') throw new Error('應為沉默的島，實際 ' + info.ending);
  if (extra.indexOf('ending=nameless') >= 0 && info.ending !== 'nameless_line') throw new Error('應為無名防線，實際 ' + info.ending);
  if (extra.indexOf('ending=guard') >= 0 && info.ending !== 'island_guard') throw new Error('應為島嶼守衛，實際 ' + info.ending);
  if (extra.indexOf('ending=') < 0 && extra.indexOf('boss=kill') < 0 && extra.indexOf('captive=leave') < 0 && extra.indexOf('down=1') < 0 && extra.indexOf('fate=kia') < 0 && info.ending !== 'island_guard') throw new Error('預設應為島嶼守衛，實際 ' + info.ending);
  if (!info.flags.isl_tunnel_stealth && !info.flags.isl_tunnel_assault && !info.flags.isl_rail_escape && !info.flags.isl_tunnel_jeep) throw new Error('沒有坑道打法旗標');
  if (!info.flags.isl_captives_rescued && !info.flags.isl_captives_left) throw new Error('沒有俘虜旗標');
  if (info.fates.wang !== 'alive' && info.fates.wang !== 'kia') throw new Error('王班長命運沒寫入');
  if (!info.rolls || !info.rolls['lin:op1_landing'] || !info.rolls['lin:op3_ridge'] || !info.rolls['lin:op4_tunnel']) throw new Error('小林第 1、3、4 關擲骰沒寫入');
  if (info.rolls['lin:op2_radar']) throw new Error('小林第 2 關不該擲骰');
  if (!info.rolls['akai:op3_ridge'] || !info.rolls['akai:op4_tunnel']) throw new Error('阿凱第 3、4 關擲骰沒寫入');
  if (info.rolls['akai:op2_radar']) throw new Error('阿凱第 2 關不該擲骰');
  if (extra.indexOf('tunnel=rail') >= 0 && !info.flags.isl_rail_escape) throw new Error('沒有軌道車旗標');
  if (extra.indexOf('tunnel=jeep') >= 0 && !info.flags.isl_tunnel_jeep) throw new Error('沒有坑道吉普旗標');
  if (extra.indexOf('captive=leave') >= 0 && !info.flags.isl_captives_left) throw new Error('俘虜留下旗標沒設');
  if (extra.indexOf('captive=leave') < 0 && extra.indexOf('ending=silent') < 0 && extra.indexOf('down=1') < 0 && !info.flags.isl_captives_rescued) throw new Error('預設應救出俘虜');
  if (!info.flags.isl_spared_scout && !info.flags.isl_killed_scout) throw new Error('沒有斥候旗標');
  if (!info.flags.isl_ridge_walk && !info.flags.isl_bike_dash && !info.flags.isl_ridge_trail) throw new Error('沒有稜線打法旗標');
  if (!info.flags.isl_flank_by_bike && !info.flags.isl_flank_by_sea && !info.flags.isl_flank_front && !info.flags.isl_stealth) throw new Error('沒有打法旗標');
  const routes = ['isl_flank_front', 'isl_flank_by_sea', 'isl_flank_by_bike', 'isl_stealth'].filter(k => info.flags[k]);
  if (routes.length !== 1) throw new Error('打法旗標沒互斥: ' + routes.join(','));
  if (typeof info.o !== 'number') throw new Error('袍澤值 o 沒寫入');
  if (!info.flags.isl_radio_strong && !info.flags.isl_radio_weak) throw new Error('沒有天線旗標');
  if (!info.flags.isl_akai_with_you && !info.flags.isl_akai_outside) throw new Error('沒有阿凱同行旗標');
  if (!info.flags.isl_jeep_driver_akai && !info.flags.isl_jeep_driver_lin && !info.flags.isl_jeep_driver_player) throw new Error('沒有吉普駕駛旗標');
  if (extra.indexOf('power=0') >= 0 && info.flags.isl_power_restored) throw new Error('摸黑不該設復電旗標');
  if (extra.indexOf('power=late') >= 0) {
    if (info.flags.isl_power_restored) throw new Error('戰後復電不該設 isl_power_restored');
    if (!info.flags.isl_power_restored_late) throw new Error('戰後復電應設 isl_power_restored_late');
  }
  if (extra.indexOf('power=0') < 0 && extra.indexOf('power=late') < 0 && extra.indexOf('down=1') < 0 && !info.flags.isl_power_restored) throw new Error('預設應中途復電');
  if (!info.fates || (info.fates.lin !== 'alive' && info.fates.lin !== 'kia')) throw new Error('第 1 關同袍命運沒接到第 2 關');
  if (info.fates.akai !== 'alive' && info.fates.akai !== 'kia') throw new Error('阿凱沒在第 3 關結束寫入命運');
  if (extra.indexOf('down=1') >= 0 && !info.downSeen) throw new Error('倒下重試沒有觸發');
  if (extra.indexOf('route=sea') >= 0 && !info.flags.isl_flank_by_sea) throw new Error('沒有舢舨旗標');
  if (extra.indexOf('antenna=warehouse') >= 0 && !info.flags.isl_radio_weak) throw new Error('沒有弱訊號天線');
  fs.writeFileSync(path.join(outDir, `${mode}-result.json`), JSON.stringify({ info, errors }, null, 2));
  await browser.close(); srv.close();
  log('ok');
}

main().catch(e => { console.error(e); process.exit(1); });
