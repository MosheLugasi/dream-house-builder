"""Neutral (grey, mean-normalised) detail maps for the catalog material factory: colour is supplied by the material."""
import sys, os
from PIL import Image, ImageOps, ImageEnhance
MAV, OUT = sys.argv[1] + '/mav/package/Textures', sys.argv[2]
SETS = {  # name: (source dir/prefix, size, target mean (sRGB 0..255), contrast)
    'wood': ('ambientCG/Wood048/Wood048', 1024, 224, 0.6),
    'fabric': ('ambientCG/Fabric019/Fabric019', 512, 226, 1.6),
    'marble': ('ambientCG/Marble012/Marble012', 1024, 236, 1.0),
}
for name, (src, n, mean_t, contrast) in SETS.items():
    out = f'{OUT}/{name}'; os.makedirs(out, exist_ok=True)
    g = ImageOps.grayscale(Image.open(f'{MAV}/{src}_1K-JPG_Color.jpg')).resize((n, n), Image.LANCZOS)
    g = ImageEnhance.Contrast(g).enhance(contrast)
    mean = sum(i * c for i, c in enumerate(g.histogram())) / (n * n)
    g = g.point(lambda v: min(255, int(v * mean_t / mean)))
    g.save(f'{out}/color.webp', 'WEBP', quality=84, method=6)
    Image.open(f'{MAV}/{src}_1K-JPG_NormalGL.jpg').convert('RGB').resize((n, n), Image.LANCZOS).save(f'{out}/normal.webp', 'WEBP', quality=88, method=6)
    print(name, sum(os.path.getsize(f'{out}/{f}') for f in os.listdir(out)) // 1024, 'KB')
