# -*- coding: utf-8 -*-
"""题库画像 + 宽网异常扫描。"""
import re, json, collections

raw = open('data/bank-real.js', encoding='utf-8').read()
d = json.loads(re.search(r'window\.CAAC_BANK\s*=\s*(\{.*\})\s*;', raw, re.S).group(1))
qs = d['questions']
print('共 %d 题, %d 章节\n' % (len(qs), len(d['cats'])))

# ---- 1. 答案位置分布 ----
print('=== 1. 答案位置分布（看是否严重偏斜）===')
c = collections.Counter()
for q in qs:
    if isinstance(q['ans'], int):
        c[chr(65 + q['ans'])] += 1
tot = sum(c.values())
for k in 'ABCDEF':
    if c[k]:
        print('  %s: %4d  (%.1f%%)' % (k, c[k], 100.0 * c[k] / tot))

# ---- 2. 选项数分布 ----
print('\n=== 2. 选项数分布 ===')
c2 = collections.Counter(len(q['opts']) for q in qs)
for k in sorted(c2):
    print('  %d 个选项: %d 题' % (k, c2[k]))

# ---- 3. 超短选项（<3 字，排除数字/单字母类正常项）----
print('\n=== 3. 超短选项（<3 字符）===')
short = []
for q in qs:
    for i, o in enumerate(q['opts']):
        if isinstance(o, str) and len(o.strip()) < 3:
            short.append((q['id'], chr(65 + i), o, q['opts'][q['ans']] if isinstance(q['ans'], int) and 0 <= q['ans'] < len(q['opts']) else ''))
for it in short[:30]:
    print('  #%s 选项%s=%r  (本题答案=%r)' % it)
print('  ... 共 %d 处' % len(short))

# ---- 4. 题干提到 ABCD/甲乙丙丁 但选项里没有 ----
print('\n=== 4. 题干提到字母/甲乙 但选项未出现 ===')
hit = 0
for q in qs:
    qtext, joined = q['q'], ' '.join(q['opts'])
    for tok in ('ABCD', '甲乙丙丁', '①②③④'):
        if tok in qtext:
            if tok == 'ABCD' and not re.search(r'[A-D]', joined):
                print('  #%s 题干含「%s」但选项无 A-D: %s' % (q['id'], tok, ' / '.join(q['opts'])[:60]))
                hit += 1
            elif tok == '甲乙丙丁' and not re.search(r'[甲乙丙丁]', joined):
                print('  #%s 题干含「%s」但选项无 甲乙丙丁: %s' % (q['id'], tok, ' / '.join(q['opts'])[:60]))
                hit += 1
if not hit:
    print('  无')

# ---- 5. 题干不以（）或？结尾 ----
print('\n=== 5. 题干不含「（）」也不含「？」===')
odd = [(q['id'], q['q']) for q in qs if '（）' not in q['q'] and '？' not in q['q'] and '?' not in q['q']]
for it in odd[:20]:
    print('  #%s  %s' % it)
print('  ... 共 %d 题' % len(odd))

# ---- 6. 同题内选项高度相似（疑似只差一字）----
print('\n=== 6. 同题选项高度相似（差 1-2 字，可能是笔误）===')
import difflib
cnt = 0
for q in qs:
    ops = [o for o in q['opts'] if isinstance(o, str)]
    for i in range(len(ops)):
        for j in range(i + 1, len(ops)):
            r = difflib.SequenceMatcher(None, ops[i], ops[j]).ratio()
            if 0.85 <= r < 1 and abs(len(ops[i]) - len(ops[j])) <= 2 and len(ops[i]) > 6:
                cnt += 1
                if cnt <= 15:
                    print('  #%s 相似度%.2f: %r | %r' % (q['id'], r, ops[i][:34], ops[j][:34]))
print('  ... 共 %d 对' % cnt)
