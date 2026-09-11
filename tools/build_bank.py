# -*- coding: utf-8 -*-
"""
把原始 questions.js 规范化为 data/bank-real.js，并标注可疑题目。

规范化内容：
  1. 机械清理（全题库生效）：去空选项、去选项尾部「正确答案/参考答案」标签、去首尾空白。
  2. 结构重建（MANUAL 表，逐题对照解析重建）：修复源清洗脚本误伤造成的
     题干截断 / 选项字母丢失 / 选项粘连 / 选项被拆 / 答案指向空项。
  3. 解析补全（RECOVER，据辅助题库 data/reference-bank.json 交叉校验）：
     源题库解析被统一截到约 100 字；辅助题库同源但解析未截断，
     按 ID 对齐 + 公共前缀校验后可安全补全（详见下方 REF 段注释）。

用法：
    python tools/build_bank.py               # 只重新生成 bank-real.js
    python tools/build_bank.py --write-src   # 同时把清理结果写回 data/questions.js
    python tools/build_bank.py --no-recover  # 不做解析补全
"""
import re, json, io, sys

SRC = "data/questions.js"
OUT = "data/bank-real.js"
REF_SRC = "data/reference-bank.json"     # 辅助题库：用于交叉校验 + 补全被截断的解析
RECOVER = "--no-recover" not in sys.argv
WRITE_SRC = "--write-src" in sys.argv


# ---------------- 读取源文件 ----------------
def load_source(path):
    raw = io.open(path, encoding="utf-8").read()
    m = re.search(r"window\.QUESTIONS\s*=\s*(\[.*\])\s*;", raw, re.S)
    body = m.group(1)
    body = re.sub(r"//[^\n]*", "", body)
    body = re.sub(r"(\{|,)\s*(\w+):", lambda mm: mm.group(1) + ' "%s":' % mm.group(2), body)
    body = re.sub(r",(\s*[\]}])", r"\1", body)
    return json.loads(body)


# ---------------- 机械清理 ----------------
LABEL_RE = re.compile(r"\s*(正确答案|参考答案)\s*$")


def clean_option(o):
    if not isinstance(o, str):
        return o
    o = LABEL_RE.sub("", o).strip()
    return o


# ---------------- 结构重建表（逐题核对解析后重建） ----------------
# 说明：这些题在源数据中因清洗脚本误伤而损坏，已依据其自带解析逐题重建。
MANUAL = {
    16: dict(
        q="无人机飞艇属于（）无人机",
        opts=["XII 类", "XI 类", "VI 类"], ans=2,
        exp="无人飞艇属于Ⅵ类无人机。根据《轻小无人机运行规定（试行）》的分类，无人飞艇为Ⅵ类无人机。",
        flag="解析自相矛盾修复：原解析先写「Ⅵ类」又写「V 类」，依《轻小无人机运行规定（试行）》无人飞艇为Ⅵ类，已统一为Ⅵ类（答案=Ⅵ类）"),
    21: dict(
        q="植保机属于（）无人机",
        opts=["3 类", "5 类", "7 类"], ans=1,
        exp="植保无人机属于无人机的一种分类。根据《轻小无人机运行规定（试行）》中的分类，植保类无人机为Ⅴ类无人机。这类无人机专门用于农林植物保护作业，包括喷洒农药、种子、粉剂等。",
        flag="源数据损坏修复：原答案「4 类」与解析「Ⅴ 类」矛盾，依《轻小无人机运行规定（试行）》植保类为Ⅴ类，已修正选项与解析一致（答案=5 类）"),
    217: dict(
        q="何种无人机须安装使用电子围栏？（）",
        opts=["Ⅲ、Ⅳ、Ⅵ、Ⅶ类无人机及在重点地区和机场净空区以下运行Ⅱ、Ⅴ类无人机",
              "Ⅱ、Ⅲ、Ⅰ、Ⅴ、Ⅵ、Ⅶ类无人机",
              "Ⅲ、Ⅰ、Ⅵ、Ⅶ类无人机"], ans=0,
        exp="依据《轻小无人机运行规定（试行）》第 14.1.1 条：对于Ⅲ、Ⅳ、Ⅵ和Ⅶ类无人机，应安装并使用电子围栏；对于在重点地区和机场净空区以下运行Ⅱ类和Ⅴ类无人机，应安装并使用电子围栏。其他选项要么范围过大要么范围过小。",
        flag="源数据损坏修复：选项与解析均出现重复编号「Ⅵ、Ⅵ」（OCR 错误），依《轻小无人机运行规定（试行）》第 14.1.1 条应为「Ⅲ、Ⅳ、Ⅵ、Ⅶ类」，已修正（答案=A）"),
    152: dict(
        q="我国管制空域包括 ABCD 四类空中交通服务空域。每一个空域都是一个划定范围的三维空间，其中（）空域是中、低空管制空域，为 6000m（含）以下至最低高度层以上空间。",
        opts=["A 类", "B 类", "C 类", "D 类"], ans=1,
        flag="源数据损坏修复：选项丢失类别字母（原为「类」×3），已还原为 A/B/C/D 类；答案=B 类（与解析一致）"),
    178: dict(
        q="以下哪个空域属于进近管制空域？通常是指在一个或几个机场附近的航路汇合处划设的，便于进场和离场航空器飞行的管制空域。",
        opts=["A 类空域", "B 类空域", "C 类空域", "D 类空域"], ans=2,
        flag="源数据损坏修复：选项丢失类别字母（原为「类空域」×3），已还原为 A~D 类空域；答案=C 类空域（与解析一致）"),
    229: dict(
        q="民用无人机驾驶申请人飞行时间不少于（）",
        opts=["44 小时", "56 小时", "100 小时"], ans=0,
        flag="源数据损坏修复：选项被粘连（原「56 小时 C100 小时」），已拆分为 3 项；答案=44 小时（与解析一致）"),
    559: dict(
        q="一块聚合物锂电池上标有 25C 字样，代表（）",
        opts=["充电倍率", "放电倍率", "容量倍率"], ans=1,
        flag="源数据损坏修复：题干尾部「代表（）」混入首选项，已还原；答案=放电倍率（与解析一致）"),
    48: dict(
        opts=["伞降", "横滚", "气囊回收"], ans=1,
        flag="错别字修复：选项「伞隆」应为「伞降」（解析中作「伞降」）"),
    397: dict(
        q="地图校准时，在命令下拉菜单中选取（）个定位点作为校准点，并在对话框左侧输入这些定位点的实际地理位置信息。",
        flag="题干格式修复：补回丢失的空括号「（）个」（原题为无空的陈述句）"),
    1514: dict(
        q="风矢杆上的两横，长横代表（）m/s，短横代表（）m/s.",
        opts=["长横 4m/s，短横 2m/s", "长横 2m/s，短横 4m/s", "长横 2m/s，短横 2m/s"], ans=0,
        flag="源数据损坏修复：题干尾部「上的两横…」混入首选项，已还原；答案=长横 4m/s，短横 2m/s（与解析一致）"),
    644: dict(
        q="悬停状态的四轴飞行器如何实现向左移动？（）",
        opts=["纵轴右侧的螺旋桨加速，纵轴左侧的螺旋桨减速",
              "横轴前侧的螺旋桨加速，横轴后侧的螺旋桨减速",
              "纵轴右侧的螺旋桨减速，纵轴左侧的螺旋桨加速"], ans=0,
        flag="源数据损坏修复：题干尾部混入选项残片，已还原为选项 C；答案按解析修正为「右侧加速/左侧减速」"),
    710: dict(
        q="关于飞机积冰，下列正确的是（）",
        opts=["飞机积冰一般发生在-1~-15°的温度范围内",
              "在-2~-10°温度范围内遭遇积冰的次数最多",
              "强烈的积冰主要发生在-4~-8°的温度范围内"], ans=1,
        flag="源数据损坏修复：选项在「°C」处被拆成两半（原 6 项），已合并还原为 3 项；答案=「-2~-10°温度范围内遭遇积冰的次数最多」（与解析一致）"),
    1039: dict(
        q="机翼空气动力受力最大的是（）",
        opts=["机翼下表面压力", "机翼上表面负压", "机翼上表面压力"], ans=1,
        flag="源数据损坏修复：题干尾部混入选项残片、原答案指向空项；已还原为 3 项，答案=机翼上表面负压（与解析一致）"),
    1092: dict(
        q="飞机的最大起飞重量指（）",
        opts=["飞机离地时的重量",
              "飞机开始滑行时的重量（地面上从 A 点移动到 B 点）",
              "飞机开始起飞滑跑的重量（起飞前加速滑跑）"], ans=2,
        flag="源数据损坏修复：选项在字母处被拆成 5 段，已合并还原为 3 项；答案=「飞机开始起飞滑跑的重量」（与解析一致）"),
    1486: dict(
        q="以下哪种多旋翼是 H 型机架？（）",
        opts=["悟", "经纬 M600", "MAVIC"], ans=0,
        flag="源数据损坏修复：题干丢失「H」且首选项错位为空，已还原为 3 项；答案=悟（与解析一致）"),
    1525: dict(
        q="你手头有一块 6000mAh 的电池，用一个标准充电电流 3A 的充电器充电，理论上电池多长时间能够充满，那么它是多少 C 充电的呢？（）",
        opts=["2h，0.5C", "1h，1C", "0.5h，2C"], ans=0,
        flag="源数据损坏修复：题干被截断、首选项混入题干残片，已还原为 3 项；答案=2h/0.5C（与解析一致）"),
    219: dict(
        opts=["两者都有",
              "被动反馈系统，是指航空器被雷达、ADS-B 系统、北斗等手段从地面进行监视的系统，该反馈信息不经过运营人",
              "主动反馈系统，是指运营人主动将航空器的运行信息发送给监视系统"],
        ans=0,
        flag="源数据损坏修复：原选项 B/C 是同一句话被从中间劈开的两段，已依解析合并为「被动反馈系统」「主动反馈系统」两项；答案=两者都有"),
    272: dict(
        opts=["在融合空域运行的Ⅰ类无人机",
              "超视距运行的Ⅰ类无人机",
              "视距内运行的Ⅱ类无人机"],
        ans=2,
        flag="源数据损坏修复：选项 A 丢失类别（原为「在融合空域运行的」），选项 B 的罗马数字被 OCR 成小写 l；A 依题干语义补齐为Ⅰ类，答案=C（与解析一致）"),
    483: dict(
        opts=["直接推杆离地", "原地垂直上升离地", "加速到一定程度后拉杆离地"],
        ans=2,
        flag="低质量题修复：原选项 B 为玩梗文本「用玄学」，A/C 表述亦残缺，已改写为规范干扰项；答案=加速到一定程度后拉杆离地（与解析一致）"),
    1093: dict(
        flag="重复题：#1093 与 #1087 内容相同（仅选项顺序不同），如精简可删其一。另题干「翼弦比」为非规范说法，规范术语为「展弦比」（见 #1038）"),
    1606: dict(
        flag="错别字修复：原选项 C「尾桨桨距减大，尾桨所需功率减大」为「增大」之误，已按公开题库四选项版本还原；答案=B（与解析一致）"),
    1195: dict(
        flag="错别字修复：题干「大气团素」应为「大气因素」（同题 #1002 作「大气因素」）"),
    204: dict(
        flag="源数据损坏修复：解析末尾类号清单被 OCR 破坏成「川 I、Ⅳ、Ⅵ和 V 类」，已依上下文重建为「Ⅲ、Ⅰ、Ⅳ、Ⅵ和Ⅴ类」（答案不变）"),
    342: dict(
        flag="解析分类表述存疑：辅助题库原文把「植保」列为Ⅶ级别、并出现「Ⅺ、Ⅴ、Ⅵ级别」混排，与《轻小无人机运行规定（试行）》的分类不符（植保为Ⅴ类），仅供理解参考"),
    1436: dict(
        q="民用无人机运行多处于低空速环境下，主要受到的阻力有（）：1.摩擦阻力；2.循环阻力；3.干扰阻力；4.激波阻力；5.诱导阻力；6.压差阻力。",
        flag="源数据损坏修复：题干退化成选项残片（原为「干扰阻力；4.激波阻力；5.诱导阻力；6.压差阻力。（）」），已据辅助题库同题解析中保留的原始题干（题号 96）重建；答案=C（1356）与解析一致"),
}


# ---------------- 全库文本修正 ----------------
# 源题库经多手 OCR/清洗，混杂繁体字、乱码、重复字与罗马数字伪影。
# 下列替换经上下文逐一核对，均为无歧义修正（旧串在库中唯一或语义唯一）。
TEXT_FIX = [
    # 繁体／异体字
    ("減", "减"),
    ("決", "决"),
    # 相邻重复字（错字）
    ("飞飞机", "飞机"),
    ("飞飞行", "飞行"),
    ("飞飞时", "飞时"),
    ("平飞飞转为", "平飞转为"),
    ("起飞飞点", "起飞点"),
    ("起飞飞长。", "起飞距离长。"),
    ("流体体 积", "流体体积"),
    ("平飘距离、缩短", "平飘距离缩短"),
    ("转转速", "转/分的转速"),   # 源库 6 处：#486/#489 选项与解析漏单位，库内惯例见 #433/#434
    # 形近错字
    ("大气团素", "大气因素"),
    ("尾桨桨距减大，尾桨所需功率减大", "尾桨桨距增大，尾桨所需功率增大"),
    # 公式/变量被 OCR 破坏
    ("截面积 A=2A2=4A3", "截面积 A1=2A2=4A3"),
    ("流速 VIP2>P3。", "流速 V1<V2<V3，故静压 P1>P2>P3。"),
    ("L=1/2pCSV2", "L=1/2ρCSV²"),
    ("即=PV=nRT", "即 PV=nRT"),
    ("（q=frac｛1｝｛2｝rhov^2）", "q=1/2ρv²"),
    ("（q）是动压，（rho）是空气密度，（v）是速度", "q 是动压，ρ 是空气密度，v 是速度"),
    ("T=PRp", "T=PRρ"),
    ("P=Rp/T", "P=Rρ/T"),
    ("P=RpT", "P=RρT"),
    ("密度 p=m/V", "密度 ρ=m/V"),
    # 中文解析里混入的英文字符串（去空格/残字）
    ("UnmannedAirerafiSystem", "Unmanned Aircraft System"),
    ("UnmannedAerialVehicle", "Unmanned Aerial Vehicle"),
    ("FlightControlSystem,FCs", "Flight Control System, FCs"),
    ("ElectronicSpeedController", "Electronic Speed Controller"),
    ("Electronic SpeedController", "Electronic Speed Controller"),
    ("InternationalStandardAtmosphere", "International Standard Atmosphere"),
    ("10CEJ10x1Ah=10A. ExitB.", "10C 即 10×1Ah=10A，故选 B。"),
    # 英文单词被 OCR 粘连/串字
    ("Ljpo6SIP12000mAh30C", "LiPo 6S 1P 12000mAh 30C"),
    ("Lipo6S1P12000mAh30C", "LiPo 6S 1P 12000mAh 30C"),
    ("lipolp10000mAh25C", "LiPo 1P 10000mAh 25C"),
    ("16000mAh6s25c", "16000mAh 6S 25C"),
    ("WorldGeodeticSystem1984", "World Geodetic System 1984"),
    ("CoaxialRotorHelicopter", "Coaxial Rotor Helicopter"),
    ("12000mAb", "12000mAh"),
    ("25C (3C)池，", "25C（3C）电池，"),
    # 罗马数字/字母 OCR 串字
    ("3.7Vx3=11.Ⅳ", "3.7V×3=11.1V"),
    # 标点／符号
    ("。。", "。"),
    ("1013HPA", "1013hPa"),
    # 罗马数字类号：源文件经「形近归一」，Ⅰ/Ⅵ/Ⅺ/Ⅻ 等被转成 ASCII（写成 XI 类 / XII 类 / VI 类）。
    # 依据 AC-61-FS-2018-20R2《民用无人驾驶航空器系统驾驶员管理规定》分类表：
    #   Ⅴ=植保类 Ⅵ=无人飞艇 Ⅶ=超视距运行的Ⅰ、Ⅱ类 Ⅺ=116<W≤5700kg Ⅻ=W>5700kg
    # 该条文线上可查（「在融合空域 3,000 米以下运行的Ⅺ类无人机驾驶员，应至少持有运动或私用驾驶员执照」），
    # 与 #164 解析逐字吻合，可确证 Ⅺ/Ⅻ 而非 Ⅴ/Ⅵ。
    ("XIⅠ类无人机是指", "Ⅻ类无人机是指"),           # #7  题干  X+I+Ⅰ → Ⅻ
    ("XⅠ类无人机是指", "Ⅺ类无人机是指"),            # #6  题干  X+Ⅰ   → Ⅺ
    ("X1 类", "Ⅺ类"),                              # 兜底：源回滚为 X1 形态时
    ("XI 型无人机", "Ⅺ类无人机"),
    ("I 型无人机", "Ⅰ类无人机"),
    ("II 无人机", "Ⅱ类无人机"),
    ("XII 级别", "Ⅻ级别"),                         # #165
    ("XII 类", "Ⅻ类"),                             # #16 选A
    ("XI 级别", "Ⅺ级别"),                          # #163 题干
    ("XI、Ⅻ级别", "Ⅺ、Ⅻ级别"),                     # #334 选B（顿号分隔，无空格）
    ("XI 类", "Ⅺ类"),                              # #6解析/#16选B/#154/#163解析/#164/#176
    ("VI 类", "Ⅵ类"),                              # #16 选C
    ("II 类无人机", "Ⅱ类无人机"),                   # #154 选A
    # 竖线／数字伪装成罗马数字
    ("|、|I 类", "Ⅰ、Ⅱ类"),
    ("1、|I 级别", "Ⅰ、Ⅱ级别"),
    ("1、|| 类", "Ⅰ、Ⅱ类"),
    ("1、Ⅱ类无人机系统驾驶员", "Ⅰ、Ⅱ类无人机系统驾驶员"),
    ("I.Ⅳ级别", "Ⅲ、Ⅳ级别"),
    ("l 类无人机", "Ⅰ类无人机"),
    ("Ⅳ、V、Ⅵ", "Ⅳ、Ⅴ、Ⅵ"),
    # #204 解析的类号清单被 OCR 破坏成「川 I、Ⅳ、Ⅵ和 V 类」，依上下文重建为「Ⅲ、Ⅰ、Ⅳ、Ⅵ和Ⅴ类」
    ("川 I、Ⅳ、Ⅵ和 V 类", "Ⅲ、Ⅰ、Ⅳ、Ⅵ和Ⅴ类"),
    ("I 类损伤", "Ⅰ类损伤"),                        # #439 解析（导线损伤分级）
    # 英文缩写缺字母
    ("可以按 VF 自由飞行", "可以按 VFR 自由飞行"),
    ("也不能仅按 VF（目视飞", "也不能仅按 VFR（目视飞"),
    # 拉丁／西里尔／日文误字
    ("P1>Р2>Р3", "P1>P2>P3"),
    ("机升カ", "机升力"),
    # 气候题选项残字（依公开题库原题应为「要长」）
    ("起飞滑跑距离要卡", "起飞滑跑距离要长"),
    # 风向题选项：乱码与「或」被 OCR 成 E
    ("200°ENW", "200° 或 NW"),
    ("315°EËNW", "315° 或 NW"),
    # 箭头被 OCR 成「一」和「->」
    ("控制站一遥控器->无人机", "控制站→遥控器→无人机"),

    # ---------------- 中文排印（源题库多手转录遗留）----------------
    # 引号错配：第二个左引号当右引号 / 右引号写成半角
    ("“飞行人员“", "“飞行人员”"),                  # #188
    ("“机长“", "“机长”"),                          # #286
    ("“REV“", "“REV”"),                            # #1476（3 处）
    ("“C 代表放电倍率", "“C”代表放电倍率"),           # #559 右引号丢失
    ("代表“Reverse，即反向。", "代表“Reverse”，即反向。"),  # #1476 右引号丢失
    ('“CounterClockwise"', "“CounterClockwise”"),   # #437
    # #95 选B 右括号漏（选项结尾）
    ("空中交通管制（ATC)", "空中交通管制（ATC）"),
    # #17：左引号被 OCR 成左括号；改回后全文引号正好配平
    ("“UAS”是(Unmanned Aircraft System”，", "“UAS”是“Unmanned Aircraft System”，"),
    # 半角冒号 / 列表序号
    ("以下检查:1、", "以下检查：1、"),
    ("油门低位: 油门杆", "油门低位：油门杆"),
    ("合适位置: 检查", "合适位置：检查"),
    ("2.拨杆档位", "2、拨杆档位"),
    ("视觉效果: 1、", "视觉效果：1、"),
    ("偏离中心扫视:将", "偏离中心扫视：将"),
    ("利用视杆细胞:通过", "利用视杆细胞：通过"),
    ("抑制作用: 1、", "抑制作用：1、"),
    ("破坏睡眠结构:酒精会", "破坏睡眠结构：酒精会"),
    ("短期麻痹效应:酒精通过", "短期麻痹效应：酒精通过"),
    # 枚举项之间应为顿号（对照题或同题解析均用顿号，逗号版属不一致）
    ("规避航空器，发动机故障，链路丢失，应急回收，迫降等", "规避航空器、发动机故障、链路丢失、应急回收、迫降等"),  # #285/#286/#287
    ("IMU，ESC，起落架，电机，螺旋桨", "IMU、ESC、起落架、电机、螺旋桨"),          # #1447（#1515 用顿号）
    ("上行链路，下行链路，上行链路", "上行链路、下行链路、上行链路"),               # #1473（#1449 用顿号）
    ("上行链路，下行链路，上下行链路并存", "上行链路、下行链路、上下行链路并存"),
    ("下行链路，下行链路，上行链路", "下行链路、下行链路、上行链路"),
    ("升降舵，方向舵，襟翼", "升降舵、方向舵、襟翼"),                            # #992（#1099 用顿号）
    ("方向舵，襟翼，缝翼", "方向舵、襟翼、缝翼"),
    ("升降舵，方向舵，副翼", "升降舵、方向舵、副翼"),
    ("飞控，电调，电机，螺旋桨，机架，接收机", "飞控、电调、电机、螺旋桨、机架、接收机"),   # #1405（同题解析用顿号）
    ("飞控，电调，电机，螺旋桨，机架，倾斜盘", "飞控、电调、电机、螺旋桨、机架、倾斜盘"),
    ("飞控，电调，电机，螺旋桨，机架，遥控器", "飞控、电调、电机、螺旋桨、机架、遥控器"),
    ("充足的水汽，不稳定的大气和上升运动", "充足的水汽、不稳定的大气和上升运动"),        # #751（同题解析用顿号）
    ("浓积云，充足的水汽和锋区", "浓积云、充足的水汽和锋区"),
    ("非指令的时而左滚，时而右滚", "非指令的时而左滚、时而右滚"),                  # #938（同题解析用顿号）
    ("时而左偏，时而右偏", "时而左偏、时而右偏"),
    ("增大，减小", "增大、减小"),                        # #1182（#904 同结构题用顿号）
    ("减小，增大", "减小、增大"),
    ("增大，增大", "增大、增大"),
    ("飞控，GPS", "飞控、GPS"),                          # #1353
    ("接收机，遥控器", "接收机、遥控器"),
    # #1490 电池串数大小写不一 + 半角分号
    ("400kv; (2) 4s 20000mAh 600kv；（3） 6s 10000mAh 800kv",
     "400kv；（2）4S 20000mAh 600kv；（3）6S 10000mAh 800kv"),
    # OCR 串字：Capacitor Discharge Ignition（l 被当成 I）
    ("(CapacitorDischargelgnition）", "（Capacitor Discharge Ignition）"),
    # 选项尾部多余句号（同题其余选项均无）
    ("旋翼的基本功能是产生前进推力 。", "旋翼的基本功能是产生前进推力"),              # #638
    ("兼备发射与贮存无人机功能。", "兼备发射与贮存无人机功能"),                      # #967

    # ---------------- 交叉校验发现的错别字（辅助题库同源同错，两库互相印证）----------------
    ("下机空速", "飞机空速"),                        # #706 选C：顺风切变题，「下机」应为「飞机」
    ("暂停行，尝试重新连接", "暂停飞行，尝试重新连接"),   # #1399 选B：漏「飞」字，与选C「暂停飞行」不一致
    # #1365 解析中电池型号的另一 OCR 形态（小写 mah，旧键未覆盖）
    ("Ljpo6SIP12000mah30C", "LiPo 6S 1P 12000mAh 30C"),
    # ---------------- 解析补全（据辅助题库）带回来的 OCR 形态 ----------------
    ("VII 级别", "Ⅶ级别"),                          # #342 解析类号清单
    ("XI、V、Ⅵ级别", "Ⅺ、Ⅴ、Ⅵ级别"),                  # #342 解析类号清单
    ("3.天线方向:", "3、天线方向："),                  # #662 解析：半角冒号 + 列表序号
    ("起飞飞滑跑距离长", "起飞滑跑距离长"),              # #1527 解析：相邻重复字
    # 解析补全带回来的引号 OCR 缺陷（辅助库原文）
    ("〝捕食者”", "“捕食者”"),                        # #47（U+301D 误作左引号）
    ("标有“25C 的 2000mAh", "标有“25C”的 2000mAh"),   # #559 右引号丢失
    ('③"警用监视”', '③“警用监视”'),                    # #589 半角左引号
    ("42°30Y00”", "42°30′00″"),                      # #660 度分秒符号被 OCR
    ("“强烈积冰“", "“强烈积冰”"),                     # #710 右引号误作左引号
    ("“气 流越山而过“", "“气流越山而过”"),             # #868 右引号误作左引号 + 词中空格
    ("“12000mAh 是整个", "“12000mAh”是整个"),         # #1366 右引号丢失
]

# 正则型修正：中文顿号/逗号两侧不应有空格
TEXT_RE = [
    (re.compile(r"\s*、\s*"), "、"),
    (re.compile(r"\s*，\s*"), "，"),
    # 罗马数字类号后不应有空格（「Ⅺ 类」「Ⅱ 级别」→「Ⅺ类」「Ⅱ级别」）
    (re.compile(r"(?<=[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ])[ \t]+(?=类|型|级别)"), ""),
    # 中文语境里的半角圆括号 → 全角。先处理成对（含括号内为英文的情况），再处理仅左括号
    # （如「(ICAO）」「(SAR）」（半角左+全角右））。仅当左括号紧邻中文时触发，不碰公式。
    (re.compile(r"(?<=[\u4e00-\u9fff])[ \t]*\(([^()]{0,80}?)\)[ \t]*(?=[\u4e00-\u9fff，。、；：”]|$)"), r"（\1）"),
    (re.compile(r"(?<=[\u4e00-\u9fff])[ \t]*\("), "（"),
    # 全角右括号后不应有空格再接中文
    (re.compile(r"(?<=）)[ \t]+(?=[\u4e00-\u9fff])"), ""),
]

# 单位／符号书写统一（源题库同一单位混用多种大小写）
UNIT_RE = [
    (re.compile(r"(?<![A-Za-z])mah(?![A-Za-z])"), "mAh"),
    (re.compile(r"(?<![A-Za-z])MAH(?![A-Za-z])"), "mAh"),
    (re.compile(r"(?<=\d)AH(?![A-Za-z])"), "Ah"),      # 30AH→30Ah，但不碰 AH-64
    (re.compile(r"MHZ"), "MHz"),
    (re.compile(r"(?<![A-Za-z])Lipo(?![A-Za-z])"), "LiPo"),
    (re.compile(r"℃"), "°C"),
    # 乘号：数字/单位之间的半角 x（不碰「x 轴」「Vx」「Ax 数字 B」等）
    (re.compile(r"(?<=[0-9A-Za-z)）])x(?=\s?\d)"), "×"),
    (re.compile(r" x (?!轴)"), "×"),
    (re.compile(r"1/2x "), "1/2×"),
    (re.compile(r"容量 xC 率"), "容量×C 率"),
]


def text_fix(s):
    if not isinstance(s, str):
        return s
    for old, new in TEXT_FIX:
        s = s.replace(old, new)
    for pat, rep in TEXT_RE + UNIT_RE:
        s = pat.sub(rep, s)
    return s


# ---------------- 解析定点替换/截断标记 ----------------
# 源题库把所有解析统一截断到约 100 字（1691 题中约 1000 道被截断，断在句中）。
# 现已用辅助题库（data/reference-bank.json）按 ID 对齐 + 前缀校验补全了其中的绝大部分，
# 补全后仍被截断的少数题目，才补省略号以免用户误以为 App 显示不全。
# 关闭方式：命令行加 --no-mark-trunc / --no-recover
MARK_TRUNC = "--no-mark-trunc" not in sys.argv
TRUNC_PUNCT = "。！？.!?）)】」”’…"
CONT_PUNCT = "，、；：,;"      # 以这些收尾说明句子没写完（含辅助库自身截断的情况）
EXP_FIX = {
    # 73 的解析把「L」OCR 成了「工」
    73: [("工（低频）", "L（低频）")],
    # 58 的解析漏字 + 破折号被 OCR 成连字符
    58: [("尽量在高度开伞-这是错误的", "尽量在高高度开伞——这是错误的")],
    # 483 的解析漏字
    483: [("使飞机离地起。", "使飞机离地起飞。")],
    # 1435 的解析尾部混入了下一题（题号 96）的题干残片，删除；该残片正是 #1436 丢失的题干
    1435: [(" 96. 民用无人机运行多处于低空速环境下，主要受到的阻力有：1.摩擦阻力；2.循环阻力；", "")],
}


# ---------------- 辅助题库：ID 对齐 + 解析补全 ----------------
# 辅助题库 data/reference-bank.json（CAAC 机长【分章练习】题库-汇总 PDF 的转录版）
# 与本源题库同源，题目编号 1..1621 基本一一对应（题干相似度均值 0.996），
# 但其解析未截断——正好可用来补全本源题库被清洗脚本截到 ~100 字的解析。
# 已核实：两库答案零冲突（1619 道共有题逐题比对，答案不一致=0）。
# 注意：辅助题库本身也有 OCR 瑕疵（ASCII 罗马数字、繁体字、半角括号等），
#       故仅当作「补全文本」用，且必须先过同一套 text_fix 再比对。
#
# 编号错位（逐题核对得到，非猜测）：
#   我方 #45  ↔ 辅助 q0044-2（辅助把该题拆成两条，占用了原 45 的位）
#   我方 #46  ↔ 辅助 q0045   （辅助缺 46）
#   我方 #1436 ↔ 辅助 q1343-2（辅助缺 1436）
def _load_ref():
    try:
        data = json.load(io.open(REF_SRC, encoding="utf-8"))
    except Exception:
        return {}
    byid = {q["id"]: q for q in data.get("questions", [])}

    def g(i):
        return byid.get("q%04d" % i) or byid.get("q%04d-2" % i)

    ref = {}
    for i in range(1, 45):
        if g(i):
            ref[i] = g(i)
    if byid.get("q0044-2"):
        ref[45] = byid["q0044-2"]
    if byid.get("q0045"):
        ref[46] = byid["q0045"]
    for i in range(47, 1436):
        if g(i):
            ref[i] = g(i)
    if byid.get("q1343-2"):
        ref[1436] = byid["q1343-2"]
    for i in range(1437, 1622):
        if g(i):
            ref[i] = g(i)
    return ref


REF = _load_ref()

# 解析开头的标签/多余标点（两边统一清理后再比对）
EXP_HEAD_RE = re.compile(r"^[.。\s]*(?:解析|分析)\s*[:：]\s*")


def clean_exp(s):
    s = (s or "").strip()
    s = EXP_HEAD_RE.sub("", s)
    s = re.sub(r"^[：:。.]+", "", s).strip()
    return s


def common_prefix_len(a, b):
    n = min(len(a), len(b))
    i = 0
    while i < n and a[i] == b[i]:
        i += 1
    return i


def _norm_ref(qid):
    refq = REF.get(qid)
    if not refq:
        return None
    r = text_fix(clean_exp(refq.get("explanation")))
    # 辅助库同样套用该题的定点替换，避免 EXP_FIX 造成的差异干扰比对（如 #58/#73）
    for old, new in EXP_FIX.get(qid, ()):
        r = r.replace(old, new)
    return r


def ref_confirms(qid, cur):
    """辅助库是否已确认该解析是完整文本（用于决定是否要补「……」）。"""
    r = _norm_ref(qid)
    core = (cur or "").rstrip("…").strip()
    if not r or not core:
        return False
    cp = common_prefix_len(core, r)
    return cp >= 40 and cp >= 0.75 * len(core)


def recover_exp(qid, cur):
    """用辅助题库补全/校正解析。
    返回 (解析, status)：status='full' 表示已采用辅助库完整文本（不应再补省略号）；
    status=None 表示维持原样。
    """
    r = _norm_ref(qid)
    if r is None:
        return cur, None
    core = (cur or "").rstrip("…").strip()
    if not core or not r:
        return cur, None
    cp = common_prefix_len(core, r)
    if cp >= 40 and cp >= 0.75 * len(core):
        # 辅助库明显更长 ⇒ 补全被截断的解析
        if len(r) > len(core) + 3:
            return r, "full"
        # 长度相当 ⇒ 辅助库版本即完整版（我方那句其实没被截断，只是不以句号收尾）
        if cur.endswith("…") and len(r) >= len(core) - 5:
            return r, "full"
    return cur, None


# ---------------- 可疑题检测（保留原逻辑） ----------------
CN_ROMAN = {"Ⅰ": 1, "Ⅱ": 2, "Ⅲ": 3, "Ⅳ": 4, "Ⅴ": 5, "Ⅵ": 6, "Ⅶ": 7,
            "Ⅷ": 8, "Ⅸ": 9, "Ⅹ": 10, "Ⅺ": 11, "Ⅻ": 12}
EN_ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7,
            "VIII": 8, "IX": 9, "X": 10, "XI": 11, "XII": 12}
ROMAN_TOK = "|".join(sorted(
    list(CN_ROMAN) + ["XII", "XI", "VIII", "VII", "VI", "IV", "III", "II", "V"],
    key=len, reverse=True))
CLASS_RE = re.compile(r"(%s|[一二三四五六七八九十]+|\d+)[ 　]{0,2}类" % ROMAN_TOK)
DUP_RE = re.compile(r"(%s)\s*[、,，]\s*(%s)(?=[ 　]*[类，、。])" % (ROMAN_TOK, ROMAN_TOK))


def norm(tok):
    t = re.sub(r"[ 　]{0,2}类$", "", tok.strip()).replace(" ", "").replace("\u3000", "")
    for k, v in CN_ROMAN.items():
        if t.startswith(k):
            return v
    if t in EN_ROMAN:
        return EN_ROMAN[t]
    if re.fullmatch(r"[一二三四五六七八九十]+", t):
        cn = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7,
              "八": 8, "九": 9, "十": 10}
        return cn.get(t)
    if t.isdigit() and 1 <= int(t) <= 25:
        return int(t)
    return None


def classes(text):
    return {n for n in (norm(m.group(0)) for m in CLASS_RE.finditer(text)) if n}


def detect(ans, opts, exp):
    if ans is None or not (0 <= ans < len(opts)):
        return "答案缺失：原题库给出的答案下标指向空选项，无法判分，请以解析为准"
    a, e = classes(opts[ans]), classes(exp)
    if a and e and not (a & e):
        return "选项与解析矛盾：答案选「%s」，但解析写「%s」" % (
            sorted(a)[0], "／".join(str(x) for x in sorted(e)))
    m1 = re.search(r"属于\s*(%s)[ 　]{0,2}类" % ROMAN_TOK, exp)
    m2 = re.search(r"归类为\s*(%s)[ 　]{0,2}类" % ROMAN_TOK, exp)
    if m1 and m2 and norm(m1.group(1)) != norm(m2.group(1)):
        return "解析自相矛盾：同一段解析里先写「%s 类」又写「%s 类」" % (
            m1.group(1), m2.group(1))
    for txt, name in ((opts[ans], "答案选项"), (exp, "解析")):
        for d in DUP_RE.finditer(txt):
            if norm(d.group(1)) == norm(d.group(2)):
                return "%s中出现重复类别编号「%s、%s」，疑为 OCR 错误" % (
                    name, d.group(1), d.group(2))
    if len(opts) < 2:
        return "有效选项不足 2 个，题目残缺"
    if len(exp) < 25:
        return "解析过短/疑似截断，参考价值有限"
    return None


# ---------------- 主流程 ----------------
src_qs = load_source(SRC)
out = []
applied = []
recovered = []
for q in src_qs:
    qid = q["id"]
    fix = MANUAL.get(qid)
    if fix:
        for k in ("q", "opts", "ans", "exp"):
            if k in fix:
                q[k] = list(fix[k]) if k == "opts" else fix[k]
        applied.append(qid)
    # 机械清理
    q["q"] = (q.get("q") or "").strip()
    q["opts"] = [o for o in (clean_option(o) for o in q["opts"]) if o]
    q["exp"] = (q.get("exp") or "").strip()
    # 解析开头混入的标签/多余标点（如「. 解析：」「：」）
    q["exp"] = re.sub(r"^[.。\s]*(?:解析|分析)\s*[:：]\s*", "", q["exp"])
    q["exp"] = re.sub(r"^[：:。.]+", "", q["exp"]).strip()
    # 全库文本修正（繁体字/乱码/重复字/罗马数字 OCR 伪影）
    q["q"] = text_fix(q["q"])
    q["opts"] = [text_fix(o) for o in q["opts"]]
    q["exp"] = text_fix(q["exp"])
    if isinstance(q.get("tip"), str):
        q["tip"] = text_fix(q["tip"])
    # 用辅助题库补全/校正解析（MANUAL 已显式重写 exp 的题跳过）
    exp_full = False
    if RECOVER and "exp" not in (fix or {}):
        q["exp"], status = recover_exp(qid, q["exp"])
        if status == "full":
            recovered.append(qid)
            exp_full = True
    # 解析定点替换（放在补全之后，补全带回来的 OCR 瑕疵仍能被修正）
    for old, new in EXP_FIX.get(qid, ()):
        q["exp"] = q["exp"].replace(old, new)
    # 被截断的解析补省略号（已由辅助库确认为完整文本的不补）
    if MARK_TRUNC and q["exp"]:
        tail = q["exp"][-1]
        if tail in CONT_PUNCT:
            # 句子没收尾（含辅助库自身在此截断的情况，如 #964）⇒ 补标记
            q["exp"] = q["exp"] + "……"
        elif (not exp_full and not ref_confirms(qid, q["exp"])
              and len(q["exp"]) >= 90 and tail not in TRUNC_PUNCT):
            q["exp"] = q["exp"] + "……"
    # 答案有效性
    ans = q["ans"] if isinstance(q["ans"], int) and 0 <= q["ans"] < len(q["opts"]) else None
    reason = (fix or {}).get("flag") or detect(ans, q["opts"], q["exp"])
    out.append(dict(id=qid, cat=q["cat"], type="single", q=q["q"],
                    opts=q["opts"], ans=ans, exp=q["exp"], flag=reason or ""))

cats = []
for q in out:
    if q["cat"] not in cats:
        cats.append(q["cat"])

bank = dict(name="CAAC 超视距（机长）理论题库", version="2026-07-30-v2",
            source="开源社区整理，已做规范化与可疑题标注",
            cats=cats, questions=out)

js = ("// 自动生成，勿手改。来源 data/questions.js\n"
      "window.CAAC_BANK = " +
      json.dumps(bank, ensure_ascii=False, separators=(",", ":")) + ";\n")
io.open(OUT, "w", encoding="utf-8").write(js)


# ---------------- 可选：回写清理后的源文件 ----------------
def js_str(s):
    return json.dumps(s, ensure_ascii=False)


if WRITE_SRC:
    lines = [
        "// ============================================================",
        "// CAAC 无人机机长理论考试 完整题库",
        "// 来源: 开源社区 (GitHub)",
        "// VERSION: '2026-07-30-v2'",
        "// 共计: %d 题（含解析）" % len(src_qs),
        "// 已规范化：清理空选项/标签残留，重建结构损坏题，并据辅助题库补全解析（见 tools/build_bank.py）",
        "// ============================================================",
        "",
        "window.QUESTIONS = [",
    ]
    prev = None
    for q in src_qs:
        if q["cat"] != prev:
            lines.append("  // ==================== %s ====================" % q["cat"])
            prev = q["cat"]
        lines.append(
            "  { id: %d, cat: %s, q: %s, opts: [%s], ans: %s, exp: %s },"
            % (q["id"], js_str(q["cat"]), js_str(q["q"]),
               ", ".join(js_str(o) for o in q["opts"]),
               "null" if not isinstance(q["ans"], int) else q["ans"],
               js_str(q.get("exp") or "")))
    lines.append("];")
    io.open(SRC, "w", encoding="utf-8").write("\n".join(lines) + "\n")

# ---------------- 报告 ----------------
print("题数=%d  章节=%d  可疑/修复标注=%d" %
      (len(out), len(cats), sum(1 for q in out if q["flag"])))
print("结构重建题: %s" % (applied or "无"))
print("解析补全（据辅助题库）: %d 题" % len(recovered))
if recovered:
    print("  补全 id: %s%s" %
          (",".join(str(i) for i in recovered[:40]),
           " …（共 %d 题）" % len(recovered) if len(recovered) > 40 else ""))
for q in out:
    if q["flag"]:
        print("  #%-5s [%s] %s\n        %s" % (q["id"], q["cat"], q["q"][:44], q["flag"]))
