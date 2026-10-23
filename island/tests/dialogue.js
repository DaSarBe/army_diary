/* 結局／營區組合對白：不打關卡，直接呼叫 evalStoryState。 */
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
function has(arr, re) { return (arr || []).some(t => re.test(t)); }
function none(arr, re) { return !(arr || []).some(t => re.test(t)); }
function deadSpoke(who, campWho) { return (campWho || []).indexOf(who) >= 0; }

async function main() {
  const port = 8980 + Math.floor(Math.random() * 40);
  const srv = await serve(port);
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/island/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__island && __island.evalStoryState, { timeout: 20000 });

  const cases = await page.evaluate(() => {
    const ev = __island.evalStoryState;
    return {
      guard: ev({
        wang: 'alive', akai: 'alive', lin: 'alive',
        flags: { isl_captives_rescued: true, isl_commander_captured: true, isl_chat_wang: true, isl_radio_strong: true }
      }),
      namelessNone: ev({
        wang: 'alive', akai: 'alive', lin: 'alive',
        flags: { isl_captives_rescued: true, isl_commander_killed: true, isl_radio_strong: true }
      }),
      namelessLin: ev({
        wang: 'alive', akai: 'alive', lin: 'kia',
        flags: { isl_captives_rescued: true, isl_commander_killed: true }
      }),
      namelessAkai: ev({
        wang: 'alive', akai: 'kia', lin: 'alive',
        flags: { isl_captives_rescued: true, isl_commander_killed: true }
      }),
      namelessWang: ev({
        wang: 'kia', akai: 'alive', lin: 'alive',
        flags: { isl_captives_rescued: true, isl_commander_killed: true }
      }),
      silentA_linAkai: ev({
        wang: 'alive', akai: 'kia', lin: 'kia',
        flags: { isl_captives_rescued: true, isl_commander_captured: true }
      }),
      silentA_wangAkai: ev({
        wang: 'kia', akai: 'kia', lin: 'alive',
        flags: { isl_captives_rescued: true, isl_commander_captured: true }
      }),
      silentA_wangLin: ev({
        wang: 'kia', akai: 'alive', lin: 'kia',
        flags: { isl_captives_rescued: true, isl_commander_captured: true }
      }),
      silentA_all: ev({
        wang: 'kia', akai: 'kia', lin: 'kia',
        flags: { isl_captives_rescued: true, isl_commander_killed: true }
      }),
      silentB_allAlive: ev({
        wang: 'alive', akai: 'alive', lin: 'alive',
        flags: { isl_captives_left: true, isl_commander_killed: true }
      }),
      silentB_wang: ev({
        wang: 'kia', akai: 'alive', lin: 'alive',
        flags: { isl_captives_left: true, isl_commander_killed: true }
      }),
      silentB_akai: ev({
        wang: 'alive', akai: 'kia', lin: 'alive',
        flags: { isl_captives_left: true, isl_commander_killed: true }
      }),
      silentB_lin: ev({
        wang: 'alive', akai: 'alive', lin: 'kia',
        flags: { isl_captives_left: true, isl_commander_killed: true }
      }),
      silentBothPreferA: ev({
        wang: 'kia', akai: 'kia', lin: 'alive',
        flags: { isl_captives_left: true, isl_commander_killed: true }
      }),
      campNowang: ev({
        wang: 'kia', akai: 'alive', lin: 'alive',
        flags: { isl_captives_rescued: true, isl_commander_captured: true }
      }),
      campQuiet: ev({
        wang: 'alive', akai: 'kia', lin: 'alive',
        flags: { isl_captives_rescued: true, isl_commander_captured: true }
      }),
      campMissing: ev({
        wang: 'alive', akai: 'alive', lin: 'kia',
        flags: { isl_captives_rescued: true, isl_commander_captured: true }
      }),
      forcedNo: ev({
        wang: 'alive', akai: 'alive', lin: 'alive',
        flags: { isl_killed_scout: true, isl_radio_weak: true, isl_captives_rescued: true, isl_commander_killed: true }
      }),
      captureOk: ev({
        wang: 'alive', akai: 'alive', lin: 'alive',
        flags: { isl_killed_scout: true, isl_radio_strong: true, isl_captives_rescued: true, isl_commander_captured: true }
      })
    };
  });

  const log = (...a) => console.log('[island dialogue]', ...a);

  function noEmptyBox(lines, label) {
    (lines || []).forEach(t => {
      const i = String(t).indexOf(':');
      const text = i < 0 ? String(t) : String(t).slice(i + 1);
      must(text.trim() !== '', (label || '結局') + ' 出現空對話框: ' + JSON.stringify(t));
    });
  }
  Object.keys(cases).forEach(k => noEmptyBox(cases[k].lines, k));

  must(cases.guard.ending === 'island_guard', '守衛結局未命中');
  must(has(cases.guard.lines, /回來就好/), '守衛缺少碼頭回來就好');
  must(has(cases.guard.lines, /便當。我說話算話/), '守衛便當句未改');
  must(has(cases.guard.lines, /去過島上的/), '守衛缺少水電行客人');
  must(has(cases.guard.lines, /你是來找人的/), '守衛缺少找人回聲');
  must(cases.guard.camp === 'hq_camp', '全員活著應播 hq_camp');
  must(has(cases.guard.jeepChat, /保險業務車/), '吉普車應有阿凱台詞');
  must(has(cases.guard.jeepChat, /天線我抓著/), '吉普車應有小林台詞');
  must(cases.guard.hqChoice.length === 2, 'hq_choice 應拆兩段');
  must(has(cases.guard.hqChoice, /正面打進去/), 'hq_choice 第一段');
  must(has(cases.guard.hqChoice, /側門可以潛入/), 'hq_choice 第二段');
  must(has(cases.guard.forced, /斥候的對講機/), 'forced 應解釋斥候');
  must(has(cases.guard.forced, /我收不到他的頻道/), 'forced 應解釋天線');

  must(cases.namelessNone.ending === 'nameless_line', '無名無人死未命中');
  must(has(cases.namelessNone.lines, /離島防務順利恢復/), '無名缺少新聞');
  must(has(cases.namelessNone.lines, /指揮官倒下了/), '無名無人死前綴');
  must(has(cases.namelessNone.lines, /他關掉電視，沒有說話/), '無名缺少關電視旁白');
  must(none(cases.namelessNone.lines, /^方子豪:\s*$/), '無名不該有空的方子豪對話框');
  must(has(cases.namelessLin.lines, /他關掉電視，沒有說話/), '無名小林版缺少關電視旁白');
  must(has(cases.namelessAkai.lines, /他關掉電視，沒有說話/), '無名阿凱版缺少關電視旁白');
  must(has(cases.namelessWang.lines, /他關掉電視，沒有說話/), '無名王班長版缺少關電視旁白');
  must(has(cases.namelessLin.lines, /南灘通信，小林/), '無名小林前綴');
  must(has(cases.namelessAkai.lines, /還沒簽完那張保單/), '無名阿凱前綴');
  must(has(cases.namelessWang.lines, /他帶過的人/), '無名王班長前綴');

  must(cases.silentA_linAkai.ending === 'silent_island' && cases.silentA_linAkai.variant === 'silent_a', '沉默 A 阿凱小林');
  must(cases.silentA_linAkai.camp === 'hq_camp_wang_only', '王班長活阿凱小林死應 wang_only');
  must(!deadSpoke('阿凱', cases.silentA_linAkai.campWho), '阿凱已死不該在營區說話');
  must(!deadSpoke('小林', cases.silentA_linAkai.campWho), '小林已死不該在營區說話');
  must(has(cases.silentA_linAkai.lines, /名單我會親自簽/), '沉默 A 名單');
  must(has(cases.silentA_linAkai.lines, /阿凱，保險業務/), '沉默 A 念阿凱');
  must(has(cases.silentA_linAkai.lines, /小林，南灘通信/), '沉默 A 念小林');
  must(none(cases.silentA_linAkai.jeepChat, /阿凱/), '阿凱陣亡吉普不該開口');
  must(none(cases.silentA_linAkai.jeepChat, /小林/), '小林陣亡吉普不該開口');

  must(cases.silentA_wangAkai.camp === 'hq_camp_lin_only', '王班長阿凱死應 lin_only');
  must(!deadSpoke('王班長', cases.silentA_wangAkai.campWho), '王班長已死不該說話');
  must(!deadSpoke('阿凱', cases.silentA_wangAkai.campWho), '阿凱已死不該說話');
  must(deadSpoke('小林', cases.silentA_wangAkai.campWho), '小林應在 lin_only 說話');

  must(cases.silentA_wangLin.camp === 'hq_camp_akai_only', '王班長小林死應 akai_only');
  must(!deadSpoke('王班長', cases.silentA_wangLin.campWho), '王班長已死不該說話');
  must(!deadSpoke('小林', cases.silentA_wangLin.campWho), '小林已死不該說話');
  must(deadSpoke('阿凱', cases.silentA_wangLin.campWho), '阿凱應在 akai_only 說話');

  must(cases.silentA_all.camp === 'hq_camp_alone', '三人陣亡應 alone');
  must(cases.silentA_all.variant === 'silent_a', '三人陣亡應沉默 A');

  must(cases.silentB_allAlive.ending === 'silent_island' && cases.silentB_allAlive.variant === 'silent_b', '沉默 B 未命中');
  must(none(cases.silentB_allAlive.lines, /頻道裡人少了/), '沉默 B 不可播頻道裡人少了');
  must(has(cases.silentB_allAlive.lines, /坑道裡還有三個名字/), '沉默 B 俘虜名單');
  must(has(cases.silentB_allAlive.lines, /這不是勝利/), '沉默 B 這不是勝利');
  must(none(cases.silentB_allAlive.lines, /小林，南灘通信|阿凱，保險業務|王班長。方子豪的班長/), '沉默 B 全活不該有名單句');
  must(cases.silentB_allAlive.camp === 'hq_camp', '沉默 B 同袍可全活');

  function memorialBeforeEnd(lines, nameRe, label) {
    const iName = (lines || []).findIndex(t => nameRe.test(t));
    const iEnd = (lines || []).findIndex(t => /這不是勝利/.test(t));
    must(iName >= 0 && iEnd >= 0 && iName < iEnd, label + ' 名單句應在「這不是勝利」之前');
  }
  must(cases.silentB_wang.variant === 'silent_b', '王班長一人死應仍為沉默 B');
  must(has(cases.silentB_wang.lines, /坑道裡還有三個名字/), '沉默 B 一人死仍有俘虜句');
  memorialBeforeEnd(cases.silentB_wang.lines, /王班長。方子豪的班長/, '沉默 B 王班長');
  must(none(cases.silentB_wang.lines, /名單我會親自簽/), '一人死不該改播 A');
  memorialBeforeEnd(cases.silentB_akai.lines, /阿凱，保險業務/, '沉默 B 阿凱');
  memorialBeforeEnd(cases.silentB_lin.lines, /小林，南灘通信/, '沉默 B 小林');

  must(cases.silentBothPreferA.ending === 'silent_island' && cases.silentBothPreferA.variant === 'silent_a', 'A+B 同時應固定播 A');
  must(has(cases.silentBothPreferA.lines, /名單我會親自簽/), 'A+B 同時應有 A 名單');
  must(has(cases.silentBothPreferA.lines, /阿凱，保險業務/), 'A+B 同時應念阿凱');
  must(has(cases.silentBothPreferA.lines, /王班長。方子豪的班長/), 'A+B 同時應念王班長');
  must(none(cases.silentBothPreferA.lines, /坑道裡還有三個名字/), 'A+B 同時不該播 B 版俘虜句');
  must(none(cases.silentBothPreferA.lines, /這不是勝利/), 'A+B 同時不該播 B 版全活句');
  must(none(cases.silentBothPreferA.lines, /頻道裡人少了/), 'A+B 同時不該播頻道裡人少了');

  must(cases.campNowang.camp === 'hq_camp_nowang', '只王班長死應 nowang');
  must(!deadSpoke('王班長', cases.campNowang.campWho), 'nowang 王班長不該說話');
  must(cases.campQuiet.camp === 'hq_camp_quiet', '只阿凱死應 quiet');
  must(!deadSpoke('阿凱', cases.campQuiet.campWho), 'quiet 阿凱不該說話');
  must(cases.campMissing.camp === 'hq_camp_missing', '只小林死應 missing');
  must(!deadSpoke('小林', cases.campMissing.campWho), 'missing 小林不該說話');

  must(cases.forcedNo.canCapture === false, '殺斥候且弱訊號不能活捉');
  must(cases.captureOk.canCapture === true, '殺斥候但強訊號可以活捉');

  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'dialogue-result.json'), JSON.stringify(cases, null, 2));
  await browser.close(); srv.close();
  log('ok', Object.keys(cases).join(','));
}

main().catch(e => { console.error(e); process.exit(1); });
