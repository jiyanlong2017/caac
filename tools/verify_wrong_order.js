// 回归守卫：重做错题时，答题卡顺序必须稳定、且不能提前提示「错题重做完啦」
//
// 用户报的 bug：重做错题时右边答题卡顺序不对，而且总提示「错题已经做完了」，可错题还剩着。
// 根因在 currentList()：错题模式下它每次都重算 wrongList()，而 record() 里
//   - 答对 → delete b.wrong[qi]（列表当场少一个）
//   - 答错 → b.wrong[qi] +1 并被排到最前（顺序实时变）
// UI.idx 却是静态递增的，于是索引漂移：
//   初始 N=5 → 答对1题剩4、答对2题剩3，idx 走到 3 时就撞到末尾提示"做完了"，
//   实际还剩 2 道。所以修复的核心是错题模式用「进入时的快照 UI.list」。
//
// 用法：node tools/verify_wrong_order.js      （失败退出码 1）
const { chromium } = require('C:/Users/jyl17/.workbuddy/binaries/node/workspace/node_modules/playwright-core');
const { spawn, execSync } = require('child_process');

const PY = 'C:/Users/jyl17/.workbuddy/binaries/python/versions/3.13.12/python.exe';
const ROOT = 'C:/Users/jyl17/WorkBuddy/2026-09-10-15-14-28/caac-quiz';
const PORT = 8803;
const EXE = 'C:/Users/jyl17/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe';
const LS = 'caac_quiz_v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fails = [];
function check(ok, label, got) {
  console.log('  ' + (ok ? 'OK   ' : 'FAIL ') + label + (got === undefined ? '' : '  → ' + got));
  if (!ok) fails.push(label + (got === undefined ? '' : ' (实际: ' + got + ')'));
}
function killTree(pid) { try { execSync('taskkill /PID ' + pid + ' /T /F', { stdio: 'ignore' }); } catch (e) {} }

let srv = null;
const watchdog = setTimeout(() => { console.error('!! 看门狗超时'); if (srv) killTree(srv.pid); process.exit(2); }, 170000);
watchdog.unref();

(async () => {
  srv = spawn(PY, ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(1200);
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'], timeout: 60000 });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await page.goto('http://127.0.0.1:' + PORT + '/index.html', { waitUntil: 'load', timeout: 40000 });
  await sleep(900);

  // 读答题卡：格子数 = 列表长度，格子文本序列 = 列表顺序
  const readGrid = () => page.evaluate(() => {
    const bs = Array.prototype.slice.call(document.querySelectorAll('#rail .qgrid button'));
    return { n: bs.length, seq: bs.map((b) => (b.innerText || '').trim()).join('|') };
  });
  const currentQi = () => page.evaluate(() => {
    const c = document.querySelector('.qcard');
    return c ? +c.dataset.qi : -1;
  });
  const wrongLeft = () => page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k));
    return Object.keys(s.banks.real.wrong || {}).length;
  }, LS);

  // 1) 章节模式，故意答错 5 道，制造错题
  await page.click('#modeChips .chip[data-mode="chapter"]', { timeout: 8000 });
  await sleep(450);
  for (let k = 0; k < 5; k++) {
    const info = await page.evaluate(() => {
      const card = document.querySelector('.qcard');
      if (!card) return null;
      const qi = +card.dataset.qi;
      const q = window.CAAC_BANK.questions[qi];
      const opts = Array.prototype.slice.call(card.querySelectorAll('.opt'));
      const bad = opts.filter((o) => +o.dataset.i !== q.ans)[0];
      return { qi: qi, pick: bad ? +bad.dataset.i : -1 };
    });
    if (!info || info.pick < 0) break;
    await page.click('.qcard .opt[data-i="' + info.pick + '"]', { timeout: 8000 });
    await sleep(320);
    await page.click('#btnNext', { timeout: 8000 });
    await sleep(320);
  }
  const made = await wrongLeft();
  check(made === 5, '已制造 5 道错题', made);

  // 2) 进入错题模式，取快照
  // 进错题模式：先切到「错题」tab，再点「重做当前分组」（错题模式不在 modeChips 里）
  await page.click('.tab[data-tab="wrong"]', { timeout: 8000 });
  await sleep(550);
  await page.click('[data-act="redoWrong"]', { timeout: 8000 });
  await sleep(650);
  const g0 = await readGrid();
  check(g0.n === 5, '进入错题模式，答题卡 5 格', g0.n);

  // 3) 逐题答对：每轮都要「长度不变 + 顺序不变」，且只有最后一轮才允许提示做完
  let earlyFinish = -1;
  const rounds = [];
  for (let k = 0; k < 5; k++) {
    const before = await readGrid();
    const qi0 = await currentQi();
    const info = await page.evaluate(() => {
      const card = document.querySelector('.qcard');
      if (!card) return null;
      const qi = +card.dataset.qi;
      return { qi: qi, ans: window.CAAC_BANK.questions[qi].ans };
    });
    if (!info) { console.log('  第 ' + (k + 1) + ' 轮没有题卡了'); break; }
    await page.click('.qcard .opt[data-i="' + info.ans + '"]', { timeout: 8000 });
    await sleep(380);
    const qi1 = await currentQi();
    if (qi1 === qi0) { await page.click('#btnNext', { timeout: 8000 }); await sleep(400); }  // 未开自动跳转则手动翻
    const after = await readGrid();
    const finished = await page.evaluate(() => document.body.innerText.indexOf('错题重做完啦') >= 0);
    rounds.push({ k: k + 1, len: after.n, same: before.seq === after.seq, finished: finished });
    if (finished && k < 4 && earlyFinish < 0) earlyFinish = k + 1;
  }

  rounds.forEach((r) => {
    console.log('    第 ' + r.k + ' 题答对后：长度=' + r.len + ' 顺序不变=' + r.same + ' 提示做完=' + r.finished);
  });

  check(rounds.length === 5, '5 道题全部轮到了（没有中途卡住）', rounds.length);
  check(rounds.every((r) => r.len === 5), '每轮列表长度都还是 5（没边做边缩短）', rounds.map((r) => r.len).join(','));
  check(rounds.every((r) => r.same), '每轮答题卡顺序都不变（没有重排）');
  check(earlyFinish < 0, '没有提前提示「错题重做完啦」', earlyFinish < 0 ? '无' : '第 ' + earlyFinish + ' 轮就提示了');

  const left = await wrongLeft();
  check(left === 0, '全部答对后错题本清空', left);

  check(errs.length === 0, '无控制台错误', errs.join(' | ') || undefined);

  clearTimeout(watchdog);
  await Promise.race([browser.close().catch(() => {}), sleep(4000)]);
  killTree(srv.pid);

  console.log('\n== 结论 ==');
  console.log(fails.length ? '失败 ' + fails.length + ' 项:\n  - ' + fails.join('\n  - ') : '全部通过');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); if (srv) killTree(srv.pid); process.exit(1); });
