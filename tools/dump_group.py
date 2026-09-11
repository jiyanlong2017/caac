# -*- coding: utf-8 -*-
"""把「同题干异答案」的分组完整展开，便于人工判定是真错题还是同题干不同选项的正常变体。
用法: python tools/dump_group.py 286 287 [346 347 ...]  (不传参=输出全部同题干组)
"""
import re, json, sys, collections

raw = open('data/bank-real.js', encoding='utf-8').read()
d = json.loads(re.search(r'window\.CAAC_BANK\s*=\s*(\{.*\})\s*;', raw, re.S).group(1))
qs = d['questions']
byid = {q['id']: q for q in qs}

LETTER = 'ABCD'


def show(q):
    print('  #%s  [%s/%s]  ans=%s' % (q['id'], q.get('cat', ''), q.get('type', ''), q['ans']))
    print('     题干: %s' % q['q'])
    for i, o in enumerate(q['opts']):
        mark = ' <== 答案' if q['ans'] == i else ''
        print('       %s. %s%s' % (LETTER[i], o, mark))
    exp = (q['exp'] or '').replace('\n', ' ')
    print('     解析: %s' % exp[:160])
    print()


ids = [int(x) for x in sys.argv[1:]]
if ids:
    for i in ids:
        if i in byid:
            show(byid[i])
else:
    g = collections.defaultdict(list)
    for q in qs:
        g[q['q'].strip()].append(q)
    for t, grp in g.items():
        if len({str(q['ans']) for q in grp}) > 1:
            print('=' * 78)
            for q in grp:
                show(q)
