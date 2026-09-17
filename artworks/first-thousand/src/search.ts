import type { Person } from './collection';

export const normalize = (value: string) => value.normalize('NFKC').trim().toLowerCase();
export const createSearchIndex = (people: Person[]) => people.map((person, index) => ({ index, handle: normalize(person.handle), name: normalize(person.displayName) }));

export function findPeople(index: ReturnType<typeof createSearchIndex>, value: string): number[] {
  const query = normalize(value).replace(/^@+/, '');
  if (!query) return [];
  return index.map(person => {
    const score = person.handle === query ? 0 : person.name === query ? 1 : person.handle.startsWith(query) ? 2 : person.name.startsWith(query) ? 3 : person.handle.includes(query) ? 4 : person.name.includes(query) ? 5 : -1;
    return { index: person.index, score };
  }).filter(person => person.score >= 0).sort((a, b) => a.score - b.score || a.index - b.index).map(person => person.index);
}
