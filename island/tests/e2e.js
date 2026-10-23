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
  const params = {};
  extra.split('&').forEach(p => {
    if (!p) return;
    const i = p.indexOf('=');
    params[i < 0 ? p : p.slice(0, i)] = i < 0 ? '1' : p.slice(i + 1);
  });
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
  try {
    await page.waitForFunction(() => {
      const dlg = document.getElementById('dlg');
      const t = document.getElementById('dText');
      const n = document.getElementById('dName');
      if (!dlg || dlg.hidden || !t || !t.textContent) return false;
      const s = ((n && n.textContent) || '') + t.textContent;
      return /回來就好|便當。我說話算話|名單我會親自簽|坑道裡還有三個名字|這不是勝利|離島防務順利恢復|指揮官倒下了|去過島上|南灘通信|他關掉電視/.test(s);
    }, { timeout: 20000 });
    await page.screenshot({ path: path.join(outDir, `${mode}-ending-dlg.png`) });
  } catch (e) { log('ending dlg shot skipped', e.message); }
  await page.waitForFunction(() => window.__island && __island.phase() === 'done', { timeout: 60000 });
  await sleep(400);
  await page.screenshot({ path: path.join(outDir, `${mode}-99-done.png`) });

  const info = await page.evaluate(() => {
    const s = __island.save();
    return {
      phase: __island.phase(),
      flags: s && s.flags,
      fates: s && s.companionFates,
      rolls: s && s.fateRolls,
      ending: s && s.ending,
      endingVariant: s && s.endingVariant,
      endingLines: s && s.endingLines,
      hqCamp: s && s._hqCamp,
      jeepChat: s && s._jeepChat,
      bossForced: !!(s && s._bossForced),
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
  if (!info.endingVariant) throw new Error('沒有結局版本');
  if (!info.endingLines || !info.endingLines.length) throw new Error('沒有結局對白');
  if (!info.hqCamp) throw new Error('沒有營區場景');
  const joined = info.endingLines.join('\n');
  info.endingLines.forEach(t => {
    const i = String(t).indexOf(':');
    const text = i < 0 ? String(t) : String(t).slice(i + 1);
    if (!text.trim()) throw new Error('結局空對話框: ' + JSON.stringify(t));
  });
  const campId = info.hqCamp;
  if (info.fates.wang === 'kia' && info.fates.akai === 'kia' && info.fates.lin === 'kia' && campId !== 'hq_camp_alone') throw new Error('三人陣亡應為 alone，實際 ' + campId);
  if (info.fates.wang === 'kia' && info.fates.akai === 'kia' && info.fates.lin !== 'kia' && campId !== 'hq_camp_lin_only') throw new Error('只剩小林應為 lin_only，實際 ' + campId);
  if (info.fates.wang === 'kia' && info.fates.lin === 'kia' && info.fates.akai !== 'kia' && campId !== 'hq_camp_akai_only') throw new Error('只剩阿凱應為 akai_only，實際 ' + campId);
  if (info.fates.wang !== 'kia' && info.fates.akai === 'kia' && info.fates.lin === 'kia' && campId !== 'hq_camp_wang_only') throw new Error('只剩王班長應為 wang_only，實際 ' + campId);
  if (!info.flags.isl_commander_captured && !info.flags.isl_commander_killed) throw new Error('沒有指揮官旗標');
  if (info.fates.lin !== 'kia' && !info.rolls['lin:op5_hq']) throw new Error('第 5 關小林擲骰沒寫入');
  if (info.fates.akai !== 'kia' && !info.rolls['akai:op5_hq']) throw new Error('第 5 關阿凱擲骰沒寫入');
  if (params.ending === 'silent_a' && (info.ending !== 'silent_island' || info.endingVariant !== 'silent_a')) throw new Error('應為沉默的島 A，實際 ' + info.ending + '/' + info.endingVariant);
  if ((params.ending === 'silent' || params.ending === 'silent_b') && (info.ending !== 'silent_island' || info.endingVariant !== 'silent_b')) throw new Error('應為沉默的島 B，實際 ' + info.ending + '/' + info.endingVariant);
  if (params.ending === 'nameless' && info.ending !== 'nameless_line') throw new Error('應為無名防線，實際 ' + info.ending);
  if (params.ending === 'guard' && info.ending !== 'island_guard') throw new Error('應為島嶼守衛，實際 ' + info.ending);
  if (!params.ending && extra.indexOf('boss=kill') < 0 && extra.indexOf('captive=leave') < 0 && extra.indexOf('down=1') < 0 && extra.indexOf('fate=kia') < 0 && extra.indexOf('akai=kia') < 0 && extra.indexOf('wang=kia') < 0 && extra.indexOf('lin=kia') < 0 && extra.indexOf('scout=kill') < 0 && info.ending !== 'island_guard') throw new Error('預設應為島嶼守衛，實際 ' + info.ending);
  if (info.ending === 'island_guard') {
    if (!/回來就好/.test(joined)) throw new Error('島嶼守衛缺少碼頭「回來就好」');
    if (!/便當。我說話算話/.test(joined)) throw new Error('島嶼守衛便當句未改');
    if (!/去過島上的/.test(joined)) throw new Error('島嶼守衛缺少水電行客人問句');
    if (params.chat === 'wang' && !/你是來找人的/.test(joined)) throw new Error('島嶼守衛缺少王班長找人回聲');
  }
  if (info.ending === 'nameless_line') {
    if (!/離島防務順利恢復/.test(joined)) throw new Error('無名防線缺少新聞「離島防務順利恢復」');
    if (!/他關掉電視，沒有說話/.test(joined)) throw new Error('無名防線缺少關電視旁白');
    if (/^方子豪:\s*$/m.test(joined)) throw new Error('無名防線不該有空的方子豪對話框');
    if (info.fates.lin !== 'kia' && info.fates.akai !== 'kia' && info.fates.wang !== 'kia' && !/指揮官倒下了/.test(joined)) throw new Error('無名防線無人死應有前綴');
    if (info.fates.lin === 'kia' && info.fates.akai !== 'kia' && info.fates.wang !== 'kia' && !/南灘通信，小林/.test(joined)) throw new Error('無名防線小林陣亡前綴錯誤');
    if (info.fates.akai === 'kia' && info.fates.lin !== 'kia' && info.fates.wang !== 'kia' && !/還沒簽完那張保單/.test(joined)) throw new Error('無名防線阿凱陣亡前綴錯誤');
    if (info.fates.wang === 'kia' && info.fates.lin !== 'kia' && info.fates.akai !== 'kia' && !/他帶過的人/.test(joined)) throw new Error('無名防線王班長陣亡前綴錯誤');
  }
  if (info.endingVariant === 'silent_a') {
    if (!/名單我會親自簽/.test(joined)) throw new Error('沉默的島 A 缺少「名單我會親自簽」');
    if (info.fates.lin === 'kia' && !/小林，南灘通信/.test(joined)) throw new Error('沉默的島 A 沒念小林');
    if (info.fates.akai === 'kia' && !/阿凱，保險業務/.test(joined)) throw new Error('沉默的島 A 沒念阿凱');
    if (info.fates.wang === 'kia' && !/王班長。方子豪的班長/.test(joined)) throw new Error('沉默的島 A 沒念王班長');
  }
  if (info.endingVariant === 'silent_b') {
    if (/頻道裡人少了/.test(joined)) throw new Error('沉默的島 B 不該出現「頻道裡人少了」');
    if (!/坑道裡還有三個名字/.test(joined)) throw new Error('沉默的島 B 缺少俘虜名單');
    if (!/這不是勝利/.test(joined)) throw new Error('沉默的島 B 缺少「這不是勝利」');
    const kiaN = ['wang', 'akai', 'lin'].filter(id => info.fates[id] === 'kia').length;
    if (kiaN === 1) {
      if (info.fates.lin === 'kia' && !/小林，南灘通信/.test(joined)) throw new Error('沉默 B 一人死沒念小林');
      if (info.fates.akai === 'kia' && !/阿凱，保險業務/.test(joined)) throw new Error('沉默 B 一人死沒念阿凱');
      if (info.fates.wang === 'kia' && !/王班長。方子豪的班長/.test(joined)) throw new Error('沉默 B 一人死沒念王班長');
      const iName = info.endingLines.findIndex(t => /小林，南灘通信|阿凱，保險業務|王班長。方子豪的班長/.test(t));
      const iEnd = info.endingLines.findIndex(t => /這不是勝利/.test(t));
      if (iName < 0 || iName > iEnd) throw new Error('沉默 B 名單句應在「這不是勝利」之前');
    }
  }
  if (params.hq === 'jeep') {
    if (!info.jeepChat || !info.jeepChat.length) throw new Error('吉普車沒有車上對白');
    if (info.fates.akai !== 'kia' && !info.jeepChat.some(t => /保險業務車/.test(t))) throw new Error('阿凱活著時吉普車應有阿凱台詞');
    if (info.fates.lin !== 'kia' && !info.jeepChat.some(t => /天線我抓著/.test(t))) throw new Error('小林活著時吉普車應有小林台詞');
    if (info.fates.akai === 'kia' && info.jeepChat.some(t => /阿凱/.test(t))) throw new Error('阿凱陣亡不該在吉普車上說話');
    if (info.fates.lin === 'kia' && info.jeepChat.some(t => /小林/.test(t))) throw new Error('小林陣亡不該在吉普車上說話');
  }
  if (params.scout === 'kill' && (params.antenna === 'warehouse' || params.antenna === 'weak')) {
    if (!info.bossForced) throw new Error('殺斥候且弱訊號應強制擊斃指揮官');
    if (info.flags.isl_commander_captured) throw new Error('不該能活捉指揮官');
  }
  if (!info.flags.isl_tunnel_stealth && !info.flags.isl_tunnel_assault && !info.flags.isl_rail_escape && !info.flags.isl_tunnel_jeep) throw new Error('沒有坑道打法旗標');
  if (!info.flags.isl_captives_rescued && !info.flags.isl_captives_left) throw new Error('沒有俘虜旗標');
  if (info.fates.wang !== 'alive' && info.fates.wang !== 'kia') throw new Error('王班長命運沒寫入');
  if (!info.rolls || !info.rolls['lin:op1_landing']) throw new Error('小林第 1 關擲骰沒寫入');
  if (info.rolls['lin:op1_landing'] !== 'kia' && !info.rolls['lin:op3_ridge']) throw new Error('小林第 3 關擲骰沒寫入');
  if (info.rolls['lin:op1_landing'] !== 'kia' && info.rolls['lin:op3_ridge'] !== 'kia' && !info.rolls['lin:op4_tunnel']) throw new Error('小林第 4 關擲骰沒寫入');
  if (info.rolls['lin:op2_radar']) throw new Error('小林第 2 關不該擲骰');
  if (!info.rolls['akai:op3_ridge']) throw new Error('阿凱第 3 關擲骰沒寫入');
  if (info.rolls['akai:op3_ridge'] !== 'kia' && !info.rolls['akai:op4_tunnel']) throw new Error('阿凱第 4 關擲骰沒寫入');
  if (info.rolls['akai:op2_radar']) throw new Error('阿凱第 2 關不該擲骰');
  if (extra.indexOf('tunnel=rail') >= 0 && !info.flags.isl_rail_escape) throw new Error('沒有軌道車旗標');
  if (extra.indexOf('tunnel=jeep') >= 0 && !info.flags.isl_tunnel_jeep) throw new Error('沒有坑道吉普旗標');
  if (extra.indexOf('captive=leave') >= 0 && !info.flags.isl_captives_left) throw new Error('俘虜留下旗標沒設');
  if (extra.indexOf('captive=leave') < 0 && params.ending !== 'silent' && params.ending !== 'silent_b' && extra.indexOf('down=1') < 0 && !info.flags.isl_captives_rescued) throw new Error('預設應救出俘虜');
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
