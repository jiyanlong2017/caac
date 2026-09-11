// 用 Contents API 把本地改动直接写到远端 main（git push 通道当前不可用时的应急路径）
// 用法：node tools/gh_api_push.js <token> 
// 注意：API 提交不会触发 push 事件，写完还要手动 dispatch 工作流（见 tools/gh_api_dispatch.js）
const fs = require('fs');
const path = require('path');

const TOKEN = process.argv[2];
const OWNER = 'jiyanlong2017';
const REPO = 'caac';
const BRANCH = 'main';
const API = 'https://api.github.com';

const FILES = [
  'assets/app.js',
  'index.html',
  'README.md',
  'tools/verify_badge.js',
  'tools/verify_migration.js',
  'tools/verify_badge_live.js',
];

async function api(method, url, body) {
  const r = await fetch(API + url, {
    method,
    headers: {
      'Authorization': 'token ' + TOKEN,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'caac-quiz-deploy',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) {}
  return { status: r.status, body: j, text };
}

(async () => {
  const commitMsg = 'fix: 题卡颜色随错题本状态翻转（答对后由红变绿）+ 迁移/颜色两条回归守卫';
  let okCount = 0;
  for (const f of FILES) {
    // 统一 LF：gitattributes 里仓库是 eol=lf，直接传 CRLF 会把仓库搞脏
    const raw = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
    const content = Buffer.from(raw, 'utf8').toString('base64');

    // 老文件要带当前 sha（GitHub 的乐观锁），新文件不带
    const g = await api('GET', `/repos/${OWNER}/${REPO}/contents/${f}?ref=${BRANCH}`);
    const sha = g.status === 200 && g.body ? g.body.sha : null;

    const payload = { message: commitMsg, content, branch: BRANCH };
    if (sha) payload.sha = sha;
    const r = await api('PUT', `/repos/${OWNER}/${REPO}/contents/${f}`, payload);
    const detail = r.body && r.body.commit ? r.body.commit.sha.slice(0, 7) : (r.body && r.body.message || r.text.slice(0, 120));
    console.log(`${r.status === 200 || r.status === 201 ? 'OK  ' : 'FAIL'} ${f}  → ${r.status} ${detail}`);
    if (r.status === 200 || r.status === 201) okCount++;
    else { console.log(r.text.slice(0, 400)); break; }
  }
  console.log(`\n${okCount}/${FILES.length} 个文件已写入远端 main`);
  process.exit(okCount === FILES.length ? 0 : 1);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
