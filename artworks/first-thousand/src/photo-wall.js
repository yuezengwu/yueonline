import * as THREE from 'three';
import { BEND, CELL, TILE, RADIUS, CORE_Y, bendPoint, cellCenter, cellForPerson, isDedication, isPrimary, nearestCell, overviewZoom, personAt, portraitFitsViewport, unbendPoint, visibleCells } from './original-layout.js';
// The original first-thousand curved gallery engine, adapted to the shared
// renderer and selection. Curved gallery direction: ol-ivier, MIT.
// See assets/THIRD_PARTY_LICENSES.txt. No shared texture is owned by this view.
export function createPhotoWall({ canvas, renderer, collection, atlasTexture, atlas: initialAtlas, authorIndex = -1, dedication, onSelect, onClearSelection, onOpenProfile, onViewChange, onSharpen }) {
    let texture = atlasTexture, atlas = initialAtlas;
    let opened = false, destroyed = false, frame = 0, visited = false;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const events = new AbortController();
    const listen = (target, type, callback, options = {}) => target.addEventListener(type, callback, { ...options, signal: events.signal });
    const dialogOpen = () => Boolean(document.querySelector('dialog[open]'));
    const inputBlocked = () => dialogOpen() || document.activeElement?.matches('input,textarea,[contenteditable="true"]');
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10);
    camera.position.z = 3;
    let capacity = 10000;
    const geometry = new THREE.PlaneGeometry(TILE, TILE, 6, 6);
    const distantGeometry = new THREE.PlaneGeometry(TILE, TILE, 1, 1);
    let indices = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    indices.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aPortrait', indices);
    distantGeometry.setAttribute('aPortrait', indices);
    const material = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: {
            uAtlas: { value: texture }, uDetail: { value: texture }, uDetailIndex: { value: -1 }, uAtlasGrid: { value: new THREE.Vector2(collection.atlasColumns, collection.atlasRows) },
            uAtlasInset: { value: .5 * collection.atlasColumns / texture.image.naturalWidth },
            uHeight: { value: 720 }, uBend: { value: BEND }, uSelected: { value: -1 }, uHover: { value: -1 },
        },
        vertexShader: `
      attribute float aPortrait;
      uniform float uHeight; uniform float uBend;
      varying vec2 vUv; varying float vPortrait; varying vec2 vScreen;
      void main() {
        vUv = uv; vPortrait = aPortrait;
        vec4 p = instanceMatrix * vec4(position, 1.0);
        p.xy *= 1.0 + uBend * dot(p.xy, p.xy) / (uHeight * uHeight);
        vScreen = p.xy / uHeight;
        gl_Position = projectionMatrix * modelViewMatrix * p;
      }`,
        fragmentShader: `
      uniform sampler2D uAtlas; uniform sampler2D uDetail; uniform float uDetailIndex; uniform vec2 uAtlasGrid; uniform float uAtlasInset;
      uniform float uSelected; uniform float uHover;
      varying vec2 vUv; varying float vPortrait; varying vec2 vScreen;
      void main() {
        vec2 p = vUv - .5;
        float r = length(p);
        float aa = max(fwidth(r), .001);
        float radius = ${RADIUS / TILE};
        float face = 1.0 - smoothstep(radius-aa, radius+aa, r);
        float shadow = (1.0-smoothstep(radius-.008, .5, length(p-vec2(.018,-.032))))*.7;
        float selected = 1.0-step(.5, abs(vPortrait-uSelected));
        float hover = 1.0-step(.5, abs(vPortrait-uHover));
        float ring = (1.0-smoothstep(.009+aa, .018+aa, abs(r-radius-.022)))*selected;
        float rim = (1.0-smoothstep(.006, .017+aa, abs(r-radius)))*face;
        vec2 cell = vec2(mod(vPortrait, uAtlasGrid.x), floor(vPortrait/uAtlasGrid.x));
        vec2 uv = clamp(p/(radius*2.0)+.5, uAtlasInset, 1.0-uAtlasInset);
        vec2 atlasUv = vec2((cell.x+uv.x)/uAtlasGrid.x, (uAtlasGrid.y-cell.y-1.0+uv.y)/uAtlasGrid.y);
        vec3 color = texture2D(uAtlas, atlasUv).rgb;
        if(abs(vPortrait-uDetailIndex)<.5) color = texture2D(uDetail, clamp(p/(radius*2.0)+.5, 0.0, 1.0)).rgb;
        float light = .88 + .1*dot(normalize(vec3(p, .5)), normalize(vec3(-.5, .65, 1.0)));
        float vignette = smoothstep(.35, 1.2, length(vScreen));
        color *= light * (1.0-vignette*.27) + hover*.08 + selected*.09;
        color += rim * max(0.0, dot(normalize(p), normalize(vec2(-.5,.8))))*.14;
        vec3 result = mix(vec3(.012), color, face);
        result = mix(result, vec3(.88,.89,.87), ring);
        float alpha = max(max(face, shadow), ring);
        if(alpha < .01) discard;
        gl_FragColor = vec4(result, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    });
    let mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    scene.add(mesh);
    let width = innerWidth, height = innerHeight;
    const compact = () => width < 600;
    const coreX = () => compact() ? CELL / 2 : 0;
    const coreY = () => compact() ? 0 : CORE_Y;
    const homeZoom = () => Math.max(.02, Math.min(.62, (width - 48) / (compact() ? 800 : 1180), (height - 170) / (compact() ? 1150 : 680)));
    const state = { x: coreX(), y: coreY(), zoom: homeZoom(), vx: 0, vy: 0 };
    let fitZoom = overviewZoom(width, height, collection.count), overview = false;
    let previousTime = 0, dirty = true, moved = false, pinched = false;
    let startX = 0, startY = 0, lastMove = 0;
    let lastPointerType = 'mouse';
    let selected = null;
    let selectedCell = null;
    let located = null;
    let lastTap = null;
    let transition = null;
    const pointers = new Map();
    const keys = new Set();
    let sharperRequested = false;
    function sharpenPortraits() {
        if (sharperRequested || !onSharpen)
            return;
        sharperRequested = true;
        Promise.resolve(onSharpen()).catch(() => { });
    }
    function wake() { if (opened && !destroyed && !frame && !document.hidden)
        frame = requestAnimationFrame(render); }
    function change() { dirty = true; wake(); }
    function halt(keepLocation = false) { transition = null; state.vx = 0; state.vy = 0; if (!keepLocation)
        located = null; }
    function setView(all) {
        halt();
        overview = all;
        if (all)
            choose(null);
        transition = { x: all ? 0 : coreX(), y: all ? 0 : coreY(), zoom: all ? fitZoom : homeZoom() };
        if (reducedMotion.matches) {
            Object.assign(state, transition);
            transition = null;
        }
        change();
    }
    function zoomAt(factor, clientX = width / 2, clientY = height / 2) {
        halt();
        const next = THREE.MathUtils.clamp(state.zoom * factor, fitZoom, 1.8);
        if (next <= fitZoom * 1.001) {
            setView(true);
            return;
        }
        const [x, y] = unbendPoint(clientX - width / 2, height / 2 - clientY, height);
        state.x += x / state.zoom - x / next;
        state.y += y / state.zoom - y / next;
        state.zoom = next;
        overview = false;
        change();
    }
    function hitTest(clientX, clientY) {
        const [x, y] = unbendPoint(clientX - width / 2, height / 2 - clientY, height);
        const wx = x / state.zoom + state.x, wy = y / state.zoom + state.y;
        const [col, row] = nearestCell(wx, wy, compact());
        for (let r = row - 1; r <= row + 1; r++)
            for (let c = col - 1; c <= col + 1; c++) {
                if (isDedication(c, r, compact()) || (overview && !isPrimary(c, r, compact())))
                    continue;
                const [cx, cy] = cellCenter(c, r, compact());
                if (Math.hypot(wx - cx, wy - cy) <= RADIUS) {
                    const index = personAt(c, r, collection.count, compact(), !overview);
                    return index < 0 ? null : { index, cell: [c, r] };
                }
            }
        return null;
    }
    function select(index, cell) {
        const next = Number.isInteger(index) && index >= 0 && (index < collection.count || index === authorIndex) ? index : null;
        selectedCell = next === null || next === authorIndex ? null : cell ?? (selected === next ? selectedCell : null) ?? cellForPerson(next, compact());
        selected = next;
        material.uniforms.uSelected.value = next === authorIndex ? -1 : next ?? -1;
        if (dedication)
            dedication.dataset.selected = String(next === authorIndex);
        change();
    }
    function choose(index, cell) {
        select(index, cell);
        if (selected === null)
            onClearSelection?.();
        else
            onSelect?.(selected);
    }
    function openProfile(index) { onOpenProfile?.(index); }
    function updateTiles() {
        if (state.zoom > .7)
            void sharpenPortraits();
        const { left, right, top, bottom } = visibleCells(width, height, state.zoom, state.x, state.y, compact());
        const required = overview ? collection.count : (right - left + 1) * (bottom - top + 1);
        if (required > capacity) {
            capacity = 2 ** Math.ceil(Math.log2(required));
            scene.remove(mesh);
            mesh.dispose();
            indices.dispose();
            indices = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
            indices.setUsage(THREE.DynamicDrawUsage);
            geometry.setAttribute('aPortrait', indices);
            distantGeometry.setAttribute('aPortrait', indices);
            mesh = new THREE.InstancedMesh(geometry, material, capacity);
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.frustumCulled = false;
            scene.add(mesh);
        }
        mesh.geometry = state.zoom < .2 ? distantGeometry : geometry;
        let instance = 0, primary = 0, fullyVisible = 0;
        const matrices = mesh.instanceMatrix.array;
        for (let row = top; row <= bottom; row++)
            for (let col = left; col <= right; col++) {
                if (isDedication(col, row, compact()) || (overview && !isPrimary(col, row, compact())))
                    continue;
                const portrait = personAt(col, row, collection.count, compact(), !overview);
                if (portrait < 0)
                    continue;
                const [x, y] = cellCenter(col, row, compact());
                const [screenX, screenY] = bendPoint((x - state.x) * state.zoom, (y - state.y) * state.zoom, height);
                const margin = TILE * state.zoom;
                if (Math.abs(screenX) > width / 2 + margin || Math.abs(screenY) > height / 2 + margin)
                    continue;
                const offset = instance * 16;
                matrices[offset] = state.zoom;
                matrices[offset + 5] = state.zoom;
                matrices[offset + 10] = state.zoom;
                matrices[offset + 12] = (x - state.x) * state.zoom;
                matrices[offset + 13] = (y - state.y) * state.zoom;
                indices.setX(instance, portrait);
                instance++;
                if (isPrimary(col, row, compact()))
                    primary++;
                if (overview && portraitFitsViewport(x - state.x, y - state.y, state.zoom, width, height))
                    fullyVisible++;
            }
        mesh.count = instance;
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, instance * 16);
        mesh.instanceMatrix.needsUpdate = true;
        indices.clearUpdateRanges();
        indices.addUpdateRange(0, instance);
        indices.needsUpdate = true;
        const [dx, dy] = bendPoint((coreX() - state.x) * state.zoom, (coreY() - state.y) * state.zoom, height);
        if (dedication) {
            dedication.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% - ${dy}px)) scale(${state.zoom})`;
            dedication.dataset.compact = String(state.zoom < homeZoom() * .72);
            dedication.hidden = Math.abs(dx) > width + 600 * state.zoom || Math.abs(dy) > height + 400 * state.zoom;
        }
        canvas.dataset.visiblePortraits = String(instance);
        canvas.dataset.primaryPortraits = String(primary);
        canvas.dataset.wallPosition = `${Math.round(state.x)},${Math.round(state.y)}`;
        canvas.dataset.wallZoom = state.zoom.toFixed(4);
        canvas.dataset.wallOverview = String(overview);
        canvas.dataset.atlasTileSize = String(atlas.tileSize);
        canvas.dataset.fullyVisiblePortraits = overview ? String(fullyVisible) : '';
        onViewChange?.({ overview, count: collection.count, fullyVisible, visible: instance, zoom: state.zoom, position: { x: state.x, y: state.y } });
    }
    function render(now) {
        frame = 0;
        if (!opened || destroyed)
            return;
        const dt = previousTime ? Math.min(now - previousTime, 40) : 16.667;
        previousTime = now;
        if (transition) {
            const mix = 1 - Math.exp(-dt / 85);
            state.x += (transition.x - state.x) * mix;
            state.y += (transition.y - state.y) * mix;
            state.zoom += (transition.zoom - state.zoom) * mix;
            if (Math.abs(state.x - transition.x) + Math.abs(state.y - transition.y) < .05 && Math.abs(state.zoom - transition.zoom) < .00005) {
                Object.assign(state, transition);
                transition = null;
            }
            dirty = true;
        }
        else if (!pointers.size) {
            if (keys.size) {
                const speed = .5 * dt / state.zoom;
                if (keys.has('ArrowLeft'))
                    state.x -= speed;
                if (keys.has('ArrowRight'))
                    state.x += speed;
                if (keys.has('ArrowUp'))
                    state.y += speed;
                if (keys.has('ArrowDown'))
                    state.y -= speed;
                overview = false;
                dirty = true;
            }
            if (Math.abs(state.vx) + Math.abs(state.vy) > .002) {
                state.x += state.vx * dt;
                state.y += state.vy * dt;
                const decay = reducedMotion.matches ? 0 : Math.exp(-dt / 150);
                state.vx *= decay;
                state.vy *= decay;
                dirty = true;
            }
            else {
                state.vx = 0;
                state.vy = 0;
            }
        }
        if (dirty) {
            updateTiles();
            renderer.render(scene, camera);
            dirty = false;
        }
        if (transition || keys.size || (!pointers.size && (state.vx || state.vy)))
            wake();
    }
    function resize() {
        if (!opened || destroyed)
            return;
        const wasCompact = compact();
        const wasHome = (Math.abs(state.x - coreX()) < 1 && Math.abs(state.y - coreY()) < 1 && Math.abs(state.zoom - homeZoom()) < .001) ||
            Boolean(transition && transition.x === coreX() && transition.y === coreY() && transition.zoom === homeZoom());
        const anchorCell = selectedCell ? selectedCell : nearestCell(state.x, state.y, wasCompact);
        const anchorIndex = personAt(...anchorCell, collection.count, wasCompact, true);
        const [anchorX, anchorY] = cellCenter(...anchorCell, wasCompact);
        const anchorOffset = [anchorX - state.x, anchorY - state.y];
        width = innerWidth;
        height = innerHeight;
        fitZoom = overviewZoom(width, height, collection.count);
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        if (wasCompact !== compact() && selected !== null)
            selectedCell = cellForPerson(selected, compact());
        renderer.setSize(width, height);
        camera.left = -width / 2;
        camera.right = width / 2;
        camera.top = height / 2;
        camera.bottom = -height / 2;
        camera.updateProjectionMatrix();
        material.uniforms.uHeight.value = height;
        if (located === authorIndex) {
            state.zoom = homeZoom();
            state.x = coreX();
            state.y = coreY();
        }
        else if (located !== null) {
            selectedCell = cellForPerson(located, compact());
            if (selectedCell) {
                const [x, y] = cellCenter(...selectedCell, compact());
                state.x = x;
                state.y = y;
                state.zoom = compact() ? .9 : 1.05;
            }
        }
        else if (overview) {
            state.zoom = fitZoom;
            state.x = 0;
            state.y = 0;
        }
        else if (wasHome) {
            state.zoom = homeZoom();
            state.x = coreX();
            state.y = coreY();
        }
        else {
            if (wasCompact !== compact() && anchorIndex >= 0) {
                const cell = cellForPerson(anchorIndex, compact());
                if (cell) {
                    const [x, y] = cellCenter(...cell, compact());
                    state.x = x - anchorOffset[0];
                    state.y = y - anchorOffset[1];
                }
            }
            state.zoom = Math.max(state.zoom, fitZoom);
        }
        clearInput();
        halt(true);
        change();
    }
    listen(canvas, 'wheel', event => {
        if (!opened || destroyed || dialogOpen())
            return;
        event.preventDefault();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
        if (event.ctrlKey || event.metaKey) {
            zoomAt(Math.exp(-event.deltaY * unit * .006), event.clientX, event.clientY);
            return;
        }
        halt();
        overview = false;
        lastTap = null;
        state.x += event.deltaX * unit / state.zoom;
        state.y -= event.deltaY * unit / state.zoom;
        change();
    }, { passive: false });
    listen(canvas, 'pointerdown', event => {
        if (!opened || destroyed || dialogOpen())
            return;
        if (event.button !== 0)
            return;
        lastPointerType = event.pointerType;
        canvas.dataset.keyboard = 'false';
        halt();
        canvas.setPointerCapture(event.pointerId);
        canvas.focus({ preventScroll: true });
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, time: event.timeStamp });
        if (pointers.size === 1) {
            moved = false;
            pinched = false;
            startX = event.clientX;
            startY = event.clientY;
        }
        else {
            pinched = true;
            lastTap = null;
        }
        lastMove = event.timeStamp;
    });
    listen(canvas, 'pointermove', event => {
        if (!opened || destroyed || dialogOpen())
            return;
        const last = pointers.get(event.pointerId);
        if (!last) {
            const hover = hitTest(event.clientX, event.clientY)?.index ?? -1;
            if (material.uniforms.uHover.value !== hover) {
                material.uniforms.uHover.value = hover;
                change();
            }
            return;
        }
        const before = [...pointers.values()];
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, time: event.timeStamp });
        if (Math.hypot(event.clientX - startX, event.clientY - startY) > 5)
            moved = true;
        if (pointers.size >= 2) {
            const after = [...pointers.values()];
            const oldDistance = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y);
            const distance = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y);
            const oldX = (before[0].x + before[1].x) / 2, oldY = (before[0].y + before[1].y) / 2;
            const newX = (after[0].x + after[1].x) / 2, newY = (after[0].y + after[1].y) / 2;
            if (oldDistance > 0)
                zoomAt(distance / oldDistance, oldX, oldY);
            if (!overview) {
                const [ox, oy] = unbendPoint(oldX - width / 2, height / 2 - oldY, height);
                const [nx, ny] = unbendPoint(newX - width / 2, height / 2 - newY, height);
                state.x += (ox - nx) / state.zoom;
                state.y += (oy - ny) / state.zoom;
            }
        }
        else if (moved) {
            overview = false;
            const [oldX, oldY] = unbendPoint(last.x - width / 2, height / 2 - last.y, height);
            const [newX, newY] = unbendPoint(event.clientX - width / 2, height / 2 - event.clientY, height);
            const dx = (oldX - newX) / state.zoom, dy = (oldY - newY) / state.zoom;
            state.x += dx;
            state.y += dy;
            const dt = Math.max(8, event.timeStamp - last.time);
            state.vx = reducedMotion.matches ? 0 : THREE.MathUtils.clamp(dx / dt, -2.5, 2.5);
            state.vy = reducedMotion.matches ? 0 : THREE.MathUtils.clamp(dy / dt, -2.5, 2.5);
            lastMove = event.timeStamp;
        }
        change();
    });
    const release = (event) => {
        if (!opened || destroyed || !pointers.has(event.pointerId))
            return;
        pointers.delete(event.pointerId);
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        if (event.timeStamp - lastMove > 90 || event.type !== 'pointerup' || pinched) {
            state.vx = 0;
            state.vy = 0;
        }
        if (!pointers.size && !moved && !pinched && event.type === 'pointerup') {
            const hit = hitTest(event.clientX, event.clientY);
            if (event.pointerType === 'touch' && hit !== null && lastTap?.index === hit.index && event.timeStamp - lastTap.time < 350 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 18) {
                openProfile(hit.index);
                lastTap = null;
            }
            else {
                choose(hit?.index ?? null, hit?.cell);
                lastTap = hit === null || event.pointerType !== 'touch' ? null : { index: hit.index, time: event.timeStamp, x: event.clientX, y: event.clientY };
            }
        }
        else if (moved || pinched)
            lastTap = null;
        change();
    };
    listen(canvas, 'pointerup', release);
    listen(canvas, 'pointercancel', release);
    listen(canvas, 'lostpointercapture', release);
    listen(canvas, 'dblclick', event => {
        if (!opened || destroyed || dialogOpen())
            return;
        event.preventDefault();
        if (moved || pinched || lastPointerType === 'touch')
            return;
        const hit = hitTest(event.clientX, event.clientY);
        if (hit)
            openProfile(hit.index);
    });
    listen(canvas, 'pointerleave', () => { if (opened) {
        material.uniforms.uHover.value = -1;
        change();
    } });
    listen(canvas, 'keydown', event => {
        if (!opened || destroyed || event.isComposing || inputBlocked())
            return;
        if (event.key.startsWith('Arrow')) {
            event.preventDefault();
            halt();
            keys.add(event.key);
            change();
        }
        if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            zoomAt(1.18);
        }
        if (event.key === '-') {
            event.preventDefault();
            zoomAt(1 / 1.18);
        }
        if (event.key === '0') {
            event.preventDefault();
            setView(true);
        }
        if (event.key === 'Home') {
            event.preventDefault();
            setView(false);
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            if (selected !== null)
                openProfile(selected);
            else {
                const hit = hitTest(width / 2, height / 2) ?? hitTest(width / 2 + width * .36, height / 2);
                if (hit !== null)
                    choose(hit.index, hit.cell);
            }
        }
    });
    listen(window, 'keydown', () => { if (opened)
        canvas.dataset.keyboard = 'true'; });
    listen(window, 'keyup', event => { if (opened)
        keys.delete(event.key); });
    listen(window, 'keydown', event => { if (opened && !destroyed && event.key === 'Escape' && !inputBlocked() && !event.defaultPrevented && !event.isComposing) {
        event.preventDefault();
        choose(null);
        setView(false);
        canvas.focus({ preventScroll: true });
    } });
    function clearInput() {
        keys.clear();
        const captured = [...pointers.keys()];
        pointers.clear();
        for (const id of captured)
            if (canvas.hasPointerCapture(id))
                canvas.releasePointerCapture(id);
        state.vx = 0;
        state.vy = 0;
        lastTap = null;
        previousTime = 0;
        moved = false;
        pinched = false;
    }
    listen(reducedMotion, 'change', () => {
        if (!opened || destroyed)
            return;
        if (reducedMotion.matches) {
            state.vx = 0;
            state.vy = 0;
            if (transition) {
                Object.assign(state, transition);
                transition = null;
            }
            change();
        }
    });
    listen(window, 'blur', () => { if (opened)
        clearInput(); });
    listen(canvas, 'blur', () => { if (opened)
        keys.clear(); });
    listen(window, 'resize', resize);
    listen(document, 'visibilitychange', () => {
        if (!opened || destroyed)
            return;
        clearInput();
        if (document.hidden && frame) {
            cancelAnimationFrame(frame);
            frame = 0;
        }
        else
            change();
    });
    function locate(index) {
        if (destroyed || (!Number.isInteger(index)) || index < 0 || (index >= collection.count && index !== authorIndex))
            return;
        halt();
        clearInput();
        overview = false;
        located = index;
        const cell = index === authorIndex ? null : cellForPerson(index, compact());
        if (index !== authorIndex && !cell)
            return;
        select(index, cell ?? undefined);
        const [x, y] = cell ? cellCenter(...cell, compact()) : [coreX(), coreY()];
        transition = { x, y, zoom: index === authorIndex ? homeZoom() : compact() ? .9 : 1.05 };
        if (reducedMotion.matches) {
            Object.assign(state, transition);
            transition = null;
        }
        if (opened)
            canvas.focus({ preventScroll: true });
        change();
    }
    function open(selection = -1, { focus = false } = {}) {
        if (destroyed)
            return;
        opened = true;
        renderer.setClearColor('#161616');
        if (!visited) {
            state.x = coreX();
            state.y = coreY();
            state.zoom = homeZoom();
            overview = false;
            visited = true;
        }
        select(selection);
        resize();
        if (focus)
            canvas.focus({ preventScroll: true });
        canvas.setAttribute('aria-label', '圆形头像照片墙。向任意方向拖动或滚动，双指或 Control 加滚轮缩放。单击选中，双击打开 X 主页。方向键移动，加减键缩放，0 查看全景，Home 或 Escape 回到中心。');
        change();
    }
    function close() {
        opened = false;
        if (frame)
            cancelAnimationFrame(frame);
        frame = 0;
        clearInput();
        halt(true);
        material.uniforms.uHover.value = -1;
        if (dedication)
            dedication.hidden = true;
        renderer.setClearColor('#000000');
    }
    return {
        open,
        resume(selection = selected) { open(selection, { focus: true }); },
        select(index, { focus = false } = {}) { select(index); if (focus && opened)
            canvas.focus({ preventScroll: true }); },
        locate,
        close,
        stop: close,
        pause() { halt(true); clearInput(); if (frame)
            cancelAnimationFrame(frame); frame = 0; },
        isOpen: () => opened && !destroyed,
        zoomAt(factor, x, y) { if (opened && !destroyed)
            zoomAt(factor, x, y); },
        toggleOverview() { if (opened && !destroyed)
            setView(!overview); },
        setView(all) { if (opened && !destroyed)
            setView(Boolean(all)); },
        resize,
        setPortrait(index, portraitTexture) {
            if (destroyed) return;
            material.uniforms.uDetailIndex.value = index;
            material.uniforms.uDetail.value = portraitTexture || texture;
            change();
        },
        setAtlas(nextTexture, nextAtlas) {
            if (destroyed)
                return;
            texture = nextTexture;
            atlas = nextAtlas;
            material.uniforms.uAtlas.value = texture;
            if (material.uniforms.uDetailIndex.value < 0) material.uniforms.uDetail.value = texture;
            material.uniforms.uAtlasInset.value = .5 / atlas.tileSize;
            change();
        },
        destroy() {
            if (destroyed)
                return;
            close();
            destroyed = true;
            events.abort();
            scene.remove(mesh);
            mesh.dispose();
            geometry.dispose();
            distantGeometry.dispose();
            material.dispose();
        },
    };
}
