"""Build bounded online atlases and per-person lossless portraits, offline only.

The source manifest and lossless 128px atlas remain untouched. Online atlases
may be lossy; every per-person portrait is verified against its source pixels.
"""
import argparse
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
import hashlib
import io
import json
import math
from pathlib import Path
import re
import shutil
import sys

from PIL import Image, ImageChops, ImageDraw, ImageOps, ImageStat

TILE_SIZES = (64, 32, 16)
BUDGETS = {64: 5 * 1024**2, 32: int(1.5 * 1024**2), 16: 512 * 1024}
QUALITIES = (88, 84, 80, 76, 72, 68, 64)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    temporary = path.with_name('.' + path.name + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')
    temporary.replace(path)


def content_file(output, image, prefix, **encoding):
    buffer = io.BytesIO()
    image.save(buffer, 'WEBP', **encoding)
    raw = buffer.getvalue()
    digest = sha(raw)
    name = f'{prefix}-{digest[:16]}.webp'
    path = output / name
    if not path.exists():
        temporary = path.with_name('.' + name + '.tmp')
        temporary.write_bytes(raw)
        temporary.replace(path)
    else:
        require(path.read_bytes() == raw, 'Existing content-named image does not match its name')
    return {'file': name, 'width': image.width, 'height': image.height, 'sha256': digest, 'bytes': len(raw)}


def source_collection(source):
    raw = (source / 'people.json').read_bytes()
    data = json.loads(raw)
    require(data.get('schemaVersion') == 2 and data.get('preview') is not True, 'Expected a real schemaVersion 2 collection')
    require(isinstance(data.get('count'), int) and data['count'] > 0 and len(data.get('people', [])) == data['count'], 'Invalid source count')
    require(len({p['handle'].lower() for p in data['people']}) == data['count'], 'Duplicate source accounts')
    columns = data.get('atlasColumns')
    require(isinstance(columns, int) and columns > 0 and data.get('atlasRows') == math.ceil(data['count'] / columns), 'Invalid source grid')
    candidates = [a for a in data.get('atlases', []) if a.get('tileSize') == 128]
    require(len(candidates) == 1, 'Source requires one verified 128px atlas')
    atlas = candidates[0]
    require(re.fullmatch(r'[a-f0-9]{64}', atlas.get('sha256', '')), 'Invalid source atlas digest')
    require(atlas['file'] == f'portraits-{atlas["sha256"][:16]}.webp', 'Invalid source atlas filename')
    pixels = (source / atlas['file']).read_bytes()
    require(len(pixels) == atlas['bytes'] and sha(pixels) == atlas['sha256'], 'Source atlas integrity mismatch')
    image = Image.open(io.BytesIO(pixels))
    image.load()
    require(image.mode == 'RGB', 'Source atlas must contain RGB pixels')
    require(image.size == (atlas['width'], atlas['height']) == (columns * 128, data['atlasRows'] * 128), 'Source atlas dimensions mismatch')
    return data, image, sha(raw), atlas['sha256']


def source_tile(image, index, columns):
    x, y = index % columns * 128, index // columns * 128
    return image.crop((x, y, x + 128, y + 128))


def make_portrait(output, tile):
    try:
        metadata = content_file(output, tile, 'portrait', lossless=True, method=4)
        with Image.open(output / metadata['file']) as decoded:
            require(decoded.mode == 'RGB' and decoded.size == (128, 128) and decoded.tobytes() == tile.tobytes(), 'Lossless portrait pixels changed')
        return metadata
    finally:
        tile.close()


def make_atlas(output, image, count, columns, rows, size, budget):
    atlas = Image.new('RGB', (columns * size, rows * size), '#161616')
    for index in range(count):
        with source_tile(image, index, columns) as tile:
            reduced = tile.resize((size, size), Image.Resampling.LANCZOS)
            atlas.paste(reduced, (index % columns * size, index // columns * size))
    selected = None
    for quality in QUALITIES:
        encoded = io.BytesIO()
        atlas.save(encoded, 'WEBP', quality=quality, method=6)
        raw = encoded.getvalue()
        if len(raw) <= budget:
            selected = (raw, quality)
            break
    require(selected is not None, f'{size}px atlas cannot meet {budget} byte budget at a supported quality')
    raw, quality = selected
    digest = sha(raw)
    filename = f'portraits-{digest[:16]}.webp'
    path = output / filename
    temporary = path.with_name('.' + filename + '.tmp')
    temporary.write_bytes(raw)
    temporary.replace(path)
    per_tile_rmse = []
    with Image.open(path) as decoded:
        require(decoded.size == atlas.size and decoded.mode == 'RGB', 'Online atlas dimensions changed')
        for index in range(count):
            x, y = index % columns * size, index // columns * size
            box = (x, y, x + size, y + size)
            error = ImageStat.Stat(ImageChops.difference(decoded.crop(box), atlas.crop(box))).rms
            per_tile_rmse.append(math.sqrt(sum(v * v for v in error) / 3))
    # Lossy pixels may differ, but a wrong tile/cell must not silently pass.
    require(max(per_tile_rmse) < 45, f'{size}px online tile differs excessively from its corresponding source')
    metadata = {'file': filename, 'width': atlas.width, 'height': atlas.height, 'tileSize': size, 'sha256': digest, 'bytes': len(raw)}
    quality_report = {'quality': quality, 'budgetBytes': budget, 'maxTileRmse': round(max(per_tile_rmse), 3), 'meanTileRmse': round(sum(per_tile_rmse) / count, 3)}
    atlas.close()
    return metadata, quality_report


def contact_sheet(path, source, data, atlases, output):
    # Show the same identities at their native 32/64 pixel online sizes and as
    # 128px magnifications, alongside the original lossless portrait.
    indices = list(dict.fromkeys(i for i in (0, 47, 48, 63, 64, 994, 995, 2026, 2027, 2047, 2048, 2111, 2500, 3000, data['count'] - 1) if i < data['count']))
    sample_width, sample_height = 560, 176
    canvas = Image.new('RGB', (sample_width * 3, 42 + math.ceil(len(indices) / 3) * sample_height), '#151515')
    draw = ImageDraw.Draw(canvas)
    draw.text((16, 12), 'Each sample: source 128 | online 64 -> 128 | online 32 -> 128 | native 64 / 32', fill='#eeeeee')
    loaded = {a['tileSize']: Image.open(output / a['file']) for a in atlases if a['tileSize'] in (32, 64)}
    for slot, index in enumerate(indices):
        left, top = slot % 3 * sample_width + 16, 42 + slot // 3 * sample_height
        draw.text((left, top), f'{index}: @{data["people"][index]["handle"]}', fill='#dddddd')
        with source_tile(source, index, data['atlasColumns']) as original:
            canvas.paste(original, (left, top + 24))
        for position, size in enumerate((64, 32), 1):
            x, y = index % data['atlasColumns'] * size, index // data['atlasColumns'] * size
            tile = loaded[size].crop((x, y, x + size, y + size))
            canvas.paste(tile.resize((128, 128), Image.Resampling.NEAREST), (left + 136 * position, top + 24))
            canvas.paste(tile, (left + 414, top + (24 if size == 64 else 96)))
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path, 'PNG')
    for image in loaded.values():
        image.close()


def build(source, output, sheet=None, budgets=None):
    source = source.resolve()
    # Reject existing symlinks, including output ancestors, before mkdir/write.
    require(not any(p.is_symlink() for p in (output, *output.parents)), 'Output and its parents must not be symbolic links')
    output = output.resolve()
    require(source != output and source not in output.parents and output not in source.parents, 'Delivery output must be separate from source assets')
    if sheet:
        require(source != sheet.resolve() and source not in sheet.resolve().parents, 'Contact sheet must not be written inside source assets')
    data, image, manifest_hash, atlas_hash = source_collection(source)
    output.mkdir(parents=True, exist_ok=True)
    require(not (output / 'people.json').exists(), 'Use a fresh output directory; an existing manifest will not be overwritten')
    for name in ('yue.jpg', 'THIRD_PARTY_LICENSES.txt'):
        require((source / name).is_file(), f'Missing shared resource: {name}')
    portraits, unique, pending = [], {}, set()
    with ThreadPoolExecutor(max_workers=6) as executor:
        for index in range(data['count']):
            tile = source_tile(image, index, data['atlasColumns'])
            pixels_hash = sha(tile.tobytes())
            if pixels_hash in unique:
                tile.close()
                future = unique[pixels_hash]
            else:
                future = executor.submit(make_portrait, output, tile)
                unique[pixels_hash] = future
                pending.add(future)
            portraits.append(future)
            if len(pending) >= 12:
                done, pending = wait(pending, return_when=FIRST_COMPLETED)
                for finished in done:
                    finished.result()
            if (index + 1) % 500 == 0:
                print(f'Prepared {index + 1}/{data["count"]} lossless portrait positions', flush=True)
    portraits = [future.result() for future in portraits]
    atlases, quality_reports = [], {}
    for size in TILE_SIZES:
        print(f'Encoding online {size}px atlas', flush=True)
        metadata, quality = make_atlas(output, image, data['count'], data['atlasColumns'], data['atlasRows'], size, (budgets or BUDGETS)[size])
        atlases.append(metadata)
        quality_reports[str(size)] = quality
        print(json.dumps({'tileSize': size, 'bytes': metadata['bytes'], **quality}), flush=True)
    for name in ('yue.jpg', 'THIRD_PARTY_LICENSES.txt'):
        shutil.copyfile(source / name, output / name)
    delivery = {
        'schemaVersion': 1, 'sourceManifestSha256': manifest_hash, 'sourceAtlasSha256': atlas_hash,
        'atlasEncoding': 'lossy-webp', 'portraitEncoding': 'lossless-webp',
        'atlasQualities': {key: value['quality'] for key, value in quality_reports.items()},
        'atlasVerification': quality_reports, 'portraitSize': 128,
        'verifiedPortraitPositions': data['count'], 'uniquePortraitFiles': len(unique),
    }
    published = {**data, 'atlases': atlases, 'portraits': portraits, 'delivery': delivery}
    require(published['people'] == data['people'] and published.get('provenance') == data.get('provenance'), 'Source identity or provenance changed')
    write_json(output / 'people.json', published)
    if sheet:
        contact_sheet(sheet, image, data, atlases, output)
    image.close()
    return {'count': data['count'], 'uniquePortraitFiles': len(unique), 'portraitBytes': sum({p['file']: p['bytes'] for p in portraits}.values()), 'maxPortraitBytes': max(p['bytes'] for p in portraits), 'atlases': atlases, 'delivery': delivery}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--contact-sheet', type=Path)
    args = parser.parse_args()
    try:
        result = build(args.source, args.output, args.contact_sheet)
    except Exception as error:
        print(f'Delivery build failed: {error}', file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
