"""Offline atlas-build acceptance using generated solid-color test images only."""
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

class PreparePortraitsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.source = Path(self.temp.name) / 'source'
        self.source.mkdir()
        self.output = Path(self.temp.name) / 'output'
        self.people = json.loads((ROOT / 'public/people.json').read_text())['people'][:1000]
        Image.new('RGB', (128, 128), '#0000ff').save(self.source / 'regular.png')
        Image.new('RGB', (128, 128), '#ff0000').save(self.source / 'hires.png')
        self.write_manifest()
        downloads = [{'handle': p['handle'], 'path': str(self.source / 'regular.png'), 'status': 'ok'} for p in self.people]
        (self.source / 'downloads.json').write_text(json.dumps(downloads))
        (self.source / 'hires-downloads.json').write_text(json.dumps([{'handle': self.people[0]['handle'], 'path': str(self.source / 'hires.png'), 'status': 'ok'}]))
        (self.source / 'status.json').write_text(json.dumps({'downloadedAt': '2026-09-17T08:43:00Z'}))

    def write_manifest(self):
        (self.source / 'manifest.json').write_text(json.dumps(self.people))

    def run_builder(self, *extra):
        return subprocess.run([sys.executable, str(ROOT / 'tools/prepare-portraits.py'), str(self.source), '--output', str(self.output), *extra], capture_output=True, text=True)

    def test_small_preview_is_explicit_and_has_valid_one_row_atlases(self):
        self.people = self.people[:2]
        self.write_manifest()
        result = self.run_builder('--preview')
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads((self.output / 'people.json').read_text())
        self.assertTrue(data['preview'])
        self.assertEqual(data['originalCount'], 2)
        self.assertEqual(data['atlasRows'], 1)
        for atlas in data['atlases']:
            with Image.open(self.output / atlas['file']) as image:
                self.assertEqual(image.height, atlas['tileSize'])

    def test_atlas_sizes_identity_and_partial_hires_fallback(self):
        result = self.run_builder()
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads((self.output / 'people.json').read_text())
        self.assertEqual(data['people'], self.people)
        self.assertEqual(data['count'], 1000)
        self.assertEqual(data['capturedAt'], '2026-09-17T08:43:00Z')
        self.assertEqual([a['tileSize'] for a in data['atlases']], [128, 64, 32])
        for atlas in data['atlases']:
            path = self.output / atlas['file']
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), atlas['sha256'])
            with Image.open(path) as image:
                self.assertEqual(image.size, (atlas['width'], atlas['height']))
                size = atlas['tileSize']
                first = image.getpixel((size // 2, size // 2))
                last = image.getpixel(((999 % 48) * size + size // 2, (999 // 48) * size + size // 2))
                self.assertGreater(first[0], 240)
                self.assertGreater(last[2], 240)

    def test_reordered_original_cohort_cannot_replace_existing_output(self):
        self.output.mkdir()
        (self.output / 'people.json').write_text('keep existing output')
        self.people[0], self.people[1] = self.people[1], self.people[0]
        self.write_manifest()
        result = self.run_builder()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Original cohort', result.stderr)
        self.assertEqual((self.output / 'people.json').read_text(), 'keep existing output')

    def test_additive_update_cannot_drop_an_existing_new_account(self):
        self.output.mkdir()
        existing = json.loads((ROOT / 'public/people.json').read_text())
        (self.output / 'people.json').write_text(json.dumps(existing))
        result = self.run_builder()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('retain existing accounts', result.stderr)
        self.assertEqual(json.loads((self.output / 'people.json').read_text()), existing)

if __name__ == '__main__':
    unittest.main()
