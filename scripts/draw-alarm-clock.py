#!/usr/bin/env python3
"""Draws the twin-bell alarm clock of the ringing-alarm modal.

Writes two 512x512 transparent PNGs to public/alarm/: the clock without its hammer, and the hammer alone, on the
same canvas, so that stacking them gives the full clock. The modal animates the hammer on its own.

    python3 scripts/draw-alarm-clock.py

Needs Pillow. Everything is drawn at 4x and downsampled with LANCZOS for clean edges.
"""
import math
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

SIZE = 512
K = 4  # supersampling factor

RED = (0xD9, 0x48, 0x2B, 255)
RED_SHADE = (0xB0, 0x35, 0x1C, 255)
CREAM = (0xFB, 0xF4, 0xE6, 255)
INK = (0x2B, 0x26, 0x22, 255)
LINE = 14  # outline thickness at 512

CX, CY = 256, 308  # clock body centre
BODY_R = 154
FACE_R = 116
BELL_R = 76
BELL_ANGLE = 32  # degrees from vertical
BELL_DIST = BODY_R - 12  # bell dome centre, from the body centre
PIVOT = (256, CY - BODY_R + 2)  # where the hammer is hinged
HAMMER_LEN = 70
HAMMER_BALL = 18


def s(v):
    return v * K


def canvas():
    return Image.new("RGBA", (s(SIZE), s(SIZE)), (0, 0, 0, 0))


def circle(d, cx, cy, r, fill):
    d.ellipse([s(cx - r), s(cy - r), s(cx + r), s(cy + r)], fill=fill)


def line(d, p, q, w, fill):
    """A line with round caps."""
    d.line([s(p[0]), s(p[1]), s(q[0]), s(q[1])], fill=fill, width=s(w))
    for x, y in (p, q):
        circle(d, x, y, w / 2, fill)


def polar(cx, cy, r, deg):
    """deg 0 = 12 o'clock, clockwise."""
    a = math.radians(deg)
    return cx + r * math.sin(a), cy - r * math.cos(a)


def dome_mask(cx, cy, r, facing_deg):
    """A half disc of radius r whose round side faces `facing_deg` (0 = up, clockwise)."""
    m = Image.new("L", (s(SIZE), s(SIZE)), 0)
    d = ImageDraw.Draw(m)
    phi = facing_deg - 90  # PIL measures angles clockwise from 3 o'clock
    d.pieslice([s(cx - r), s(cy - r), s(cx + r), s(cy + r)], phi - 90, phi + 90, fill=255)
    return m


def paint(img, mask, colour):
    img.paste(Image.new("RGBA", img.size, colour), (0, 0), mask)


def draw_bell(img, side):
    facing = side * BELL_ANGLE
    cx, cy = polar(CX, CY, BELL_DIST, facing)
    outer = dome_mask(cx, cy, BELL_R + LINE / 2, facing)
    inner = dome_mask(cx, cy, BELL_R - LINE / 2, facing)
    paint(img, outer, INK)
    paint(img, inner, RED)
    # A slight shade on the lower, outer side: the dome minus itself nudged toward the light (up and inward).
    off = s(9)
    nudged = ImageChops.offset(inner, -side * off, -off)
    paint(img, ImageChops.subtract(inner, nudged), RED_SHADE)


def clock_layer():
    img = canvas()
    d = ImageDraw.Draw(img)

    # Handle: an arc joining the tops of the two bells.
    bx, by = polar(CX, CY, BELL_DIST, BELL_ANGLE)
    hx = bx + BELL_R * math.sin(math.radians(BELL_ANGLE)) - CX  # half width, at the bells' poles
    hy = by - BELL_R * math.cos(math.radians(BELL_ANGLE))
    rise = 82
    d.arc([s(CX - hx), s(hy - rise), s(CX + hx), s(hy + rise)], 180, 360, fill=INK, width=s(LINE))
    for x in (CX - hx, CX + hx):
        circle(d, x, hy, LINE / 2, INK)

    # Legs.
    for side in (-1, 1):
        a = polar(CX, CY, BODY_R - 14, side * 152)
        b = (CX + side * 104, CY + BODY_R + 34)
        line(d, a, b, 24, INK)
        circle(d, b[0], b[1], 15, INK)

    for side in (-1, 1):
        draw_bell(img, side)
    d = ImageDraw.Draw(img)

    # Body, face.
    circle(d, CX, CY, BODY_R + LINE / 2, INK)
    circle(d, CX, CY, BODY_R - LINE / 2, RED)
    circle(d, CX, CY, FACE_R + LINE / 2, INK)
    circle(d, CX, CY, FACE_R - LINE / 2, CREAM)

    # Ticks: thicker and longer at 12/3/6/9.
    for i in range(12):
        major = i % 3 == 0
        a = polar(CX, CY, FACE_R - LINE / 2 - (30 if major else 22), i * 30)
        b = polar(CX, CY, FACE_R - LINE / 2 - 8, i * 30)
        line(d, a, b, 10 if major else 5, INK)

    # Hands at about 10:10, and the centre pin.
    line(d, (CX, CY), polar(CX, CY, 56, 305), 12, INK)
    line(d, (CX, CY), polar(CX, CY, 80, 60), 10, INK)
    circle(d, CX, CY, 13, INK)
    circle(d, CX, CY, 5, CREAM)
    return img


def hammer_layer():
    img = canvas()
    d = ImageDraw.Draw(img)
    tip = (PIVOT[0], PIVOT[1] - HAMMER_LEN)
    line(d, PIVOT, tip, 12, INK)
    circle(d, tip[0], tip[1], HAMMER_BALL, INK)
    circle(d, tip[0], tip[1], HAMMER_BALL - LINE / 2 + 2, RED)
    circle(d, PIVOT[0], PIVOT[1], 13, INK)
    circle(d, PIVOT[0], PIVOT[1], 5, CREAM)
    return img


def save(img, path):
    out = img.resize((SIZE, SIZE), Image.LANCZOS)
    # A flat palette keeps the file small; FASTOCTREE is the quantizer that keeps the alpha channel.
    out = out.quantize(colors=48, method=Image.Quantize.FASTOCTREE)
    out.save(path, optimize=True)
    print(f"{path} {path.stat().st_size / 1024:.1f} kB")


def main():
    root = Path(__file__).resolve().parent.parent / "public" / "alarm"
    root.mkdir(parents=True, exist_ok=True)
    save(clock_layer(), root / "alarm-clock.png")
    save(hammer_layer(), root / "alarm-clock-hammer.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())
