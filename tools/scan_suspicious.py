# -*- coding: utf-8 -*-
"""扫描题库中「选项与解析自相矛盾 / 解析自相矛盾」的可疑题目。"""
import re, json, io

SRC = "data/questions.js"
raw = io.open(SRC, encoding="utf-8").read()
body = raw.split("window.QUESTIONS =", 1)[1].rstrip().rstrip(";")
body = re.sub(r"//[^\n]*", "", body)
body = re.sub(r"(\{|,)\s*(\w+):", lambda m: m.group(1) + ' "%s":' % m.group(2), body)
body = re.sub(r",(\s*[\]}])", r"\1", body)
data = json.loads(body)

CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7,
          "八": 8, "九": 9, "十": 10, "十一": 11, "十二": 12}
CN_ROMAN = {"Ⅰ": 1, "Ⅱ": 2, "Ⅲ": 3, "Ⅳ": 4, "Ⅴ": 5, "Ⅵ": 6, "Ⅶ": 7,
            "Ⅷ": 8, "Ⅸ": 9, "Ⅹ": 10, "Ⅺ": 11, "Ⅻ": 12}
EN_ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7,
            "VIII": 8, "IX": 9, "X": 10, "XI": 11, "XII": 12}
ALL_ROMAN = dict(CN_ROMAN)
ALL_ROMAN.update(EN_ROMAN)

CLASS_RE = re.compile(
    r"(?:Ⅻ|Ⅺ|Ⅹ|Ⅸ|Ⅷ|Ⅶ|Ⅵ|Ⅴ|Ⅳ|Ⅲ|Ⅱ|Ⅰ|XII|XI|IX|VIII|VII|VI|IV|V?III|V?II|V"
    r"|[一二三四五六七八九十]+|\d+)[ 　]{0,2}类")


def norm(tok):
    t = tok.strip().replace(" ", "").replace("\u3000", "")
    t = re.sub(r"[ 　]{0,2}类$", "", t)
    for k in ("Ⅻ", "Ⅺ", "Ⅹ", "Ⅸ", "Ⅷ", "Ⅶ", "Ⅵ", "Ⅴ", "Ⅳ", "Ⅲ", "Ⅱ", "Ⅰ"):
        if t.startswith(k):
            return CN_ROMAN[k]
    for k in ("XII", "XI", "VIII", "VII", "VI", "IV", "III", "II", "V", "I"):
        if t == k:
            return EN_ROMAN[k]
    if t in CN_NUM:
        return CN_NUM[t]
    if t.isdigit():
        n = int(t)
        if 1 <= n <= 25:
            return n
    return None


def find_classes(text):
    out = set()
    for m in CLASS_RE.finditer(text):
        n = norm(m.group(0))
        if n:
            out.add(n)
    return out


sus = {}
for q in data:
    opts = [o for o in q["opts"] if o and o.strip()]
    reasons = []
    if not (0 <= q["ans"] < len(opts)):
        reasons.append("答案索引越界/选项缺失")
    else:
        a = find_classes(opts[q["ans"]])
        e = find_classes(q.get("exp", ""))
        if a and e and not (a & e):
            reasons.append("答案选项写 %s 类，解析却写 %s 类" % (
                "/".join(map(str, sorted(a))), "/".join(map(str, sorted(e)))))
        if len(e) > 1:
            reasons.append("解析内部出现多个类别编号(%s)，自相矛盾" %
                           "/".join(map(str, sorted(e))))
    if reasons:
        sus[q["id"]] = dict(id=q["id"], cat=q["cat"], q=q["q"][:60], reasons=reasons)

print("总题数:", len(data), " 可疑题数:", len(sus))
for v in sus.values():
    print("  id=%-5s [%s] %s\n        -> %s" % (v["id"], v["cat"], v["q"], "；".join(v["reasons"])))
