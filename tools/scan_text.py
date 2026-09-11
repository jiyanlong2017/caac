# -*- coding: utf-8 -*-
"""文本层体检：乱码字符 / 繁体异体字 / 相邻重复字 / 异常标点。
打印上下文，便于人工判定真伪。"""
import re, json, io, sys, collections

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

raw = open('data/bank-real.js', encoding='utf-8').read()
d = json.loads(re.search(r'window\.CAAC_BANK\s*=\s*(\{.*\})\s*;', raw, re.S).group(1))
qs = d['questions']


def fields(q):
    return [('题干', q['q'])] + [('选项%s' % 'ABCD'[i], o) for i, o in enumerate(q['opts'])] + \
           [('解析', q.get('exp') or ''), ('技巧', q.get('tip') or '')]


# ---------- 1. 乱码 / 非法字符 ----------
MOJI = re.compile(r'[ËÈÊÆÇØÅÐÞß¬®§¶¤]')
print('=== 1. 乱码字符 ===')
hit = 0
for q in qs:
    for fn, t in fields(q):
        for m in MOJI.finditer(t):
            hit += 1
            print('  #%-5s %s ... %s ...' % (q['id'], fn, t[max(0, m.start() - 12):m.start() + 12]))
if not hit:
    print('  无')

# ---------- 2. 繁体 / 异体字 ----------
TRAD = {
    '減': '减', '機': '机', '飛': '飞', '們': '们', '個': '个', '時': '时', '後': '后',
    '為': '为', '與': '与', '於': '于', '說': '说', '這': '这', '裡': '里', '來': '来',
    '過': '过', '對': '对', '開': '开', '關': '关', '電': '电', '車': '车', '東': '东',
    '馬': '马', '鳥': '鸟', '見': '见', '頁': '页', '風': '风', '齊': '齐', '專': '专',
    '業': '业', '產': '产', '數': '数', '壓': '压', '溫': '温', '濕': '湿', '輪': '轮',
    '槳': '桨', '類': '类', '號': '号', '稱': '称', '選': '选', '擇': '择', '氣': '气',
    '態': '态', '穩': '稳', '轉': '转', '縱': '纵', '桿': '杆', '無': '无', '線': '线',
    '導': '导', '監': '监', '視': '视', '慣': '惯', '覺': '觉', '勢': '势', '馬': '马',
    '動': '动', '發': '发', '間': '间', '題': '题', '點': '点', '單': '单', '應': '应',
    '該': '该', '標': '标', '準': '准', '訓': '训', '練': '练', '員': '员', '歷': '历',
    '證': '证', '書': '书', '質': '质', '構': '构', '軸': '轴',
}
# 注：曾误收 '滑': '滑' 自映射，导致 368 处假阳性，已删除。新增项务必确认 简/繁 字形不同。
print('\n=== 2. 繁体/异体字 ===')
cnt = collections.Counter()
ex = {}
for q in qs:
    for fn, t in fields(q):
        for ch in TRAD:
            if ch in t:
                cnt[ch] += t.count(ch)
                if ch not in ex:
                    i = t.index(ch)
                    ex[ch] = (q['id'], fn, t[max(0, i - 12):i + 12])
for ch, n in cnt.most_common():
    print('  %s→%s  %d处  例: #%s %s ... %s ...' % (ch, TRAD[ch], n, ex[ch][0], ex[ch][1], ex[ch][2]))
if not cnt:
    print('  无')

# ---------- 3. 相邻重复汉字 ----------
# 大量 XX 是合法词边界（无人机+机长、放电+电流、升力+力矩…）或叠词（渐渐/仅仅/常常）。
# 下列白名单经全库逐条人工核对确认合法，比对时跳过，避免噪音淹没真错字。
BIGRAM_OK = set("""
机机 电电 速速 空空 桨桨 圈圈 向向 流流 高高 国国 转转 大大 面面 起起 地地 力力 分分
跷跷 动动 仅仅 两两 常常 稍稍 视视 往往 风风 慢慢 油油 航航 间间 图图 下下 千千 体体
以以 明明 要要 日日 标标 确确 调调 当当 控控 摄摄 云云 毛毛 色色 渐渐 升升 说说 距距
行行
""".split())
print('\n=== 3. 相邻重复汉字（已过滤 %d 个已知合法词）===' % len(BIGRAM_OK))
cnt3 = collections.Counter()
ctx = collections.defaultdict(list)
for q in qs:
    for fn, t in fields(q):
        for m in re.finditer(r'([\u4e00-\u9fff])\1', t):
            g = m.group(0)
            if g in BIGRAM_OK:
                continue
            cnt3[g] += 1
            if len(ctx[g]) < 4:
                ctx[g].append('#%s %s「%s」' % (q['id'], fn, t[max(0, m.start() - 8):m.start() + 10]))
for g, n in cnt3.most_common():
    print('  %s x%d' % (g, n))
    for c in ctx[g]:
        print('      ', c)
if not cnt3:
    print('  无')

# ---------- 4. 异常标点 ----------
print('\n=== 4. 异常标点 ===')
# （）是题库的填空占位符，属预期，不计为异常
PATS = [r'，，', r'。。', r'、、', r'，、', r'、，', r'。、', r'、。', r'：，', r'，。',
        r'；，', r'，；', r'\s+、', r'、\s*$', r'，\s*$']
for p in PATS:
    n = 0
    for q in qs:
        for fn, t in fields(q):
            for m in re.finditer(p, t):
                n += 1
                if n <= 4:
                    print('  %-10s #%-5s %s ... %s ...' % (p, q['id'], fn, t[max(0, m.start() - 12):m.start() + 12]))
    if n:
        print('  ↑ %s 共 %d 处' % (p, n))

# ---------- 5. 罗马数字类号残留 ----------
# 源文件经「形近归一」，Ⅰ/Ⅵ/Ⅺ/Ⅻ 被转成 ASCII（XI 类 / XII 类 / VI 类），
# 依 AC-61-FS-2018-20R2 分类表应还原为 Unicode 罗马数字。此 bug 类曾两次漏检，故固化。
print('\n=== 5. 罗马数字类号残留（ASCII/混排 → 应为 Unicode 罗马数字）===')
ROMAN_CHECKS = [
    ('ASCII 罗马数字 + 类/型/级别', re.compile(r'[IVXL]{1,5}\s*(?:类|型|级别)')),
    ('Unicode 罗马数字 + 空格', re.compile(r'[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ]\s+(?:类|级别)')),
    ('混排（XⅠ / XIⅠ）', re.compile(r'[XVI]{1,3}[ⅠⅡⅢ]{1,2}')),
    ('竖线／数字伪装', re.compile(r'[|｜](?=\s*[ⅠⅡⅢⅣIV]|\s*(?:类|级别))')),
]
hit5 = 0
for name, rx in ROMAN_CHECKS:
    for q in qs:
        for fn, t in fields(q):
            for m in rx.finditer(t):
                # 排除英文缩写误报（AIL、RUD 等）
                if re.search(r'[A-Za-z](?=[IVXL]{1,5}\s*[、，,])', t[max(0, m.start() - 1):m.start() + 1]):
                    continue
                hit5 += 1
                print('  [%s] #%-5s %s ...%s...' % (name, q['id'], fn, t[max(0, m.start() - 14):m.start() + 18]))
if not hit5:
    print('  无')
