# -*- coding: utf-8 -*-
"""深度语义体检：重复题 + 解析与答案矛盾 + 选项格式异常。"""
import re, json, collections

PATH = 'data/bank-real.js'
raw = open(PATH, encoding='utf-8').read()
d = json.loads(re.search(r'window\.CAAC_BANK\s*=\s*(\{.*\})\s*;', raw, re.S).group(1))
qs = d['questions']
print('题库 %s  共 %d 题\n' % (PATH, len(qs)))

idx = {q['id']: q for q in qs}

# ---------- 1. 完全重复（题干+选项+答案全同） ----------
sig = collections.defaultdict(list)
for q in qs:
    sig[(q['q'].strip(), tuple(o.strip() for o in q['opts']), str(q['ans']))].append(q['id'])
print('=== 1. 完全重复题（同题干+同选项+同答案）===')
found = False
for k, ids in sig.items():
    if len(ids) > 1:
        found = True
        print('  x%d  #%s  %s' % (len(ids), ids, k[0][:46]))
if not found:
    print('  无')

# ---------- 2. 同题干但选项/答案不同（疑似变体或错配） ----------
byq = collections.defaultdict(list)
for q in qs:
    byq[q['q'].strip()].append(q['id'])
print('\n=== 2. 同题干多题（>1，可能是变体，仅供参考）===')
multi = [(t, ids) for t, ids in byq.items() if len(ids) > 1]
multi.sort(key=lambda x: -len(x[1]))
for t, ids in multi[:20]:
    print('  x%d  #%s  %s' % (len(ids), ids, t[:40]))
print('  ... 共 %d 组同题干' % len(multi))

# ---------- 3. 解析里明确写出与 ans 不同的答案 ----------
print('\n=== 3. 解析明确写出别的答案（与 ans 冲突）===')
# 抓「正确答案是X」「答案为X」「故选X」「应选X」等。
# 注意：不抓裸「选项 X」——补全后的解析常写「选项 A 保持…不利于…」这类
# 逐项点评（是解释而不是断言答案），会误报；只认「答案/应选/故选/选择」后的字母。
PAT = re.compile(r'(?:正确答案|参考答案|答案|应选|故选|选择)\s*(?:是|为|：|:)?\s*([A-DＡ-Ｄ])')
def opt_letter(i):
    return chr(65 + i)
cnt = 0
for q in qs:
    exp = q.get('exp') or ''
    ans = q['ans']
    if not isinstance(ans, int) or not (0 <= ans < len(q['opts'])):
        continue
    want = opt_letter(ans)
    hits = set(PAT.findall(exp))
    hits = {h.upper().replace('Ａ','A').replace('Ｂ','B').replace('Ｃ','C').replace('Ｄ','D') for h in hits}
    if hits and want not in hits:
        cnt += 1
        print('  #%s ans=%s(%s) 但解析提到: %s' % (q['id'], ans, want, sorted(hits)))
        print('      解析: %s' % exp[:90])
if not cnt:
    print('  无')

# ---------- 4. 选项格式异常 ----------
print('\n=== 4. 选项格式异常 ===')
issues = []
for q in qs:
    for i, o in enumerate(q['opts']):
        if not isinstance(o, str):
            continue
        if '　' in o:                      # 全角空格
            issues.append((q['id'], chr(65+i), '含全角空格', o[:40]))
        if re.match(r'^[、，。；：\s]', o):   # 以标点开头
            issues.append((q['id'], chr(65+i), '以标点开头', o[:40]))
        if o.count('（）') >= 1 and len(o) < 12:  # 选项里带括号但很短
            issues.append((q['id'], chr(65+i), '疑似残片', o[:40]))
if issues:
    for it in issues[:40]:
        print('  #%s 选项%s [%s] %r' % it)
    print('  ... 共 %d 处' % len(issues))
else:
    print('  无')

# ---------- 5. 解析疑似为空壳 ----------
print('\n=== 5. 选项含「以上都对/都不对」等全选项型（统计，非错误）===')
n = sum(1 for q in qs for o in q['opts'] if re.search(r'以上(都|均)?(对|正确|是)|都不对|均不正确', str(o)))
print('  共 %d 个此类选项' % n)
