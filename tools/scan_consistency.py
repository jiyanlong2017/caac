# -*- coding: utf-8 -*-
"""一致性体检：分类归属 / 全半角标点 / 括号配对 / 选项标点 / 近似题数值答案冲突。
这些维度此前未被 scan_quality / scan_deep / scan_text / scan_extra / scan_logic 覆盖。
"""
import re, io, sys, json, math, collections, itertools

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

raw = open('data/bank-real.js', encoding='utf-8').read()
d = json.loads(re.search(r'window\.CAAC_BANK\s*=\s*(\{.*\})\s*;', raw, re.S).group(1))
qs = d['questions']
cats = d['cats']
print('题库 %d 题 / 声明分类 %d 个\n' % (len(qs), len(cats)))


def fields(q):
    return [('题干', q['q'])] + [('选' + 'ABCD'[i], o) for i, o in enumerate(q['opts'])] + \
           [('解析', q.get('exp') or '')]


# ---------- 1. 引用完整性 ----------
print('=== 1. 引用完整性 ===')
catset = set(cats)
used = collections.Counter(q.get('cat', '') for q in qs)
bad_cat = [q['id'] for q in qs if q.get('cat') not in catset]
print('  使用但未声明的分类: %s' % (bad_cat or '无'))
print('  声明但零题的分类: %s' % ([c for c in cats if not used[c]] or '无'))
bad_type = [(q['id'], q.get('type')) for q in qs if q.get('type') not in ('single', 'multi')]
print('  非法 type: %s' % (bad_type or '无'))
ids = [q['id'] for q in qs]
print('  id 范围: %d~%d, 数量 %d, 缺口 %s' % (min(ids), max(ids), len(set(ids)),
      ('%d 个' % (max(ids) - min(ids) + 1 - len(set(ids)))) if max(ids) - min(ids) + 1 != len(set(ids)) else '无'))
print('  分类题量: %s' % dict(sorted(used.items(), key=lambda x: -x[1])))

# ---------- 2. 中文文本里的半角标点 ----------
print('\n=== 2. 中文文本里混入半角标点（, ; : ? ! ( )）===')
# 只在“两侧都是中文”的位置判定，避免误伤纯英文/数字串
HALF = re.compile(r'(?<=[\u4e00-\u9fff])[,;:?!]|[,;:?!](?=[\u4e00-\u9fff])')
cnt2 = 0
for q in qs:
    for fn, t in fields(q):
        for m in HALF.finditer(t):
            cnt2 += 1
            if cnt2 <= 30:
                print('  #%-5s %s: ...%s...' % (q['id'], fn, t[max(0, m.start() - 12):m.start() + 14]))
if not cnt2:
    print('  无')
else:
    print('  ... 共 %d 处' % cnt2)

# ---------- 3. 括号配对 ----------
# 注意：约 1000 条解析在源数据里就被截断（构建时补「……」）。被截断的解析必然
# 出现未闭合的括号/引号，那是截断产物而非排版错误，故跳过以「……」结尾的字段。
print('\n=== 3. 括号/引号不配对（已排除 100 字截断导致的未闭合）===')
PAIRS = [('（', '）', '全角圆括号'), ('(', ')', '半角圆括号'), ('《', '》', '书名号'), ('“', '”', '双引号'), ('【', '】', '方括号')]
cnt3 = 0
skipped = 0
for q in qs:
    for fn, t in fields(q):
        if t.rstrip().endswith('……'):
            skipped += 1
            continue
        for op, cl, name in PAIRS:
            if op == '（' and op in t and cl in t:
                continue        # 题干填空占位符，正常
            no, nc = t.count(op), t.count(cl)
            if no != nc:
                cnt3 += 1
                if cnt3 <= 30:
                    print('  #%-5s %s [%s] %d 开 / %d 闭: %s' % (q['id'], fn, name, no, nc, t[:56]))
if not cnt3:
    print('  无')
else:
    print('  ... 共 %d 处' % cnt3)
print('  （已跳过 %d 个被截断字段）' % skipped)

# ---------- 4. 选项尾部标点一致性 ----------
print('\n=== 4. 选项以句号/标点结尾（与多数选项不一致）===')
cnt4 = 0
for q in qs:
    ends = [bool(re.search(r'[。；;.]$', o.strip())) for o in q['opts']]
    if any(ends) and not all(ends):
        cnt4 += 1
        if cnt4 <= 25:
            print('  #%-5s %s' % (q['id'], [o[-14:] for o in q['opts']]))
if not cnt4:
    print('  无')
else:
    print('  ... 共 %d 处（同一题内部分选项带句号、部分不带）' % cnt4)

# ---------- 5. 近似题数值答案冲突 ----------
print('\n=== 5. 近似题干（相似度≥0.85）但正确项数值不同 ===')
NUM = re.compile(r'\d+\.?\d*')


def nums(s):
    return tuple(NUM.findall(s))


cnt5 = 0
for i in range(len(qs)):
    for j in range(i + 1, len(qs)):
        t1, t2 = qs[i]['q'].strip(), qs[j]['q'].strip()
        if t1 == t2:
            continue
        s1, s2 = set(t1), set(t2)
        if not s1 or not s2:
            continue
        if len(s1 & s2) / float(len(s1 | s2)) < 0.85:
            continue
        a1, a2 = qs[i]['ans'], qs[j]['ans']
        if not (isinstance(a1, int) and isinstance(a2, int)):
            continue
        if not (0 <= a1 < len(qs[i]['opts']) and 0 <= a2 < len(qs[j]['opts'])):
            continue
        n1, n2 = nums(qs[i]['opts'][a1]), nums(qs[j]['opts'][a2])
        # 题干只差个别字、正确项数值却完全不同 → 可疑
        if n1 != n2 and n1 and n2 and abs(len(t1) - len(t2)) <= 6:
            cnt5 += 1
            if cnt5 <= 20:
                print('  #%s vs #%s' % (qs[i]['id'], qs[j]['id']))
                print('      %s  →  %s' % (t1[:62], qs[i]['opts'][a1][:34]))
                print('      %s  →  %s' % (t2[:62], qs[j]['opts'][a2][:34]))
if not cnt5:
    print('  无')
else:
    print('  ... 共 %d 对' % cnt5)

# ---------- 6. 分类归属异常（朴素贝叶斯反查） ----------
print('\n=== 6. 分类归属异常（题目术语更贴近别的分类）===')
TOK = re.compile(r'[\u4e00-\u9fff]{2}')
cat_docs = collections.defaultdict(collections.Counter)
allc = collections.Counter()
for q in qs:
    txt = q['q'] + ''.join(q['opts']) + (q.get('exp') or '')[:120]
    toks = TOK.findall(txt)
    cat_docs[q['cat']].update(toks)
    allc.update(toks)
vocab = list(allc)
V = len(vocab) + 1
prior = {c: sum(cat_docs[c].values()) for c in cat_docs}
total = sum(prior.values())
mis = []
for q in qs:
    txt = q['q'] + ''.join(q['opts']) + (q.get('exp') or '')[:120]
    toks = TOK.findall(txt)
    if not toks:
        continue
    scores = {}
    for c in cat_docs:
        s = math.log(prior[c] / total)
        denom = sum(cat_docs[c].values()) + V
        for tk in toks:
            s += math.log((cat_docs[c].get(tk, 0) + 1) / denom)
        scores[c] = s / len(toks)
    own = scores[q['cat']]
    best = max(scores, key=scores.get)
    if best != q['cat'] and scores[best] - own > 0.6:
        mis.append((q['id'], q['cat'], best, round(scores[best] - own, 2), q['q'][:50]))
mis.sort(key=lambda x: -x[3])
for m in mis[:22]:
    print('  #%-5s 现归类=%-10s 更像=%-10s 差=%.2f  %s' % m)
print('  ... 共 %d 题被标记（阈值 0.6，仅供参考，需人工复核）' % len(mis))
