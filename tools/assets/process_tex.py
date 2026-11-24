"""Convert downloaded CC0 PBR sets into the game's layout: public/assets/textures/<name>/{color,normal,rough}.webp
color 1024 (AO baked in lightly, optional mean-brightness normalisation), normal 1024, roughness 512 grey.
usage: python3 -I process_tex.py <dl_root> <out_root>
"""
import sys, os
from PIL import Image, ImageOps, ImageChops, ImageEnhance

DL, OUT = sys.argv[1], sys.argv[2]
MAV = DL + '/mav/package/Textures'
PC = DL + '/pc/tex'

def ph(name):  # Poly Haven set in the mavrodiev package
    d = f'{MAV}/PolyHaven/{name}/{name}'
    return {'color': f'{d}_diff_1k.jpg', 'normal': f'{d}_nor_gl_1k.jpg',
            'ms': f'{MAV}/PolyHaven/{name}/{name}_MetallicSmoothness.png', 'mask': f'{d}_mask_1k.png', 'ao': f'{d}_ao_1k.jpg'}

def acg(name):
    d = f'{MAV}/ambientCG/{name}/{name}'
    return {'color': f'{d}_1K-JPG_Color.jpg', 'normal': f'{d}_1K-JPG_NormalGL.jpg',
            'ms': f'{MAV}/ambientCG/{name}/{name}_MetallicSmoothness.png', 'ao': f'{d}_1K-JPG_AmbientOcclusion.jpg'}

def pc(name):
    return {'color': f'{PC}/{name}_color.webp', 'normal': f'{PC}/{name}_normal.webp', 'rough': f'{PC}/{name}_rough.webp'}

# name -> (source, options)
SETS = {
    'asphalt': (ph('clean_asphalt'), {}),
    'grass': (ph('leafy_grass'), {'grade': ((88, 128, 52), 0.8)}),
    'sand': (ph('coast_sand_01'), {}),
    'gravel': (ph('rocky_trail'), {}),
    'sandstone-blocks': (pc('pyramid'), {'match': (222, 206, 172)}),
    'paving-stones': (acg('PavingStones038'), {}),
    'brick-red': (acg('Bricks051'), {}),
    'brick-white': (acg('Bricks060'), {}),
    'plaster': (ph('plaster_grey_04'), {'neutral': 0.86}),
    'marble': (acg('Marble012'), {}),
    'floor-tiles-large': (ph('large_floor_tiles_02'), {}),
    'floor-tiles-terracotta': (ph('floor_tiles_08'), {}),
    'parquet': (ph('rectangular_parquet'), {}),
}
ONLY = set(sys.argv[3:])

def exists(p):
    return p and os.path.exists(p)

for name, (src, o) in SETS.items():
    if ONLY and name not in ONLY:
        continue
    out = f'{OUT}/{name}'
    os.makedirs(out, exist_ok=True)
    col = Image.open(src['color']).convert('RGB').resize((1024, 1024), Image.LANCZOS)
    # ambient occlusion: bake a gentle version into the albedo
    ao = None
    if exists(src.get('ao')):
        ao = Image.open(src['ao']).convert('L')
    elif exists(src.get('mask')):
        ao = Image.open(src['mask']).split()[1]
    if ao is not None:
        ao = ao.resize((1024, 1024)).point(lambda v: int(255 * (0.55 + 0.45 * (v / 255.0))))
        col = ImageChops.multiply(col, Image.merge('RGB', (ao, ao, ao)))
    if 'sat' in o:
        col = ImageEnhance.Color(col).enhance(o['sat'])
    if 'match' in o:
        # scale each channel so the mean colour equals the target (keeps the photographic detail)
        st = [sum(i * c for i, c in enumerate(ch.histogram())) / (1024 * 1024) for ch in col.split()]
        col = Image.merge('RGB', [ch.point(lambda v, k=o['match'][i] / max(st[i], 1): min(255, int(v * k))) for i, ch in enumerate(col.split())])
    if 'grade' in o:
        # lawn: luminance detail of the photo carried by the target colour, blended with the original hues
        (tr, tg, tb), amt = o['grade']
        g = ImageOps.grayscale(col)
        mean = sum(i * c for i, c in enumerate(g.histogram())) / (1024 * 1024)
        tinted = Image.merge('RGB', [g.point(lambda v, t=t: min(255, int(v * t / mean))) for t in (tr, tg, tb)])
        col = Image.blend(col, tinted, amt)
    if 'neutral' in o:
        # neutral bright albedo: the material colour tints it (one texture for several finishes)
        g = ImageOps.grayscale(col)
        mean = sum(i * c for i, c in enumerate(g.histogram())) / (1024 * 1024) / 255.0
        k = o['neutral'] / max(mean, 1e-3)
        col = Image.merge('RGB', (g, g, g)).point(lambda v: min(255, int(v * k)))
    col.save(f'{out}/color.webp', 'WEBP', quality=82, method=6)
    nrm = Image.open(src['normal']).convert('RGB').resize((1024, 1024), Image.LANCZOS)
    nrm.save(f'{out}/normal.webp', 'WEBP', quality=88, method=6)
    if exists(src.get('rough')):
        r = Image.open(src['rough']).convert('L')
    elif exists(src.get('ms')):
        r = ImageOps.invert(Image.open(src['ms']).split()[3])
    else:
        r = ImageOps.invert(Image.open(src['mask']).split()[3])
    r = r.resize((512, 512), Image.LANCZOS)
    r.save(f'{out}/rough.webp', 'WEBP', quality=85, method=6)
    sz = sum(os.path.getsize(f'{out}/{f}') for f in os.listdir(out))
    print(f'{name}: {sz // 1024} KB')
