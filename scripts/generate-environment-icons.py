"""Regenerate environment SVG/PNG/ICO assets using CairoSVG and Pillow."""
from pathlib import Path
import cairosvg
from PIL import Image
from io import BytesIO

def render(svg, size, path):
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=size, output_height=size)
    if path.suffix == ".ico":
        Image.open(BytesIO(png)).save(path, sizes=[(size, size)])
    else:
        path.write_bytes(png)

root = Path(__file__).resolve().parent.parent
base = (root / 'public/favicon.svg').read_text()
letters = {
    'staging': 'M104 20H96C89 20 89 29 96 29H100C107 29 107 38 100 38H92',
    'preview': 'M93 39V20H100C110 20 110 30 100 30H93',
}
for env, color, background in [('staging', '#2563eb', '#eff6ff'), ('preview', '#7c3aed', '#f5f3ff')]:
    directory = root / 'public' / 'environments' / env
    (directory / 'icons').mkdir(parents=True, exist_ok=True)
    for dark in [False, True]:
        svg = base.replace('#fffbf5', '#1f2937' if dark else background).replace('#1f2937"\n', '#ffffff"\n' if dark else color + '"\n')
        svg = svg.replace('<circle cx="101" cy="38" r="10" fill="#f59e0b" />', f'<circle cx="100" cy="30" r="18" fill="{color}" />\n  <path d="{letters[env]}" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />')
        suffix = '-dark' if dark else ''
        (directory / f'favicon{suffix}.svg').write_text(svg)
        render(svg, 32, directory / f"favicon{suffix}.ico")
        square = svg.replace('rx="26"', 'rx="0"')
        for size, path in [(180, f'apple-touch-icon{suffix}.png'), (192, f'icons/icon{suffix}-192.png'), (512, f'icons/icon{suffix}-512.png')]:
            render(square, size, directory / path)
        # Keep both the R and environment badge inside the maskable safe circle.
        masked = square.replace('  <path', '  <g transform="translate(64 64) scale(.7) translate(-64 -64)">\n  <path', 1).replace('</svg>', '</g></svg>')
        render(masked, 512, directory / f"icons/icon-maskable{suffix}-512.png")
