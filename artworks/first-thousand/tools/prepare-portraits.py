"""Build the local-only portrait atlas from a verified public follower snapshot."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image, ImageOps

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('--preview', action='store_true')
args = parser.parse_args()
people = json.loads((args.source / 'manifest.json').read_text())
download_file = args.source / 'hires-downloads.json'
downloads = json.loads((download_file if download_file.exists() else args.source / 'downloads.json').read_text())
paths = {item['handle'].lower(): Path(item['path']) for item in downloads if item['status'] == 'ok'}
assert len({p['handle'].lower() for p in people}) == len(people), 'Duplicate accounts'
if not args.preview:
    assert 900 <= len(people) <= 1000, f'Unexpected collection size: {len(people)}'
columns = 32
rows = (len(people) + columns - 1) // columns
size = 128
atlas = Image.new('RGB', (columns * size, rows * size), '#161616')
output = Path(__file__).resolve().parents[1] / 'public'
output.mkdir(exist_ok=True)
for i, person in enumerate(people):
    assert 'default_profile' not in person['avatarSourceUrl'], f'Generic avatar: {person["handle"]}'
    path = paths[person['handle'].lower()]
    with Image.open(path) as image:
        image = ImageOps.exif_transpose(image).convert('RGB')
        assert min(image.size) >= 32, f'Undersized image: {person["handle"]}'
        tile = ImageOps.fit(image, (size, size), method=Image.Resampling.LANCZOS)
        atlas.paste(tile, (i % columns * size, i // columns * size))
atlas.save(output / 'portraits.webp', 'WEBP', quality=91, method=6)
snapshot = json.loads((args.source / 'status.json').read_text()) if (args.source / 'status.json').exists() else {}
data = {
    'capturedAt': snapshot.get('downloadedAt', datetime.now(timezone.utc).isoformat()),
    'source': 'https://x.com/ZengwuY/followers',
    'selection': 'Current follower snapshot; generic and unavailable avatars omitted, supplemented by verified accounts from the same follower list. Not a historical first-1000 list.',
    'layoutCapacity': 1000, 'omittedSlots': 1000 - len(people),
    'biographiesCapturedAt': snapshot.get('biographiesCapturedAt'),
    'count': len(people), 'atlasColumns': columns, 'atlasRows': rows,
    'people': [{**{k: p[k] for k in ('handle', 'displayName', 'profileUrl')}, 'bio': p.get('bio', ''), 'bioStatus': p.get('bioStatus', 'unavailable')} for p in people],
}
(output / 'people.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
print(json.dumps({'count': len(people), 'dimensions': atlas.size, 'atlasBytes': (output / 'portraits.webp').stat().st_size}))
