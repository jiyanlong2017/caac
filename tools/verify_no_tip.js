// 验证「答题技巧」已从做题/背题相关页面移除，且答案解析仍正常
const { chromium } = require('C:/Users/jyl17/.workbuddy/binaries/node/workspace/node_modules/playwright-core');
const { spawn, execSync } = require('child_process');

const PY = 'C:/Users/jyl17/.workbuddy/binaries/python/versions/3.13.12/python.exe';
const ROOT = 'C:/Users/jyl17/WorkBuddy/2026-09-10-15-14-28/caac-quiz';
const PORT = 8785;
const EXE = 'C:/Users/jyl17/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const WATCHDOG_MS = 150000;
const errs = [];
let browser = null, srv = null;
function killTree(pid) { try { execSync('taskkill /PID ' + pid + ' /T /F', { stdio: 'ignore' }); } catch (e) {} }
const watchdog = setTimeout(() => { console.error('!! 看门狗触发'); if (srv) killTree(srv.pid); process.exit(2); }, WATCHDOG_MS);
watchdog.unref();

// 全页扫描：整个 DOM 里是否还残留「答题技巧」字样 / tip 折叠块
const probe = () => {
  const html = document.body.innerHTML;
  const tipBlocks = document.querySelectorAll('.acc[data-acc="tip"]').length;
  const q = document.querySelector('#cardWrap .qtext') || document.querySelector('.qtext');
  return {
    tipWord: html.indexOf('答题技巧') >= 0 ? '有' : '无',
    tipBlocks: tipBlocks,
    expBlocks: document.querySelectorAll('.acc[data-acc="exp"]').length,
    q: q ? q.textContent.trim().slice(0, 24) : '',
  };
};

async function shot(page, sel, path) {
  try { const el = await page.$(sel); if (el) await el.screenshot({ path, timeout: 5000 }); } catch (e) { errs.push('截图跳过 ' + path + ': ' + e.message.split('\n')[0]); }
}

(async () => {
  srv = spawn(PY, ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(1200);
  browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'], timeout: 60000 });
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1.5 });
  page.setDefaultTimeout(6000);
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await sleep(800);

  const results = [];
  const record = async (label, file) => {
    const r = await page.evaluate(probe);
    results.push(Object.assign({ label }, r));
    if (file) await shot(page, '#cardWrap .qcard', file);
  };

  // 1) 练习页三种模式
  for (const mode of ['browse', 'chapter', 'random']) {
    await page.click(`#modeChips .chip[data-mode="${mode}"]`);
    await sleep(500);
    try { const o = await page.$('#cardWrap .qcard .opt'); if (o) { await o.click(); await sleep(350); } } catch (e) { errs.push(mode + ' 作答失败: ' + e.message.split('\n')[0]); }
    try { const h = await page.$('#cardWrap .acc[data-acc="exp"] .acc-h'); if (h) { await h.click(); await sleep(250); } } catch (e) {}
    await record('练习·' + mode, `tools/notip-${mode}.png`);
  }

  // 2) 错题页
  await page.click('.tab[data-tab="wrong"]');
  await sleep(800);
  await record('错题页', 'tools/notip-wrong.png');

  // 3) 考试页：进考试 → 答一题
  await page.click('.tab[data-tab="exam"]');
  await sleep(800);
  try { const b = await page.$('#examSetup button'); if (b) { await b.click(); await sleep(1000); } } catch (e) { errs.push('进考试失败: ' + e.message.split('\n')[0]); }
  try { const o = await page.$('#examRun .opt'); if (o) { await o.click(); await sleep(350); } } catch (e) {}
  await record('考试中', 'tools/notip-exam.png');

  console.log('\n页面            | DOM含"答题技巧" | tip折叠块 | 解析块 | 当前题');
  console.log('-'.repeat(88));
  for (const r of results) console.log(`${r.label.padEnd(14)} | ${r.tipWord.padEnd(14)} | ${String(r.tipBlocks).padEnd(9)} | ${String(r.expBlocks).padEnd(6)} | ${r.q}`);
  const bad = results.filter(r => r.tipWord === '有' || r.tipBlocks > 0);
  console.log('\n仍有答题技巧的页面:', bad.length ? JSON.stringify(bad.map(r => r.label)) : '无');
  console.log('=== 错误 ===\n' + (errs.length ? errs.join('\n') : '无'));

  await Promise.race([browser.close().catch(() => {}), sleep(4000)]);
  killTree(srv.pid);
  clearTimeout(watchdog);
  process.exit(0);
})().catch(e => { console.error('FATAL', e); if (srv) killTree(srv.pid); process.exit(1); });
