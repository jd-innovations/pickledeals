"""Builds the PickleDeals PD logo as clean vector SVG (owner-approved rebuild, Oct 8, 2026).

The layout is measured from the owner's PNG (pd-logo-white.png, 2009x535): a frame, a divider, "PD"
on the left and "PICKLE / DEALS" stacked on the right, each letter centred where the original's is. Letters are Montserrat (SIL Open Font License,
OFL.txt) converted to outlines, so the SVG has no font dependency: PICKLE/DEALS at weight 900, PD at
830 (matching the original's lighter monogram strokes), scaled to the original cap heights.

Usage: python build_logo_svg.py <path to Montserrat variable TTF>
Writes pd-logo-{black,white}.svg and pd-monogram-{black,white}.svg next to this file.
"""
import os
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 2009, 535
FRAME = (5, 5, 2003, 529)  # outer box (x0, y0, x1, y1)
STROKE = 34
RADIUS = 4
DIVIDER_X = 834.5  # left edge of the divider; same width as the frame stroke

# (text, weight, cap top, baseline, [(ink left, ink right) per letter]) measured from the original.
# Each letter is centred on its measured span, so spacing matches the original exactly.
LINES = [
    ('PD', 830, 88, 462, [(83, 420), (440, 800)]),
    ('PICKLE', 900, 74, 264, [(912, 1093), (1113, 1177), (1197, 1391), (1408, 1601), (1613, 1753), (1772, 1924)]),
    ('DEALS', 900, 284, 470, [(912, 1112), (1131, 1281), (1293, 1518), (1537, 1681), (1694, 1884)]),
]


def font_at(vf_path, wght):
    return instancer.instantiateVariableFont(TTFont(vf_path), {'wght': wght})


def line_paths(font, text, top, base, spans):
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()

    def bounds(n):
        p = BoundsPen(gs)
        gs[n].draw(p)
        return p.bounds

    hb = bounds(cmap[ord('H')])
    s = (base - top) / (hb[3] - hb[1])  # cap height -> scale
    paths = []
    for ch, (left, right) in zip(text, spans):
        n = cmap[ord(ch)]
        gb = bounds(n)
        # centre the glyph's ink on the original letter's span
        ox = (left + right) / 2 - s * (gb[0] + gb[2]) / 2
        pen = SVGPathPen(gs, ntos=lambda v: f'{v:.2f}'.rstrip('0').rstrip('.'))
        gs[n].draw(TransformPen(pen, (s, 0, 0, -s, ox, base)))
        paths.append(pen.getCommands())
    return paths


def frame_path():
    x0, y0, x1, y1 = FRAME
    r = RADIUS
    outer = (f'M{x0 + r},{y0}H{x1 - r}A{r},{r} 0 0 1 {x1},{y0 + r}V{y1 - r}A{r},{r} 0 0 1 {x1 - r},{y1}'
             f'H{x0 + r}A{r},{r} 0 0 1 {x0},{y1 - r}V{y0 + r}A{r},{r} 0 0 1 {x0 + r},{y0}Z')
    ix0, iy0, ix1, iy1 = x0 + STROKE, y0 + STROKE, x1 - STROKE, y1 - STROKE
    inner = f'M{ix0},{iy0}V{iy1}H{ix1}V{iy0}Z'  # opposite winding: a hole
    divider = f'M{DIVIDER_X},{iy0}H{DIVIDER_X + STROKE}V{iy1}H{DIVIDER_X}Z'
    return outer + inner + divider


def svg(width, height, view, d_list, fill, title):
    body = ''.join(f'<path d="{d}"/>' for d in d_list)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" width="{width}" height="{height}" '
            f'role="img" aria-label="{title}"><title>{title}</title><g fill="{fill}">{body}</g></svg>\n')


def main(vf_path):
    fonts = {w: font_at(vf_path, w) for w in {l[1] for l in LINES}}
    letters = {text: line_paths(fonts[wt], text, t, b, spans) for text, wt, t, b, spans in LINES}
    frame = frame_path()
    full = [frame] + letters['PD'] + letters['PICKLE'] + letters['DEALS']
    # Monogram: the left box only (frame left part up to and including the divider).
    x0, y0, x1, y1 = FRAME
    mx1 = DIVIDER_X + STROKE
    r = RADIUS
    mono_frame = (f'M{x0 + r},{y0}H{mx1}V{y1}H{x0 + r}A{r},{r} 0 0 1 {x0},{y1 - r}V{y0 + r}A{r},{r} 0 0 1 {x0 + r},{y0}Z'
                  f'M{x0 + STROKE},{y0 + STROKE}V{y1 - STROKE}H{DIVIDER_X}V{y0 + STROKE}Z')
    mono = [mono_frame] + letters['PD']
    for name, color in (('black', '#0A0A0A'), ('white', '#FFFFFF')):
        open(os.path.join(HERE, f'pd-logo-{name}.svg'), 'w', encoding='utf-8').write(
            svg(W, H, f'0 0 {W} {H}', full, color, 'PickleDeals'))
        open(os.path.join(HERE, f'pd-monogram-{name}.svg'), 'w', encoding='utf-8').write(
            svg(int(mx1 + x0), H, f'0 0 {mx1 + x0:g} {H}', mono, color, 'PickleDeals'))
    print('written')


if __name__ == '__main__':
    main(sys.argv[1])
