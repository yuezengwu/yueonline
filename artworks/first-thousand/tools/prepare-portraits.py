"""Build the local-only portrait atlas from a verified public follower snapshot."""
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image, ImageOps

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('--preview', action='store_true')
parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'public')
args = parser.parse_args()
people = json.loads((args.source / 'manifest.json').read_text())
paths = {}
for filename in ('downloads.json', 'hires-downloads.json'):
    download_file = args.source / filename
    if download_file.exists():
        downloads = json.loads(download_file.read_text())
        paths.update({item['handle'].lower(): Path(item['path']) for item in downloads if item['status'] == 'ok'})
assert len({p['handle'].lower() for p in people}) == len(people), 'Duplicate accounts'
if not args.preview:
    assert 1000 <= len(people) <= 2240, f'Unexpected collection size: {len(people)}'
    original = '\n'.join(p['handle'].lower() for p in people[:995]).encode()
    assert hashlib.sha256(original).hexdigest() == '43116afa71784ce46bcad80b2a1060e221307f58e8e060fe8a7eb3dfeaf1dfd8', 'Original cohort was reordered or replaced'
for person in people:
    assert re.fullmatch(r'[A-Za-z0-9_]{1,15}', person['handle']), 'Invalid handle'
    assert person['profileUrl'] == f'https://x.com/{person["handle"]}', 'Profile URL does not match account'
    assert isinstance(person['displayName'], str) and person['displayName'].strip(), 'Missing display name'
    assert person['handle'].lower() in paths, f'Missing verified image: {person["handle"]}'
    assert person.get('avatarStatus', 'profile') in ('profile', 'default', 'unavailable'), 'Unknown avatar status'
    assert person.get('bioStatus', 'unavailable') in ('available', 'empty', 'unavailable'), 'Unknown biography status'
    assert isinstance(person.get('bio', ''), str), 'Invalid biography'
    assert (person.get('bioStatus', 'unavailable') == 'available') == bool(person.get('bio', '')), 'Biography status does not match text'
previous_file = args.output / 'people.json'
if not args.preview and previous_file.exists():
    previous = json.loads(previous_file.read_text())['people']
    assert [p['handle'].lower() for p in people[:len(previous)]] == [p['handle'].lower() for p in previous], 'Additive updates must retain existing accounts in order'
columns = 48
rows = (len(people) + columns - 1) // columns
size = 128
atlas = Image.new('RGB', (columns * size, rows * size), '#161616')
output = args.output
output.mkdir(parents=True, exist_ok=True)
for i, person in enumerate(people):
    path = paths[person['handle'].lower()]
    with Image.open(path) as image:
        image = ImageOps.exif_transpose(image).convert('RGB')
        assert min(image.size) >= 32, f'Undersized image: {person["handle"]}'
        tile = ImageOps.fit(image, (size, size), method=Image.Resampling.LANCZOS)
        atlas.paste(tile, (i % columns * size, i // columns * size))
atlases = []
for tile_size in (128, 64, 32):
    # Resize each cell separately so neighboring portraits cannot bleed into it.
    image = atlas if tile_size == size else Image.new('RGB', (columns * tile_size, rows * tile_size), '#161616')
    if tile_size != size:
        for i in range(len(people)):
            x, y = i % columns * size, i // columns * size
            tile = atlas.crop((x, y, x + size, y + size)).resize((tile_size, tile_size), Image.Resampling.LANCZOS)
            image.paste(tile, (i % columns * tile_size, i // columns * tile_size))
    temporary = output / '.portraits.webp.tmp'
    image.save(temporary, 'WEBP', quality=91, method=6)
    digest = hashlib.sha256(temporary.read_bytes()).hexdigest()
    filename = f'portraits-{digest[:16]}.webp'
    temporary.replace(output / filename)
    atlases.append({'file': filename, 'width': image.width, 'height': image.height, 'tileSize': tile_size, 'sha256': digest, 'bytes': (output / filename).stat().st_size})
snapshot = json.loads((args.source / 'status.json').read_text()) if (args.source / 'status.json').exists() else {}
data = {
    'schemaVersion': 2,
    **({'preview': True} if args.preview else {}),
    'capturedAt': snapshot.get('downloadedAt', datetime.now(timezone.utc).isoformat()),
    'source': 'https://x.com/ZengwuY/followers',
    'selection': 'Original 995 portraits retained in the center, with newly observed followers filling unused edge positions and expanding outside, including real accounts using the default X avatar. One unavailable avatar uses the default image and is explicitly labeled unavailable. An additive archive of follower snapshots, not a historical follow-order claim or a complete current follower list.',
    'originalCount': min(995, len(people)) if args.preview else 995,
    'originalCapturedAt': snapshot.get('originalCapturedAt'),
    'layoutCapacity': 2240, 'omittedSlots': 2240 - len(people),
    'biographiesCapturedAt': snapshot.get('biographiesCapturedAt'),
    'count': len(people), 'atlasColumns': columns, 'atlasRows': rows, 'atlases': atlases,
    'people': [{**{k: p[k] for k in ('handle', 'displayName', 'profileUrl')}, 'bio': p.get('bio', ''), 'bioStatus': p.get('bioStatus', 'unavailable'), **({'avatarStatus': p['avatarStatus']} if 'avatarStatus' in p else {})} for p in people],
}
# Publish the manifest only after all immutable, content-named atlases exist.
temporary = output / '.people.json.tmp'
temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
temporary.replace(output / 'people.json')
print(json.dumps({'count': len(people), 'atlases': atlases}))
