#!/usr/bin/env python3
"""
Regenerate the amber theme's override block in index.html.

Amber is the dark theme with the blue taken out of the grey and the mint
turned to gold. That means restating a few hundred Tailwind classes, and
Tailwind is unforgiving about two things:

  * `dark:bg-gray-800` is its OWN class (`.dark\\:bg-gray-800:is(.dark *)`),
    not the class `bg-gray-800`; and every opacity variant
    (`dark:bg-gray-700/50`) is another class again.
  * an element usually carries BOTH the light utility and the dark: one, and
    Tailwind counts on the dark: rule being more specific. Ours are equally
    specific, so the dark: group has to come LAST.

Writing that by hand misses classes. This scans the source for the ones that
are actually used and writes a rule for each.

    python3 scripts/gen-amber-theme.py
"""
import re, io, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = list(ROOT.glob('components/*.tsx')) + [ROOT / 'App.tsx']

# ── The palette ──────────────────────────────────────────────────────────
# Surfaces: Tailwind's grey is blue-tinted; these are the neutral equivalents
# at the same lightness.
SURFACE = {
    'gray-900': '#0D0E10', 'gray-800': '#16181A', 'gray-700': '#1D2023',
    'gray-600': '#2A2D31', 'gray-500': '#3F444C', 'gray-400': '#555B62',
    'slate-950': '#08090A', 'gray-950': '#08090A',
    'slate-900': '#0D0E10', 'slate-800': '#16181A', 'slate-700': '#1D2023',
    'slate-600': '#2A2D31', 'slate-500': '#3F444C',
}
# Text keeps its lightness, loses the blue.
TEXT = {
    'slate-50': '#F8FAFB', 'gray-50': '#F8FAFB',
    'slate-100': '#F2F4F6', 'slate-200': '#E7EAED', 'slate-300': '#C9CDD2',
    'slate-400': '#9BA1A8', 'slate-500': '#929AA1', 'slate-600': '#51565C',
    'gray-100': '#F2F4F6', 'gray-200': '#E7EAED', 'gray-300': '#C9CDD2',
    'gray-400': '#9BA1A8', 'gray-500': '#929AA1', 'gray-600': '#51565C',
    'gray-700': '#3B4047', 'gray-800': '#23272C', 'gray-900': '#15181B',
}
# The mint family becomes gold, shade for shade.
#
# The mid shades need TWO values. A 600 is used both as a fill with white on it
# and as text on a 50/100 chip, and one gold cannot do both: bright enough for
# dark ink on the fill is too pale to read as text on cream. So fills brighten
# and text darkens.
MINT_FILL = {
    '50': '#FDF6EA', '100': '#FAEAD0', '200': '#F6D9A8', '300': '#EFC27C', '400': '#E8A33D',
    '500': '#D4881A', '600': '#C07614', '700': '#7A4E10', '800': '#5A3A0C',
    '900': '#3A2609', '950': '#241705',
}
MINT_TEXT = {
    '50': '#FDF6EA', '100': '#FAEAD0', '200': '#F6D9A8', '300': '#EFC27C', '400': '#E8A33D',
    '500': '#B87410', '600': '#8A5209', '700': '#6E4208', '800': '#573305',
    '900': '#3A2609', '950': '#241705',
}
MINT_FAMILIES = ('teal', 'emerald', 'green', 'lime')

PROP = {
    'bg': 'background-color', 'border': 'border-color', 'text': 'color',
    'ring': '--tw-ring-color', 'stroke': 'stroke', 'fill': 'fill',
    'divide': 'border-color', 'decoration': 'text-decoration-color',
    'outline': 'outline-color', 'caret': 'caret-color', 'accent': 'accent-color',
    'shadow': '--tw-shadow-color', 'placeholder': 'color',
    # Gradient stops. Only the COLOUR half is restated; Tailwind's own rule
    # keeps supplying the position and the --tw-gradient-stops plumbing, so a
    # from/to pair still composes correctly.
    'from': '--tw-gradient-from', 'to': '--tw-gradient-to',
}

CLASS_RE = re.compile(
    r'(?<![\w:-])(?:dark:)?(?:(hover|focus|active|group-hover|disabled):)?'
    r'(bg|border|text|ring|stroke|fill|divide|decoration|outline|caret|accent|shadow|placeholder|from|to)-'
    r'(gray|slate|teal|emerald|green|lime)-(\d{2,3})(?:/(\d{1,3}))?'
)

def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def colour(family, shade, prop):
    key = f'{family}-{shade}'
    if family in MINT_FAMILIES:
        return (MINT_TEXT if prop in ('color', 'caret-color') else MINT_FILL).get(shade)
    if prop == 'color' or prop == 'caret-color':
        return TEXT.get(key) or SURFACE.get(key)
    return SURFACE.get(key) or TEXT.get(key)

def main():
    found = set()
    for f in SRC:
        for m in CLASS_RE.finditer(f.read_text(encoding='utf-8')):
            state, kind, family, shade, alpha = m.groups()
            found.add((state or '', kind, family, shade, alpha or ''))

    rules = []
    for state, kind, family, shade, alpha in sorted(found):
        prop = PROP[kind]
        hexv = colour(family, shade, prop)
        if not hexv:
            print(f'  (no mapping) dark:{kind}-{family}-{shade}', file=sys.stderr)
            continue
        if alpha:
            r, g, b = hex_to_rgb(hexv)
            value = f'rgb({r} {g} {b} / {alpha}%)'
        else:
            value = hexv
        if kind in ('from', 'to'):
            value = f'{value} var(--tw-gradient-{kind}-position)'

        # Escape the class exactly as Tailwind writes it.
        base = f'{kind}-{family}-{shade}'
        if alpha:
            base += f'\\/{alpha}'
        state_prefix = f'{state}\\:' if state else ''
        pseudo = {'hover': ':hover', 'focus': ':focus', 'active': ':active',
                  'disabled': ':disabled'}.get(state, '')
        suffix = ' > :not([hidden]) ~ :not([hidden])' if kind == 'divide' else ''
        if kind == 'placeholder':
            suffix = '::placeholder'
        rules.append((f'{state_prefix}{base}{pseudo}{suffix}', f'{prop}: {value}'))

    A = 'html.dark[data-theme="amber"]'
    out = []
    out.append('      /* the plain utilities, for anything carrying them unprefixed */')
    for sel, decl in rules:
        if '\\:' in sel.split('-')[0]:
            pass
        out.append(f'      {A} .{sel} {{ {decl} !important; }}')
    out.append('')
    out.append('      /* white on a gold fill is about 3:1; dark ink on it is about 9:1 */')
    for state, kind, family, shade, alpha in sorted(found):
        if kind != 'bg' or family not in MINT_FAMILIES or int(shade) > 600 or int(shade) < 300:
            continue
        base = f'bg-{family}-{shade}' + (f'\\/{alpha}' if alpha else '')
        out.append(f'      {A} .{base}.text-white,')
        out.append(f'      {A} .dark\\:{base}.text-white {{ color: #1A1206 !important; }}')
    out.append('')
    out.append('      /* the dark: variants — LAST, so they beat the light utility above */')
    for sel, decl in rules:
        out.append(f'      {A} .dark\\:{sel} {{ {decl} !important; }}')
    return '\n'.join(out), len(rules)

if __name__ == '__main__':
    css, n = main()
    print(css)
    print(f'\n/* {n} classes */', file=sys.stderr)
