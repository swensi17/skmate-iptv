"""Draws the bot's banner (banner.jpg next to this file) from the SkMate wordmark.

    python tools/playlist-server/render_banner.py

Needs Pillow. The wordmark is cut from docs/brand/banner-dark.png; the caption uses SF Pro Rounded
(macOS), which carries Cyrillic.
"""
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
W, H = 1280, 640
BG = (24, 27, 31)
ACCENT = (91, 200, 245)
FONT = "/System/Library/Fonts/SFNSRounded.ttf"


def font(size: int, weight: int) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(FONT, size)
    try:
        f.set_variation_by_axes([weight])
    except (OSError, ValueError):
        pass
    return f


def main() -> None:
    img = Image.new("RGB", (W, H), BG)
    glow = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(glow)
    d.ellipse((W * 0.18, -H * 0.55, W * 0.82, H * 0.75), fill=(36, 70, 92))
    d.ellipse((W * 0.62, H * 0.55, W * 1.25, H * 1.6), fill=(30, 52, 70))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(160)), 0.9)

    src = Image.open(os.path.join(ROOT, "docs/brand/banner-dark.png")).convert("RGB")
    mark = src.crop((340, 100, 1260, 320))
    mask = Image.new("L", mark.size, 0)
    px, mp = mark.load(), mask.load()
    for y in range(mark.size[1]):
        for x in range(mark.size[0]):
            r, g, b = px[x, y]
            mp[x, y] = max(0, min(255, int((b - 45) * 255 / (245 - 45))))
    scale = 0.78
    mark = mark.resize((int(mark.size[0] * scale), int(mark.size[1] * scale)), Image.LANCZOS)
    mask = mask.resize(mark.size, Image.LANCZOS)
    solid = Image.new("RGB", mark.size, ACCENT)
    mx = (W - mark.size[0]) // 2
    my = 150
    img.paste(solid, (mx, my), mask)

    draw = ImageDraw.Draw(img)
    title = "плейлист"
    f1 = font(64, 700)
    tw = draw.textlength(title, font=f1)
    draw.text(((W - tw) / 2, my + mark.size[1] + 30), title, font=f1, fill=(236, 240, 244))

    tag = "каналы  ·  телегид  ·  проверка 24/7"
    f2 = font(30, 500)
    tw2 = draw.textlength(tag, font=f2)
    pad_x, pad_y = 28, 14
    top = my + mark.size[1] + 135
    box = ((W - tw2) / 2 - pad_x, top, (W + tw2) / 2 + pad_x, top + 30 + pad_y * 2 + 6)
    draw.rounded_rectangle(box, radius=40, fill=(38, 44, 51), outline=(52, 60, 69), width=2)
    draw.text(((W - tw2) / 2, top + pad_y), tag, font=f2, fill=(160, 172, 184))

    img.save(os.path.join(HERE, "banner.jpg"), quality=92)


if __name__ == "__main__":
    main()
