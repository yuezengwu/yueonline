// Reused from artworks/first-thousand/src/collection.ts; TypeScript types removed only.
export function validateCollection(value, capacity, allowPreview = false) {
    const data = value;
    const preview = allowPreview && data?.preview === true;
    if (!data || data.schemaVersion !== 2 || (data.preview === true && !preview) ||
        !Number.isInteger(data.count) || data.count < (preview ? 1 : 1000) || data.count > capacity ||
        data.originalCount !== (preview ? Math.min(995, data.count) : 995) || data.layoutCapacity !== capacity ||
        !Array.isArray(data.people) || data.people.length !== data.count ||
        !Number.isInteger(data.atlasColumns) || data.atlasColumns < 1 ||
        data.atlasRows !== Math.ceil(data.count / data.atlasColumns))
        throw new Error('Invalid collection');
    const handles = new Set();
    for (const person of data.people) {
        if (!person || !/^[A-Za-z0-9_]{1,15}$/.test(person.handle) ||
            person.profileUrl !== `https://x.com/${person.handle}` ||
            typeof person.displayName !== 'string' || !person.displayName.trim() ||
            typeof person.bio !== 'string' || !['available', 'empty', 'unavailable'].includes(person.bioStatus) ||
            (person.bioStatus === 'available') !== Boolean(person.bio.length) ||
            (person.avatarStatus !== undefined && !['profile', 'default', 'unavailable'].includes(person.avatarStatus)) ||
            handles.has(person.handle.toLowerCase()))
            throw new Error('Invalid account');
        handles.add(person.handle.toLowerCase());
    }
    if (!Array.isArray(data.atlases) || !data.atlases.length)
        throw new Error('Missing atlas');
    for (const atlas of data.atlases) {
        if (!atlas || !/^[a-f0-9]{64}$/.test(atlas.sha256) || atlas.file !== `portraits-${atlas.sha256.slice(0, 16)}.webp` ||
            ![16, 32, 64].includes(atlas.tileSize) ||
            atlas.width !== data.atlasColumns * atlas.tileSize || atlas.height !== data.atlasRows * atlas.tileSize ||
            !Number.isInteger(atlas.bytes) || atlas.bytes <= 0)
            throw new Error('Invalid atlas');
    }
    if (new Set(data.atlases.map(atlas => atlas.tileSize)).size !== data.atlases.length)
        throw new Error('Duplicate atlas sizes');
    if (!Array.isArray(data.portraits) || data.portraits.length !== data.count)
        throw new Error('Missing individual portraits');
    for (const portrait of data.portraits) {
        if (!portrait || !/^[a-f0-9]{64}$/.test(portrait.sha256) ||
            portrait.file !== `portrait-${portrait.sha256.slice(0, 16)}.webp` ||
            portrait.width !== 128 || portrait.height !== 128 ||
            !Number.isInteger(portrait.bytes) || portrait.bytes <= 0 || portrait.bytes > 128 * 1024)
            throw new Error('Invalid individual portrait');
    }
    return data;
}
export function chooseAtlases(data, maxTextureSize, compact, initial = false) {
    const memoryBudget = (compact ? 80 : 128) * 1024 * 1024;
    const supported = data.atlases.filter(atlas =>
        atlas.tileSize <= (initial ? 32 : 64) &&
        atlas.bytes <= (initial ? 1.5 : 5) * 1024 * 1024 &&
        Math.max(atlas.width, atlas.height) <= maxTextureSize &&
        atlas.width * atlas.height * 4 * 4 / 3 <= memoryBudget)
        .sort((a, b) => b.tileSize - a.tileSize);
    return supported;
}
