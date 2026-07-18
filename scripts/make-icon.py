#!/usr/bin/env python3
"""Generate the Moverse app icons with Pillow.

Motif: an amber moving box (2.5D) framed by a mint scan-reticle on a dark
gradient — "scan a label, pack the box." Rendered at 2x and downscaled for
crisp anti-aliased edges.

Outputs (1024x1024 PNG):
  mobile/assets/icon.png            legacy/full-bleed  (gradient bg + motif)
  mobile/assets/adaptive-icon.png   Android adaptive foreground (transparent,
                                    motif inside the safe zone)
"""
import os
from PIL import Image, ImageDraw

SS = 2                      # supersample factor
S = 1024                    # final size
Z = S * SS

BG_TOP = (31, 43, 61)       # #1f2b3d
BG_BOT = (11, 18, 32)       # #0b1220
FRONT = (224, 164, 88)      # amber
TOP = (240, 194, 122)       # lighter amber
SIDE = (196, 132, 66)       # darker amber
TAPE = (247, 224, 182)      # light tape strip
MINT = (52, 211, 153)       # #34d399 reticle
LINE = (60, 42, 20, 255)    # box outline


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size, top, bot):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        c = lerp(top, bot, y / (size - 1))
        for x in range(size):
            px[x, y] = c
    return img


def draw_box(d, cx, cy, R):
    """Amber 2.5D box centered around (cx, cy), overall extent ~R."""
    w = R * 0.30          # half front width
    h = R * 0.28          # half front height
    dx = R * 0.26         # depth x
    dy = R * 0.15         # depth y
    ox = -dx * 0.45       # recenter for depth
    cx += ox
    cy += R * 0.04

    fl_t = (cx - w, cy - h)
    fr_t = (cx + w, cy - h)
    fr_b = (cx + w, cy + h)
    fl_b = (cx - w, cy + h)
    br_t = (cx + w + dx, cy - h - dy)      # back-right top
    bl_t = (cx - w + dx, cy - h - dy)      # back-left top

    lw = max(2, int(R * 0.012))
    # right side, top, then front (painter's order)
    d.polygon([fr_t, br_t, (cx + w + dx, cy + h - dy), fr_b], fill=SIDE, outline=LINE)
    d.polygon([fl_t, fr_t, br_t, bl_t], fill=TOP, outline=LINE)
    d.polygon([fl_t, fr_t, fr_b, fl_b], fill=FRONT, outline=LINE)
    # tape seam down the front
    d.rectangle([cx - R * 0.028, cy - h, cx + R * 0.028, cy + h], fill=TAPE)
    # flap seam across the top
    d.line([lerp3(fl_t, bl_t, 0.5), lerp3(fr_t, br_t, 0.5)], fill=TAPE, width=int(R * 0.03))


def lerp3(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def draw_reticle(d, cx, cy, half, t, ln):
    """Four corner brackets forming a scan frame."""
    for sx in (-1, 1):
        for sy in (-1, 1):
            x = cx + sx * half
            y = cy + sy * half
            # horizontal arm
            d.rounded_rectangle(
                [min(x, x - sx * ln), min(y, y - sy * t),
                 max(x, x - sx * ln), max(y, y - sy * t)],
                radius=t / 2, fill=MINT)
            # vertical arm
            d.rounded_rectangle(
                [min(x, x - sx * t), min(y, y - sy * ln),
                 max(x, x - sx * t), max(y, y - sy * ln)],
                radius=t / 2, fill=MINT)


def render(with_bg, motif_scale):
    if with_bg:
        base = gradient(Z, BG_TOP, BG_BOT).convert("RGBA")
    else:
        base = Image.new("RGBA", (Z, Z), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    R = Z * motif_scale
    cx = cy = Z / 2
    draw_box(d, cx, cy, R)
    draw_reticle(d, cx, cy, half=R * 0.52, t=R * 0.055, ln=R * 0.20)
    return base.resize((S, S), Image.LANCZOS)


def rounded_bg(img, radius_frac=0.0):
    return img  # Android applies its own mask; keep full square


def main():
    out = os.path.join(os.path.dirname(__file__), "..", "mobile", "assets")
    os.makedirs(out, exist_ok=True)
    # Legacy / full icon: gradient bg, motif fills more of the tile.
    render(with_bg=True, motif_scale=0.78).save(os.path.join(out, "icon.png"))
    # Adaptive foreground: transparent, motif inside the ~66% safe zone.
    render(with_bg=False, motif_scale=0.60).save(os.path.join(out, "adaptive-icon.png"))
    print("wrote icon.png and adaptive-icon.png to", os.path.normpath(out))


if __name__ == "__main__":
    main()
