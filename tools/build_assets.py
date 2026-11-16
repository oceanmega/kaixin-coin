#!/usr/bin/env python3
"""把 Kenney CC0 素材 + 生成的豆豆/场景图 打包成游戏用的图集、背景和音效。
用法: python3 tools/build_assets.py  (需要 /workspace/kenney 下解压好的 Kenney 包、ffmpeg、Pillow、numpy)"""
import json, os, subprocess, numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
K = os.environ.get('KENNEY', '/workspace/kenney')
SP = f'{K}/new-platformer-pack/Sprites'
ART = f'{ROOT}/src-art'
OUT = f'{ROOT}/assets'

def key_out(img, bg, lo=60, hi=130, despill='g'):
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    d = np.sqrt(((a - np.array(bg, np.float32))**2).sum(-1))
    alpha = np.clip((d - lo) / (hi - lo), 0, 1)
    out = a.copy()
    if despill == 'g':
        m = (out[..., 1] > np.maximum(out[..., 0], out[..., 2])) & (alpha < 1)
        out[..., 1][m] = np.maximum(out[..., 0], out[..., 2])[m]
    else:
        m = (alpha < 1)
        mx = np.minimum(out[..., 0], out[..., 2])
        out[..., 0][m] = np.minimum(out[..., 0], out[..., 1] + 40)[m]
        out[..., 2][m] = np.minimum(out[..., 2], out[..., 1] + 40)[m]
    rgba = np.dstack([out, alpha * 255]).clip(0, 255).astype(np.uint8)
    im = Image.fromarray(rgba, 'RGBA')
    return im

def runs(mask1d, gap=6):
    idx = np.where(mask1d)[0]; res = []
    if len(idx) == 0: return res
    s = p = idx[0]
    for i in idx[1:]:
        if i - p > gap: res.append((s, p)); s = i
        p = i
    res.append((s, p)); return res

# ---------- 豆豆序列帧 ----------
sheet = key_out(Image.open(f'{ART}/doudou_sheet.jpg'), (70, 188, 60), 70, 140, 'g')
al = np.asarray(sheet)[..., 3] > 40
cols = runs(al.any(0), 10)
cols = [c for c in cols if c[1] - c[0] > 40]
print('hero frames found', len(cols))
frames = []
for (x0, x1) in cols:
    sub = al[:, x0:x1+1]; rr = runs(sub.any(1), 10); rr = max(rr, key=lambda r: r[1]-r[0])
    frames.append(sheet.crop((x0, rr[0], x1+1, rr[1]+1)))
names = ['run0', 'run1', 'run2', 'jump', 'fall', 'land']
FH = 150
hero = {}
for n, f in zip(names, frames):
    s = FH / max(f.height, f.width * 0.9)
    f2 = f.resize((max(1, round(f.width*s)), max(1, round(f.height*s))), Image.LANCZOS)
    hero[n] = f2

# ---------- Kenney 瓷砖 / 敌人 ----------
def kt(n, d='Tiles', q='Double'): return Image.open(f'{SP}/{d}/{q}/{n}.png').convert('RGBA')
tiles = {}
for t in ['grass', 'sand', 'snow', 'purple', 'stone', 'dirt']:
    for part in ['block_top', 'block_center', 'horizontal_left', 'horizontal_middle', 'horizontal_right']:
        tiles[f'{t}_{part}'] = kt(f'terrain_{t}_{part}')
for n in ['coin_gold', 'coin_gold_side', 'coin_silver', 'star', 'gem_red', 'gem_yellow', 'heart', 'bush', 'grass', 'grass_purple', 'mushroom_red', 'mushroom_brown',
          'rock', 'fence', 'cactus', 'snow', 'flag_red_a', 'flag_red_b', 'flag_yellow_a', 'flag_yellow_b', 'torch_on_a', 'torch_on_b', 'hill_top_smile', 'hud_coin',
          'spring', 'window', 'block_coin']:
    tiles[n] = kt(n)
for i in range(10): tiles[f'd{i}'] = kt(f'hud_character_{i}')
tiles['dx'] = kt('hud_character_multiply')
for n in ['slime_spike_walk_a', 'slime_spike_walk_b', 'snail_walk_a', 'snail_walk_b', 'ladybug_walk_a', 'ladybug_walk_b', 'mouse_walk_a', 'mouse_walk_b', 'bee_a', 'bee_b']:
    tiles[n] = kt(n, 'Enemies')

# 缩到 96px 一格，iPhone 上够清楚又省内存
items = {}
for n, im in tiles.items():
    s = 96 / 128
    if n.startswith('d') and len(n) <= 2: s = 0.75
    items[n] = im.resize((round(im.width*s), round(im.height*s)), Image.LANCZOS)
for n, im in hero.items(): items['hero_' + n] = im

# ---------- 打图集（简单货架法） ----------
order = sorted(items.items(), key=lambda kv: -kv[1].height)
W = 1024; x = y = 0; shelf = 0; pos = {}
for n, im in order:
    if x + im.width + 2 > W: x = 0; y += shelf + 2; shelf = 0
    pos[n] = (x, y, im.width, im.height); x += im.width + 2; shelf = max(shelf, im.height)
H = y + shelf
H2 = 1
while H2 < H: H2 *= 2
atlas = Image.new('RGBA', (W, H2), (0, 0, 0, 0))
for n, im in items.items(): atlas.paste(im, pos[n][:2], im)
atlas.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(f'{OUT}/atlas.png', optimize=True)
# 豆豆的头顶位置（给帽子定位）
meta = {}
for n in names:
    a = np.asarray(hero[n])[..., 3] > 100
    ys = np.where(a.any(1))[0]; xs = np.where(a.any(0))[0]
    # 头顶 = 去掉呆毛后的身体顶部：取宽度超过 35% 的第一行
    wide = np.where(a.sum(1) > a.shape[1] * 0.35)[0]
    meta[n] = {'headTop': int(wide[0]), 'cx': float((xs[0] + xs[-1]) / 2), 'bottom': int(ys[-1])}
json.dump({'frames': pos, 'hero': meta}, open(f'{OUT}/atlas.json', 'w'), separators=(',', ':'))
print('atlas', W, H2, os.path.getsize(f'{OUT}/atlas.png') // 1024, 'KB')

# ---------- 背景 ----------
def save_jpg(im, path, w): im = im.convert('RGB'); im = im.resize((w, round(im.height*w/im.width)), Image.LANCZOS); im.save(path, quality=82, optimize=True, progressive=True)
for n in ['jiangnan_far', 'beach_far', 'snow_far', 'night_far']:
    save_jpg(Image.open(f'{ART}/{n}.jpg'), f'{OUT}/bg/{n}.jpg', 1024)
mid = key_out(Image.open(f'{ART}/jiangnan_mid.jpg'), (237, 4, 192), 70, 140, 'm')
bb = mid.getbbox(); mid = mid.crop(bb)
mid = mid.resize((1024, round(mid.height*1024/mid.width)), Image.LANCZOS)
mid.quantize(128, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(f'{OUT}/bg/jiangnan_mid.png', optimize=True)
for n in ['background_fade_hills', 'background_color_trees', 'background_fade_trees', 'background_color_hills']:
    im = Image.open(f'{SP}/Backgrounds/Double/{n}.png').convert('RGBA')
    a = np.asarray(im).astype(np.float32)
    # 天空是 白(255,255,255) → 浅蓝(221,239,255) 的渐变；离这条线近的像素抠成透明
    A = np.array([255, 255, 255], np.float32); B = np.array([221, 239, 255], np.float32); D = B - A
    t = np.clip(((a[..., :3] - A) @ D) / (D @ D), 0, 1)
    dist = np.sqrt((((A + t[..., None]*D) - a[..., :3])**2).sum(-1))
    alpha = np.clip((dist - 6) / 10, 0, 1) * 255
    a[..., 3] = np.minimum(a[..., 3], alpha)
    im = Image.fromarray(a.astype(np.uint8), 'RGBA')
    im.resize((384, 384), Image.LANCZOS).save(f'{OUT}/bg/{n.replace("background_", "k_")}.png', optimize=True)
for f in sorted(os.listdir(f'{OUT}/bg')): print('bg', f, os.path.getsize(f'{OUT}/bg/{f}') // 1024, 'KB')

# ---------- 音效（ogg → mp3，iOS 都能解） ----------
SFX = {
  'coin': 'interface-sounds/Audio/glass_002.ogg', 'coin2': 'interface-sounds/Audio/glass_003.ogg', 'big': 'interface-sounds/Audio/confirmation_004.ogg',
  'jump': 'digital-audio/Audio/phaseJump1.ogg', 'jump2': 'digital-audio/Audio/phaseJump2.ogg', 'land': 'impact-sounds/Audio/impactSoft_medium_000.ogg',
  'hit': 'interface-sounds/Audio/bong_001.ogg', 'hit2': 'impact-sounds/Audio/impactSoft_heavy_000.ogg', 'combo': 'digital-audio/Audio/powerUp2.ogg',
  'power': 'digital-audio/Audio/powerUp7.ogg', 'rain': 'digital-audio/Audio/powerUp3.ogg', 'star': 'interface-sounds/Audio/select_003.ogg',
  'finish': 'music-jingles/Audio/jingles_PIZZI02.ogg', 'click': 'interface-sounds/Audio/click_002.ogg', 'buy': 'interface-sounds/Audio/confirmation_001.ogg',
  'pop': 'interface-sounds/Audio/pluck_001.ogg'}
for n, rel in SFX.items():
    src = f'{K}/{rel}'
    if not os.path.exists(src):
        import glob; c = glob.glob(f'{K}/**/{os.path.basename(rel)}', recursive=True); src = c[0]
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-ac', '1', '-ar', '44100', '-b:a', '64k', f'{OUT}/sfx/{n}.mp3'], check=True)
print('sfx KB', sum(os.path.getsize(f'{OUT}/sfx/{f}') for f in os.listdir(f'{OUT}/sfx')) // 1024)
