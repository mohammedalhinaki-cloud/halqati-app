#!/usr/bin/env python3
"""Generate app icons for the PWA (open mushaf + crescent, emerald palette)."""
from PIL import Image, ImageDraw
import math, os

S = 1024
BG1 = (2, 44, 34)      # emerald-950
BG2 = (6, 95, 70)      # emerald-800
RING = (16, 185, 129)  # emerald-500
PAGE = (241, 245, 249)# slate-50
LINE = (5, 150, 105)   # emerald-600
GOLD = (252, 211, 77)  # amber-300


def draw_content(d, cx, cy, s):
    # --- crescent above the book ---
    ry = cy - 240 * s
    r = 86 * s
    d.ellipse([cx - r, ry - r, cx + r, ry + r], fill=GOLD)
    r2 = r * 0.80
    d.ellipse([cx - r2 + r * 0.42, ry - r2 - r * 0.14, cx + r2 + r * 0.42, ry + r2 - r * 0.14], fill=BG2)
    # small star
    sr = 16 * s
    sx, sy = cx + 120 * s, ry - 30 * s
    pts = []
    for i in range(8):
        ang = math.pi / 4 * i - math.pi / 2
        rad = sr if i % 2 == 0 else sr * 0.45
        pts.append((sx + rad * math.cos(ang), sy + rad * math.sin(ang)))
    d.polygon(pts, fill=GOLD)

    # --- open book: cover under two curved pages ---
    by = cy + 50 * s          # cover top
    bh = 210 * s              # cover height
    d.rounded_rectangle([cx - 330 * s, by - 24 * s, cx + 330 * s, by + bh], radius=34 * s, fill=(4, 120, 87))
    # left page (quadrilateral tilted up toward spine)
    d.polygon([
        (cx, by + 30 * s), (cx - 286 * s, by - 6 * s),
        (cx - 286 * s, by + 170 * s), (cx, by + 200 * s)], fill=PAGE)
    d.polygon([
        (cx, by + 30 * s), (cx + 286 * s, by - 6 * s),
        (cx + 286 * s, by + 170 * s), (cx, by + 200 * s)], fill=(226, 232, 240))
    # spine shadow
    d.polygon([(cx - 8 * s, by + 30 * s), (cx + 8 * s, by + 30 * s),
               (cx + 8 * s, by + 200 * s), (cx - 8 * s, by + 200 * s)], fill=LINE)
    # text lines on pages
    for k in range(4):
        yy = by + (52 + 36 * k) * s
        off = -6 * k * s
        d.line([(cx - 250 * s, yy + off), (cx - 46 * s, yy + off + 8 * s)], fill=LINE, width=int(9 * s))
        d.line([(cx + 46 * s, yy + off + 8 * s), (cx + 250 * s, yy + off)], fill=LINE, width=int(9 * s))
    # bookmark
    d.polygon([(cx + 150 * s, by + 6 * s), (cx + 190 * s, by + 6 * s),
               (cx + 190 * s, by + 150 * s), (cx + 170 * s, by + 120 * s),
               (cx + 150 * s, by + 150 * s)], fill=GOLD)


def make(path, content_scale, rounded):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([8, 8, S - 8, S - 8], radius=int(S * 0.22), fill=BG1)
        d.rounded_rectangle([26, 26, S - 26, S - 26], radius=int(S * 0.19), fill=BG2)
        d.rounded_rectangle([26, 26, S - 26, S - 26], radius=int(S * 0.19), outline=RING, width=6)
    else:  # maskable: full-bleed, content shrunk into safe zone
        d.rectangle([0, 0, S, S], fill=BG2)
    draw_content(d, S / 2, S / 2 + 10, content_scale)
    img.save(path)
    print("wrote", path)


here = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(here, exist_ok=True)
make(os.path.join(here, "icon-512.png"), 1.0, True)
make(os.path.join(here, "maskable-512.png"), 0.72, False)
for size, name, src in [(192, "icon-192.png", "icon-512.png"), (180, "icon-180.png", "maskable-512.png")]:
    im = Image.open(os.path.join(here, src)).resize((size, size), Image.LANCZOS)
    im.save(os.path.join(here, name))
    print("wrote", name)
