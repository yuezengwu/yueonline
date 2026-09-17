export type Person = {
  handle: string; displayName: string; profileUrl: string;
  bio: string; bioStatus: 'available' | 'empty' | 'unavailable';
  avatarStatus?: 'profile' | 'default' | 'unavailable';
};
export type Atlas = { file: string; width: number; height: number; tileSize: number; sha256: string; bytes: number };
export type Collection = {
  schemaVersion: number;
  preview?: boolean;
  count: number; originalCount: number; layoutCapacity: number;
  atlasColumns: number; atlasRows: number; atlases: Atlas[]; people: Person[];
};

export function validateCollection(value: unknown, capacity: number, allowPreview = false): Collection {
  const data = value as Collection;
  const preview = allowPreview && data?.preview === true;
  if (!data || data.schemaVersion !== 2 || (data.preview === true && !preview) ||
      !Number.isInteger(data.count) || data.count < (preview ? 1 : 1000) || data.count > capacity ||
      data.originalCount !== (preview ? Math.min(995,data.count) : 995) || data.layoutCapacity !== capacity ||
      !Array.isArray(data.people) || data.people.length !== data.count ||
      !Number.isInteger(data.atlasColumns) || data.atlasColumns < 1 ||
      data.atlasRows !== Math.ceil(data.count / data.atlasColumns)) throw new Error('Invalid collection');
  const handles = new Set<string>();
  for (const person of data.people) {
    if (!person || !/^[A-Za-z0-9_]{1,15}$/.test(person.handle) ||
        person.profileUrl !== `https://x.com/${person.handle}` ||
        typeof person.displayName !== 'string' || !person.displayName.trim() ||
        typeof person.bio !== 'string' || !['available', 'empty', 'unavailable'].includes(person.bioStatus) ||
        (person.bioStatus === 'available') !== Boolean(person.bio.length) ||
        (person.avatarStatus !== undefined && !['profile', 'default', 'unavailable'].includes(person.avatarStatus)) ||
        handles.has(person.handle.toLowerCase())) throw new Error('Invalid account');
    handles.add(person.handle.toLowerCase());
  }
  if (!Array.isArray(data.atlases) || !data.atlases.length) throw new Error('Missing atlas');
  for (const atlas of data.atlases) {
    if (!atlas || !/^[a-f0-9]{64}$/.test(atlas.sha256) || atlas.file !== `portraits-${atlas.sha256.slice(0, 16)}.webp` ||
        !Number.isInteger(atlas.tileSize) || atlas.tileSize < 32 ||
        atlas.width !== data.atlasColumns * atlas.tileSize || atlas.height !== data.atlasRows * atlas.tileSize ||
        !Number.isInteger(atlas.bytes) || atlas.bytes <= 0) throw new Error('Invalid atlas');
  }
  return data;
}

export function chooseAtlases(data: Collection, maxTextureSize: number, compact: boolean): Atlas[] {
  const supported = data.atlases.filter(atlas => Math.max(atlas.width, atlas.height) <= maxTextureSize)
    .sort((a, b) => b.tileSize - a.tileSize);
  // Phones use the smaller atlas; large screens can fall back to it after a
  // failed high-resolution load. Never let WebGL silently resize the atlas.
  const preferred = compact ? supported.filter(atlas => atlas.tileSize <= 64) : supported;
  return preferred.length ? preferred : supported;
}
