// 速查页验证：入口按钮 + 页面渲染 + 筛选交互 + 主题切换 + 截图
const { chromium } = require('C:/Users/jyl17/.workbuddy/binaries/node/workspace/node_modules/playwright-core');
const { spawn, execSync } = require('child_process');

const PY = 'C:/Users/jyl17/.workbuddy/binaries/python/versions/3.13.12/python.exe';
const ROOT = 'C:/Users/jyl17/WorkBuddy/2026-09-10-15-14-28/caac-quiz';
const PORT = 8781;
const EXE = 'C:/Users/jyl17/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const errs = [];
let step = '';

const watchdog = setTimeout(() => { console.log('\n[看门狗] 超时'); process.exit(2); }, 120000);
watchdog.unref && watchdog.unref();

function killTree(pid) {
  try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }); } catch (e) {}
}

(async () => {
  let srv;
  try {
    srv = spawn(PY, ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  } catch (e) { killTree(srv && srv.pid); }
  await sleep(1200);

  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });

  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  // ---- 1. 主站入口按钮 ----
  step = '主站入口';
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  const topBtn = await page.locator('.cheat-btn').count();
  const tabBtn = await page.locator('.cheat-tab').count();
  console.log(`[1] 顶部速查按钮=${topBtn}  底部速查tab=${tabBtn}`);
  if (topBtn !== 1 || tabBtn !== 1) errs.push('速查入口缺失');

  // 顶部按钮底色（应含金色渐变）
  const bg = await page.locator('.cheat-btn').evaluate(el => getComputedStyle(el).backgroundImage + '|' + getComputedStyle(el).color);
  console.log(`[1] 顶部按钮样式: ${bg}`);

  const dot = await page.locator('.cheat-btn .dot').count();
  const tdot = await page.locator('.cheat-tab .cheat-dot').count();
  console.log(`[1] 红点标识: 顶部=${dot} 底部=${tdot}`);

  await page.screenshot({ path: ROOT + '/tools/cheat-entry.png' });

  // ---- 2. 点击进入速查页 ----
  step = '进入速查页';
  await page.locator('.cheat-tab').click();
  await page.waitForLoadState('domcontentloaded');
  await sleep(1200);
  const url1 = page.url();
  const h1 = await page.locator('.top h1').textContent();
  console.log(`[2] URL=${url1.split('/').pop()}  标题=${h1}`);

  const secs = await page.locator('.sec').count();
  const cards = await page.locator('.card').count();
  const ids = await page.locator('.ids code').count();
  console.log(`[2] 大块=${secs}  卡片=${cards}  题号引用=${ids}`);
  if (secs < 6) errs.push('速查页内容块异常少');

  await page.screenshot({ path: ROOT + '/tools/cheat-page-light.png', fullPage: true });

  // ---- 3. 筛选交互 ----
  step = '筛选交互';
  await page.locator('#filters button[data-f="trap"]').click();
  await sleep(400);
  const visible = await page.locator('.sec:not(.hide)').count();
  const trapOn = await page.locator('#filters button[data-f="trap"].on').count();
  console.log(`[3] 点"术语陷阱"后可见块=${visible} 按钮高亮=${trapOn}`);
  if (visible !== 1) errs.push('筛选逻辑异常: 可见块=' + visible);

  await page.locator('#filters button[data-f="all"]').click();
  await sleep(300);
  const allVisible = await page.locator('.sec:not(.hide)').count();
  console.log(`[3] 切回"全部"可见块=${allVisible}`);
  if (allVisible !== secs) errs.push('切回全部异常');

  // ---- 4. 暗色主题 ----
  step = '暗色主题';
  await page.locator('#btnTheme').click();
  await sleep(500);
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  console.log(`[4] data-theme=${theme}  body背景=${bodyBg}`);
  if (theme !== 'dark') errs.push('主题切换失败');
  await page.screenshot({ path: ROOT + '/tools/cheat-page-dark.png', fullPage: true });

  // ---- 5. 返回链接 ----
  step = '返回链接';
  await page.locator('.top .back').click();
  await page.waitForLoadState('domcontentloaded');
  await sleep(1200);
  const backOk = page.url().includes('index.html');
  console.log(`[5] 返回题库: ${backOk ? 'OK' : 'FAIL -> ' + page.url()}`);
  if (!backOk) errs.push('返回链接失效');

  const title = await page.locator('#bankName').textContent();
  console.log(`[5] 题库标题=${title}`);

  await browser.close();
  killTree(srv.pid);

  console.log('\n===== 结果 =====');
  if (errs.length) { errs.forEach(e => console.log('  ✗ ' + e)); console.log('  失败 ' + errs.length + ' 项'); }
  else { console.log('  全部通过'); }
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.log('异常: ' + e.message + '\n' + e.stack); process.exit(3); });
