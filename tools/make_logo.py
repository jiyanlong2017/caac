# -*- coding: utf-8 -*-
"""从带白底的 logo 原图生成站点用图。

产出：
  assets/logo.png      整枚 logo（白底抠成透明、裁掉四周白边），高 132px
  assets/logo-mark.png 只取彩色徽标（飞翼+五角星），高 128px，给标题栏用
  assets/favicon.png   徽标居中放进 64×64 透明方图，用作 favicon

为什么标题栏用徽标而不是整枚：
  整枚 logo 缩到标题栏的 ~30px 时，「中国民航 / CAAC」两行字会糊成灰团，
  而标题栏旁边本来就有题库名文字；徽标在这个尺寸下仍然清晰可辨。
  想换成整枚：把 index.html 里 img 的 src 改成 assets/logo.png 即可。

为什么要抠白底：站点有深色主题，白底图在深色顶栏上会变成一个白方块。

用法：
  python tools/make_logo.py <原图路径>
"""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_LOGO = os.path.join(ROOT, 'assets', 'logo.png')
OUT_MARK = os.path.join(ROOT, 'assets', 'logo-mark.png')
OUT_FAVICON = os.path.join(ROOT, 'assets', 'favicon.png')
LOGO_H = 132
MARK_H = 128
FAVICON_SIZE = 64


def white_to_alpha(im):
    """把白底转成透明。按「最小通道值」估 alpha，再反预乘还原颜色，保住抗锯齿边缘。"""
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            m = min(r, g, b)
            a = 255 - m
            if a <= 8:
                px[x, y] = (0, 0, 0, 0)
                continue
            f = a / 255.0
            # 反预乘：像素 = 原色*f + 白*(1-f)  =>  原色 = (像素 - 白*(1-f)) / f
            nr = int(min(255, max(0, (r - 255 * (1 - f)) / f)))
            ng = int(min(255, max(0, (g - 255 * (1 - f)) / f)))
            nb = int(min(255, max(0, (b - 255 * (1 - f)) / f)))
            px[x, y] = (nr, ng, nb, a)
    return im


def content_bbox(im, thresh=8):
    """非透明像素的外接矩形"""
    a = im.getchannel('A').point(lambda v: 255 if v > thresh else 0)
    bb = a.getbbox()
    if not bb:
        raise SystemExit('图片全是透明/全白，抠不出内容')
    return bb


def colored_bbox(im, sat=60, minmax=90, alpha_min=40):
    """「有颜色」像素的外接矩形。

    徽标是蓝翼 + 红星，而「中国民航 / CAAC」是黑色书法字 —— 用饱和度一筛就分开了。
    注意：屏幕截图里的黑字带 subpixel 抗锯齿彩色描边（ClearType），那些像素饱和度也不算低，
    所以还要加「足够亮」（max 通道 > minmax）这一条 —— 描边像素偏暗，会被滤掉。
    """
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a <= alpha_min:
                continue
            mx = max(r, g, b)
            if mx - min(r, g, b) > sat and mx > minmax:
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
    if maxx < 0:
        return content_bbox(im)          # 兜底：整张图都是灰阶
    return (minx, miny, maxx + 1, maxy + 1)


def fit_square(im, size, pad_ratio=0.08):
    """等比缩放后居中放进正方透明画布"""
    pad = int(size * pad_ratio)
    inner = size - pad * 2
    w, h = im.size
    scale = min(inner / w, inner / h)
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    im = im.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.paste(im, ((size - nw) // 2, (size - nh) // 2), im)
    return canvas


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'logo-src.png')
    if not os.path.isfile(src):
        raise SystemExit('找不到原图：%s\n用法: python tools/make_logo.py <原图路径>' % src)

    im = white_to_alpha(Image.open(src))
    im = im.crop(content_bbox(im))
    print('抠底+裁白边后尺寸:', im.size)

    # 1) 整枚 logo
    w, h = im.size
    logo = im.resize((max(1, round(w * LOGO_H / h)), LOGO_H), Image.LANCZOS)
    logo.save(OUT_LOGO, optimize=True)
    print('写出 %s  %s  %.1f KB' % (os.path.relpath(OUT_LOGO, ROOT), logo.size,
                                    os.path.getsize(OUT_LOGO) / 1024))

    # 2) 徽标（标题栏）+ favicon 共用一次裁剪
    mark = im.crop(colored_bbox(im))
    print('徽标区域尺寸:', mark.size)
    mw, mh = mark.size
    mark_big = mark.resize((max(1, round(mw * MARK_H / mh)), MARK_H), Image.LANCZOS)
    mark_big.save(OUT_MARK, optimize=True)
    print('写出 %s  %s  %.1f KB' % (os.path.relpath(OUT_MARK, ROOT), mark_big.size,
                                    os.path.getsize(OUT_MARK) / 1024))

    fav = fit_square(mark, FAVICON_SIZE, pad_ratio=0.02)
    fav.save(OUT_FAVICON, optimize=True)
    print('写出 %s  %s  %.1f KB' % (os.path.relpath(OUT_FAVICON, ROOT), fav.size,
                                    os.path.getsize(OUT_FAVICON) / 1024))


if __name__ == '__main__':
    main()
