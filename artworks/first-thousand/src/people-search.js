import { createSearchIndex, findPeople, normalize } from './search.js';

/** One search and selection entry point for both the space and the original wall. */
export function createPeopleSearch({ people, collection, atlasImage, authorImage, authorIndex, onLocate, onClearSelection, onFocus }) {
  const wrap = /** @type {HTMLElement} */ (document.querySelector('.search-wrap'));
  const input = /** @type {HTMLInputElement} */ (wrap.querySelector('#search'));
  const panel = /** @type {HTMLElement} */ (wrap.querySelector('#results'));
  const status = /** @type {HTMLElement} */ (wrap.querySelector('#result-count'));
  const list = /** @type {HTMLElement} */ (wrap.querySelector('#result-list'));
  const clear = /** @type {HTMLButtonElement} */ (wrap.querySelector('#search-clear'));
  const events = new AbortController();
  const searchIndex = createSearchIndex(people);
  let matches = [], activeMatch = -1, composing = false;
  const listen = (target, type, callback, options = {}) => target.addEventListener(type, callback, { ...options, signal: events.signal });

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-describedby', status.id);
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('autocapitalize', 'none');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', '匹配的朋友');
  status.setAttribute('aria-live', 'polite');
  clear.hidden = !input.value;

  function close() {
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activeMatch = -1;
  }

  function paintPortrait(portrait, index) {
    const image = index === authorIndex ? authorImage : atlasImage;
    portrait.style.backgroundImage = `url(${JSON.stringify(image.currentSrc || image.src)})`;
    if (index === authorIndex) {
      portrait.style.backgroundSize = 'cover';
      portrait.style.backgroundPosition = 'center';
      return;
    }
    const { atlasColumns, atlasRows } = collection;
    portrait.style.backgroundSize = `${atlasColumns * 100}% ${atlasRows * 100}%`;
    portrait.style.backgroundPosition = `${index % atlasColumns / Math.max(1, atlasColumns - 1) * 100}% ${Math.floor(index / atlasColumns) / Math.max(1, atlasRows - 1) * 100}%`;
  }

  function activateMatch(index, scroll = true) {
    activeMatch = index;
    [...list.children].forEach((element, position) => element.setAttribute('aria-selected', String(position === index)));
    const option = list.children[index];
    if (option) {
      input.setAttribute('aria-activedescendant', option.id);
      if (scroll) option.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  function locatePerson(index) {
    input.value = `@${people[index].handle}`;
    clear.hidden = false;
    close();
    onLocate?.(index);
  }

  function updateSearch() {
    clear.hidden = !input.value;
    const query = normalize(input.value).replace(/^@+/, '');
    list.replaceChildren();
    matches = [];
    if (!query) { close(); return; }
    matches = findPeople(searchIndex, query);
    status.textContent = matches.length ? `找到 ${matches.length} 位朋友` : '没有找到，试试其他用户名';
    const options = document.createDocumentFragment();
    matches.forEach((index, position) => {
      const person = people[index];
      const option = document.createElement('button');
      option.type = 'button'; option.className = 'search-result'; option.id = `search-option-${index}`;
      option.setAttribute('role', 'option'); option.tabIndex = -1;
      option.setAttribute('aria-posinset', String(position + 1));
      option.setAttribute('aria-setsize', String(matches.length));
      const portrait = document.createElement('span');
      portrait.className = 'search-portrait'; portrait.dataset.index = String(index); portrait.setAttribute('aria-hidden', 'true');
      paintPortrait(portrait, index);
      const identity = document.createElement('span'); identity.className = 'search-identity';
      const name = document.createElement('span'); name.className = 'search-name'; name.textContent = person.displayName;
      const handle = document.createElement('small'); handle.className = 'search-handle'; handle.textContent = `@${person.handle}`;
      identity.append(name, handle); option.append(portrait, identity); options.append(option);
      // Keep the input focused for mouse selection; touch retains native list scrolling.
      option.addEventListener('pointerdown', event => { if (event.pointerType === 'mouse') event.preventDefault(); });
      option.addEventListener('pointermove', event => { if (event.pointerType === 'mouse') activateMatch(position, false); });
      option.addEventListener('click', () => locatePerson(index));
    });
    list.append(options); list.scrollTop = 0;
    panel.hidden = false; input.setAttribute('aria-expanded', 'true'); activateMatch(matches.length ? 0 : -1);
  }

  listen(input, 'input', () => { if (!composing) updateSearch(); });
  listen(input, 'compositionstart', () => { composing = true; });
  listen(input, 'compositionend', () => { composing = false; updateSearch(); });
  listen(input, 'focus', () => { onFocus?.(); updateSearch(); });
  listen(wrap, 'submit', event => {
    event.preventDefault();
    if (!composing && matches.length && !panel.hidden) locatePerson(matches[Math.max(0, activeMatch)]);
  });
  listen(wrap, 'keydown', event => {
    if (composing || event.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.target !== input) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (panel.hidden) updateSearch();
      else if (matches.length) activateMatch((activeMatch + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
      return;
    }
    if (event.ctrlKey && (event.key === 'Home' || event.key === 'End') && matches.length && !panel.hidden) {
      event.preventDefault(); activateMatch(event.key === 'Home' ? 0 : matches.length - 1); return;
    }
    if (event.key === 'Enter' && matches.length && !panel.hidden) {
      event.preventDefault(); locatePerson(matches[Math.max(0, activeMatch)]);
    }
  });
  listen(clear, 'click', () => {
    input.value = ''; matches = []; close(); clear.hidden = true;
    onClearSelection?.(); input.focus({ preventScroll: true });
  });
  listen(document, 'pointerdown', event => { if (!wrap.contains(event.target)) close(); });
  listen(wrap, 'focusout', event => { if (!wrap.contains(event.relatedTarget)) close(); });

  return {
    close,
    setAtlas(image) {
      atlasImage = image;
      for (const portrait of /** @type {NodeListOf<HTMLElement>} */ (list.querySelectorAll('.search-portrait'))) paintPortrait(portrait, Number(portrait.dataset.index));
    },
    destroy() { events.abort(); close(); list.replaceChildren(); matches = []; },
  };
}
