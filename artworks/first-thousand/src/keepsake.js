const WIDTH = 1200, HEIGHT = 900;
const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';

// Shared with the original wall: atlas indices identify people at every resolution.
/** @returns {[number, number, number, number]} */
export function portraitSourceRect(index, count, columns, tileSize) {
  if (!Number.isInteger(index) || index < 0 || index >= count || !Number.isInteger(columns) || columns < 1 || !Number.isInteger(tileSize) || tileSize < 1) throw new Error('Invalid portrait');
  return [index % columns * tileSize, Math.floor(index / columns) * tileSize, tileSize, tileSize];
}

export function fitLabel(text, maxWidth, measure) {
  const singleLine = text.replace(/\s+/gu, ' ').trim();
  if (measure(singleLine) <= maxWidth) return singleLine;
  const parts = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(singleLine)].map(part => part.segment);
  while (parts.length && measure(`${parts.join('')}…`) > maxWidth) parts.pop();
  return `${parts.join('')}…`;
}

function drawPortrait(context, image, x, y, size) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const edge = Math.min(width, height);
  context.save();
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  context.clip();
  context.drawImage(image, (width - edge) / 2, (height - edge) / 2, edge, edge, x, y, size, size);
  context.restore();
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, size / 2 - .75, 0, Math.PI * 2);
  context.strokeStyle = '#ffffff';
  context.lineWidth = 1.5;
  context.stroke();
}

async function makeCard(person, portrait, authorImage) {
  await Promise.all([authorImage.decode(), document.fonts.ready]);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH; canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image export unavailable');
  context.fillStyle = '#000000'; context.fillRect(0, 0, WIDTH, HEIGHT);
  drawPortrait(context, portrait, 190, 240, 300);
  drawPortrait(context, authorImage, 710, 240, 300);
  context.textAlign = 'center';
  for (const identity of [
    { name: person.displayName, handle: person.handle, x: 340 },
    { name: '岳增五', handle: 'ZengwuY', x: 860 },
  ]) {
    context.font = `400 32px ${FONT}`; context.fillStyle = '#ffffff';
    context.fillText(fitLabel(identity.name, 400, value => context.measureText(value).width), identity.x, 605);
    context.font = `400 22px ${FONT}`; context.fillStyle = '#888888';
    context.fillText(fitLabel(`@${identity.handle}`, 400, value => context.measureText(value).width), identity.x, 649);
  }
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image export failed')), 'image/png'));
}

/** One keepsake dialog for both views; selection and camera state remain owned by the caller. */
export function createKeepsake(options) {
  const trigger = /** @type {HTMLButtonElement} */ (document.querySelector('#make-photo'));
  const dialog = /** @type {HTMLDialogElement} */ (document.querySelector('#photo-dialog'));
  const picture = /** @type {HTMLImageElement} */ (document.querySelector('#photo-preview'));
  const status = /** @type {HTMLElement} */ (document.querySelector('#photo-status'));
  const download = /** @type {HTMLAnchorElement} */ (document.querySelector('#photo-download'));
  const retry = /** @type {HTMLButtonElement} */ (document.querySelector('#photo-retry'));
  const close = /** @type {HTMLButtonElement} */ (document.querySelector('#photo-close'));
  const events = new AbortController();
  let generation = 0, imageUrl = null, person = null, destroyed = false;

  function clearImage() {
    picture.hidden = true; picture.removeAttribute('src');
    download.hidden = true; download.removeAttribute('href'); download.removeAttribute('download');
    if (imageUrl) { URL.revokeObjectURL(imageUrl); imageUrl = null; }
  }

  async function generate() {
    if (!person || destroyed || !dialog.open) return;
    const current = ++generation, selected = person;
    const active = () => !destroyed && current === generation && dialog.open;
    clearImage(); retry.hidden = true; dialog.setAttribute('aria-busy', 'true');
    status.textContent = '正在生成合影…'; status.hidden = false;
    try {
      const portrait = await options.portrait(selected.index);
      if (!active()) return;
      const blob = await makeCard(selected.person, portrait, options.authorImage);
      if (!active()) return;
      imageUrl = URL.createObjectURL(blob);
      picture.alt = `${selected.person.displayName}（@${selected.person.handle}）与岳增五的合影${selected.person.avatarStatus === 'unavailable' ? '，该成员头像暂不可用，使用默认头像' : ''}`;
      picture.src = imageUrl;
      await picture.decode();
      if (!active()) return;
      download.href = imageUrl; download.download = `yue-with-${selected.person.handle}.png`;
      picture.hidden = false; download.hidden = false;
      status.textContent = ''; status.hidden = true;
    } catch {
      if (!active()) return;
      clearImage(); status.textContent = '合影生成失败，请重试。'; status.hidden = false; retry.hidden = false;
    } finally {
      if (current === generation) dialog.removeAttribute('aria-busy');
    }
  }

  function cleanup() {
    generation++; person = null; clearImage();
    retry.hidden = true; status.hidden = true; status.textContent = '';
    dialog.removeAttribute('aria-busy');
  }

  trigger.addEventListener('click', () => {
    const selected = options.selection();
    if (!selected || destroyed || dialog.open) return;
    person = { index: selected.index, person: { ...selected.person } };
    options.pause();
    dialog.showModal();
    void generate();
  }, { signal: events.signal });
  retry.addEventListener('click', () => void generate(), { signal: events.signal });
  close.addEventListener('click', () => dialog.close(), { signal: events.signal });
  dialog.addEventListener('cancel', event => {
    event.preventDefault(); dialog.close();
  }, { signal: events.signal });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  }, { signal: events.signal });
  dialog.addEventListener('close', () => {
    cleanup();
    if (!destroyed) options.restoreFocus();
  }, { signal: events.signal });

  return {
    get isOpen() { return dialog.open; },
    destroy() {
      if (destroyed) return;
      destroyed = true; events.abort();
      if (dialog.open) dialog.close();
      cleanup();
    },
  };
}
