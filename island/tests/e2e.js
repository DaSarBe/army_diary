/* 島嶼守備 E2E：桌機 1280×800 與手機 390×844 各跑一輪第 1 關。 */
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

  const url = `http://localhost:${port}/island/index.html?auto=1&diff=story&route=bike&antenna=ridge`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__island, { timeout: 20000 });
  await sleep(800);
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `${mode}-01-title.png`) });

  await page.waitForFunction(() => window.__island && __island.phase() === 'play', { timeout: 20000 });
  await sleep(400);
  await page.screenshot({ path: path.join(outDir, `${mode}-02-play.png`) });

  await page.waitForFunction(() => {
    const s = window.__island && __island.save && __island.save();
    return s && (s.flags && s.flags.isl_01_clear || s._e2e === 'clear' || (window.__island.phase && __island.phase() === 'done'));
  }, { timeout: 120000 });

  await sleep(500);
  await page.screenshot({ path: path.join(outDir, `${mode}-99-done.png`) });

  const info = await page.evaluate(() => {
    const s = __island.save();
    return {
      phase: __island.phase(),
      flags: s && s.flags,
      fates: s && s.companionFates,
      diff: s && s.diff,
      renderer: !!(__island.World && __island.World.renderer && __island.World.renderer()),
      combat: !!(__island.Combat && __island.Combat.session && __island.Combat.session())
    };
  });
  log('result', JSON.stringify(info));
  const fatal = errors.filter(e => /PAGEERROR|HTTP 4|HTTP 5|REQFAIL|error:/i.test(e) && !/favicon|AudioContext|pointer lock/i.test(e));
  if (fatal.length) {
    log('errors', fatal);
    throw new Error('console errors: ' + fatal.slice(0, 8).join(' | '));
  }
  if (!info.flags || !info.flags.isl_01_clear) throw new Error('第 1 關沒有打完');
  if (!info.flags.isl_flank_by_bike && !info.flags.isl_flank_by_sea && !info.flags.isl_flank_front && !info.flags.isl_stealth) throw new Error('沒有打法旗標');
  if (!info.flags.isl_radio_strong && !info.flags.isl_radio_weak) throw new Error('沒有天線旗標');
  fs.writeFileSync(path.join(outDir, `${mode}-result.json`), JSON.stringify({ info, errors }, null, 2));
  await browser.close(); srv.close();
  log('ok');
}

main().catch(e => { console.error(e); process.exit(1); });
