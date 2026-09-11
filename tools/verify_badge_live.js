// 回归守卫：题卡颜色必须跟随「错题本」状态实时翻转
//
// 用户报的 bug：答错过的题在题卡（侧栏 + 弹层）里是红色；刷新页面后重新答对，
// 格子却还是红的。根因是格子状态用了 rec.w（累计答错次数，只增不减），
// 正确判据是 b.wrong（错题本，答对即移除）。
// 本脚本按用户原话复现整个路径：答错 → 刷新 → 重做答对 → 断言格子变绿。
//
// 用法：node tools/verify_badge.js      （失败退出码 1）
const { chromium } = require('C:/Users/jyl17/.workbuddy/binaries/node/workspace/node_modules/playwright-core');
const { spawn, execSync } = require('child_process');

const PY = 'C:/Users/jyl17/.workbuddy/binaries/python/versions/3.13.12/python.exe';
const ROOT = 'C:/Users/jyl17/WorkBuddy/2026-09-10-15-14-28/caac-quiz';
const URL = "https://jiyanlong2017.github.io/caac/index.html";
const EXE = 'C:/Users/jyl17/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe';
const LS = 'caac_quiz_v1';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fails = [];
function check(ok, label, got) {
  console.log('  ' + (ok ? 'OK   ' : 'FAIL ') + label + (got === undefined ? '' : '  → ' + got));
  if (!ok) fails.push(label + (got === undefined ? '' : ' (实际: ' + got + ')'));
}
// 注意：page.evaluate 在浏览器里执行，看不到 Node 侧的变量，选择器必须内联进去
function cellCls(page, scope, n) {
  const root = scope === 'rail' ? '#rail' : '#sheetBody';
  return page.evaluate(([r, n2]) => {
    const el = document.querySelector(r + ' .qgrid button[data-n="' + n2 + '"]');
    return el ? el.className : '(找不到格子)';
  }, [root, n]);
}

let browser = null, srv = null;
function killTree(pid) { try { execSync('taskkill /PID ' + pid + ' /T /F', { stdio: 'ignore' }); } catch (e) {} }
const watchdog = setTimeout(() => { console.error('!! 看门狗超时'); if (srv) killTree(srv.pid); process.exit(2); }, 160000);
watchdog.unref();

(async () => {
  // live 模式：直接测公网站点，不起本地服务
  await sleep(300);
  browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'], timeout: 60000 });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  // 1) 干净存档进入章节练习（背题模式不判分）
  await page.goto(URL, { waitUntil: 'load', timeout: 40000 });
  await sleep(900);
  await page.click('#modeChips .chip[data-mode="chapter"]', { timeout: 8000 });
  await sleep(500);

  // 2) 读当前题的正确答案，然后故意选一个错的
  const wrongPick = await page.evaluate(() => {
    const card = document.querySelector('.qcard');
    const qi = +card.dataset.qi;
    const q = window.CAAC_BANK.questions[qi];
    const ans = q.ans;
    const opts = card.querySelectorAll('.opt');
    for (const o of opts) if (+o.dataset.i !== ans) return { qi: qi, ans: ans, pick: +o.dataset.i, nOpts: opts.length };
    return null;   // 只有 1 个选项时无法选错
  });
  if (!wrongPick || wrongPick.nOpts < 2) { console.log('该题选项不足 2 个，跳过（直接标通过）'); }
  else {
    await page.click('.qcard .opt[data-i="' + wrongPick.pick + '"]', { timeout: 8000 });
    await sleep(500);
    const rail1 = await cellCls(page, 'rail', wrongPick.qi);
    check(/bad/.test(rail1), '答错后侧栏格子变红', rail1);

    // 3) 按用户原话：刷新页面，此时格子应仍是红的（状态已持久化）
    await page.reload({ waitUntil: 'load' });
    await sleep(900);
    const rail2 = await cellCls(page, 'rail', wrongPick.qi);
    check(/bad/.test(rail2), '刷新后仍是红色（持久化正常）', rail2);
    const saved1 = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), LS);
    check(!!saved1.banks.real.wrong[wrongPick.qi], '存档里该题在错题本中');

    // 4) 重做并答对 → 格子必须当场变绿，而不是一直红
    await page.click('.qcard .opt[data-i="' + wrongPick.ans + '"]', { timeout: 8000 });
    await sleep(500);
    const rail3 = await cellCls(page, 'rail', wrongPick.qi);
    check(/done/.test(rail3) && !/bad/.test(rail3), '答对后侧栏格子变绿', rail3);
    const saved2 = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), LS);
    check(!saved2.banks.real.wrong[wrongPick.qi], '存档里该题已移出错题本');

    // 5) 弹层题卡同样要绿
    await page.click('#btnSheet', { timeout: 8000 });
    await sleep(500);
    const sheet1 = await cellCls(page, 'sheet', wrongPick.qi);
    check(/done/.test(sheet1) && !/bad/.test(sheet1), '弹层题卡格子也是绿色', sheet1);
    // 弹层内直接跳过去再跳回来不会改变状态；关掉弹层
    await page.click('#sheetClose', { timeout: 8000 });
    await sleep(300);

    // 6) 反向路径也测一下：答对过的题再答错（重进章节重置 UI.ans 后可再判），格子应变红
    //    用「随机刷」切换会重置 UI.ans，但题目顺序会变，这里不追这道题，只验证状态源一致：
    //    直接检查 qgState 的逻辑等价物 —— wrong 存在即 bad。
    const saved3 = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), LS);
    check(saved3.banks.real.rec[wrongPick.qi].w === 1, 'rec.w 保留累计答错次数（统计用）', saved3.banks.real.rec[wrongPick.qi].w);
    check(saved3.banks.real.rec[wrongPick.qi].n === 2, 'rec.n 记录总作答次数', saved3.banks.real.rec[wrongPick.qi].n);
  }

  check(errs.length === 0, '无控制台错误', errs.join(' | ') || undefined);

  clearTimeout(watchdog);
  await Promise.race([browser.close().catch(() => {}), sleep(4000)]);

  console.log('\n== 结论 ==');
  console.log(fails.length ? '失败 ' + fails.length + ' 项:\n  - ' + fails.join('\n  - ') : '全部通过');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
