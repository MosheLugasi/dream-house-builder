"""Halve a Radiance .hdr (RGBE, new-style RLE) by 2x2 box filtering in linear float. usage: python3 -I hdr_half.py in.hdr out.hdr"""
import sys
import numpy as np


def read_hdr(path):
    data = open(path, 'rb').read()
    pos = 0
    while True:
        end = data.index(b'\n', pos)
        line = data[pos:end]
        pos = end + 1
        if line.startswith(b'-Y') or line.startswith(b'+Y'):
            parts = line.split()
            h, w = int(parts[1]), int(parts[3])
            break
    img = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        if data[pos] == 2 and data[pos + 1] == 2:
            pos += 4
            for c in range(4):
                x = 0
                row = img[y, :, c]
                while x < w:
                    n = data[pos]
                    pos += 1
                    if n > 128:
                        n -= 128
                        row[x:x + n] = data[pos]
                        pos += 1
                    else:
                        row[x:x + n] = np.frombuffer(data, np.uint8, n, pos)
                        pos += n
                    x += n
        else:
            img[y] = np.frombuffer(data, np.uint8, w * 4, pos).reshape(w, 4)
            pos += w * 4
    e = img[..., 3].astype(np.int32)
    f = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0)
    return img[..., :3].astype(np.float64) * f[..., None]


def write_hdr(path, rgb):
    h, w, _ = rgb.shape
    m = rgb.max(axis=2)
    mant, ex = np.frexp(m)
    scale = np.where(m > 1e-32, mant * 256.0 / np.maximum(m, 1e-32), 0)
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = np.clip(rgb * scale[..., None], 0, 255).astype(np.uint8)
    out[..., 3] = np.where(m > 1e-32, ex + 128, 0).astype(np.uint8)
    with open(path, 'wb') as fh:
        fh.write(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n')
        fh.write(f'-Y {h} +X {w}\n'.encode())
        for y in range(h):
            fh.write(bytes([2, 2, w >> 8, w & 255]))
            for c in range(4):
                row = out[y, :, c]
                x = 0
                buf = bytearray()
                while x < w:
                    # run?
                    r = 1
                    while x + r < w and r < 127 and row[x + r] == row[x]:
                        r += 1
                    if r >= 4:
                        buf += bytes([128 + r, row[x]])
                        x += r
                        continue
                    s = x
                    while x < w and x - s < 128:
                        r = 1
                        while x + r < w and r < 4 and row[x + r] == row[x]:
                            r += 1
                        if r >= 4:
                            break
                        x += 1
                    buf += bytes([x - s]) + bytes(row[s:x])
                fh.write(buf)


img = read_hdr(sys.argv[1])
h, w, _ = img.shape
half = img.reshape(h // 2, 2, w // 2, 2, 3).mean(axis=(1, 3))
write_hdr(sys.argv[2], half)
print(sys.argv[2], half.shape, float(half.max()))
