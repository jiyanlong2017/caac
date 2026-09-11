// 老存档迁移回归：验证「题库只剩真题库」之后，各种历史 localStorage 形态都能正常启动
//
// 为什么必须测：线上用户浏览器里存着上一版的存档，其中 bankId 可能仍指向**已被删除的示例库**。
// load() 里那句 `delete r.bankId` 就是为这条路径写的补丁 —— 不测它等于没验证。
//
// 用法：node tools/verify_migration.js      （失败退出码 1）
const { chromium } = require('C:/Users/jyl17/.workbuddy/binaries/node/workspace/node_modules/playwright-core');
const { spawn, execSync } = require('child_process');

const PY = 'C:/Users/jyl17/.workbuddy/binaries/python/versions/3.13.12/python.exe';
const ROOT = 'C:/Users/jyl17/WorkBuddy/2026-09-10-15-14-28/caac-quiz';
const PORT = 8793;
const EXE = 'C:/Users/jyl17/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe';
const LS = 'caac_quiz_v1';
const TOTAL = 1691;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fails = [];
function check(ok, label, got) {
  console.log('  ' + (ok ? 'OK   ' : 'FAIL ') + label + (got === undefined ? '' : '  → ' + got));
  if (!ok) fails.push(label + (got === undefined ? '' : ' (实际: ' + got + ')'));
}

let browser = null, srv = null;
function killTree(pid) { try { execSync('taskkill /PID ' + pid + ' /T /F', { stdio: 'ignore' }); } catch (e) {} }
const watchdog = setTimeout(() => { console.error('!! 看门狗超时'); if (srv) killTree(srv.pid); process.exit(2); }, 160000);
watchdog.unref();

// 历史存档形态。rec 用真实存在的题号（0/1/2/3/4），否则统计会被 `if (!q) return` 过滤掉。
function rec(n) { const o = {}; for (let i = 0; i < n; i++) o[i] = { n: 1, w: i % 2 }; return o; }
const settings = { autoExp: false, shake: true, autoNext: false, passLine: 80, examSize: 100, examDur: 3600 };

const CASES = [
  {
    name: 'A 老存档：bankId=real + 有进度',
    seed: { v: 1, theme: 'dark', bankId: 'real', settings, exams: [],
            banks: { real: { rec: rec(7), wrong: { 0: 2, 1: 1 }, fav: { 2: 1 }, doubt: {}, session: { mode: 'chapter', chapter: '概述', idx: 3 } } } },
    wantDone: 7, wantTheme: 'dark',
    note: '进度与主题必须原样保留',
  },
  {
    name: 'B 老存档：bankId=demo（选过已删的示例库）',
    seed: { v: 1, theme: 'light', bankId: 'demo', settings, exams: [],
            // demo 有 5 条、real 有 3 条 —— 取错库的话 done 会变成 5
            banks: { demo: { rec: rec(5), wrong: { 0: 9 }, fav: {}, doubt: {}, session: null },
                     real: { rec: rec(3), wrong: {}, fav: {}, doubt: {}, session: null } } },
    wantDone: 3, wantTheme: 'light',
    note: '必须读 real 而不是 demo，且 bankId 要被清掉',
  },
  {
    name: 'C 老存档：只有 banks.demo（从没做过真题）',
    seed: { v: 1, theme: 'light', bankId: 'demo', settings, exams: [],
            banks: { demo: { rec: rec(5), wrong: {}, fav: {}, doubt: {}, session: null } } },
    wantDone: 0, wantTheme: 'light',
    note: 'real 不存在时应自动初始化，不能崩',
  },
  {
    name: 'D 损坏存档（非法 JSON）',
    raw: '{ this is not json',
    wantDone: 0, wantTheme: 'light',
    note: '应静默重置为全新存档',
  },
  {
    name: 'E 版本不符（v:2）',
    seed: { v: 2, theme: 'dark', bankId: 'real', settings, exams: [], banks: { real: { rec: rec(9) } } },
    wantDone: 0, wantTheme: 'light',
    note: '版本不匹配应整体重置，连 theme 一起回默认',
  },
  {
    name: 'F 空存档（首次访问）',
    seed: null,
    wantDone: 0, wantTheme: 'light',
    note: '首次访问不应报错',
  },
];

(async () => {
  srv = spawn(PY, ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(1200);
  browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'], timeout: 60000 });

  for (const c of CASES) {
    console.log('\n== ' + c.name + ' ==\n   ' + c.note);
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const errs = [];
    // 必须在 app.js 执行之前把 localStorage 种进去，addInitScript 正是干这个的
    await ctx.addInitScript(([key, payload]) => {
      try { if (payload === null) localStorage.removeItem(key); else localStorage.setItem(key, payload); } catch (e) {}
    }, [LS, c.seed ? JSON.stringify(c.seed) : (c.raw !== undefined ? c.raw : null)]);

    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 40000 });
    await sleep(900);

    // 1) 页面不能是那张「题库加载失败」兜底页
    const booted = await page.evaluate(() => {
      const card = document.querySelector('#cardWrap .qcard');
      const t1 = document.querySelector('#bankName');
      return {
        failed: document.body.innerHTML.indexOf('题库加载失败') >= 0,
        hasCard: !!card,
        name: t1 ? t1.textContent.trim() : '(无)',
        n: (window.CAAC_BANK && window.CAAC_BANK.questions || []).length,
      };
    });
    check(!booted.failed, '未落入「题库加载失败」兜底页');
    check(booted.hasCard, '题卡已渲染');
    check(booted.name === 'CAAC理论题库', '站名正确', booted.name);
    check(booted.n === TOTAL, '题库题量', booted.n);

    // 2) 主题是否按存档恢复
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    check(theme === c.wantTheme, '主题恢复为 ' + c.wantTheme, theme);

    // 3) 进度：去统计页读「已做」那一卡
    await page.click('.tab[data-tab="stats"]', { timeout: 8000 });
    await sleep(500);
    const done = await page.evaluate(() => {
      const n = document.querySelectorAll('#statsBody .grid4 .stat .n');
      return n.length > 1 ? parseInt(n[1].textContent.trim(), 10) : NaN;
    });
    check(done === c.wantDone, '已做题数 = ' + c.wantDone, done);

    // 4) 断言 bankId 被清掉（给存档一次落盘机会：点一下收藏会触发 save）
    await page.click('.tab[data-tab="practice"]', { timeout: 8000 });
    await sleep(400);
    const favBtn = await page.$('#cardWrap [data-act="fav"]');
    if (favBtn) { await favBtn.click(); await sleep(500); }
    const stored = await page.evaluate((k) => {
      try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; }
    }, LS);
    if (stored) {
      check(!('bankId' in stored), '落盘后存档里不再有 bankId');
      check(stored.v === 1, '存档版本仍为 1', stored.v);
      check(!!(stored.banks && stored.banks.real), '存档里有 banks.real');
    } else {
      check(false, '存档可解析', '(读不到)');
    }

    check(errs.length === 0, '无控制台错误', errs.join(' | ') || undefined);
    await ctx.close();
  }

  clearTimeout(watchdog);
  await Promise.race([browser.close().catch(() => {}), sleep(4000)]);
  killTree(srv.pid);

  console.log('\n== 结论 ==');
  console.log(fails.length ? '失败 ' + fails.length + ' 项:\n  - ' + fails.join('\n  - ') : '全部通过');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); if (srv) killTree(srv.pid); process.exit(1); });
