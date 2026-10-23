/* 可達性：用實際玩家碰撞半徑與跨步高度，從出生點 BFS 走到每個目標。禁止傳送。 */
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
const LEVEL_FILES = {
  op1_landing: 'island/data/levels/01-beachhead.json',
  op2_radar: 'island/data/levels/02-radar.json',
  op3_ridge: 'island/data/levels/03-ridge.json',
  op4_tunnel: 'island/data/levels/04-tunnel.json',
  op5_hq: 'island/data/levels/05-hq.json'
};
const SOLID_KINDS = { bld: 1, crate: 1, rock: 1, bunker: 1, tent: 1, tree: 1, powerbox: 1 };

function propBox(p) {
  if (!p || !SOLID_KINDS[p.kind]) return null;
  if (p.kind === 'tent') return { kind: p.kind, x0: p.x - 1.2, x1: p.x + 1.2, z0: p.z - 1.2, z1: p.z + 1.2 };
  if (p.kind === 'tree') return { kind: p.kind, x0: p.x - 0.22, x1: p.x + 0.22, z0: p.z - 0.22, z1: p.z + 0.22 };
  const w = p.w || (p.kind === 'powerbox' ? 0.72 : 1);
  const d = p.d || (p.kind === 'powerbox' ? 0.38 : 1);
  return { kind: p.kind, x0: p.x - w / 2, x1: p.x + w / 2, z0: p.z - d / 2, z1: p.z + d / 2 };
}

function collectJsonPoints(lv) {
  const pts = [];
  function add(id, x, z) {
    if (x == null || z == null) return;
    pts.push({ id: id, x: x, z: z });
  }
  (lv.beats || []).forEach(b => {
    if (b.x != null) add(b.id, b.x, b.z);
    if (b.optionalPower) add(b.id + ':power', b.optionalPower.x, b.optionalPower.z);
    if (b.sites) Object.keys(b.sites).forEach(k => add(b.id + ':' + k, b.sites[k].x, b.sites[k].z));
    if (b.points) b.points.forEach(p => add('rescue:' + p.id, p.x, p.z));
    if (b.from) add(b.id + ':from', b.from[0], b.from[1]);
    if (b.to) add(b.id + ':to', b.to[0], b.to[1]);
    if (b.toByFlag) Object.keys(b.toByFlag).forEach(k => add(b.id + ':' + k, b.toByFlag[k][0], b.toByFlag[k][1]));
    if (b.wave && b.wave.frontAmmo) add('ammo', b.wave.frontAmmo.x, b.wave.frontAmmo.z);
    if (b.wave && b.wave.placed) b.wave.placed.forEach((pl, i) => add('placed:' + (pl.type || i), pl.x, pl.z));
  });
  return pts;
}

function scanJsonFootprints() {
  Object.keys(LEVEL_FILES).forEach(id => {
    const lv = JSON.parse(fs.readFileSync(path.join(ROOT, LEVEL_FILES[id]), 'utf8'));
    const boxes = (lv.map.props || []).map(propBox).filter(Boolean);
    const hits = [];
    collectJsonPoints(lv).forEach(pt => {
      const box = boxes.find(b => pt.x >= b.x0 && pt.x <= b.x1 && pt.z >= b.z0 && pt.z <= b.z1);
      if (box) hits.push(pt.id + ' inside ' + box.kind + ' @' + pt.x + ',' + pt.z);
    });
    if (hits.length) throw new Error(id + ' 目標落在實心物內：' + hits.join('; '));
    console.log(id + ' json-footprint ok');
  });
}

function pinGroundCoords() {
  function lv(id) { return JSON.parse(fs.readFileSync(path.join(ROOT, LEVEL_FILES[id]), 'utf8')); }
  function beat(L, id) { return L.beats.find(b => b.id === id); }
  const radar = lv('op2_radar');
  const assault = beat(radar, 'station_assault');
  const late = beat(radar, 'restore_power_late');
  const t75 = beat(radar, 'grab_t75');
  must(assault.optionalPower.x === -16 && assault.optionalPower.z === 65.5, '復電應在機房南面 (-16,65.5)');
  must(late.x === -16 && late.z === 65.5, '戰後復電應在 (-16,65.5)');
  must(t75.x === -6 && t75.z === 67.5, 'T75 應在雷達站外牆 (-6,67.5)');
  const gun = assault.wave.placed.find(p => p.type === 'gunner' && p.z === 69);
  must(gun && gun.x === -9, '機房內機槍兵應改到 (-9,69)');
  must(!assault.wave.placed.some(p => p.x === -14 && p.z === 68), '機房中心機槍兵不得留下');
  const ridge = lv('op3_ridge');
  const dmr = beat(ridge, 'find_dmr');
  must(dmr.x === 4 && dmr.z === 83.5, 'T65K2 應在觀測哨外牆 (4,83.5)');
  const beach = lv('op1_landing');
  const weak = beat(beach, 'plant_antenna').sites.isl_radio_weak;
  must(weak.x === 18 && weak.z === 3, '弱訊號天線應在倉庫南面 (18,3)');
  const hq = lv('op5_hq');
  const cmd = beat(hq, 'hq_fight').wave.placed.find(p => p.type === 'commander');
  must(cmd && cmd.x === 0 && cmd.z === 86, '指揮官應在指揮所後方 (0,86)');
  must(cmd.z !== 73.5, '指揮官不得貼指揮所南牆 (0,73.5)');
  console.log('dai-ground-pins ok');
}

function nearProp(lv, x, z, kind, maxd) {
  return (lv.map.props || []).some(p => p.kind === kind && Math.hypot((p.x || 0) - x, (p.z || 0) - z) <= (maxd || 1.2));
}

function pinEveCopy() {
  const story = JSON.parse(fs.readFileSync(path.join(ROOT, 'island/data/story.json'), 'utf8'));
  const sc = story.scenes || {};
  must(sc.grab_t75 && sc.grab_t75.hint === '雷達站外牆邊的箱子裡，有一把被拆下的 T75。', 'grab_t75 hint 不符 Eve 原文');
  must(sc.find_dmr && sc.find_dmr.hint === '觀測哨外牆邊的箱子裡，有一把 T65K2。', 'find_dmr hint 不符 Eve 原文');
  must(sc.power_hint && sc.power_hint.toast === '小林：「配電箱在機房外牆。要復電就得跑過兩挺機槍。」', 'power_hint toast 不符 Eve 原文');
  function lv(id) { return JSON.parse(fs.readFileSync(path.join(ROOT, LEVEL_FILES[id]), 'utf8')); }
  const radar = lv('op2_radar');
  const ridge = lv('op3_ridge');
  must(nearProp(radar, -16, 65.5, 'powerbox'), '復電點旁要有配電箱');
  must(nearProp(radar, -6, 67.5, 'crate'), 'T75 點旁要有箱子');
  must(nearProp(ridge, 4, 83.5, 'crate'), 'T65K2 點旁要有箱子');
  console.log('eve-copy-props ok');
}

const BLOCKED = {
  op2_radar: [{ id: 'old_power_on_roof', x: -16, z: 70, r: 0.8 }],
  op3_ridge: [{ id: 'old_dmr_inside', x: 4, z: 88, r: 0.8 }],
  op5_hq: [{ id: 'old_office_inside', x: 0, z: 78, r: 0.8 }]
};

async function main() {
  scanJsonFootprints();
  pinGroundCoords();
  pinEveCopy();
  const port = 9020 + Math.floor(Math.random() * 40);
  const srv = await serve(port);
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage();
  const pageErrs = [];
  page.on('pageerror', e => pageErrs.push(e.message));
  await page.goto(`http://localhost:${port}/island/index.html?test=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__island && __island.loadMapOnly && __island.World && __island.World.ok, { timeout: 20000 });

  const reports = [];
  for (const id of LEVELS) {
    const scan = await page.evaluate(async (levelId, blocked) => {
      await __island.loadMapOnly(levelId);
      const W = __island.World;
      const spawn = W.S.spawn;
      W.place(spawn[0], spawn[1]);
      const reach = __island.scanReach();
      const blockedHits = (blocked || []).map(function (b) {
        const r = W.pathReach(b.x, b.z, b.r);
        return { id: b.id, x: b.x, z: b.z, r: b.r, ok: !!r.ok };
      });
      return {
        level: reach.level,
        spawn: reach.spawn,
        radius: reach.radius,
        step: reach.step,
        jump: reach.jump,
        count: reach.results.length,
        failed: reach.failed,
        results: reach.results,
        blockedHits: blockedHits
      };
    }, id, BLOCKED[id] || []);
    reports.push(scan);
    console.log(scan.level + ' targets=' + scan.count + ' radius=' + scan.radius + ' step=' + scan.step + ' jump=' + scan.jump);
    scan.results.forEach(t => {
      console.log('  ' + (t.ok ? 'OK' : 'FAIL') + '  ' + t.id + '  (' + t.x + ',' + t.z + ') r=' + t.r);
    });
    must(scan.count > 0, scan.level + ' 沒有蒐集到目標點');
    must(scan.radius === 0.42, '玩家碰撞半徑應為 0.42');
    must(scan.step === 0.45, '跨步高度應為 0.45');
    must(scan.jump === 0, '本遊戲沒有跳躍，尋路不得假設可跳過建物');
    const inside = (scan.results || []).filter(t => t.inside);
    if (inside.length) throw new Error(scan.level + ' 目標在實心物內：' + inside.map(f => f.id + '/' + f.inside).join('; '));
    if (scan.failed.length) {
      throw new Error(scan.level + ' 不可達：' + scan.failed.map(f => f.id + '@' + f.x + ',' + f.z).join('; '));
    }
    scan.blockedHits.forEach(b => {
      must(!b.ok, scan.level + ' 建物內部 ' + b.id + ' 不該走得到（證明沒用傳送）');
    });
  }

  await browser.close();
  srv.close();
  if (pageErrs.length) console.warn('page errors', pageErrs.slice(0, 4));
  console.log('reach ok', reports.map(r => r.level + ':' + r.count).join(' '));
}

main().catch(e => { console.error(e); process.exit(1); });
