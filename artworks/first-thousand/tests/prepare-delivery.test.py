"""Offline delivery checks with distinct cells and duplicate portrait content."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image

SCRIPT = Path(__file__).resolve().parents[1] / 'tools/prepare-delivery.py'
spec = importlib.util.spec_from_file_location('prepare_delivery', SCRIPT)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class DeliveryTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.source, self.output = self.root / 'source', self.root / 'delivery'
        self.source.mkdir()
        self.colors = [(250, 0, 0), (0, 250, 0), (0, 0, 250), (250, 0, 0)]
        atlas = Image.new('RGB', (256, 256))
        for index, color in enumerate(self.colors):
            atlas.paste(color, (index % 2 * 128, index // 2 * 128, (index % 2 + 1) * 128, (index // 2 + 1) * 128))
        path = self.source / 'test.webp'
        atlas.save(path, 'WEBP', lossless=True)
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        filename = f'portraits-{digest[:16]}.webp'
        path.rename(self.source / filename)
        self.data = {'schemaVersion': 2, 'count': 4, 'atlasColumns': 2, 'atlasRows': 2, 'source': 'public snapshot', 'provenance': {'sourceCaptureStatus': 'partial'}, 'people': [{'handle': f'Person{i}', 'displayName': f'Name {i}', 'bio': f'Original {i}'} for i in range(4)], 'atlases': [{'file': filename, 'width': 256, 'height': 256, 'tileSize': 128, 'sha256': digest, 'bytes': len(raw)}]}
        (self.source / 'people.json').write_text(json.dumps(self.data))
        Image.new('RGB', (128, 128), '#888888').save(self.source / 'yue.jpg')
        (self.source / 'THIRD_PARTY_LICENSES.txt').write_text('Fixture license')

    def test_exact_portraits_deduplicate_and_online_cells_keep_identity(self):
        before = {p.name: p.read_bytes() for p in self.source.iterdir()}
        report = builder.build(self.source, self.output)
        data = json.loads((self.output / 'people.json').read_text())
        self.assertEqual((data['people'], data['source'], data['provenance']), (self.data['people'], self.data['source'], self.data['provenance']))
        self.assertEqual(len(data['portraits']), 4)
        self.assertEqual(data['portraits'][0], data['portraits'][3])
        self.assertEqual(report['uniquePortraitFiles'], 3)
        self.assertEqual([a['tileSize'] for a in data['atlases']], [64, 32, 16])
        for index, portrait in enumerate(data['portraits']):
            raw = (self.output / portrait['file']).read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(), portrait['sha256'])
            with Image.open(self.output / portrait['file']) as image:
                self.assertEqual(image.size, (128, 128))
                self.assertEqual(image.tobytes(), Image.new('RGB', (128, 128), self.colors[index]).tobytes())
        for atlas in data['atlases']:
            size = atlas['tileSize']
            self.assertLessEqual(atlas['bytes'], builder.BUDGETS[size])
            with Image.open(self.output / atlas['file']) as image:
                self.assertEqual(image.size, (size * 2, size * 2))
                for index, expected in enumerate(self.colors):
                    actual = image.getpixel((index % 2 * size + size // 2, index // 2 * size + size // 2))
                    self.assertLess(max(abs(a - b) for a, b in zip(actual, expected)), 12)
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.source.iterdir()})

    def test_corrupt_source_and_impossible_budget_never_publish_manifest(self):
        with self.assertRaisesRegex(ValueError, 'byte budget'):
            builder.build(self.source, self.output, budgets={64: 1, 32: 1, 16: 1})
        self.assertFalse((self.output / 'people.json').exists())
        (self.source / self.data['atlases'][0]['file']).write_bytes(b'broken')
        with self.assertRaisesRegex(ValueError, 'integrity mismatch'):
            builder.build(self.source, self.root / 'other')
        self.assertFalse((self.root / 'other').exists())

    def test_source_and_symlink_output_cannot_be_overwritten(self):
        original = (self.source / 'people.json').read_bytes()
        with self.assertRaisesRegex(ValueError, 'separate'):
            builder.build(self.source, self.source)
        self.output.symlink_to(self.source, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'symbolic links'):
            builder.build(self.source, self.output)
        self.assertEqual((self.source / 'people.json').read_bytes(), original)


if __name__ == '__main__':
    unittest.main()
