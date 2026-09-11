// 校验线上站点：真实渲染 + 题库加载 + 答题流程
const { chromium } = require('C:/Users/jyl17/.workbuddy/binaries/node/workspace/node_modules/playwright-core');
const EXE = 'C:/Users/jyl17/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe';
const URL = 'https://jiyanlong2017.github.io/caac/';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const errs = [];
(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'], timeout: 60000 });
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1.5 });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  await page.goto(URL, { waitUntil: 'load', timeout: 40000 });
  await sleep(1200);
  const info = await page.evaluate(() => {
    const b = window.CAAC_BANK || {};
    const q = document.querySelector('#cardWrap .qtext');
    return {
      title: document.title,
      bank: b.name || '(未加载)',
      n: (b.questions || []).length,
      chapters: document.querySelectorAll('#catMenu, .catmenu').length,
      firstQ: q ? q.textContent.trim().slice(0, 30) : '(无)',
      tipWord: document.body.innerHTML.indexOf('答题技巧') >= 0,
    };
  });
  console.log('页面标题:', info.title);
  console.log('题库:', info.bank);
  console.log('题目数:', info.n);
  console.log('首题:', info.firstQ);
  console.log('仍含「答题技巧」:', info.tipWord ? '是' : '否');
  try { const o = await page.$('#cardWrap .qcard .opt'); if (o) { await o.click(); await sleep(400); } } catch (e) {}
  const v = await page.evaluate(() => { const e = document.querySelector('#cardWrap .verdict'); return e ? e.textContent.trim() : '(无)'; });
  console.log('答题判定:', v);
  await page.screenshot({ path: 'tools/live-check.png', fullPage: false });
  console.log('错误:', errs.length ? errs.join(' | ') : '无');
  await Promise.race([browser.close().catch(() => {}), sleep(4000)]);
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
