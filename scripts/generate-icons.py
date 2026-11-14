from pathlib import Path
import struct
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
NAVY = '#102E3B'
TEAL = '#37CBB4'
WHITE = '#FFFFFF'
GOLD = '#F5C56B'
SCALE = 4
SIZE = 512
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)


def cubic(a, b, c, d):
    points = []
    for step in range(1, 65):
        t = step / 64
        u = 1 - t
        points.append((u**3*a[0] + 3*u*u*t*b[0] + 3*u*t*t*c[0] + t**3*d[0],
                       u**3*a[1] + 3*u*u*t*b[1] + 3*u*t*t*c[1] + t**3*d[1]))
    return points


def flatten(commands):
    points = []
    current = (0, 0)
    for command in commands:
        if command[0] in ('M', 'L'):
            current = (command[1], command[2])
            points.append(current)
        elif command[0] == 'C':
            end = (command[5], command[6])
            points.extend(cubic(current, (command[1], command[2]),
                                (command[3], command[4]), end))
            current = end
    return points


def path_data(commands):
    return ' '.join(command[0] + ' '.join(str(value) for value in command[1:])
                    for command in commands)


def scaled(values):
    return tuple(round(value * SCALE) for value in values)


def build():
    canvas = Image.new('RGBA', (SIZE * SCALE, SIZE * SCALE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">']

    def rounded_rect(x, y, width, height, radius, fill):
        draw.rounded_rectangle(scaled((x, y, x + width, y + height)),
                               radius=round(radius * SCALE), fill=fill)
        svg.append(f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="{radius}" fill="{fill}"/>')

    def circle(x, y, radius, fill):
        draw.ellipse(scaled((x - radius, y - radius, x + radius, y + radius)), fill=fill)
        svg.append(f'<circle cx="{x}" cy="{y}" r="{radius}" fill="{fill}"/>')

    def path(commands, color, stroke_width=0):
        points = flatten(commands)
        coordinates = [scaled(point) for point in points]
        data = path_data(commands)
        if stroke_width:
            draw.line(coordinates, fill=color, width=round(stroke_width * SCALE), joint='curve')
            radius = stroke_width / 2
            for x, y in (points[0], points[-1]):
                draw.ellipse(scaled((x - radius, y - radius, x + radius, y + radius)), fill=color)
            svg.append(f'<path d="{data}" fill="none" stroke="{color}" stroke-width="{stroke_width}" stroke-linecap="round" stroke-linejoin="round"/>')
        else:
            draw.polygon(coordinates, fill=color)
            svg.append(f'<path d="{data} Z" fill="{color}"/>')

    rounded_rect(16, 16, 480, 480, 108, NAVY)
    rounded_rect(96, 108, 320, 256, 40, WHITE)
    rounded_rect(120, 132, 272, 208, 16, NAVY)
    circle(334, 190, 25, GOLD)
    path([('M', 144, 282), ('L', 213, 211), ('L', 285, 282),
          ('C', 310, 267, 339, 267, 368, 283), ('L', 368, 313),
          ('C', 340, 295, 315, 295, 288, 311),
          ('C', 261, 328, 236, 328, 209, 311),
          ('C', 186, 297, 166, 297, 144, 308)], TEAL)
    path([('M', 144, 398), ('C', 181, 377, 213, 377, 250, 398),
          ('C', 286, 419, 324, 419, 368, 394)], TEAL, 24)
    svg.append('</svg>')
    image = canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    svg_text = '\n'.join(svg) + '\n'
    ET.fromstring(svg_text)
    paths = {
        'svg': ROOT / 'web/assets/photoharbor.svg',
        'native_svg': ROOT / 'src-tauri/icons/icon.svg',
        'png': ROOT / 'src-tauri/icons/icon.png',
        'ico': ROOT / 'src-tauri/icons/icon.ico',
        'preview': ROOT / 'artifacts/photoharbor-logo.png',
    }
    for output in paths.values():
        output.parent.mkdir(parents=True, exist_ok=True)
    paths['svg'].write_text(svg_text, encoding='utf-8')
    paths['native_svg'].write_text(svg_text, encoding='utf-8')
    image.save(paths['png'], format='PNG', optimize=True)
    image.save(paths['preview'], format='PNG', optimize=True)
    image.save(paths['ico'], format='ICO', sizes=[(size, size) for size in ICO_SIZES])
    for key in ('png', 'preview'):
        with Image.open(paths[key]) as check:
            check.load()
            assert check.size == (512, 512) and check.mode == 'RGBA'
            assert check.format == 'PNG'
            print(f'{paths[key].relative_to(ROOT)}: {check.format} {check.size} {check.mode}')
    with Image.open(paths['ico']) as check:
        expected = {(size, size) for size in ICO_SIZES}
        assert check.format == 'ICO' and check.ico.sizes() == expected
        for size in sorted(expected):
            frame = check.ico.getimage(size)
            frame.load()
            assert frame.size == size and frame.mode == 'RGBA'
        print(f'{paths["ico"].relative_to(ROOT)}: ICO {sorted(check.ico.sizes())}')
    header = paths['ico'].read_bytes()[:6]
    assert struct.unpack('<HHH', header) == (0, 1, len(ICO_SIZES))
    assert paths['svg'].read_bytes() == paths['native_svg'].read_bytes()
    print('SVG copies match and ICO directory contains seven verified frames')


if __name__ == '__main__':
    build()
