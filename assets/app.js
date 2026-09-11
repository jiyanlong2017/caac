/* =========================================================
   沉浸式题库刷题 · app.js
   题库读取全局变量 window.CAAC_BANK（单题库，无映射表）。
   数据契约（替换真实题库时保持这些字段即可）：
     顶层：{ name, subtitle?, version, source, cats:[], questions:[] }
             name     = 顶栏站点名
             subtitle = 副行前缀（如「超视距（机长）理论考试」），可省略
     题目：{ id, cat, type:'single'|'multi', q, opts:[], ans:number|number[], exp, flag }
   ========================================================= */
(function () {
  'use strict';

  var LS = 'caac_quiz_v1';
  var BANK = window.CAAC_BANK;

  /* ---------------- 工具 ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function fmtTime(s) {
    s = Math.max(0, s | 0);
    var m = (s / 60) | 0, ss = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
  }
  function fmtDate(t) {
    var d = new Date(t), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  var ICON = {
    check: '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>',
    cross: '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
    doubt: '<svg viewBox="0 0 24 24"><path d="M9.1 9a3 3 0 1 1 4.4 2.7c-.9.6-1.5 1.1-1.5 2.3"/><path d="M12 17.5h.01"/></svg>',
    warn: '<svg viewBox="0 0 24 24"><path d="M12 3l9 16H3z"/><path d="M12 9v5M12 17h.01"/></svg>',
    grid: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
  };
  var toastT;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 1700);
  }

  /* ---------------- 持久化状态 ---------------- */
  var DEF = {
    v: 1, theme: 'light',
    settings: { autoExp: false, shake: true, autoNext: false, passLine: 80, examSize: 100, examDur: 3600 },
    banks: {}, exams: []
  };
  var S = load();
  function load() {
    var r = null;
    try { r = JSON.parse(localStorage.getItem(LS)); } catch (e) { }
    if (!r || r.v !== 1) r = JSON.parse(JSON.stringify(DEF));
    // 兼容旧存档：题库只剩真题库，清掉可能残留的 bankId（曾选过示例库会导致取不到题库）
    delete r.bankId;
    return r;
  }
  var saveT;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { toast('本地存储写入失败'); }
    }, 200);
  }
  function bstate(id) {
    id = id || 'real';
    if (!S.banks[id]) S.banks[id] = { rec: {}, wrong: {}, fav: {}, doubt: {}, session: null };
    var b = S.banks[id];
    ['rec', 'wrong', 'fav', 'doubt'].forEach(function (k) { if (!b[k]) b[k] = {}; });
    return b;
  }
  function bank() { return BANK; }
  function Q(i) { return bank().questions[i]; }

  /* ---------------- 运行时 ---------------- */
  var UI = { tab: 'practice', mode: 'browse', chapter: '全部', list: [], idx: 0, ans: {}, combo: 0 };
  var EX = null;

  /* ---------------- 列表 ---------------- */
  function buildList(mode, chapter) {
    var qs = bank().questions, arr = [];
    for (var i = 0; i < qs.length; i++) if (chapter === '全部' || qs[i].cat === chapter) arr.push(i);
    if (mode === 'random') shuffle(arr);
    return arr;
  }
  function wrongList(chapter) {
    var b = bstate(), arr = Object.keys(b.wrong).map(Number)
      .filter(function (i) { return Q(i) && (chapter === '全部' || Q(i).cat === chapter); });
    arr.sort(function (a, c) { return (b.wrong[c] | 0) - (b.wrong[a] | 0); });
    return arr;
  }
  function currentList() { return UI.mode === 'wrong' ? wrongList(UI.chapter) : UI.list; }

  /* ---------------- 统计 ---------------- */
  function stats() {
    var b = bstate(), qs = bank().questions, done = 0, ans = 0, wrong = 0, cat = {};
    qs.forEach(function (q) { if (!cat[q.cat]) cat[q.cat] = { t: 0, d: 0 }; cat[q.cat].t++; });
    Object.keys(b.rec).forEach(function (k) {
      var q = Q(k); if (!q) return;
      done++; ans += b.rec[k].n; wrong += b.rec[k].w;
      if (cat[q.cat]) cat[q.cat].d++;
    });
    return {
      total: qs.length, done: done, ans: ans, wrong: wrong,
      rate: ans ? Math.round((1 - wrong / ans) * 100) : 0,
      wrongCount: Object.keys(b.wrong).length,
      fav: Object.keys(b.fav).length, doubt: Object.keys(b.doubt).length,
      flags: qs.filter(function (q) { return q.flag; }).length, cat: cat
    };
  }
  function record(qi, ok) {
    var b = bstate(), r = b.rec[qi] || (b.rec[qi] = { n: 0, w: 0 });
    r.n++; if (!ok) r.w++;
    if (ok) delete b.wrong[qi]; else b.wrong[qi] = (b.wrong[qi] | 0) + 1;
    save();
  }
  // 题卡格子的状态类：'' = 未答，' bad' = 当前在错题本，' done' = 已答对
  //
  // 判"错"必须看 b.wrong（错题本，答对时会被删掉），**不能看 rec.w**：
  // rec.w 是「累计答错次数」——只增不减（stats() 的正确率、统计页的「错误 N 次」都靠它），
  // 拿它当"当前是否答错"用，就会出现「答错过的题重做答对后格子还是红的」。
  // 侧栏题卡和弹层题卡原本各写了一遍这段判断，于是同时错；抽到这里，别再复制。
  function qgState(qi) {
    var b = bstate();
    if (!b.rec[qi]) return '';
    return b.wrong[qi] ? ' bad' : ' done';
  }

  /* =========================================================
     题卡渲染  mode: browse|practice|wrong|exam
     ========================================================= */
  function ansStore(mode) { return mode === 'exam' ? EX.ans : UI.ans; }

  function cardHTML(qi, mode) {
    var q = Q(qi), st = ansStore(mode)[qi] || {};
    var pick = st.pick || [], judged = !!st.judged;
    var multi = q.type === 'multi';
    var noAns = q.ans === null || q.ans === undefined;
    if (mode === 'browse') {
      judged = true;
      pick = noAns ? [] : (multi ? q.ans.slice() : [q.ans]);
    }
    var correct = !noAns && (multi ? String(pick.slice().sort()) === String(q.ans.slice().sort()) : pick[0] === q.ans);
    var h = '<div class="qcard" data-qi="' + qi + '">';
    h += '<div class="qhead"><span class="tag">' + esc(q.cat) + '</span>';
    if (multi) h += '<span class="tag multi">多选</span>';
    if (noAns) h += '<span class="tag grey">答案缺失</span>';
    h += '<span class="sp"></span>';
    h += '<button class="mini fav' + (bstate().fav[qi] ? ' on' : '') + '" data-act="fav" title="收藏">' + ICON.star + '</button>';
    h += '<button class="mini doubt' + (bstate().doubt[qi] ? ' on' : '') + '" data-act="doubt" title="标记存疑">' + ICON.doubt + '</button>';
    h += '</div>';
    if (q.flag) {
      h += '<div class="flagbar">' + ICON.warn + '<div>⚠ 存疑题：' + esc(q.flag) +
        '<br><span style="font-weight:500;opacity:.85">答案仅供参考，请以法规原文或教练讲解为准。</span></div></div>';
    }
    h += '<h2 class="qtext">' + esc(q.q) + '</h2><div class="opts">';
    q.opts.forEach(function (o, i) {
      var cls = 'opt' + (multi ? ' multi' : ''), mk = '';
      if (judged && !noAns) {
        var isR = multi ? q.ans.indexOf(i) >= 0 : q.ans === i, isP = pick.indexOf(i) >= 0;
        if (isR) { cls += ' right'; mk = ICON.check; }
        else if (isP) { cls += ' wrong'; mk = ICON.cross; }
        else cls += ' dim';
      } else if (pick.indexOf(i) >= 0) cls += ' sel';
      if (judged) cls += ' locked';
      h += '<button class="' + cls + '" data-act="pick" data-i="' + i + '">' +
        '<span class="k">' + 'ABCDEFGH'[i] + '</span><span class="v">' + esc(o) + '</span>' +
        '<span class="mk">' + mk + '</span></button>';
    });
    h += '</div>';
    if (multi && !judged) {
      h += '<div class="verdict" style="background:var(--brand-soft);color:var(--brand)">' + ICON.grid +
        '<span>多选题：选好后点「确认作答」</span></div>';
      h += '<div style="margin-top:10px"><button class="btn block" data-act="confirm">确认作答（已选 ' + pick.length + ' 项）</button></div>';
    }
    if (judged) {
      if (noAns) {
        h += '<div class="verdict" style="background:var(--warn-soft);color:var(--warn)">' + ICON.warn + '<span>该题原题库答案缺失，已跳过判分</span></div>';
      } else if (correct) {
        h += '<div class="verdict ok">' + ICON.check + '<span>回答正确' + (multi ? '（全对才得分）' : '') + '</span></div>';
      } else {
        var rt = multi ? q.ans.map(function (i) { return 'ABCDEFGH'[i]; }).join('') : 'ABCDEFGH'[q.ans];
        h += '<div class="verdict no">' + ICON.cross + '<span>回答错误，正确答案：' + rt + '</span></div>';
      }
      var open = (mode === 'browse' || S.settings.autoExp) ? ' open' : '';
      if (q.exp) h += '<div class="acc' + open + '" data-acc="exp"><div class="acc-h"><span class="dot"></span>答案解析<span class="sp"></span><span class="ar">' + ICON.arrow + '</span></div><div class="acc-b">' + esc(q.exp) + '</div></div>';
    }
    h += '</div>';
    return h;
  }
  function mountCard(wrap, qi, mode, dir) {
    if (qi == null) { wrap.innerHTML = emptyHTML('没有可显示的题目', '换个章节或模式试试'); return; }
    var d = document.createElement('div');
    d.className = 'card' + (dir === 'up' ? ' slide-up' : dir === 'down' ? ' slide-down' : '');
    d.innerHTML = cardHTML(qi, mode);
    wrap.innerHTML = ''; wrap.appendChild(d); wrap.scrollTop = 0;
  }
  function emptyHTML(t, d) {
    return '<div class="empty">' + ICON.grid + '<div class="t">' + esc(t) + '</div><div class="d">' + esc(d || '') + '</div></div>';
  }
  function judge(qi, picks, mode) {
    var q = Q(qi), store = ansStore(mode), st = store[qi] || (store[qi] = { pick: [], judged: false });
    if (st.judged) return null;
    var noAns = q.ans === null || q.ans === undefined;
    st.pick = picks; st.judged = true;
    var ok = !noAns && (q.type === 'multi' ? String(picks.slice().sort()) === String(q.ans.slice().sort()) : picks[0] === q.ans);
    if (mode !== 'browse' && !noAns) { record(qi, ok); UI.combo = ok ? UI.combo + 1 : 0; }
    return noAns ? null : ok;
  }

  /* =========================================================
     练习页
     ========================================================= */
  function setMode(mode) {
    UI.mode = mode; UI.ans = {}; UI.combo = 0; UI.idx = 0;
    UI.list = (mode === 'wrong') ? wrongList(UI.chapter) : buildList(mode, UI.chapter);
    $$('#modeChips .chip').forEach(function (c) { c.classList.toggle('on', c.dataset.mode === mode); });
    bstate().session = { mode: mode, chapter: UI.chapter, idx: 0 };
    save(); renderPractice();
  }
  /* ---------------- 桌面右侧信息栏 ---------------- */
  function renderRail() {
    var el = $('#rail'); if (!el) return;
    var s = stats(), list = currentList(), b = bstate();
    var h = '';
    h += '<div class="panel"><div class="r-title">学习概览</div><div class="r-mini">' +
      '<div class="m"><b>' + s.done + '</b><span>已做</span></div>' +
      '<div class="m"><b style="color:var(--ok)">' + s.rate + '%</b><span>正确率</span></div>' +
      '<div class="m"><b style="color:var(--err)">' + s.wrongCount + '</b><span>错题</span></div></div></div>';

    var m = catStatsAll();
    var curName = UI.chapter === '全部' ? '全部章节' : UI.chapter;
    var cv = UI.chapter === '全部'
      ? { t: bank().questions.length, d: Object.keys(b.rec).length }
      : (m[UI.chapter] || { t: 0, d: 0 });
    var cp = cv.t ? Math.round(cv.d / cv.t * 100) : 0;
    h += '<div class="panel"><div class="r-title">当前范围</div>' +
      '<div class="crow on" data-act="sheetCatMenu" style="cursor:pointer"><div class="nm">' + esc(curName) + '</div>' +
      '<div class="bar"><i style="width:' + cp + '%"></i></div><div class="pc">' + cv.d + '/' + cv.t + '</div></div>' +
      '<button class="btn ghost sm block" style="margin-top:10px" data-act="sheetCatMenu">' +
      ICON.grid + ' 选择章节（' + bank().cats.length + ' 个）</button></div>';

    if (list.length) {
      h += '<div class="panel"><div class="r-title">题卡 · 共 ' + list.length + ' 题</div><div class="qgrid">';
      for (var n = 0; n < list.length; n++) {
        var qi = list[n], cls = 'qg' + qgState(qi);
        if (Q(qi).flag) cls += ' flag';
        if (b.fav[qi]) cls += ' fav';
        if (n === UI.idx) cls += ' cur';
        h += '<button class="' + cls + '" data-act="goto" data-n="' + n + '">' + (n + 1) + '</button>';
      }
      h += '</div></div>';
    }
    h += '<div class="panel"><div class="r-title">快捷键</div><div class="keys">' +
      '<kbd>↑</kbd><kbd>↓</kbd> 上下题　<kbd>1-8</kbd>/<kbd>A-H</kbd> 选项<br>' +
      '<kbd>Enter</kbd> 多选确认　<kbd>S</kbd> 收藏　<kbd>M</kbd> 存疑<br>' +
      '也支持鼠标滚轮 / 触屏上下滑动翻页</div></div>';
    el.innerHTML = h;
  }

  function renderPractice() {
    var list = currentList();
    if (UI.mode === 'wrong' && !list.length) $('#cardWrap').innerHTML = emptyHTML('错题本是空的', '先去章节练习刷几道，答错的会自动收进来');
    else if (!list.length) $('#cardWrap').innerHTML = emptyHTML('该章节暂无题目', '换一个章节看看');
    else {
      if (UI.idx >= list.length) UI.idx = list.length - 1;
      if (UI.idx < 0) UI.idx = 0;
      mountCard($('#cardWrap'), list[UI.idx], UI.mode, null);
    }
    updBar(); renderRail(); renderCatMenu();
  }
  function updBar() {
    var list = currentList();
    $('#posText').textContent = (list.length ? UI.idx + 1 : 0) + ' / ' + list.length;
    $('#comboText').textContent = UI.combo >= 3 ? '连对 ' + UI.combo + ' ✦' : '';
    $('#btnPrev').disabled = UI.idx <= 0;
    renderRail();
  }
  function goto(delta, dir) {
    var list = currentList(), n = UI.idx + delta;
    if (n < 0) { toast('已经是第一题'); return; }
    if (n >= list.length) { toast(UI.mode === 'wrong' ? '错题重做完啦' : '本章节已刷完，可切换章节或重做错题'); return; }
    UI.idx = n;
    var s = bstate().session; if (s) { s.idx = n; save(); }
    mountCard($('#cardWrap'), list[n], UI.mode, dir || (delta > 0 ? 'up' : 'down'));
    updBar();
  }
  /* 章节统计：一次遍历出全部章节的 {题量, 已做} */
  function catStatsAll() {
    var b = bstate(), m = {};
    bank().questions.forEach(function (q, i) {
      var c = m[q.cat] || (m[q.cat] = { t: 0, d: 0 });
      c.t++; if (b.rec[i]) c.d++;
    });
    return m;
  }
  function curCatStat(m) {
    if (UI.chapter === '全部') {
      var v = m && m.__all;
      return v || { t: bank().questions.length, d: Object.keys(bstate().rec).length };
    }
    return (m && m[UI.chapter]) || { t: 0, d: 0 };
  }
  function renderCatMenu() {
    var m = catStatsAll(), v = curCatStat(m);
    $('#catMenuTitle').textContent = UI.chapter === '全部' ? '全部章节' : UI.chapter;
    $('#catMenuNum').textContent = v.d + ' / ' + v.t;
    $('#catMenu').classList.toggle('on', UI.chapter !== '全部');
  }
  function catCardHTML(name, val, right, pct, on) {
    return '<button class="catcard' + (on ? ' on' : '') + '" data-act="setCat" data-cat="' + esc(val) + '">' +
      (on ? '<span class="cd">' + ICON.check + '</span>' : '') +
      '<div class="cn">' + esc(name) + '</div>' +
      '<div class="cb"><i style="width:' + (pct || 0) + '%"></i></div>' +
      '<div class="cp">' + right + '</div></button>';
  }
  function sheetCatMenu() {
    var m = catStatsAll(), b = bstate();
    var total = bank().questions.length, done = Object.keys(b.rec).length;
    var h = '<div class="catgrid">';
    h += catCardHTML('全部章节', '全部', done + ' / ' + total + ' 题 · ' + Math.round(done / total * 100) + '%',
      Math.round(done / total * 100), UI.chapter === '全部');
    bank().cats.forEach(function (c) {
      var v = m[c] || { t: 0, d: 0 }, p = v.t ? Math.round(v.d / v.t * 100) : 0;
      h += catCardHTML(c, c, v.d + ' / ' + v.t + ' 题 · ' + p + '%', p, UI.chapter === c);
    });
    h += '</div>';
    h += '<div class="legend" style="margin-top:14px">共 ' + bank().cats.length + ' 个章节 · 进度条＝已做 / 本章题量 · 点击切换</div>';
    openSheet('选择章节', h);
  }
  function setChapter(c) {
    UI.chapter = c;
    UI.idx = 0; UI.ans = {}; UI.combo = 0;
    UI.list = (UI.mode === 'wrong') ? wrongList(c) : buildList(UI.mode, c);
    bstate().session = { mode: UI.mode, chapter: c, idx: 0 };
    save();
    renderCatMenu(); renderWrongMenu(); renderPractice();
    if (UI.tab === 'wrong') renderWrongPage();
    toast('已切到「' + (c === '全部' ? '全部章节' : c) + '」');
  }
  /* 错题分组统计 */
  function wrongStats() {
    var b = bstate(), cnt = {}, all = 0;
    Object.keys(b.wrong).forEach(function (k) {
      var q = Q(k); if (!q) return;
      cnt[q.cat] = (cnt[q.cat] || 0) + 1; all++;
    });
    return { cnt: cnt, all: all };
  }
  function renderWrongMenu() {
    var w = wrongStats();
    var n = UI.chapter === '全部' ? w.all : (w.cnt[UI.chapter] || 0);
    $('#wrongMenuTitle').textContent = UI.chapter === '全部' ? '全部错题' : UI.chapter;
    $('#wrongMenuNum').textContent = n;
    $('#wrongMenu').classList.toggle('on', UI.chapter !== '全部');
  }
  function sheetWrongMenu() {
    var w = wrongStats();
    if (!w.all) return openSheet('筛选题目分组', emptyHTML('错题本是空的', '先去练习里刷几道题'));
    var h = '<div class="catgrid">';
    h += catCardHTML('全部错题', '全部', w.all + ' 题', 100, UI.chapter === '全部');
    Object.keys(w.cnt).forEach(function (c) {
      h += catCardHTML(c, c, w.cnt[c] + ' 题', Math.round(w.cnt[c] / w.all * 100), UI.chapter === c);
    });
    h += '</div>';
    openSheet('筛选题目分组', h);
  }

  /* =========================================================
     考试
     ========================================================= */
  function renderExamSetup() {
    var b = bank(), st = S.settings;
    var h = '<div class="panel"><div class="ph"><h3>模拟仿真考试</h3><span class="sp"></span><span class="sub">' + esc(b.name) + '</span></div>';
    h += '<div class="field"><label>题量</label><div class="seg">';
    [50, 100, 200].forEach(function (n) { h += '<button class="chip' + (st.examSize === n ? ' on' : '') + '" data-size="' + n + '">' + n + ' 题</button>'; });
    h += '</div></div>';
    h += '<div class="field"><label>考试时长</label><div class="seg">';
    [30, 45, 60, 90].forEach(function (n) { h += '<button class="chip' + (st.examDur === n * 60 ? ' on' : '') + '" data-dur="' + n * 60 + '">' + n + ' 分钟</button>'; });
    h += '</div></div>';
    h += '<div class="field"><label>及格线（超视距机长通常为 80 分，可自行调整）</label><div class="seg">';
    [60, 70, 80].forEach(function (n) { h += '<button class="chip' + (st.passLine === n ? ' on' : '') + '" data-pass="' + n + '">' + n + ' 分</button>'; });
    h += '</div></div>';
    h += '<div class="row"><button class="btn block" id="btnStartExam">' + ICON.clock + ' 开始考试</button></div>';
    h += '<div style="font-size:12px;color:var(--muted);margin-top:10px;line-height:1.65">题目从全部章节随机抽取；交卷后自动判分、保存历史，时间到自动交卷。考试中不可查看解析。</div></div>';
    if (S.exams.length) {
      h += '<div class="panel"><div class="ph"><h3>考试历史</h3><span class="sp"></span><span class="sub">最近 ' + Math.min(8, S.exams.length) + ' 次</span></div>';
      S.exams.slice(0, 8).forEach(function (e, i) {
        h += '<div class="hitem"><div class="sc" style="color:' + (e.score >= e.pass ? 'var(--ok)' : 'var(--err)') + '">' + e.score + '</div>' +
          '<div class="meta"><div class="a">' + e.correct + ' / ' + e.total + ' 题正确 · ' + (e.score >= e.pass ? '及格' : '未及格') + '</div>' +
          '<div class="b">' + fmtDate(e.date) + ' · 用时 ' + fmtTime(e.usedSec) + '</div></div>' +
          '<button class="btn sm ghost" data-act="reviewExam" data-i="' + i + '">回顾</button></div>';
      });
      h += '</div>';
    }
    $('#examSetup').innerHTML = h;
  }
  function startExam() {
    var qs = bank().questions, arr = [];
    for (var i = 0; i < qs.length; i++) if (qs[i].ans !== null && qs[i].ans !== undefined) arr.push(i);
    arr = shuffle(arr).slice(0, Math.min(S.settings.examSize, arr.length));
    EX = { qids: arr, ans: {}, idx: 0, start: Date.now(), end: Date.now() + S.settings.examDur * 1000, timer: null, done: false };
    $('#examSetup').classList.add('hide'); $('#examResult').classList.add('hide');
    var run = $('#examRun'); run.classList.remove('hide');
    run.innerHTML = '<div class="exam-top"><span class="clock" id="exClock">' + fmtTime(S.settings.examDur) + '</span>' +
      '<span class="sp"></span><span class="pg" id="exPg"></span>' +
      '<button class="btn sm ghost" id="btnExSheet">题卡</button><button class="btn sm" id="btnSubmit">交卷</button></div>' +
      '<div class="stage"><div class="card-wrap" id="exWrap"></div></div>' +
      '<div class="qbar"><button class="nav-btn" id="exPrev">上一题</button>' +
      '<div class="qbar-mid"><div class="pos" id="exPos">0 / 0</div></div>' +
      '<button class="nav-btn primary" id="exNext">下一题</button></div>';
    EX.timer = setInterval(function () {
      if (!EX || EX.done) return;
      var left = Math.round((EX.end - Date.now()) / 1000), c = $('#exClock');
      if (!c) return;
      c.textContent = fmtTime(left);
      if (left <= 60) c.classList.add('low');
      if (left <= 0) finishExam(true);
    }, 500);
    renderExamCard(null);
  }
  function renderExamCard(dir) {
    if (!EX) return;
    mountCard($('#exWrap'), EX.qids[EX.idx], 'exam', dir);
    $('#exPos').textContent = (EX.idx + 1) + ' / ' + EX.qids.length;
    $('#exPg').textContent = '已答 ' + Object.keys(EX.ans).length + ' 题';
  }
  function finishExam(auto) {
    if (!EX || EX.done) return;
    clearInterval(EX.timer); EX.done = true;
    var used = Math.round((Date.now() - EX.start) / 1000), correct = 0, wrongs = [], answers = {};
    EX.qids.forEach(function (qi) {
      var q = Q(qi), st = EX.ans[qi], picks = st && st.pick ? st.pick : [];
      answers[qi] = picks;
      var ok = q.type === 'multi' ? String(picks.slice().sort()) === String(q.ans.slice().sort()) : picks[0] === q.ans;
      if (ok) correct++; else wrongs.push(qi);
      record(qi, ok);
    });
    var rec = {
      date: Date.now(), total: EX.qids.length, correct: correct,
      score: Math.round(correct / EX.qids.length * 100), pass: S.settings.passLine,
      usedSec: used, qids: EX.qids, answers: answers, wrongs: wrongs
    };
    S.exams.unshift(rec); if (S.exams.length > 50) S.exams.length = 50;
    save(); showExamResult(rec, auto);
  }
  function showExamResult(e, auto) {
    var pass = e.score >= e.pass, h = '<div class="panel"><div class="score-hero">';
    h += '<div class="big ' + (pass ? 'pass' : 'fail') + '">' + e.score + '</div><div class="lab">得分（满分 100）</div>';
    h += '<div class="pass-tag ' + (pass ? 'y' : 'n') + '">' + (pass ? '通过' : '未通过') + ' · 及格线 ' + e.pass + '</div></div>';
    h += '<div class="grid4" style="margin-top:16px">';
    h += '<div class="stat ok"><div class="n">' + e.correct + '</div><div class="l">答对</div></div>';
    h += '<div class="stat err"><div class="n">' + (e.total - e.correct) + '</div><div class="l">答错</div></div>';
    h += '<div class="stat warn"><div class="n">' + fmtTime(e.usedSec) + '</div><div class="l">用时</div></div>';
    h += '<div class="stat brand"><div class="n">' + Math.round(e.correct / e.total * 100) + '%</div><div class="l">正确率</div></div></div>';
    if (auto) h += '<div style="text-align:center;margin-top:12px;font-size:12.5px;color:var(--warn);font-weight:700">考试时间到，已自动交卷</div>';
    h += '<div class="ph" style="margin-top:18px"><h3>各章节得分</h3></div>';
    var cm = {};
    e.qids.forEach(function (qi) {
      var q = Q(qi); if (!cm[q.cat]) cm[q.cat] = { t: 0, c: 0 };
      cm[q.cat].t++; if (e.wrongs.indexOf(qi) < 0) cm[q.cat].c++;
    });
    Object.keys(cm).forEach(function (c) {
      var v = cm[c], p = Math.round(v.c / v.t * 100);
      h += '<div class="crow"><div class="nm">' + esc(c) + '</div><div class="bar"><i style="width:' + p + '%;background:' +
        (p >= 80 ? 'linear-gradient(90deg,#0f9d58,#34c77b)' : p >= 60 ? 'linear-gradient(90deg,#e08c00,#f0a92e)' : 'linear-gradient(90deg,#e5484d,#ff6b6f)') +
        '"></i></div><div class="pc">' + v.c + '/' + v.t + '</div></div>';
    });
    h += '<div class="row" style="margin-top:16px">' +
      '<button class="btn ghost" style="flex:1" data-act="reviewExam" data-i="0">' + ICON.grid + ' 逐题回顾</button>' +
      '<button class="btn" style="flex:1" data-act="againExam">' + ICON.redo + ' 再来一次</button>' +
      '<button class="btn ghost" style="flex:1" data-act="backSetup">返回</button></div></div>';
    $('#examRun').classList.add('hide'); $('#examSetup').classList.add('hide');
    $('#examResult').classList.remove('hide'); $('#examResult').innerHTML = h;
  }

  /* =========================================================
     错题页 / 统计页
     ========================================================= */
  function renderWrongPage() {
    var b = bstate(), list = wrongList(UI.chapter);
    var h = '<div class="panel"><div class="ph"><h3>错题本</h3><span class="sp"></span><span class="sub">共 ' + Object.keys(b.wrong).length + ' 题</span></div>';
    if (!list.length) {
      h += '<div class="empty">' + ICON.check + '<div class="t">这里空空如也</div><div class="d">先去练习模式刷几道题，答错的会自动进到这里</div></div>';
    } else {
      h += '<div class="row" style="margin-bottom:12px"><button class="btn block" data-act="redoWrong">' + ICON.redo + ' 重做当前分组（' + list.length + ' 题）</button></div>';
      h += '<div class="row"><button class="btn ghost sm" data-act="clearWrongCat">' + ICON.trash + ' 清空当前分组</button>' +
        '<button class="btn ghost sm" data-act="sheetDoubt">存疑题 ' + Object.keys(b.doubt).length + '</button></div>';
      h += '<div style="margin-top:12px">';
      list.forEach(function (qi) {
        var q = Q(qi);
        h += '<div class="hitem"><div class="meta"><div class="a" style="font-weight:600">' + esc(q.q.length > 48 ? q.q.slice(0, 48) + '…' : q.q) + '</div>' +
          '<div class="b">' + esc(q.cat) + ' · 错 ' + b.wrong[qi] + ' 次' + (q.flag ? ' · <span style="color:var(--warn)">存疑题</span>' : '') + '</div></div>' +
          '<button class="btn sm ghost" data-act="jump" data-qi="' + qi + '">查看</button>' +
          '<button class="btn sm ghost" data-act="delWrong" data-qi="' + qi + '">' + ICON.trash + '</button></div>';
      });
      h += '</div>';
    }
    h += '</div>';
    $('#wrongBody').innerHTML = h;
  }
  function renderStats() {
    var s = stats(), bk = bank();
    var pct = s.total ? Math.round(s.done / s.total * 100) : 0, C = 2 * Math.PI * 42;
    var h = '<div class="panel"><div class="ph"><h3>学习总览</h3><span class="sp"></span><span class="sub">' + esc(bk.name) + '</span></div>';
    h += '<div class="ring"><svg viewBox="0 0 100 100">' +
      '<circle cx="50" cy="50" r="42" stroke="var(--bg2)" stroke-width="9"/>' +
      '<circle cx="50" cy="50" r="42" stroke="var(--brand)" stroke-width="9" stroke-linecap="round" stroke-dasharray="' +
      (C * pct / 100) + ' ' + C + '" transform="rotate(-90 50 50)"/>' +
      '<text class="rc" x="50" y="48">' + pct + '%</text><text class="rl" x="50" y="64">学习进度</text></svg>' +
      '<div class="ring-info"><div class="t">已做 ' + s.done + ' / ' + s.total + ' 题</div>' +
      '<div class="d">答题 ' + s.ans + ' 次 · 错误 ' + s.wrong + ' 次</div>' +
      '<div class="d">错题 ' + s.wrongCount + ' · 收藏 ' + s.fav + ' · 存疑 ' + s.doubt + '</div></div></div>';
    h += '<div class="grid4" style="margin-top:14px">' +
      '<div class="stat brand"><div class="n">' + s.total + '</div><div class="l">总题量</div></div>' +
      '<div class="stat"><div class="n">' + s.done + '</div><div class="l">已做题</div></div>' +
      '<div class="stat ok"><div class="n">' + s.rate + '%</div><div class="l">正确率</div></div>' +
      '<div class="stat err"><div class="n">' + s.wrongCount + '</div><div class="l">错题</div></div></div></div>';
    h += '<div class="panel"><div class="ph"><h3>各章节完成度</h3><span class="sp"></span><span class="sub">已做 / 总题量</span></div>';
    bk.cats.forEach(function (c) {
      var v = s.cat[c] || { t: 0, d: 0 }, p = v.t ? Math.round(v.d / v.t * 100) : 0;
      h += '<div class="crow"><div class="nm">' + esc(c) + '</div><div class="bar"><i style="width:' + p + '%"></i></div><div class="pc">' + v.d + '/' + v.t + '</div></div>';
    });
    h += '</div>';
    h += '<div class="panel"><div class="ph"><h3>快捷入口</h3></div><div class="row">' +
      '<button class="btn ghost sm" data-act="sheetFlag">⚠ 存疑题 ' + s.flags + '</button>' +
      '<button class="btn ghost sm" data-act="sheetDoubt">我标记的 ' + s.doubt + '</button>' +
      '<button class="btn ghost sm" data-act="sheetFav">收藏 ' + s.fav + '</button></div></div>';
    if (S.exams.length) {
      h += '<div class="panel"><div class="ph"><h3>考试历史</h3><span class="sp"></span><span class="sub">' + S.exams.length + ' 次</span></div>';
      S.exams.slice(0, 10).forEach(function (e, i) {
        h += '<div class="hitem"><div class="sc" style="color:' + (e.score >= e.pass ? 'var(--ok)' : 'var(--err)') + '">' + e.score + '</div>' +
          '<div class="meta"><div class="a">' + e.correct + '/' + e.total + ' · ' + fmtTime(e.usedSec) + ' · 及格线 ' + e.pass + '</div>' +
          '<div class="b">' + fmtDate(e.date) + '</div></div>' +
          '<button class="btn sm ghost" data-act="reviewExam" data-i="' + i + '">回顾</button></div>';
      });
      h += '</div>';
    }
    h += '<div class="panel"><div class="ph"><h3>数据与设置</h3></div>' +
      '<div class="srow"><div class="lb">答题后自动展开解析</div><div class="sw' + (S.settings.autoExp ? ' on' : '') + '" data-act="set" data-k="autoExp"></div></div>' +
      '<div class="srow"><div class="lb">答错时抖动反馈</div><div class="sw' + (S.settings.shake ? ' on' : '') + '" data-act="set" data-k="shake"></div></div>' +
      '<div class="srow"><div class="lb">单选答对后自动跳下一题</div><div class="sw' + (S.settings.autoNext ? ' on' : '') + '" data-act="set" data-k="autoNext"></div></div>' +
      '<div class="srow"><div class="lb" style="color:var(--err)">清空全部进度与记录<div class="d">答题记录、错题本、收藏、存疑、考试历史都会被删除，不可恢复</div></div>' +
      '<button class="btn sm danger" data-act="resetAll">' + ICON.trash + ' 清空</button></div></div>';
    $('#statsBody').innerHTML = h;
  }

  /* =========================================================
     弹层
     ========================================================= */
  function openSheet(title, html) {
    $('#sheetTitle').textContent = title; $('#sheetBody').innerHTML = html;
    $('#mask').classList.remove('hide'); $('#sheet').classList.remove('hide');
  }
  function closeSheet() { $('#mask').classList.add('hide'); $('#sheet').classList.add('hide'); }
  var pendingConfirm = null;
  function confirmBox(msg, cb, okText) {
    pendingConfirm = cb;
    openSheet('确认操作', '<div class="panel"><div style="font-size:14px;line-height:1.75;color:var(--text2);margin-bottom:14px">' +
      esc(msg) + '</div><div class="row"><button class="btn ghost" style="flex:1" data-act="confirmNo">取消</button>' +
      '<button class="btn danger" style="flex:1" data-act="confirmYes">' + esc(okText || '确定') + '</button></div></div>');
  }
  function sheetCard() {
    var list = currentList(), b = bstate(), cur = list[UI.idx];
    if (!list.length) return openSheet('题卡', emptyHTML('暂无题目', ''));
    var h = '<div class="legend"><span><i style="background:var(--ok-soft);border:1px solid var(--ok)"></i>已答对</span>' +
      '<span><i style="background:var(--err-soft);border:1px solid var(--err)"></i>答错</span>' +
      '<span><i style="background:var(--bg2);border:1px solid var(--line)"></i>未答</span>' +
      '<span><i style="background:var(--warn);border-radius:50%"></i>存疑题</span>' +
      '<span><i style="background:var(--fav)"></i>收藏</span></div><div class="qgrid" style="margin-top:12px">';
    list.forEach(function (qi, n) {
      var cls = 'qg' + qgState(qi);
      if (Q(qi).flag) cls += ' flag';
      if (b.fav[qi]) cls += ' fav';
      if (qi === cur) cls += ' cur';
      h += '<button class="' + cls + '" data-act="goto" data-n="' + n + '">' + (n + 1) + '</button>';
    });
    h += '</div>';
    openSheet('题卡 · 共 ' + list.length + ' 题', h);
  }
  function sheetExamCard() {
    if (!EX) return;
    var h = '<div class="qgrid">';
    EX.qids.forEach(function (qi, n) {
      var cls = 'qg' + (EX.ans[qi] ? ' done' : '') + (qi === EX.qids[EX.idx] ? ' cur' : '');
      h += '<button class="' + cls + '" data-act="exgoto" data-n="' + n + '">' + (n + 1) + '</button>';
    });
    h += '</div><div class="legend"><span>已答 ' + Object.keys(EX.ans).length + ' / ' + EX.qids.length + '　点击题号可跳转</span></div>';
    openSheet('考试题卡', h);
  }
  function sheetSearch() {
    openSheet('搜索题目', '<div class="field" style="margin-bottom:6px"><input id="searchInput" placeholder="题号 / 关键词 / 章节…" style="width:100%;padding:10px 12px;border:1.5px solid var(--line);border-radius:10px;font-size:14px;background:var(--card2);color:var(--text);font-family:inherit;outline:none"></div>' +
      '<div id="searchResults"><div class="empty" style="padding:18px"><div class="d">输入关键词搜索题干；支持题号（#）、章节名、中文关键字</div></div></div>');
    var inp = $('#searchInput'); if (!inp) return;
    setTimeout(function () { inp.focus(); }, 50);
    var token = 0;
    inp.addEventListener('input', function () {
      var q = inp.value.trim(); if (!q) {
        $('#searchResults').innerHTML = '<div class="empty" style="padding:18px"><div class="d">输入关键词搜索题干；支持题号（#）、章节名、中文关键字</div></div>';
        return;
      }
      token++; (function (tk) {
        setTimeout(function () {
          if (tk !== token) return;
          var lower = q.toLowerCase();
          var wantsId = /^#?\d+$/.test(q) ? +q.replace(/^#/, '') : 0;
          var res = [], bs = bstate();
          for (var i = 0; i < bank().questions.length; i++) {
            var qq = bank().questions[i];
            if (wantsId && qq.id === wantsId) { res.unshift(i); continue; }
            var hay = (qq.q + ' ' + qq.cat).toLowerCase();
            if (hay.indexOf(lower) >= 0) { res.push(i); if (res.length >= 50) break; }
          }
          if (!res.length) { $('#searchResults').innerHTML = '<div class="empty" style="padding:18px"><div class="d">没有匹配的题目</div></div>'; return; }
          var h = '<div style="font-size:11.5px;color:var(--muted);font-weight:600;margin-bottom:8px">命中 ' + res.length + ' 条</div>';
          res.forEach(function (qi) {
            var qq = Q(qi);
            h += '<div class="hitem" data-act="jump" data-qi="' + qi + '" style="cursor:pointer"><div class="meta"><div class="a">' +
              esc(qq.q.length > 64 ? qq.q.slice(0, 64) + '…' : qq.q) + '</div>' +
              '<div class="b">#' + qq.id + ' · ' + esc(qq.cat) +
              (qq.flag ? ' · <span style="color:var(--warn)">⚠</span>' : '') +
              (bs.wrong[qi] ? ' · <span style="color:var(--err)">错</span>' : '') +
              (bs.fav[qi] ? ' · <span style="color:var(--fav)">★</span>' : '') +
              (qq.type === 'multi' ? ' · <span style="color:#7048d8">多选</span>' : '') +
              '</div></div><button class="btn sm ghost">查看</button></div>';
          });
          $('#searchResults').innerHTML = h;
        }, 80);
      })(token);
    });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); var f = $('.hitem[data-act="jump"]'); if (f) f.click(); }
    });
  }
  function sheetList(title, arr) {
    if (!arr.length) return openSheet(title, emptyHTML('暂无内容', ''));
    var h = '';
    arr.forEach(function (qi) {
      var q = Q(qi); if (!q) return;
      h += '<div class="hitem"><div class="meta"><div class="a" style="font-weight:600">' + esc(q.q.length > 52 ? q.q.slice(0, 52) + '…' : q.q) + '</div>' +
        '<div class="b">' + esc(q.cat) + (q.flag ? ' · <span style="color:var(--warn)">' + esc(q.flag) + '</span>' : '') + '</div></div>' +
        '<button class="btn sm ghost" data-act="jump" data-qi="' + qi + '">查看</button></div>';
    });
    openSheet(title + ' · ' + arr.length + ' 题', h);
  }
  function jumpTo(qi) {
    closeSheet();
    switchTab('practice');
    var l = currentList(), pos = l.indexOf(qi);
    if (pos < 0) {
      UI.chapter = '全部'; UI.list = buildList(UI.mode === 'wrong' ? 'chapter' : UI.mode, '全部');
      renderCatMenu();
      l = currentList(); pos = l.indexOf(qi);
    }
    if (pos < 0) { toast('未找到该题'); return; }
    UI.idx = pos; UI.ans = {}; save();
    mountCard($('#cardWrap'), qi, UI.mode, null);
    updBar();
  }
  function sheetReview(i) {
    var e = S.exams[i]; if (!e) return;
    openSheet('考试回顾 · ' + e.score + ' 分',
      '<div class="row" style="margin-bottom:12px">' +
      '<button class="btn sm" data-act="revFilter" data-f="wrong" data-i="' + i + '">只看错题（' + e.wrongs.length + '）</button>' +
      '<button class="btn sm ghost" data-act="revFilter" data-f="all" data-i="' + i + '">全部题目</button></div>' +
      '<div id="revList">' + revListHTML(e, 'wrong') + '</div>');
  }
  function revListHTML(e, f) {
    var ids = f === 'wrong' ? e.wrongs : e.qids;
    if (!ids || !ids.length) return emptyHTML('这一组没有错题', '');
    var h = '';
    ids.forEach(function (qi) {
      var q = Q(qi); if (!q) return;
      var picks = e.answers[qi] || [];
      var ok = q.type === 'multi' ? String(picks.slice().sort()) === String(q.ans.slice().sort()) : picks[0] === q.ans;
      var rt = q.type === 'multi' ? q.ans.map(function (i) { return 'ABCDEFGH'[i]; }).join('') : 'ABCDEFGH'[q.ans];
      h += '<div class="panel tight" style="margin-bottom:10px"><div style="font-size:13.5px;font-weight:700;line-height:1.6;margin-bottom:8px">' + esc(q.q) + '</div>' +
        '<div style="font-size:13px;color:var(--text2)">你的答案：<b style="color:' + (ok ? 'var(--ok)' : 'var(--err)') + '">' +
        (picks.length ? picks.map(function (i) { return 'ABCDEFGH'[i]; }).join('') : '未答') + '</b>　正确答案：<b style="color:var(--ok)">' + rt + '</b></div>';
      if (q.exp) h += '<div style="font-size:12.5px;color:var(--muted);line-height:1.7;border-top:1px dashed var(--line2);padding-top:8px;margin-top:8px">' + esc(q.exp) + '</div>';
      if (q.flag) h += '<div style="font-size:12px;color:var(--warn);margin-top:6px">⚠ ' + esc(q.flag) + '</div>';
      h += '</div>';
    });
    return h;
  }

  /* =========================================================
     卡片交互
     ========================================================= */
  function onCard(e, mode, wrap) {
    var t = e.target.closest('[data-act]'); if (!t) return;
    var act = t.dataset.act, card = e.target.closest('.qcard');
    if (!card) return;
    var qi = +card.dataset.qi, b = bstate(), q = Q(qi);

    if (act === 'pick' || act === 'confirm') {
      if (mode === 'browse') { toast('背题模式直接看答案，切到章节练习才会判分'); return; }
      var store = ansStore(mode), st = store[qi] || (store[qi] = { pick: [], judged: false });
      if (st.judged) return;
      if (act === 'confirm') {
        if (!st.pick.length) { toast('请先选择答案'); return; }
        afterJudge(wrap, qi, mode, judge(qi, st.pick.slice(), mode));
        return;
      }
      var i = +t.dataset.i;
      if (q.type === 'multi') {
        var p = st.pick.indexOf(i);
        if (p >= 0) st.pick.splice(p, 1); else st.pick.push(i);
        mountCard(wrap, qi, mode, null); return;
      }
      var ok = judge(qi, [i], mode);
      afterJudge(wrap, qi, mode, ok);
      return;
    }
    if (act === 'confirm') {
      var s2 = ansStore(mode)[qi];
      if (!s2 || !s2.pick.length) { toast('请先选择答案'); return; }
      afterJudge(wrap, qi, mode, judge(qi, s2.pick.slice(), mode));
      return;
    }
    if (act === 'fav') {
      if (b.fav[qi]) delete b.fav[qi]; else b.fav[qi] = 1;
      save(); t.classList.toggle('on', !!b.fav[qi]); toast(b.fav[qi] ? '已收藏' : '已取消收藏'); return;
    }
    if (act === 'doubt') {
      if (b.doubt[qi]) delete b.doubt[qi]; else b.doubt[qi] = 1;
      save(); t.classList.toggle('on', !!b.doubt[qi]); toast(b.doubt[qi] ? '已标记存疑' : '已取消存疑'); return;
    }
  }
  function afterJudge(wrap, qi, mode, ok) {
    mountCard(wrap, qi, mode, null);
    var c = $('.qcard', wrap);
    if (c && S.settings.shake) {
      c.classList.add(ok === false ? 'flash-no' : 'flash-ok');
      if (navigator.vibrate && ok === false) navigator.vibrate(26);
    }
    if (Q(qi).flag) toast('⚠ 这题被标记为存疑，答案请核对原文');
    if (mode === 'exam') { $('#exPg').textContent = '已答 ' + Object.keys(EX.ans).length + ' 题'; }
    else { updBar(); if (ok && S.settings.autoNext && Q(qi).type !== 'multi') setTimeout(function () { goto(1, 'up'); }, 650); }
  }

  /* =========================================================
     全局事件
     ========================================================= */
  function switchTab(tab) {
    if (EX && !EX.done && tab !== 'exam') {
      confirmBox('当前考试正在进行中，切换页面将丢弃计时与答案，确定离开？', function () {
        clearInterval(EX.timer); EX = null;
        doSwitchTab(tab);
      }, '离开');
      return;
    }
    doSwitchTab(tab);
  }
  function doSwitchTab(tab) {
    UI.tab = tab;
    $$('.tab').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === tab); });
    ['practice', 'exam', 'wrong', 'stats'].forEach(function (p) {
      $('#page-' + p).classList.toggle('hide', p !== tab);
    });
    if (tab === 'wrong') { renderWrongMenu(); renderWrongPage(); }
    if (tab === 'stats') renderStats();
    if (tab === 'exam' && !EX) { $('#examSetup').classList.remove('hide'); $('#examRun').classList.add('hide'); $('#examResult').classList.add('hide'); renderExamSetup(); }
    updateBadges();
  }
  function updateBadges() {
    var w = Object.keys(bstate().wrong).length;
    var tab = $('.tab[data-tab="wrong"]');
    var ex = tab.querySelector('.n');
    if (w > 0) {
      if (!ex) { ex = document.createElement('span'); ex.className = 'n'; tab.appendChild(ex); }
      ex.textContent = w > 99 ? '99+' : w;
    } else if (ex) ex.remove();
  }

  function bind() {
    // 底部 tab
    $$('.tab').forEach(function (b) { b.onclick = function () { switchTab(b.dataset.tab); }; });
    // 模式 chips
    $('#modeChips').onclick = function (e) {
      var c = e.target.closest('.chip'); if (!c) return;
      setMode(c.dataset.mode);
    };
    // 章节 / 错题分组菜单（点击打开卡片式菜单，不再用横向 tag）
    $('#catMenu').onclick = sheetCatMenu;
    $('#wrongMenu').onclick = sheetWrongMenu;
    // 练习卡片
    $('#cardWrap').addEventListener('click', function (e) {
      var acc = e.target.closest('.acc-h');
      if (acc) { acc.parentNode.classList.toggle('open'); return; }
      onCard(e, UI.mode, $('#cardWrap'));
    });
    // 考试容器
    $('#examRun').addEventListener('click', function (e) {
      var acc = e.target.closest('.acc-h');
      if (acc) { acc.parentNode.classList.toggle('open'); return; }
      var t = e.target.closest('[data-act]');
      if (t && t.dataset.act === 'pick') { onCard(e, 'exam', $('#exWrap')); return; }
      if (t && t.dataset.act === 'confirm') { onCard(e, 'exam', $('#exWrap')); return; }
      if (t && (t.dataset.act === 'fav' || t.dataset.act === 'doubt')) { onCard(e, 'exam', $('#exWrap')); return; }
    });
    $('#examSetup').addEventListener('click', function (e) {
      var t = e.target.closest('[data-act],[data-size],[data-dur],[data-pass],#btnStartExam');
      if (!t) return;
      if (t.id === 'btnStartExam') { startExam(); return; }
      if (t.dataset.size) { S.settings.examSize = +t.dataset.size; save(); renderExamSetup(); }
      if (t.dataset.dur) { S.settings.examDur = +t.dataset.dur; save(); renderExamSetup(); }
      if (t.dataset.pass) { S.settings.passLine = +t.dataset.pass; save(); renderExamSetup(); }
    });
    // 全局动作委托（页面 + 弹层通用）
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return;
      var a = t.dataset.act, b = bstate();
      if (a === 'confirmYes') { var cb = pendingConfirm; pendingConfirm = null; closeSheet(); if (cb) cb(); return; }
      if (a === 'confirmNo') { pendingConfirm = null; closeSheet(); return; }
      if (a === 'setCat') { var c = t.dataset.cat; closeSheet(); setChapter(c); return; }
      if (a === 'sheetCatMenu') { sheetCatMenu(); return; }
      if (a === 'goto') { UI.idx = +t.dataset.n; closeSheet(); mountCard($('#cardWrap'), currentList()[UI.idx], UI.mode, null); updBar(); return; }
      if (a === 'exgoto') { EX.idx = +t.dataset.n; closeSheet(); renderExamCard(null); return; }
      if (a === 'redoWrong') { switchTab('practice'); setMode('wrong'); toast('开始重做错题'); }
      else if (a === 'delWrong') { delete b.wrong[+t.dataset.qi]; save(); renderWrongPage(); renderWrongMenu(); toast('已移出错题本'); }
      else if (a === 'clearWrongCat') {
        var l = wrongList(UI.chapter);
        confirmBox('确定清空当前分组的 ' + l.length + ' 道错题？', function () {
          l.forEach(function (qi) { delete b.wrong[qi]; });
          save(); renderWrongPage(); renderWrongMenu(); toast('已清空');
        }, '清空');
      }
      else if (a === 'sheetDoubt') sheetList('我标记的存疑题', Object.keys(b.doubt).map(Number));
      else if (a === 'sheetFav') sheetList('我的收藏', Object.keys(b.fav).map(Number));
      else if (a === 'sheetFlag') sheetList('题库存疑题', bank().questions.map(function (q, i) { return q.flag ? i : -1; }).filter(function (i) { return i >= 0; }));
      else if (a === 'reviewExam') sheetReview(+t.dataset.i);
      else if (a === 'revFilter') {
        var e2 = S.exams[+t.dataset.i];
        $('#revList').innerHTML = revListHTML(e2, t.dataset.f);
        $$('[data-act="revFilter"]').forEach(function (x) {
          x.classList.toggle('ghost', x.dataset.f !== t.dataset.f);
          x.classList.toggle('btn', true);
        });
      }
      else if (a === 'againExam') { EX = null; $('#examResult').classList.add('hide'); $('#examSetup').classList.remove('hide'); renderExamSetup(); startExam(); }
      else if (a === 'backSetup') { EX = null; $('#examResult').classList.add('hide'); $('#examSetup').classList.remove('hide'); renderExamSetup(); }
      else if (a === 'jump') jumpTo(+t.dataset.qi);
      else if (a === 'set') { S.settings[t.dataset.k] = !S.settings[t.dataset.k]; save(); t.classList.toggle('on', S.settings[t.dataset.k]); }
      else if (a === 'resetChapter') {
        var ch = UI.chapter;
        var cnt = 0, bs2 = bstate();
        for (var k in bs2.rec) if (Q(k) && Q(k).cat === ch) cnt++;
        if (!cnt) { toast('当前章节还没有答题记录'); return; }
        confirmBox('重置章节「' + ch + '」的 ' + cnt + ' 条答题进度？\n（仅清掉「已做 / 正确率」，错题与收藏会保留）', function () {
          for (var k2 in bs2.rec) if (Q(k2) && Q(k2).cat === ch) delete bs2.rec[k2];
          save();
          renderCatMenu(); renderStats(); renderRail(); toast('已重置章节进度');
        }, '重置');
      }
      else if (a === 'resetAll') {
        confirmBox('将清空全部答题记录、错题本、收藏、存疑与考试历史，且无法恢复。确定继续？', function () {
          var th = S.theme;
          localStorage.removeItem(LS);
          S = JSON.parse(JSON.stringify(DEF)); S.theme = th; save();
          applyBank(); toast('已重置全部数据');
        }, '清空全部');
      }
    });
    // 弹层内的题卡跳转已由全局委托处理
    $('#mask').onclick = closeSheet;
    $('#sheetClose').onclick = closeSheet;
    $('#btnSheet').onclick = function () { UI.tab === 'exam' && EX && !EX.done ? sheetExamCard() : sheetCard(); };
    $('#btnSearch').onclick = sheetSearch;
    $('#btnSetting').onclick = function () { openSheet('设置', settingHTML()); };
    $('#btnTheme').onclick = function () { S.theme = S.theme === 'dark' ? 'light' : 'dark'; save(); applyTheme(); };

    // 上下题
    $('#btnPrev').onclick = function () { goto(-1, 'down'); };
    $('#btnNext').onclick = function () { goto(1, 'up'); };
    document.addEventListener('click', function (e) {
      var t = e.target.closest('#btnSubmit,#btnExSheet,#exPrev,#exNext');
      if (!t) return;
      if (t.id === 'btnSubmit') {
        var un = EX.qids.length - Object.keys(EX.ans).length;
        if (un > 0) confirmBox('还有 ' + un + ' 题未作答，确定现在交卷吗？', function () { finishExam(false); }, '交卷');
        else finishExam(false);
      } else if (t.id === 'btnExSheet') sheetExamCard();
      else if (t.id === 'exPrev') { if (EX.idx > 0) { EX.idx--; renderExamCard('down'); } else toast('已经是第一题'); }
      else if (t.id === 'exNext') { if (EX.idx < EX.qids.length - 1) { EX.idx++; renderExamCard('up'); } else toast('已经是最后一题'); }
    });

    // 键盘
    document.addEventListener('keydown', function (e) {
      if (!$('#mask').classList.contains('hide')) { if (e.key === 'Escape') closeSheet(); return; }
      if (UI.tab === 'exam') {
        if (e.key === 'ArrowLeft') { if (EX && EX.idx > 0) { EX.idx--; renderExamCard('down'); } }
        else if (e.key === 'ArrowRight') { if (EX && EX.idx < EX.qids.length - 1) { EX.idx++; renderExamCard('up'); } }
        return;
      }
      if (UI.tab !== 'practice') return;
      var k = e.key;
      if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'PageUp') { goto(-1, 'down'); e.preventDefault(); }
      else if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'PageDown' || k === ' ') { goto(1, 'up'); e.preventDefault(); }
      else if (/^[1-8]$/.test(k)) {
        var btn = $('.qcard .opt[data-i="' + (+k - 1) + '"]'); if (btn) btn.click();
      } else if (/^[a-hA-H]$/.test(k)) {
        var i2 = k.toLowerCase().charCodeAt(0) - 97, b2 = $('.qcard .opt[data-i="' + i2 + '"]'); if (b2) b2.click();
      } else if (k === 'Enter') { var cb = $('.qcard [data-act="confirm"]'); if (cb) cb.click(); else goto(1, 'up'); }
      else if (k.toLowerCase() === 's') { var f = $('.qcard [data-act="fav"]'); if (f) f.click(); }
      else if (k.toLowerCase() === 'm') { var d = $('.qcard [data-act="doubt"]'); if (d) d.click(); }
    });

    // 手势：上下滑切题（抖音式）
    gesture($('#cardWrap'));
  }
  function gesture(el) {
    var x0 = 0, y0 = 0, t0 = 0, moved = false;
    el.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); moved = false;
    }, { passive: true });
    el.addEventListener('touchmove', function (e) {
      if (moved || e.touches.length !== 1) return;
      var dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
      if (Math.abs(dy) > 62 && Math.abs(dy) > Math.abs(dx) * 1.4) {
        moved = true;
        if (UI.tab === 'exam' && EX && !EX.done) {
          if (dy < 0 && EX.idx < EX.qids.length - 1) { EX.idx++; renderExamCard('up'); }
          else if (dy > 0 && EX.idx > 0) { EX.idx--; renderExamCard('down'); }
        } else if (UI.tab === 'practice') goto(dy < 0 ? 1 : -1, dy < 0 ? 'up' : 'down');
      }
    }, { passive: true });
    // 滚轮切题（内容不可滚动时，或滚到边缘时）
    var acc = 0, last = 0;
    el.addEventListener('wheel', function (e) {
      var canScroll = el.scrollHeight > el.clientHeight + 4;
      var atTop = el.scrollTop <= 0, atBot = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      if (canScroll && !atTop && !atBot) return;
      var now = Date.now(); if (now - last > 400) acc = 0; last = now;
      acc += e.deltaY;
      if (Math.abs(acc) < 45) return;
      var down = acc > 0; acc = 0;
      if (UI.tab === 'exam' && EX && !EX.done) {
        if (down && EX.idx < EX.qids.length - 1) { EX.idx++; renderExamCard('up'); }
        else if (!down && EX.idx > 0) { EX.idx--; renderExamCard('down'); }
      } else if (UI.tab === 'practice') goto(down ? 1 : -1, down ? 'up' : 'down');
    }, { passive: true });
  }
  function settingHTML() {
    var s = S.settings;
    var h = '<div class="panel">';
    h += '<div class="srow"><div class="lb">答题后自动展开解析</div><div class="sw' + (s.autoExp ? ' on' : '') + '" data-act="set" data-k="autoExp"></div></div>';
    h += '<div class="srow"><div class="lb">答错时抖动 + 震动反馈</div><div class="sw' + (s.shake ? ' on' : '') + '" data-act="set" data-k="shake"></div></div>';
    h += '<div class="srow"><div class="lb">单选答对后自动跳下一题<div class="d">打开后刷起来更连贯</div></div><div class="sw' + (s.autoNext ? ' on' : '') + '" data-act="set" data-k="autoNext"></div></div>';
    h += '</div>';
    h += '<div class="panel"><div class="ph"><h3>题库</h3></div>';
    h += '<div class="srow"><div class="lb">' + esc(bank().name) +
      '<div class="d">' + (bank().subtitle ? esc(bank().subtitle) + ' · ' : '') +
      bank().questions.length + ' 题 · ' + bank().cats.length + ' 章节 · ' + esc(bank().version) + '</div></div></div>';
    h += '</div>';
    h += '<div class="panel"><div class="ph"><h3>章节进度</h3></div>' +
      '<div class="srow"><div class="lb">重置当前章节的答题进度<div class="d">仅清掉「已做 / 正确率」，保留错题、收藏与存疑；可在切到对应章节后再点重置</div></div>' +
      '<button class="btn sm ghost" data-act="resetChapter">' + ICON.redo + ' 重置「' + esc(UI.chapter) + '」</button></div></div>';

    h += '<div class="panel"><div class="ph"><h3>快捷键</h3></div>' +
      '<div style="font-size:13px;color:var(--text2);line-height:1.9">' +
      '↑ / ↓ / 空格：上一题 · 下一题（也支持上下滑动）<br>' +
      '1-8 或 A-H：选择对应选项<br>' +
      'Enter：多选确认作答 / 下一题<br>' +
      'S：收藏　　M：标记存疑　　Esc：关闭弹层</div></div>';
    return h;
  }

  /* =========================================================
     初始化
     ========================================================= */
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', S.theme || 'light');
    var m = document.querySelector('meta[name=theme-color]'); if (m) m.content = S.theme === 'dark' ? '#0e1116' : '#ffffff';
  }
  function applyBank() {
    var b = bank(), st = bstate();
    $('#bankName').textContent = b.name;
    // 副行：考试范围（窄屏隐藏，否则会把「1691 题」挤掉）+ 题量 · 章节数。
    // 版本号不放这儿了 —— 顶栏太窄，它也不是访客关心的信息，设置页里已经有一份。
    $('#bankMeta').innerHTML =
      (b.subtitle ? '<span class="scope">' + esc(b.subtitle) + ' · </span>' : '') +
      b.questions.length + ' 题 · ' + b.cats.length + ' 章节';
    UI.chapter = (st.session && st.session.chapter) || '全部';
    if (UI.chapter !== '全部' && b.cats.indexOf(UI.chapter) < 0) UI.chapter = '全部';
    var mode = (st.session && st.session.mode) || 'browse';
    if (['browse', 'chapter', 'random', 'wrong'].indexOf(mode) < 0) mode = 'browse';
    UI.mode = mode;
    UI.list = (mode === 'wrong') ? wrongList(UI.chapter) : buildList(mode, UI.chapter);
    UI.idx = Math.min((st.session && st.session.idx) || 0, Math.max(0, UI.list.length - 1));
    UI.ans = {}; UI.combo = 0;
    $$('#modeChips .chip').forEach(function (c) { c.classList.toggle('on', c.dataset.mode === mode); });
    renderCatMenu(); renderWrongMenu(); renderPractice();
    EX = null;
    $('#examResult').classList.add('hide'); $('#examRun').classList.add('hide');
    $('#examSetup').classList.remove('hide'); renderExamSetup();
    if (UI.tab === 'wrong') renderWrongPage();
    if (UI.tab === 'stats') renderStats();
  }
  function init() {
    if (!BANK) { document.body.innerHTML = '题库加载失败'; return; }
    applyTheme(); bind(); applyBank(); switchTab('practice');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
