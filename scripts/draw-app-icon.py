#!/usr/bin/env python3
"""Draws the app icon (a tomato split into a red and a blue half, on a blue gradient) at store size.

It is the artwork of extension/icons/icon.png (256x256, the Thunderbird add-on's icon) redrawn as vectors, so the
Android and iOS icons are crisp. Writes to resources/, where `npx @capacitor/assets generate` reads them:

    icon.png             1024x1024, opaque (the iOS icon, and Android's legacy icon)
    icon-foreground.png  1024x1024, transparent, the tomato well inside the circle the adaptive icon can show
    icon-background.png  1024x1024, the gradient (adaptive icon background layer)
    splash.png           2732x2732, the tomato on the light theme's background (--color-bg in src/style.css)
    splash-dark.png      2732x2732, the same on the dark theme's background

    python3 scripts/draw-app-icon.py

Needs Pillow and NumPy. The artwork is described in the coordinates of the original 256x256 icon and drawn with
supersampling (downsampled with LANCZOS) for clean edges.
"""
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "resources"

# --- the artwork, in the 256x256 coordinates of extension/icons/icon.png -------------------------------------------
CX, CY = 126.0, 129.5  # tomato centre
R_OUT, R_IN = 81.0, 78.0  # outline outer radius, fill radius
NAVY = (6, 11, 116)
# The split between the halves: through (120, 129), leaning like the original (dx/dy = -0.572).
SPLIT_P, SPLIT_K = (120.0, 129.0), 0.572
BBOX = (46.0, 1.0, 206.0, 210.0)  # what is visible, to centre it

LEAVES = [
    # (polygon, gradient from (x, y) to (x, y), colours)
    ([(105.6, 1.3), (120.6, 12.5), (116.3, 41), (113.8, 52.5), (108.8, 47.5), (103, 12.5)], ((0, 1), (0, 52)), ((12, 66, 24), (44, 214, 84))),
    ([(71.9, 44.4), (81.9, 26.9), (91.3, 27.3), (108.8, 45.6), (96.3, 43.1)], ((72, 0), (109, 0)), ((14, 84, 30), (36, 190, 70))),
    ([(116.9, 48.8), (127.5, 40), (153.8, 38.5), (136, 43), (150, 46), (148, 52.5), (142.5, 49.4), (130, 48)], ((117, 0), (154, 0)), ((14, 84, 30), (40, 190, 70))),
    ([(86, 57.5), (96, 51), (114, 50), (116, 52.5), (115, 57.5), (104, 54)], ((86, 0), (116, 0)), ((20, 120, 40), (60, 220, 90))),
]
LEAF_OUTLINE = (14, 96, 30)
SQUARES = [(170.5, 80.5), (182.5, 106), (189, 129.5), (185, 151), (173.5, 170.5), (157, 185), (136.5, 194.5), (109.5, 194.5)]
SQUARE_SIDE = 11.0
GOLD = ((252, 228, 12), (226, 160, 6))
GOLD_EDGE = (150, 100, 0)
HIGHLIGHT = (100.0, 66.5, 8.0, 5.6)  # cx, cy, rx, ry
RED = ((226, 137, 140), (176, 49, 63), 50.0, 170.0)  # top colour, bottom colour, y of each
BLUE = ((150, 168, 228), (38, 60, 130), 60.0, 205.0)


def lerp_gradient(width, height, origin, p0, p1, c0, c1):
    """An RGB array (height x width) shading from c0 at p0 to c1 at p1 (pixel coordinates), clamped."""
    ys, xs = np.mgrid[0:height, 0:width]
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    t = ((xs + origin[0] - p0[0]) * dx + (ys + origin[1] - p0[1]) * dy) / (dx * dx + dy * dy)
    t = np.clip(t, 0.0, 1.0)[..., None]
    return (np.array(c0) * (1 - t) + np.array(c1) * t).astype(np.uint8)


def paint(img, mask, p0, p1, c0, c1):
    """Fills `mask` ('L') on `img` with a gradient (only the mask's bounding box is computed)."""
    box = mask.getbbox()
    if not box:
        return
    w, h = box[2] - box[0], box[3] - box[1]
    grad = Image.fromarray(lerp_gradient(w, h, (box[0], box[1]), p0, p1, c0, c1), "RGB")
    img.paste(grad, (box[0], box[1]), mask.crop(box))


def tomato(size, s, k):
    """The tomato scene on a transparent size x size canvas; `s` pixels per original unit, centred on the canvas."""
    ox = size / 2 - s * (BBOX[0] + BBOX[2]) / 2
    oy = size / 2 - s * (BBOX[1] + BBOX[3]) / 2
    S = size * k

    def P(x, y):
        return ((ox + s * x) * k, (oy + s * y) * k)

    def L(v):
        return v * s * k

    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    def mask_of(draw_fn):
        m = Image.new("L", (S, S), 0)
        draw_fn(ImageDraw.Draw(m))
        return m

    def poly(points):
        return mask_of(lambda d: d.polygon([P(*p) for p in points], fill=255))

    def disc(r):
        c = P(CX, CY)
        return mask_of(lambda d: d.ellipse([c[0] - L(r), c[1] - L(r), c[0] + L(r), c[1] + L(r)], fill=255))

    def halfplane(sign):
        # Points on one side of the split line, over the whole canvas.
        nx, ny = 1.0, SPLIT_K
        far = 400.0
        ux, uy = -SPLIT_K, 1.0  # along the line
        norm = math.hypot(ux, uy)
        ux, uy = ux / norm, uy / norm
        px, py = SPLIT_P
        a = (px - ux * far, py - uy * far)
        b = (px + ux * far, py + uy * far)
        c = (b[0] + sign * nx * far, b[1] + sign * ny * far)
        d = (a[0] + sign * nx * far, a[1] + sign * ny * far)
        return poly([a, b, c, d])

    def both(m1, m2):
        out = Image.new("L", m1.size, 0)
        out.paste(m1, (0, 0), m2)
        return out

    # Body: outline, then the two halves with their own gradients, then the line between them.
    img.paste(Image.new("RGBA", (S, S), NAVY + (255,)), (0, 0), disc(R_OUT))
    inner = disc(R_IN)
    paint(img, both(inner, halfplane(-1)), P(0, RED[2]), P(0, RED[3]), RED[0], RED[1])
    paint(img, both(inner, halfplane(+1)), P(0, BLUE[2]), P(0, BLUE[3]), BLUE[0], BLUE[1])
    ux, uy = -SPLIT_K, 1.0
    norm = math.hypot(ux, uy)
    ux, uy = ux / norm, uy / norm
    px, py = SPLIT_P
    line = mask_of(lambda d: d.line([P(px - ux * 120, py - uy * 120), P(px + ux * 120, py + uy * 120)], fill=255, width=round(L(3.2))))
    img.paste(Image.new("RGBA", (S, S), NAVY + (255,)), (0, 0), both(line, disc(R_IN + 0.5)))

    # Leaves and calyx over the top of the body.
    for points, (g0, g1), (c0, c1) in LEAVES:
        m = poly(points)
        paint(img, m, P(*g0), P(*g1), c0, c1)
        edge = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(edge).line([P(*p) for p in points + [points[0]]], fill=LEAF_OUTLINE + (255,), width=max(1, round(L(0.8))), joint="curve")
        img.alpha_composite(edge)

    # Highlight.
    hx, hy, rx, ry = HIGHLIGHT
    hm = mask_of(lambda d: d.ellipse([*P(hx - rx, hy - ry), *P(hx + rx, hy + ry)], fill=255))
    paint(img, hm, P(hx - rx, hy - ry), P(hx + rx, hy + ry), (250, 250, 250), (222, 222, 222))

    # The quarter ring of small squares, each turned to follow the ring.
    for (x, y) in SQUARES:
        angle = math.atan2(y - CY, x - CX)
        h = SQUARE_SIDE / 2
        corners = []
        for ex, ey in ((-h, -h), (h, -h), (h, h), (-h, h)):
            corners.append((x + ex * math.cos(angle) - ey * math.sin(angle), y + ex * math.sin(angle) + ey * math.cos(angle)))
        grown = []
        for ex, ey in ((-h - 0.7, -h - 0.7), (h + 0.7, -h - 0.7), (h + 0.7, h + 0.7), (-h - 0.7, h + 0.7)):
            grown.append((x + ex * math.cos(angle) - ey * math.sin(angle), y + ex * math.sin(angle) + ey * math.cos(angle)))
        img.paste(Image.new("RGBA", (S, S), GOLD_EDGE + (255,)), (0, 0), poly(grown))
        paint(img, poly(corners), P(x - h, y - h), P(x + h, y + h), GOLD[0], GOLD[1])

    return img.resize((size, size), Image.LANCZOS) if k > 1 else img


def background(size):
    """The icon's gradient: flat navy on the left quarter, then a linear ramp to the bright blue (as in the original)."""
    left, right = np.array((10, 28, 131)), np.array((32, 130, 224))
    t = np.clip((np.arange(size) / size - 0.25) / (0.98 - 0.25), 0, 1)[None, :, None]
    row = (left * (1 - t) + right * t).astype(np.uint8)
    return Image.fromarray(np.repeat(row, size, axis=0), "RGB")


def splash(color, scale):
    canvas = Image.new("RGB", (2732, 2732), color)
    art = tomato(2732, scale, 2)
    canvas.paste(art, (0, 0), art)
    return canvas


def main():
    OUT.mkdir(exist_ok=True)
    bg = background(1024)

    icon = bg.convert("RGBA")
    icon.alpha_composite(tomato(1024, 3.6, 4))
    icon.convert("RGB").save(OUT / "icon.png")  # no alpha: App Store rejects icons with transparency

    # Adaptive icon: @capacitor/assets insets both layers by 16.7% inside the 108dp layer, so each image is exactly
    # what the launcher can show (a circle/squircle): the tomato must sit inside the inscribed circle, which it does.
    tomato(1024, 3.75, 4).save(OUT / "icon-foreground.png")
    bg.save(OUT / "icon-background.png")

    splash((0xFF, 0xF8, 0xF0), 4.0).save(OUT / "splash.png")
    splash((0x28, 0x2A, 0x36), 4.0).save(OUT / "splash-dark.png")
    print(f"Wrote {OUT}/icon.png, icon-foreground.png, icon-background.png, splash.png, splash-dark.png")


if __name__ == "__main__":
    main()
