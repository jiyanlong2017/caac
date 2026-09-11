// 修复验证截图：搜索跳转到指定题 → 作答 → 展开解析 → 截图
const { chromium } = require('C:/Users/jyl17/.workbuddy/binaries/node/workspace/node_modules/playwright-core');
const { spawn, execSync } = require('child_process');

const PY = 'C:/Users/jyl17/.workbuddy/binaries/python/versions/3.13.12/python.exe';
const ROOT = 'C:/Users/jyl17/WorkBuddy/2026-09-10-15-14-28/caac-quiz';
const PORT = 8781;
const EXE = 'C:/Users/jyl17/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const TARGETS = [913, 706, 1399, 342, 662, 1435, 1436, 964, 1527, 1366];
const errs = [];

(async () => {
  const srv = spawn(PY, ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(1200);
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'], timeout: 60000 });
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 1.5 });
  page.setDefaultTimeout(5000);
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await sleep(700);

  console.log('btnSearch 存在:', !!(await page.$('#btnSearch')));

  for (const id of TARGETS) {
    console.log('--- #' + id + ' 开始 ---');
    try {
      await page.click('#btnSearch', { timeout: 4000 });
      console.log('  已点搜索');
      await sleep(250);
      await page.fill('#searchInput', '#' + id, { timeout: 4000 });
      await sleep(350);
      const n = (await page.$$('.hitem[data-act="jump"]')).length;
      console.log('  命中条目数:', n);
      const item = await page.$('.hitem[data-act="jump"]');
      if (!item) { console.log('  ✗ 无结果'); await page.keyboard.press('Escape'); await sleep(200); continue; }
      await item.click({ timeout: 4000 });
      await sleep(450);
      console.log('  已跳转');
    } catch (e) {
      console.log('  ✗ 交互失败: ' + e.message.split('\n')[0]);
      await page.keyboard.press('Escape').catch(() => {});
      continue;
    }

    // 作答(点第一个选项)
    try { const opt = await page.$('#cardWrap .qcard .opt'); if (opt) { await opt.click({ timeout: 4000 }); await sleep(300); } } catch (e) { console.log('  作答失败:' + e.message.split('\n')[0]); }

    // 展开解析
    try {
      const acc = '#cardWrap .acc[data-acc="exp"]';
      const isOpen = await page.$eval(acc, el => el.classList.contains('open')).catch(() => false);
      if (!isOpen) { const h = await page.$(acc + ' .acc-h'); if (h) { await h.click({ timeout: 4000 }); await sleep(250); } }
    } catch (e) { console.log('  展开解析失败:' + e.message.split('\n')[0]); }

    const info = await page.evaluate(() => {
      const q = document.querySelector('#cardWrap .qtext');
      const opts = [...document.querySelectorAll('#cardWrap .qcard .opt .v')].map(o => o.textContent.trim());
      const verdict = document.querySelector('#cardWrap .verdict');
      const exp = document.querySelector('#cardWrap .acc[data-acc="exp"] .acc-b');
      return {
        q: q ? q.textContent.trim() : '',
        opts,
        verdict: verdict ? verdict.textContent.trim() : '',
        exp: exp ? exp.textContent.trim().slice(-30) : '',
      };
    });
    console.log('  题干: ' + info.q);
    console.log('  选项: ' + JSON.stringify(info.opts));
    console.log('  判定: ' + info.verdict);
    console.log('  解析尾: ' + info.exp);

    const card = await page.$('#cardWrap .qcard');
    if (card) await card.screenshot({ path: `tools/fix-${id}.png` });
    await sleep(150);
  }

  console.log('\n=== 错误 ===\n' + (errs.length ? errs.join('\n') : '无'));
  // browser.close() 在 headless-shell 上偶发不返回，加超时兜底
  await Promise.race([browser.close().catch(() => {}), sleep(4000)]);
  // Windows 下 srv.kill() 杀不掉 python 子进程，用 taskkill /T 连树杀
  try { execSync(`taskkill /PID ${srv.pid} /T /F`, { stdio: 'ignore' }); } catch (e) {}
  process.exit(0);
})();
