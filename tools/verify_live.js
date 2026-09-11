// 校验线上站点：站点名 / logo / favicon / 题库加载 / 答题流程 / 已下线功能不复发
// 用法：node tools/verify_live.js        （失败时退出码 1）
const { chromium } = require('C:/Users/jyl17/.workbuddy/binaries/node/workspace/node_modules/playwright-core');
const EXE = 'C:/Users/jyl17/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe';
const URL = 'https://jiyanlong2017.github.io/caac/';
const EXPECT_TITLE = 'CAAC理论题库';
const EXPECT_BANK = 'CAAC理论题库';
const EXPECT_Q = 1691;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const errs = [], fails = [];
function check(ok, label, got) {
  console.log((ok ? '  OK   ' : '  FAIL ') + label + (got === undefined ? '' : '  → ' + got));
  if (!ok) fails.push(label + (got === undefined ? '' : ' (实际: ' + got + ')'));
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'], timeout: 60000 });
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1.5 });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  const resp = await page.goto(URL, { waitUntil: 'load', timeout: 40000 });
  await sleep(1500);

  console.log('== HTTP / 资源 ==');
  check(resp && resp.status() === 200, '首页返回 200', resp && resp.status());
  const assets = await page.evaluate(async () => {
    const urls = [
      'assets/logo-mark.png', 'assets/favicon.png', 'assets/app.js',
      'assets/styles.css', 'data/bank-real.js',
    ];
    const out = {};
    await Promise.all(urls.map(async u => {
      try { const r = await fetch(u, { cache: 'no-store' }); out[u] = r.status; }
      catch (e) { out[u] = 'ERR'; }
    }));
    return out;
  });
  for (const [u, s] of Object.entries(assets)) check(s === 200, '资源 ' + u, s);

  console.log('== 站点名 / logo ==');
  const info = await page.evaluate(() => {
    const l = document.querySelector('.logo img');
    const t1 = document.querySelector('.tb-title .t1');
    const t2 = document.querySelector('.tb-title .t2');
    const icon = document.querySelector('link[rel="icon"]');
    const b = window.CAAC_BANK || {};
    const q = document.querySelector('#cardWrap .qtext');
    const html = document.body.innerHTML;
    return {
      title: document.title,
      iconHref: icon ? icon.getAttribute('href') : '(无)',
      logoLoaded: !!(l && l.naturalWidth > 0),
      logoNatural: l ? l.naturalWidth + 'x' + l.naturalHeight : '-',
      shownName: t1 ? t1.textContent.trim() : '(无)',
      meta: t2 ? t2.textContent.trim() : '(无)',
      bank: b.name || '(未加载)',
      n: (b.questions || []).length,
      firstQ: q ? q.textContent.trim().slice(0, 30) : '(无)',
      hasTipWord: html.indexOf('答题技巧') >= 0,
      hasDemoWord: html.indexOf('示例') >= 0,
      hasBankPicker: !!document.querySelector('#bankPicker'),
      catCards: document.querySelectorAll('#catMenu, .catmenu').length,
    };
  });
  check(info.title === EXPECT_TITLE, '<title>', info.title);
  check(info.shownName === EXPECT_BANK, '顶栏站名', info.shownName);
  check(info.bank === EXPECT_BANK, '题库 name 字段', info.bank);
  check(info.logoLoaded, 'logo 加载成功（naturalWidth>0）', info.logoNatural);
  check(/favicon\.png/.test(info.iconHref), 'favicon 指向图标', info.iconHref);
  check(info.n === EXPECT_Q, '题目数', info.n);
  check(info.catCards > 0, '章节入口存在', info.catCards);

  console.log('== 已下线功能不应复发 ==');
  check(!info.hasTipWord, '页面无「答题技巧」');
  check(!info.hasDemoWord, '页面无「示例」字样');
  check(!info.hasBankPicker, '无 #bankPicker（切库按钮已删）');
  check(!/超视距（机长）理论题库/.test(info.bank), '旧站名未残留');

  console.log('== 答题流程 ==');
  console.log('  首题:', info.firstQ);
  console.log('  副行:', info.meta);
  try { const o = await page.$('#cardWrap .qcard .opt'); if (o) { await o.click(); await sleep(500); } } catch (e) {}
  const v = await page.evaluate(() => { const e = document.querySelector('#cardWrap .verdict'); return e ? e.textContent.trim() : '(无)'; });
  check(!!v && v !== '(无)', '点选项后给出判定', v);

  await page.screenshot({ path: 'tools/live-check.png', fullPage: false });

  console.log('\n== 结论 ==');
  console.log('控制台错误:', errs.length ? errs.join(' | ') : '无');
  console.log('断言失败:', fails.length ? '\n  - ' + fails.join('\n  - ') : '无');
  await Promise.race([browser.close().catch(() => {}), sleep(4000)]);
  process.exit(errs.length || fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
