# -*- coding: utf-8 -*-
"""补充维度体检：现有 scan_quality / scan_deep / scan_logic / scan_text 未覆盖的角度。
覆盖：重复ID / 答案分布 / 选项数分布 / 题干泄题 / 选项互含 / 数值一致性 /
      近似重复题 / 填空占位符缺失 / tip异常 / 选项语法残破 / 全选项型干扰项。
"""
import re, json, io, sys, collections, itertools

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

raw = open('data/bank-real.js', encoding='utf-8').read()
d = json.loads(re.search(r'window\.CAAC_BANK\s*=\s*(\{.*\})\s*;', raw, re.S).group(1))
qs = d['questions']
print('题库 %d 题\n' % len(qs))


def norm(s):
    """归一化：去空白与标点，便于比较"""
    return re.sub(r'[\s，。、；：？！“”‘’（）()《》,.;:?!\"\'-]', '', s)


# ---------- 1. 重复 ID ----------
print('=== 1. 重复 ID ===')
c = collections.Counter(q['id'] for q in qs)
dup = [i for i, n in c.items() if n > 1]
print('  ' + ('无' if not dup else '重复: %s' % dup))

# ---------- 2. 答案字母分布 ----------
print('\n=== 2. 答案字母分布（严重偏斜=可能答案位置未打散）===')
dist = collections.Counter()
for q in qs:
    a = q['ans']
    if isinstance(a, int):
        dist[chr(65 + a)] += 1
    elif isinstance(a, list):
        dist['+'.join(chr(65 + i) for i in a)] += 1
tot = sum(dist.values())
for k, n in sorted(dist.items()):
    print('  %-6s %4d   %5.1f%%  %s' % (k, n, n * 100.0 / tot, '#' * int(n * 40.0 / tot)))

# ---------- 3. 选项数分布 ----------
print('\n=== 3. 选项数分布（单选题通常 3 项）===')
oc = collections.Counter(len(q['opts']) for q in qs)
for k in sorted(oc):
    print('  %d 项: %d 题' % (k, oc[k]))
odd = [q['id'] for q in qs if len(q['opts']) > 4 or len(q['opts']) < 2]
if odd:
    print('  异常项数题目: %s' % odd[:40])

# ---------- 4. 题干泄题（正确选项的实质内容出现在题干里） ----------
print('\n=== 4. 题干泄题（正确选项正文≥6字且出现在题干中）===')
n = 0
for q in qs:
    a = q['ans']
    if not isinstance(a, int) or not (0 <= a < len(q['opts'])):
        continue
    key = norm(q['opts'][a])
    if len(key) >= 6 and key in norm(q['q']):
        n += 1
        print('  #%s 选项%s=%r' % (q['id'], chr(65 + a), q['opts'][a][:40]))
        print('      题干: %s' % q['q'][:70])
if not n:
    print('  无')

# ---------- 5. 选项互含（一个是另一个的子串，语义重叠易生歧义） ----------
print('\n=== 5. 选项互含（一选项是另一选项的子串）===')
n = 0
for q in qs:
    opts = q['opts']
    for i, j in itertools.permutations(range(len(opts)), 2):
        a, b = norm(opts[i]), norm(opts[j])
        if a and b and a != b and a in b and len(a) >= 6:
            n += 1
            if n <= 30:
                print('  #%s %s⊂%s' % (q['id'], chr(65 + i), chr(65 + j)))
                print('      %s | %s' % (opts[i][:50], opts[j][:50]))
if not n:
    print('  无')

# ---------- 6. 数值一致性（题干给数字，正确项应含算出的数） ----------
print('\n=== 6. 数值一致性（正确选项完全无数字，但解析里有数字）===')
n = 0
for q in qs:
    a = q['ans']
    if not isinstance(a, int) or not (0 <= a < len(q['opts'])):
        continue
    opt = q['opts'][a]
    exp = q.get('exp') or ''
    if not re.search(r'\d', opt) and len(re.findall(r'\d+\.?\d*', exp)) >= 3 and re.search(r'多少|几|等于|计算|求', q['q']):
        n += 1
        if n <= 25:
            print('  #%s 正确项=%r' % (q['id'], opt[:50]))
            print('      题干: %s' % q['q'][:60])
if not n:
    print('  无')

# ---------- 7. 近似重复题（题干 token Jaccard 高但非完全一致） ----------
print('\n=== 7. 近似重复题（题干相似度≥0.88，非完全相同）===')
seen = set()
cnt = 0
for i in range(len(qs)):
    for j in range(i + 1, len(qs)):
        t1, t2 = qs[i]['q'].strip(), qs[j]['q'].strip()
        if t1 == t2:
            continue
        s1, s2 = set(t1), set(t2)
        if not s1 or not s2:
            continue
        jac = len(s1 & s2) / float(len(s1 | s2))
        if jac >= 0.88:
            cnt += 1
            if cnt <= 25:
                print('  #%s ~ #%s  相似度 %.2f' % (qs[i]['id'], qs[j]['id'], jac))
                print('      %s' % t1[:64])
                print('      %s' % t2[:64])
if not cnt:
    print('  无')

# ---------- 8. 填空占位符缺失（题干无疑问/占位却直接给短选项） ----------
print('\n=== 8. 题干缺占位符（无（）且无？，选项均为短词）===')
n = 0
for q in qs:
    t = q['q']
    if re.search(r'[（(]\s*[)）]', t) or re.search(r'[？?]', t):
        continue
    if all(len(o) <= 8 for o in q['opts']) and len(q['opts']) >= 3:
        n += 1
        if n <= 25:
            print('  #%s  %s' % (q['id'], t[:60]))
            print('      %s' % q['opts'])
if not n:
    print('  无')

# ---------- 9. tip 字段异常 ----------
print('\n=== 9. tip 字段异常（非空但过短/含标签）===')
tips = [q for q in qs if (q.get('tip') or '').strip()]
print('  非空 tip: %d 题' % len(tips))
for q in tips[:15]:
    print('  #%s  %r' % (q['id'], q['tip'][:60]))

# ---------- 10. 选项语法残破（以「的」「是」「和」等虚词结尾） ----------
print('\n=== 10. 选项以虚词结尾（疑似截断）===')
n = 0
for q in qs:
    for i, o in enumerate(q['opts']):
        if re.search(r'(的|是|和|与|或|在|为|了|着|把|被|对|从)$', o.strip()) and len(o) <= 30:
            n += 1
            if n <= 25:
                print('  #%s 选项%s=%r' % (q['id'], chr(65 + i), o))
if not n:
    print('  无')

# ---------- 11. 全选项型干扰项（以上都对/都不对） ----------
print('\n=== 11. 「以上都对/都不对」型干扰项 ===')
for q in qs:
    for i, o in enumerate(q['opts']):
        if re.search(r'以上(都|均)?(对|正确|是)|都不对|均不正确', str(o)):
            print('  #%s 选项%s=%r  ans=%s' % (q['id'], chr(65 + i), o, q['ans']))
