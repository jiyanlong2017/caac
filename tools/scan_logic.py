# -*- coding: utf-8 -*-
"""逻辑矛盾探针：同选项异答案 / 同题异答案 / 答案数字与解析不符。"""
import re, json, collections

raw = open('data/bank-real.js', encoding='utf-8').read()
d = json.loads(re.search(r'window\.CAAC_BANK\s*=\s*(\{.*\})\s*;', raw, re.S).group(1))
qs = d['questions']
print('共 %d 题\n' % len(qs))


def ans_text(q):
    a = q['ans']
    if isinstance(a, int) and 0 <= a < len(q['opts']):
        return q['opts'][a]
    return ''


# ---- 1. 同选项集 → 不同答案 ----
print('=== 1. 完全相同的选项集，却给了不同答案（必有一错）===')
g = collections.defaultdict(set)
for q in qs:
    g[tuple(q['opts'])].add(str(q['ans']))
n = 0
for opts, anss in g.items():
    if len(anss) > 1:
        ids = [q['id'] for q in qs if tuple(q['opts']) == opts]
        n += 1
        if n <= 20:
            print('  选项: %s' % json.dumps(list(opts), ensure_ascii=False)[:90])
            print('    题号 %s  答案集合 %s' % (ids, sorted(anss)))
print('  共 %d 组\n' % n)

# ---- 2. 同题干 → 不同答案 ----
print('=== 2. 完全相同的题干，却给了不同答案 ===')
g2 = collections.defaultdict(set)
for q in qs:
    g2[q['q'].strip()].add(str(q['ans']))
n2 = 0
for t, anss in g2.items():
    if len(anss) > 1:
        ids = [q['id'] for q in qs if q['q'].strip() == t]
        n2 += 1
        if n2 <= 20:
            print('  题干: %s' % t[:50])
            print('    题号 %s  答案集合 %s' % (ids, sorted(anss)))
print('  共 %d 组\n' % n2)

# ---- 3. 答案选项的关键数字在解析中找不到 ----
print('=== 3. 答案选项的数字在解析中找不到（数字对不上，抽样）===')
NUM = re.compile(r'\d+(?:\.\d+)?')
hit = 0
for q in qs:
    at = ans_text(q)
    exp = q['exp'] or ''
    nums = [x for x in NUM.findall(at) if len(x) >= 1]
    if not nums:
        continue
    # 只关心有明确数值的答案（长度>1的数字，避免“2个选项”之类）
    nums = [x for x in nums if len(x) > 1 or float(x) >= 10]
    if not nums:
        continue
    missing = [x for x in nums if x not in exp]
    if missing and len(missing) == len(nums):   # 全都不在解析里
        hit += 1
        if hit <= 25:
            print('  #%s 答案=%r  缺数字=%s' % (q['id'], at, missing))
            print('       解析: %s' % exp[:80])
print('  ... 共 %d 题\n' % hit)

# ---- 4. 题干里混入标签词 ----
print('=== 4. 题干混入「正确答案/选项/答案」等标签词 ===')
LAB = re.compile(r'正确答案|参考答案|下列选项|（\s*选项\s*）')
h4 = 0
for q in qs:
    if LAB.search(q['q']):
        h4 += 1
        print('  #%s %s' % (q['id'], q['q'][:70]))
if not h4:
    print('  无')
