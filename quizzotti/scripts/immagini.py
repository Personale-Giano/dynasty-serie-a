# -*- coding: utf-8 -*-
"""Quizzotti: icone dell'app e anteprime per WhatsApp/social.

Uso (dalla cartella quizzotti):  python scripts/immagini.py
Serve Pillow (pip install pillow). Rigenera:
  - assets/icons/icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png (180x180)
  - favicon.ico (16, 32, 48) e una copia nella radice del dominio (../favicon.ico)
  - assets/og/<id>.jpg (1200x630) per ogni gioco del registro QZ.GAMES e assets/og/quizzotti.jpg
Il ritratto viene da logo1.png; per le icone grandi si usa lo stesso ritratto
ritagliato da logo2.png, che e' a risoluzione piu' alta.
"""
import io
import os
import re

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, 'assets', 'fonts')
BG = (7, 9, 11)
LED = (255, 182, 39)


def path(*p):
    return os.path.join(ROOT, *p)


def font(name, size, weight=None):
    f = ImageFont.truetype(os.path.join(FONTS, name), size)
    if weight is not None:
        f.set_variation_by_axes([weight, 100])
    return f


def hex2rgb(h):
    h = h.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def games():
    src = open(path('assets', 'qz.js'), encoding='utf-8').read()
    out = []
    for m in re.finditer(r"\{ id: '([a-z]+)', file: '[A-Za-z]+\.html'.*?\}", src):
        row = m.group(0)

        def field(k):
            mm = re.search(k + r": (['\"])((?:\\.|(?!\1).)*)\1", row)
            return mm.group(2).replace("\\'", "'") if mm else ''
        out.append({'id': m.group(1), 'name': field('name'), 'color': field('color'), 'color2': field('color2'),
                    'players': field('players'), 'kind': field('kind'), 'n': len(out) + 1,
                    'cultura': 'Cultura generale' in row})
    return out


# ---------------------------------------------------------------- icone
def portrait(size):
    """Il ritratto tondo: logo1.png per le misure piccole, logo2.png ritagliato per le grandi."""
    if size <= 240:
        im = Image.open(path('logo1.png')).convert('RGBA')
    else:
        big = Image.open(path('logo2.png')).convert('RGBA')
        top = big.crop((0, 0, big.width, int(big.height * 0.76)))
        box = top.getchannel('A').point(lambda a: 255 if a > 40 else 0).getbbox()
        side = max(box[2] - box[0], box[3] - box[1])
        cx, cy = (box[0] + box[2]) // 2, (box[1] + box[3]) // 2
        im = big.crop((cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2))
    return im.resize((size, size), Image.LANCZOS)


def icon(size, pad=0.06, round_bg=False):
    out = Image.new('RGBA', (size, size), BG + (255,))
    if round_bg:
        out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(out)
        d.ellipse((0, 0, size - 1, size - 1), fill=BG + (255,))
    inner = int(size * (1 - 2 * pad))
    p = portrait(inner)
    out.alpha_composite(p, ((size - inner) // 2, (size - inner) // 2))
    return out


def make_icons():
    os.makedirs(path('assets', 'icons'), exist_ok=True)
    icon(192).convert('RGB').save(path('assets', 'icons', 'icon-192.png'), optimize=True)
    icon(512).convert('RGB').save(path('assets', 'icons', 'icon-512.png'), optimize=True)
    # maskable: il ritratto dentro la zona sicura (cerchio dell'80%)
    icon(512, pad=0.14).convert('RGB').save(path('assets', 'icons', 'maskable-512.png'), optimize=True)
    icon(180, pad=0.05).convert('RGB').save(path('assets', 'icons', 'apple-touch-icon.png'), optimize=True)
    ico = icon(48, pad=0, round_bg=True)
    ico.save(path('favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
    ico.save(os.path.join(os.path.dirname(ROOT), 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])


# ---------------------------------------------------------------- anteprime
W, H = 1200, 630


def stadium():
    """Fondo: nero, due coni di luce dei fari e il prato a strisce in basso."""
    im = Image.new('RGB', (W, H), BG)
    light = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(light)
    d.polygon([(150, -40), (230, -40), (620, H), (-260, H)], fill=46)
    d.polygon([(970, -40), (1050, -40), (1460, H), (580, H)], fill=46)
    light = light.filter(ImageFilter.GaussianBlur(40))
    im.paste((255, 250, 225), (0, 0), light)
    d = ImageDraw.Draw(im)
    for i in range(0, W, 120):
        d.rectangle((i, H - 70, i + 59, H), fill=(13, 59, 34))
        d.rectangle((i + 60, H - 70, i + 119, H), fill=(11, 51, 32))
    d.line((0, H - 70, W, H - 70), fill=(80, 105, 90), width=2)
    return im


def fit_lines(text, max_w, max_h, f_name):
    """Il nome su una o due righe, col carattere piu' grande che ci sta."""
    words = text.split()
    best = None
    for size in range(150, 40, -4):
        f = font(f_name, size)
        cands = [[text]]
        for i in range(1, len(words)):
            cands.append([' '.join(words[:i]), ' '.join(words[i:])])
        for lines in cands:
            ws = [f.getbbox(line)[2] for line in lines]
            lh = int(size * 1.02)
            if max(ws) <= max_w and lh * len(lines) <= max_h:
                spread = max(ws) - min(ws)
                if best is None or spread < best[2]:
                    best = (f, lines, spread, lh)
        if best:
            return best[0], best[1], best[3]
    f = font(f_name, 40)
    return f, [text], 42


def led_board(img, box, text, color):
    """Il tabellone: punti LED spenti dappertutto, accesi dove passa il nome, con l'alone."""
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0, y1 - y0
    pitch, dot = 9, 7
    gw, gh = bw // pitch, bh // pitch
    # il nome disegnato su una maschera grande quanto il tabellone
    mask = Image.new('L', (bw, bh), 0)
    md = ImageDraw.Draw(mask)
    f, lines, lh = fit_lines(text.upper(), bw - 80, bh - 50, 'saira-800-latin.woff2')
    total = lh * len(lines)
    y = (bh - total) // 2
    for line in lines:
        bb = f.getbbox(line)
        md.text(((bw - (bb[2] - bb[0])) // 2 - bb[0], y - int(lh * 0.12)), line, font=f, fill=255)
        y += lh
    grid = mask.resize((gw, gh), Image.BOX)
    lit = Image.new('RGB', (bw, bh), (0, 0, 0))
    ld = ImageDraw.Draw(lit)
    off = ((bw - gw * pitch) // 2, (bh - gh * pitch) // 2)
    for gy in range(gh):
        for gx in range(gw):
            v = grid.getpixel((gx, gy))
            cx, cy = off[0] + gx * pitch, off[1] + gy * pitch
            if v > 90:
                ld.ellipse((cx, cy, cx + dot, cy + dot), fill=color)
            else:
                ld.ellipse((cx, cy, cx + dot, cy + dot), fill=(22, 26, 29))
    glow = lit.filter(ImageFilter.GaussianBlur(10))
    panel = Image.new('RGB', (bw, bh), (0, 0, 0))
    panel = Image.blend(panel, glow, 0.55)
    panel = Image.composite(lit, panel, lit.convert('L').point(lambda a: 255 if a > 30 else 0))
    # cornice del tabellone, angoli morbidi
    rmask = Image.new('L', (bw, bh), 0)
    ImageDraw.Draw(rmask).rounded_rectangle((0, 0, bw - 1, bh - 1), radius=18, fill=255)
    img.paste(panel, (x0, y0), rmask)
    ImageDraw.Draw(img).rounded_rectangle(box, radius=18, outline=(54, 65, 74), width=2)


def og_image(title, kicker, foot, color, out):
    img = stadium()
    d = ImageDraw.Draw(img)
    # testata: ritratto, marchio, numero del gioco
    p = portrait(84)
    img.paste(p, (60, 34), p)
    d.text((160, 44), 'QUIZ', font=font('archivo-latin.woff2', 40, 900), fill=(238, 241, 242))
    qw = d.textlength('QUIZ', font=font('archivo-latin.woff2', 40, 900))
    d.text((160 + qw, 44), 'ZOTTI', font=font('archivo-latin.woff2', 40, 900), fill=LED)
    d.text((161, 92), kicker.upper(), font=font('archivo-latin.woff2', 21, 700), fill=(180, 189, 196))
    led_board(img, (60, 150, 1140, 470), title, color)
    # piede: cosa si fa e dove
    ft = font('archivo-latin.woff2', 30, 800)
    d.text((60, 492), foot, font=ft, fill=(238, 241, 242))
    tag = 'Gratis · senza app · senza iscrizioni'
    d.text((60, 532), tag, font=font('saira-700-latin.woff2', 26), fill=LED)
    d.rectangle((0, 0, W, 6), fill=color)
    # JPG tra 60 e 90 KB
    for q in (86, 82, 78, 74, 70, 66, 62, 58):
        buf = io.BytesIO()
        img.save(buf, 'JPEG', quality=q, optimize=True, progressive=True)
        if buf.tell() <= 90 * 1024:
            break
    with open(out, 'wb') as fh:
        fh.write(buf.getvalue())
    return buf.tell()


def make_og():
    os.makedirs(path('assets', 'og'), exist_ok=True)
    for g in games():
        kind = 'Quiz di cultura generale' if g['cultura'] else ('Quiz di calcio' if g['kind'] == 'quiz' else 'Gioco di calcio in compagnia')
        if g['id'] in ('nomicose', 'tuttitv'):
            kind = 'Gioco di calcio con TV e telefoni'
        if g['id'] == 'jeopardynormale':
            kind = 'Quiz di cultura generale a squadre'
        foot = kind + ' · ' + g['players']
        title = g['name']
        if g['id'] == 'giocatoredelgiorno':
            title, foot = 'Calciatore del Giorno', 'Il Wordle del calcio · uno nuovo ogni giorno'
        size = og_image(title, 'Gioco %02d di %d' % (g['n'], len(games())), foot, hex2rgb(g['color']), path('assets', 'og', g['id'] + '.jpg'))
        print('%-20s %5.1f KB' % (g['id'], size / 1024))
    size = og_image('Quizzotti', 'Giochi di calcio online', '%d giochi di calcio e quiz, da soli o in compagnia' % len(games()), LED, path('assets', 'og', 'quizzotti.jpg'))
    print('%-20s %5.1f KB' % ('quizzotti', size / 1024))


if __name__ == '__main__':
    make_icons()
    make_og()
