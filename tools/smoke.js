// 冒烟测试：本地起 http 服务 + playwright-core 跑一遍关键路径
const { chromium } = require('C:/Users/jyl17/.workbuddy/binaries/node/workspace/node_modules/playwright-core');
const { spawn, execSync } = require('child_process');

const PY = 'C:/Users/jyl17/.workbuddy/binaries/python/versions/3.13.12/python.exe';
const ROOT = 'C:/Users/jyl17/WorkBuddy/2026-09-10-15-14-28/caac-quiz';
const PORT = 8778;
const EXE = 'C:/Users/jyl17/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const errs = [];
let step = '';

// 看门狗：无论正常与否，最多 150s 后强制退出，避免进程挂死占住端口/CPU。
// （headless-shell 上 browser.close() 偶发不返回，光靠结尾的 process.exit 兜不住）
const WATCHDOG_MS = 150000;
const watchdog = setTimeout(() => {
  console.log('\n[看门狗] 超时 ' + (WATCHDOG_MS / 1000) + 's，强制退出');
  process.exit(2);
}, WATCHDOG_MS);
watchdog.unref && watchdog.unref();

// 连树杀：Windows 下 srv.kill() 只杀直接子进程，用 /T 杀整棵进程树
function killTree(pid) {
  try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }); } catch (e) {}
}

(async () => {
  const srv = spawn(PY, ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(1200);
  let browser;
  try {
    browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'], timeout: 60000 });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
    page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    page.on('dialog', d => d.accept());

    const T = async (sel, ms = 8000) => { try { return await page.$(sel, { timeout: ms }); } catch (e) { return null; } };
    const txt = async (sel) => { const e = await T(sel, 3000); return e ? (await e.textContent()).trim() : '(缺失)'; };

    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await page.evaluate(() => { window.confirm = () => true; });
    await sleep(700);

    step = '初始加载';
    console.log('题库:', await txt('#bankName'), '|', await txt('#bankMeta'));
    console.log('章节按钮:', await txt('#catMenuTitle'), await txt('#catMenuNum'));

    step = '章节菜单';
    await page.click('#catMenu', { timeout: 8000 });
    await sleep(400);
    const cards = await page.$$('.catcard');
    console.log('章节卡片数:', cards.length, '(应为 1+18=19)');
    const dump = await page.evaluate(() => Array.from(document.querySelectorAll('.catcard')).map(c =>
      c.querySelector('.cn').textContent + '=' + c.querySelector('.cp').textContent));
    console.log('章节明细:', dump.join(' | '));
    await page.screenshot({ path: ROOT + '/tools/shot-menu-desktop.png' });

    step = '切到某个章节';
    await page.click('.catcard[data-cat="概述"]', { timeout: 5000 });
    await sleep(500);
    console.log('切换后章节按钮:', await txt('#catMenuTitle'), await txt('#catMenuNum'), '| 题号:', await txt('#posText'));

    step = '背题模式';
    console.log('背题直接展开解析:', !!(await T('#cardWrap .acc-b')));

    step = '章节练习判分';
    await page.click('#modeChips .chip[data-mode="chapter"]', { timeout: 5000 });
    await sleep(400);
    await page.click('#cardWrap .opt[data-i="0"]', { timeout: 8000 });
    await sleep(400);
    console.log('判定条:', (await txt('#cardWrap .verdict')).slice(0, 26));
    const accH = await T('#cardWrap .acc-h');
    if (accH) await accH.click();
    await sleep(250);
    console.log('解析可展开:', !!(await T('#cardWrap .acc.open')));
    await page.click('#cardWrap [data-act="fav"]', { timeout: 5000 });
    await sleep(150);
    await page.click('#btnNext', { timeout: 5000 });
    await sleep(300);
    console.log('翻页后:', await txt('#posText'));

    step = '题卡';
    await page.click('#btnSheet', { timeout: 8000 });
    await sleep(400);
    console.log('题卡格子(弹层):', (await page.$$('#sheetBody .qg')).length);
    await page.click('#sheetClose', { timeout: 5000 });
    await sleep(250);

    step = '搜索';
    await page.click('#btnSearch', { timeout: 8000 });
    await sleep(300);
    await page.fill('#searchInput', '无人机', { timeout: 5000 });
    await sleep(500);
    const hits = (await page.$$('#searchResults .hitem[data-act="jump"]')).length;
    console.log('搜索命中:', hits);
    if (hits) { await page.click('#searchResults .hitem[data-act="jump"]', { timeout: 5000 }); await sleep(400); }
    console.log('搜索跳转后:', await txt('#posText'));
    const sc = await T('#sheetClose');
    if (sc && await sc.isVisible()) { await sc.click(); await sleep(200); }

    step = '模拟考试';
    await page.click('.tab[data-tab="exam"]', { timeout: 5000 });
    await sleep(300);
    await page.click('#btnStartExam', { timeout: 8000 });
    await sleep(600);
    console.log('考试中:', await txt('#exPos'), '倒计时', await txt('#exClock'));
    await page.click('#examRun .opt[data-i="0"]', { timeout: 8000 });
    await sleep(300);
    await page.click('#btnSubmit', { timeout: 8000 });
    await sleep(400);
    const cy = await T('[data-act="confirmYes"]');
    if (cy) { await cy.click(); await sleep(700); }
    console.log('交卷得分:', await txt('#examResult .score-hero .big'));

    step = '错题页';
    await page.click('.tab[data-tab="wrong"]', { timeout: 5000 });
    await sleep(400);
    console.log('错题分组按钮:', await txt('#wrongMenuTitle'), await txt('#wrongMenuNum'));
    console.log('错题角标:', await txt('.tab[data-tab="wrong"] .n'));

    step = '统计页';
    await page.click('.tab[data-tab="stats"]', { timeout: 5000 });
    await sleep(400);
    const stats = await page.$$('#statsBody .grid4 .stat .n');
    console.log('统计四卡:', (await Promise.all(stats.map(x => x.textContent()))).join(' / '));

    step = '桌面截图';
    await page.click('.tab[data-tab="practice"]', { timeout: 5000 });
    await sleep(500);
    const layout = await page.evaluate(() => {
      const b = document.querySelector('.p-body'), s = b.querySelector('.stage'), r = document.querySelector('#rail');
      const f = e => { const x = e.getBoundingClientRect(); return (x.left | 0) + '+' + (x.width | 0); };
      return { vw: innerWidth, dir: getComputedStyle(b).flexDirection, stage: f(s), rail: f(r) };
    });
    console.log('桌面布局:', JSON.stringify(layout));
    await page.screenshot({ path: ROOT + '/tools/shot-desktop.png' });

    step = '移动端截图';
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(500);
    await page.screenshot({ path: ROOT + '/tools/shot-mobile.png' });
    await page.click('#catMenu', { timeout: 8000 });
    await sleep(400);
    await page.screenshot({ path: ROOT + '/tools/shot-menu-mobile.png' });

    step = '示例题库(多选)';
    await page.setViewportSize({ width: 1440, height: 900 });
    const sc2 = await T('#sheetClose'); if (sc2 && await sc2.isVisible()) { await sc2.click(); await sleep(200); }
    await page.click('#bankPicker', { timeout: 8000 });
    await sleep(400);
    await page.click('[data-act="switchBank"][data-k="demo"]', { timeout: 5000 });
    await sleep(600);
    console.log('切库后:', await txt('#bankName'), '|', await txt('#bankMeta'));
    await page.click('.tab[data-tab="practice"]', { timeout: 5000 });
    await sleep(300);
    await page.click('#modeChips .chip[data-mode="chapter"]', { timeout: 5000 });
    await sleep(300);
    let found = false;
    for (let i = 0; i < 25 && !found; i++) { found = !!(await T('#cardWrap .tag.multi', 400)); if (!found) { await page.click('#btnNext'); await sleep(120); } }
    console.log('找到多选题:', found);
    if (found) {
      await page.click('#cardWrap .opt[data-i="0"]', { timeout: 5000 }); await sleep(120);
      await page.click('#cardWrap .opt[data-i="1"]', { timeout: 5000 }); await sleep(120);
      const cf = await T('#cardWrap [data-act="confirm"]');
      if (cf) { await cf.click(); await sleep(350); }
      console.log('多选判定:', (await txt('#cardWrap .verdict')).slice(0, 26));
    }
    step = 'done';
  } catch (e) {
    errs.push('FATAL @' + step + ': ' + e.message.split('\n')[0]);
  } finally {
    console.log('\n=== 错误 ===');
    console.log(errs.length ? errs.join('\n') : '无');
    // browser.close() 在 headless-shell 上偶发不返回，加超时兜底
    try { await Promise.race([browser && browser.close().catch(() => {}), sleep(4000)]); } catch (e) { }
    clearTimeout(watchdog);
    killTree(srv.pid);
  }
  process.exit(0);
})();
