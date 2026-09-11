# -*- coding: utf-8 -*-
"""
题库数据体检：扫描 questions.js / bank-real.js 中所有可自动识别的数据质量问题。
用法: python tools/scan_quality.py [文件路径, 默认 data/questions.js]
输出: 按问题类型分组列出，附题号与原文片段。
"""
import re, json, sys, collections

PATH = sys.argv[1] if len(sys.argv) > 1 else 'data/questions.js'


def load_questions(path):
    raw = open(path, encoding='utf-8').read()
    # 支持两种格式: window.QUESTIONS = [ ... ];  或  window.CAAC_BANK = { ... };
    m = re.search(r'window\.CAAC_BANK\s*=\s*(\{.*\})\s*;', raw, re.S)
    if m:
        return json.loads(m.group(1))['questions']
    m = re.search(r'window\.QUESTIONS\s*=\s*(\[.*\])\s*;', raw, re.S)
    body = m.group(1)
    # 去掉 // 行注释
    body = re.sub(r'//[^\n]*', '', body)
    # 给裸 key 加引号
    body = re.sub(r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)', r'\1"\2"\3', body)
    # 去尾逗号
    body = re.sub(r',(\s*[\]}])', r'\1', body)
    return json.loads(body)


issues = collections.defaultdict(list)   # type -> [(id, detail)]
qs = load_questions(PATH)
print(f'题库: {PATH}  共 {len(qs)} 题\n')

SUSPICIOUS_CHARS = re.compile(r'[�\ufffd]')          # 替换字符
CLASS_NUM = re.compile(r'[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫIVX]+')      # 罗马数字/类号

for q in qs:
    qid = q.get('id')
    cat = q.get('cat', '')
    text = q.get('q', '')
    opts = q.get('opts', []) or []
    ans = q.get('ans')
    exp = q.get('exp', '')
    typ = q.get('type', 'single')

    # 1. 选项/题干/解析里混入标签词
    for label in ('正确答案', '参考答案', '答案'):
        for i, o in enumerate(opts):
            if isinstance(o, str) and label in o:
                issues['选项混入标签词'].append((qid, f'选项{chr(65+i)}: {o[:60]}'))
    if '正确答案' in text:
        issues['题干混入标签词'].append((qid, text[:60]))

    # 2. 空选项
    for i, o in enumerate(opts):
        if not isinstance(o, str) or o.strip() == '':
            issues['空选项'].append((qid, f'选项{chr(65+i)} 为空 (共{len(opts)}项)'))

    # 3. 答案越界
    if not isinstance(ans, int) or ans < 0 or ans >= len(opts):
        issues['答案越界'].append((qid, f'ans={ans!r}, 选项数={len(opts)}'))

    # 4. 答案指向空选项
    if isinstance(ans, int) and 0 <= ans < len(opts):
        if not isinstance(opts[ans], str) or opts[ans].strip() == '':
            issues['答案指向空选项'].append((qid, f'ans={ans} -> 空'))

    # 5. 题干疑似被截断(以"是""为""有""等结尾且很短)
    if len(text) <= 12 and re.search(r'(是|为|有|的|在|按|属于|是指|包括)$', text):
        issues['题干疑似截断'].append((qid, text))

    # 6. 题干/选项含问号括号残片(选项里出现题干尾巴)
    for i, o in enumerate(opts):
        if isinstance(o, str) and re.search(r'[？?]\s*[（(]\s*[)）]', o):
            issues['选项含题干残片'].append((qid, f'选项{chr(65+i)}: {o[:60]}'))
    # 6b. 短选项以空括号结尾(如「代表（）」)——题干尾巴掉进选项
    for i, o in enumerate(opts):
        if isinstance(o, str) and len(o) <= 12 and re.search(r'[（(]\s*[)）]\s*$', o):
            issues['选项疑似题干尾巴'].append((qid, f'选项{chr(65+i)}: {o!r}'))

    # 7. 选项完全重复
    if len(opts) != len(set(opts)):
        dups = [o for o, c in collections.Counter(opts).items() if c > 1]
        issues['选项重复'].append((qid, f'重复项: {dups}'))

    # 8. OCR/乱码字符
    if SUSPICIOUS_CHARS.search(text) or any(SUSPICIOUS_CHARS.search(o) for o in opts if isinstance(o, str)) or SUSPICIOUS_CHARS.search(exp or ''):
        issues['含乱码替换符'].append((qid, (text or '')[:50]))

    # 9. 空解析
    if not isinstance(exp, str) or exp.strip() == '':
        issues['空解析'].append((qid, (text or '')[:50]))

    # 10. 题干含换行/制表
    if isinstance(text, str) and re.search(r'[\r\n\t]', text):
        issues['题干含换行'].append((qid, repr(text[:60])))
    for i, o in enumerate(opts):
        if isinstance(o, str) and re.search(r'[\r\n\t]', o):
            issues['选项含换行'].append((qid, f'选项{chr(65+i)}: {o[:50]!r}'))

    # 11. 首尾空白
    if isinstance(text, str) and text != text.strip():
        issues['题干首尾空白'].append((qid, repr(text[:40])))
    for i, o in enumerate(opts):
        if isinstance(o, str) and o != o.strip() and o.strip() != '':
            issues['选项首尾空白'].append((qid, f'选项{chr(65+i)}: {o!r}'))

    # 12. 同一题类号在选项与解析中矛盾(粗筛)
    if exp:
        opt_classes = set(CLASS_NUM.findall(' '.join(opts)))
        ans_text = opts[ans] if isinstance(ans, int) and 0 <= ans < len(opts) else ''
        ans_classes = set(CLASS_NUM.findall(ans_text or ''))
        # 只报"答案选项与解析里明确说的类号"不一致的强信号，避免噪音，这里仅列候选
    # 13. 单选项数异常(少于2)
    if len(opts) < 2:
        issues['选项数异常'].append((qid, f'仅 {len(opts)} 个选项'))

    # 14. 多选题但答案是 int（应为 list）
    if typ == 'multi' and not isinstance(ans, list):
        issues['多选题答案类型错'].append((qid, f'ans={ans!r}'))
    if typ == 'single' and isinstance(ans, list):
        issues['单选题答案类型错'].append((qid, f'ans={ans!r}'))

# 输出
total = 0
for k in sorted(issues, key=lambda x: -len(issues[x])):
    lst = issues[k]
    total += len(lst)
    print(f'【{k}】 {len(lst)} 处')
    for qid, detail in lst[:80]:
        print(f'    #{qid}  {detail}')
    if len(lst) > 80:
        print(f'    ... 其余 {len(lst)-80} 处省略')
    print()
print(f'=== 汇总: {len(issues)} 类问题, 共 {total} 处 ===')
