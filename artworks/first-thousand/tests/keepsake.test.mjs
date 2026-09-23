import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { portraitSourceRect, fitLabel } from '../src/keepsake.js';

const collection = JSON.parse(readFileSync(new URL('../public/assets/people.json', import.meta.url), 'utf8'));

test('keepsakes select the same unique account in every atlas resolution, including the last row', () => {
  for (const atlas of collection.atlases) {
    const crops = new Set();
    collection.people.forEach((_, index) => {
      const [x, y, width, height] = portraitSourceRect(index, collection.count, collection.atlasColumns, atlas.tileSize);
      assert.ok(x >= 0 && y >= 0 && x + width <= atlas.width && y + height <= atlas.height);
      assert.equal(y / height * collection.atlasColumns + x / width, index);
      crops.add(`${x},${y}`);
    });
    assert.equal(crops.size, collection.people.length);
    for (const index of [-1, collection.count, 1.5, NaN]) assert.throws(() => portraitSourceRect(index, collection.count, collection.atlasColumns, atlas.tileSize));
  }
});

test('long multilingual names fit the card without splitting emoji or combining characters', () => {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const measure = value => [...segmenter.segment(value)].length * 10;
  assert.equal(fitLabel('  岳增五\n YUE  ', 100, measure), '岳增五 YUE');
  assert.equal(fitLabel('👨‍👩‍👧‍👦👩🏽‍💻Cafe\u0301中文', 60, measure), '👨‍👩‍👧‍👦👩🏽‍💻Caf…');
  assert.equal(fitLabel('Cafe\u0301中文', 50, measure), 'Cafe\u0301…');
});
