"""Build the Trialist logo SVGs: the wordmark is Geist SemiBold, shaped with HarfBuzz and outlined to paths."""
import sys
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

FONT, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

INK, TEAL, WHITE = "#0E1A2F", "#0F9D84", "#FFFFFF"
WEIGHT, TRACKING = 600, -20  # font units, em = 1000
WORD = "trialist"

# Pin, in its own 0..60 x 0..74 box: round head, point at the bottom, check inside.
PIN = "M30 0C13.4 0 0 13 0 29.6 0 50.5 30 74 30 74S60 50.5 60 29.6C60 13 46.6 0 30 0Z"
CHECK = "M17 30.5 27 40.5 44 21.5"
PIN_W, PIN_H = 60, 74


def instance_font():
    font = TTFont(FONT)
    static = instantiateVariableFont(font, {"wght": WEIGHT})
    static.flavor = None  # HarfBuzz reads plain TrueType, not WOFF2
    tmp = OUT.parent / "_geist-600.ttf"
    static.save(tmp)
    return TTFont(tmp), tmp


def wordmark_path(font, font_path):
    """Return (svg path d, advance width, ascender of 'l') in font units, baseline at y=0, y down."""
    blob = hb.Blob.from_file_path(str(font_path))
    hbfont = hb.Font(hb.Face(blob))
    buf = hb.Buffer()
    buf.add_str(WORD)
    buf.guess_segment_properties()
    hb.shape(hbfont, buf, {"kern": True, "liga": False})
    glyphset = font.getGlyphSet()
    order = font.getGlyphOrder()
    pen = SVGPathPen(glyphset)
    x = 0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = order[info.codepoint]
        # Flip y so the path is in SVG coordinates.
        glyphset[name].draw(TransformPen(pen, (1, 0, 0, -1, x + pos.x_offset, -pos.y_offset)))
        x += pos.x_advance + TRACKING
    x -= TRACKING
    l_glyph = font["glyf"][font.getBestCmap()[ord("l")]]
    return pen.getCommands(), x, l_glyph.yMax


def mark_svg(pin_fill, check, pad=0):
    w, h = PIN_W + 2 * pad, PIN_H + 2 * pad
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-pad} {-pad} {w} {h}" width="{w * 4}" height="{h * 4}">'
        f'<path d="{PIN}" fill="{pin_fill}"/>'
        f'<path d="{CHECK}" fill="none" stroke="{check}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'
        "</svg>\n"
    )


def lockup_svg(d, adv, asc, text_fill, pin_fill, check):
    # Pin height is 1.5x the height of the 'l'; the pin's head centres on the middle of the letters.
    s = asc * 1.5 / PIN_H
    gap = asc * 0.42
    pin_w, pin_h = PIN_W * s, PIN_H * s
    pin_top = -asc / 2 - (PIN_W * s) / 2  # head (a circle of diameter PIN_W) centred on the letters
    pad = asc * 0.1
    top = min(pin_top, -asc) - pad
    bottom = max(pin_top + pin_h, 0) + pad
    left, right = -pad, pin_w + gap + adv + pad
    w, h = right - left, bottom - top
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{left:.1f} {top:.1f} {w:.1f} {h:.1f}" '
        f'width="{w / h * 120:.0f}" height="120">'
        f'<g transform="translate(0 {pin_top:.1f}) scale({s:.4f})">'
        f'<path d="{PIN}" fill="{pin_fill}"/>'
        f'<path d="{CHECK}" fill="none" stroke="{check}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></g>'
        f'<path transform="translate({pin_w + gap:.1f} 0)" d="{d}" fill="{text_fill}"/>'
        "</svg>\n"
    )


def favicon_svg():
    # Pin on a rounded ink square reads at 16px better than a bare pin.
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        f'<rect width="64" height="64" rx="14" fill="{INK}"/>'
        f'<g transform="translate(15.5 11.6) scale(0.55)"><path d="{PIN}" fill="{WHITE}"/>'
        f'<path d="{CHECK}" fill="none" stroke="{TEAL}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></g>'
        "</svg>\n"
    )


font, font_path = instance_font()
d, adv, asc = wordmark_path(font, font_path)
files = {
    "trialist-logo.svg": lockup_svg(d, adv, asc, INK, INK, TEAL),
    "trialist-logo-white.svg": lockup_svg(d, adv, asc, WHITE, WHITE, TEAL),
    "trialist-mark.svg": mark_svg(INK, TEAL, pad=2),
    "trialist-mark-white.svg": mark_svg(WHITE, TEAL, pad=2),
    "favicon.svg": favicon_svg(),
}
for name, svg in files.items():
    (OUT / name).write_text(svg)
font_path.unlink()
print("wrote", ", ".join(files))
