import * as THREE from 'three';
import { validateCollection, chooseAtlases } from './collection.js';
import { portraitSourceRect } from './keepsake.js';
import { LAYOUT_CAPACITY } from './original-layout.js';

// Resolve against Vite's deployment base, never the document's trailing slash.
const assetBase = () => new URL(`${import.meta.env?.BASE_URL || '/visuals/first-thousand/'}assets/`, location.origin);

/** One verified atlas is shared by both views; detailed portraits load individually. */
export async function loadAssets(maxTextureSize) {
  const lifecycle = new AbortController(), listeners = new Set();
  const signal = (timeout) => AbortSignal.any([lifecycle.signal, AbortSignal.timeout(timeout)]);
  const response = await fetch(new URL('people.json', assetBase()), { cache: 'no-cache', signal: signal(15000) });
  if (!response.ok) throw Error('无法载入名单');
  const collection = validateCollection(await response.json(), LAYOUT_CAPACITY);
  let disposed = false, sharpening = null, current;
  const portraits = new Map();
  const pendingPortraits = new Map();

  async function loadImage(metadata, timeout = 15000) {
    const response = await fetch(new URL(metadata.file, assetBase()), { signal: signal(timeout) });
    if (!response.ok) throw Error('头像加载失败');
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== metadata.bytes) throw Error('头像资源不完整');
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== metadata.sha256) throw Error('头像资源校验失败');
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
    try {
      const image = new Image(); image.src = url; await image.decode();
      if (image.naturalWidth !== metadata.width || image.naturalHeight !== metadata.height) throw Error('头像尺寸不正确');
      if (disposed) throw Error('页面已关闭');
      return { image, url };
    } catch (error) { URL.revokeObjectURL(url); throw error; }
  }
  const release = item => {
    item.texture?.dispose(); URL.revokeObjectURL(item.url);
  };
  async function loadAtlas(atlas) {
    const item = await loadImage(atlas);
    const texture = new THREE.Texture(item.image);
    texture.colorSpace = THREE.SRGBColorSpace; texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
    return { ...item, atlas, texture };
  }
  let failure;
  // Start with <= 32px / 1.5 MiB, then fall back to 16px. Never wait for HD to boot.
  for (const atlas of chooseAtlases(collection, maxTextureSize, innerWidth < 600, true)) {
    try { current = await loadAtlas(atlas); break; } catch (error) { failure = error; }
  }
  if (!current) throw failure || Error('设备不支持头像图集');
  const authorImage = new Image(); authorImage.src = new URL('yue.jpg', assetBase()).href;
  try { await authorImage.decode(); } catch (error) { release(current); throw error; }
  const authorTexture = new THREE.Texture(authorImage);
  authorTexture.colorSpace = THREE.SRGBColorSpace; authorTexture.generateMipmaps = true;
  authorTexture.minFilter = THREE.LinearMipmapLinearFilter; authorTexture.needsUpdate = true;

  async function detailedPortrait(index) {
    if (!Number.isInteger(index) || index < 0 || index >= collection.count || disposed) throw Error('无效头像');
    if (portraits.has(index)) {
      const item = portraits.get(index); portraits.delete(index); portraits.set(index, item);
      return item.image;
    }
    if (pendingPortraits.has(index)) return pendingPortraits.get(index);
    const pending = loadImage(collection.portraits[index], 5000).then(item => {
      if (disposed) { release(item); throw Error('页面已关闭'); }
      portraits.set(index, item);
      // A bounded cache of decoded single portraits, never a full HD atlas.
      while (portraits.size > 8) {
        const oldest = portraits.keys().next().value;
        release(portraits.get(oldest)); portraits.delete(oldest);
      }
      return item.image;
    }).finally(() => pendingPortraits.delete(index));
    pendingPortraits.set(index, pending);
    return pending;
  }
  return {
    collection, authorImage, authorTexture,
    get current() { return current; },
    onChange(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    sharpen() {
      const connection = /** @type {Navigator & {connection?: {saveData?: boolean}}} */ (navigator).connection;
      if (disposed || connection?.saveData) return Promise.resolve();
      const best = chooseAtlases(collection, maxTextureSize, innerWidth < 600)[0];
      if (!best || best.tileSize <= current.atlas.tileSize) return Promise.resolve();
      if (!sharpening) sharpening = loadAtlas(best).then(next => {
        if (disposed) { release(next); return; }
        const previous = current;
        current = next;
        try { for (const callback of listeners) callback(next); }
        finally { release(previous); }
      }).catch(() => { /* Refinement must never interrupt the usable view. */ }).finally(() => { sharpening = null; });
      return sharpening;
    },
    async portrait(index) {
      // Check before falling back so malformed indices cannot silently crop another person.
      portraitSourceRect(index, collection.count, collection.atlasColumns, current.atlas.tileSize);
      try { return await detailedPortrait(index); } catch {
        if (disposed) throw Error('页面已关闭');
        const { atlas, image } = current, size = atlas.tileSize;
        const portrait = document.createElement('canvas'); portrait.width = portrait.height = size;
        const context = portrait.getContext('2d');
        if (!context) throw Error('无法读取头像');
        context.drawImage(image, ...portraitSourceRect(index, collection.count, collection.atlasColumns, size), 0, 0, size, size);
        return portrait;
      }
    },
    dispose() {
      disposed = true; lifecycle.abort(); listeners.clear(); authorTexture.dispose();
      release(current);
      for (const item of portraits.values()) release(item);
      portraits.clear(); pendingPortraits.clear();
    },
  };
}
