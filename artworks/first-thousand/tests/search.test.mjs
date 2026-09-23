import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSearchIndex, findPeople } from '../src/search.js';

const data = JSON.parse(readFileSync(new URL('../public/assets/people.json', import.meta.url), 'utf8'));

// Original collection.test.mjs cases, using the same real local collection.
test(`all ${data.count} handles, including the final new account, can be located exactly regardless of avatar availability`, () => {
  const index = createSearchIndex(data.people);
  assert.equal(index.length, data.count);
  data.people.forEach((person, i) => assert.equal(findPeople(index, ` @${person.handle.toUpperCase()} `)[0], i));
  assert.equal(findPeople(index, '＠ＳＥＡＲＣＨ＿ＡＩ')[0], data.people.findIndex(p => p.handle === 'search_ai'));
  const fallbackPeople = [
    {handle:'default_avatar',displayName:'Default portrait',avatarStatus:'default'},
    {handle:'no_avatar',displayName:'Unavailable portrait',avatarStatus:'unavailable'},
  ];
  const fallbackIndex = createSearchIndex(fallbackPeople);
  fallbackPeople.forEach((person, i) => assert.equal(findPeople(fallbackIndex, person.handle)[0], i));
});

test('nickname and partial searches expose every result, with exact and prefix matches first', () => {
  const people = [{ handle: 'exact', displayName: '甲' }, { handle: 'another', displayName: 'exact' },
    { handle: 'exact_prefix', displayName: '乙' }, { handle: 'prefixname', displayName: 'exact name' },
    ...Array.from({ length: 30 }, (_, i) => ({ handle: `user_exact_${i}`, displayName: '昵称' })),
    { handle: 'chinese', displayName: '测试昵称' }, { handle: 'unicode', displayName: 'Café' }];
  const index = createSearchIndex(people);
  assert.deepEqual(findPeople(index, 'exact'), Array.from({ length: 34 }, (_, i) => i));
  assert.equal(findPeople(index, '昵称').length, 31);
  assert.deepEqual(findPeople(index, 'Cafe\u0301'), [35]);
  assert.deepEqual(findPeople(index, ' @ '), []);
  assert.deepEqual(findPeople(index, 'no-such-person'), []);
});

test('broad searches in the real collection retain every matching account', () => {
  const index = createSearchIndex(data.people);
  const matches = findPeople(index, 'a');
  const expected = index.filter(person => person.handle.includes('a') || person.name.includes('a')).map(person => person.index);
  assert.ok(matches.length > 1000, 'the result list must not be truncated to the former 20-item page');
  assert.deepEqual([...matches].sort((a, b) => a - b), expected);
  assert.equal(new Set(matches).size, matches.length);
});

test('the shared search also locates the author appended at runtime', () => {
  const people = [...data.people, { handle: 'ZengwuY', displayName: '岳增五' }];
  const index = createSearchIndex(people);
  assert.equal(findPeople(index, '@ZengwuY')[0], people.length - 1);
  assert.equal(findPeople(index, '岳增五')[0], people.length - 1);
});
