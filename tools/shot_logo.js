// 抓顶部栏截图：桌面 / 移动 × 浅色 / 深色，用来肉眼校验 logo 与站名
const { chromium } = require('C:/Users/jyl17/.workbuddy/binaries/node/workspace/node_modules/playwright-core');
const { spawn, execSync } = require('child_process');

const PY = 'C:/Users/jyl17/.workbuddy/binaries/python/versions/3.13.12/python.exe';
const ROOT = 'C:/Users/jyl17/WorkBuddy/2026-09-10-15-14-28/caac-quiz';
const PORT = 8791;
const EXE = 'C:/Users/jyl17/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const errs = [];
let browser = null, srv = null;
function killTree(pid) { try { execSync('taskkill /PID ' + pid + ' /T /F', { stdio: 'ignore' }); } catch (e) {} }
const watchdog = setTimeout(() => { console.error('!! 看门狗'); if (srv) killTree(srv.pid); process.exit(2); }, 150000);
watchdog.unref();

const CASES = [
  { name: 'desktop-light', w: 1200, theme: 'light' },
  { name: 'desktop-dark', w: 1200, theme: 'dark' },
  { name: 'mobile-light', w: 390, theme: 'light' },
  { name: 'mobile-dark', w: 390, theme: 'dark' },
];

(async () => {
  srv = spawn(PY, ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(1200);
  browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'], timeout: 60000 });

  for (const c of CASES) {
    const page = await browser.newPage({ viewport: { width: c.w, height: 700 }, deviceScaleFactor: 2 });
    page.on('pageerror', e => errs.push(c.name + ' PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(c.name + ' CONSOLE: ' + m.text()); });
    // 直接写入主题，避免依赖 UI 点击
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
    await page.evaluate((th) => {
      try {
        const raw = JSON.parse(localStorage.getItem('caac_quiz_v1') || 'null');
        if (raw) { raw.theme = th; localStorage.setItem('caac_quiz_v1', JSON.stringify(raw)); }
      } catch (e) {}
      document.documentElement.setAttribute('data-theme', th);
    }, c.theme);
    await sleep(500);
    const info = await page.evaluate(() => {
      const l = document.querySelector('.logo img');
      const t1 = document.querySelector('.tb-title .t1');
      const t2 = document.querySelector('.tb-title .t2');
      const sc = document.querySelector('.tb-title .t2 .scope');
      return {
        logoLoaded: !!(l && l.naturalWidth > 0),
        logoNatural: l ? l.naturalWidth + 'x' + l.naturalHeight : '-',
        logoBox: l ? Math.round(l.getBoundingClientRect().width) + 'x' + Math.round(l.getBoundingClientRect().height) : '-',
        name: t1 ? t1.textContent.trim() : '(无)',
        // innerText 会跳过 display:none 的元素，才能反映「实际看得见」的副行
        meta: t2 ? (t2.innerText || t2.textContent).trim().replace(/\s+/g, ' ') : '(无)',
        scopeHidden: !!sc && getComputedStyle(sc).display === 'none',
        title: document.title,
      };
    });
    console.log(`[${c.name}] 标题=${info.title} | logo加载=${info.logoLoaded ? '是' : '否'} 原图${info.logoNatural} 显示${info.logoBox} | 站名=${info.name} | 副行=${info.meta}`);
    if (c.w < 640 && !info.scopeHidden) errs.push(c.name + ' 窄屏未隐藏考试范围（副行会被挤断）');
    if (c.w >= 640 && info.scopeHidden) errs.push(c.name + ' 宽屏误隐藏了考试范围');
    const bar = await page.$('.topbar');
    if (bar) await bar.screenshot({ path: `tools/logo-${c.name}.png` });
    await page.close();
  }

  console.log('错误:', errs.length ? errs.join(' | ') : '无');
  await Promise.race([browser.close().catch(() => {}), sleep(4000)]);
  killTree(srv.pid);
  clearTimeout(watchdog);
  process.exit(0);
})().catch(e => { console.error('FATAL', e); if (srv) killTree(srv.pid); process.exit(1); });
