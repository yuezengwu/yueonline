import * as THREE from 'three';
import { BEND, CELL, TILE, RADIUS, CORE_Y, LAYOUT_CAPACITY, bendPoint, cellCenter, cellForPerson, isDedication, isPrimary, nearestCell, overviewZoom, personAt, portraitFitsViewport, unbendPoint, visibleCells } from './layout';
import { chooseAtlases, validateCollection, type Atlas } from './collection';
import { createSearchIndex, findPeople, normalize } from './search';
import { createKeepsake, portraitSourceRect } from './keepsake';
import './style.css';

// Curved gallery direction: ol-ivier, MIT. See THIRD_PARTY_LICENSES.txt.
type Hit = { index: number; cell: [number, number] };
type Point = { x: number; y: number; time: number };
const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const dedication = document.querySelector<HTMLElement>('#dedication')!;
const loading = document.querySelector<HTMLElement>('#loading')!;
const error = document.querySelector<HTMLElement>('#error')!;
const overviewButton = document.querySelector<HTMLButtonElement>('#overview')!;
const collectionCount = document.querySelector<HTMLElement>('#collection-count')!;
const announcement = document.querySelector<HTMLElement>('#announcement')!;
const bubble = document.querySelector<HTMLElement>('#profile-bubble')!;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
document.querySelector('#retry')!.addEventListener('click', () => location.reload());

async function loadAtlas(atlas: Atlas) {
  const atlasUrl = `${import.meta.env.BASE_URL}${atlas.file}`;
  const response = await fetch(atlasUrl, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Atlas unavailable');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== atlas.bytes) throw new Error('Incomplete atlas');
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (digest !== atlas.sha256) throw new Error('Atlas does not match collection');
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
  try {
    const image = new Image(); image.src = url;
    await image.decode();
    if (image.naturalWidth !== atlas.width || image.naturalHeight !== atlas.height) throw new Error('Invalid atlas dimensions');
    const texture = new THREE.Texture(image); texture.needsUpdate = true;
    return { texture, atlasUrl };
  } finally { URL.revokeObjectURL(url); }
}
async function loadCollection(maxTextureSize: number) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}people.json`, { cache: 'no-cache', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Collection unavailable');
      const collection = validateCollection(await response.json(), LAYOUT_CAPACITY, import.meta.env.DEV);
      const atlases = chooseAtlases(collection, maxTextureSize, innerWidth < 600);
      if (!atlases.length) throw new Error('No supported atlas size');
      for (const atlas of atlases) {
        try { return { collection, atlas, ...await loadAtlas(atlas) }; }
        catch (reason) { lastError = reason; }
      }
    } catch (reason) { lastError = reason; }
  }
  throw lastError;
}
function configureTexture(texture: THREE.Texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
}
async function main() {
  let stopped = false, frame = 0;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();stopped=true;
    if(frame){cancelAnimationFrame(frame);frame=0;}
    document.querySelectorAll<HTMLInputElement | HTMLButtonElement>('#people-search input, #people-search button, .view-controls button').forEach(control=>{control.disabled=true;});
    document.querySelector<HTMLElement>('#search-panel')!.hidden=true;
    bubble.hidden=true;loading.hidden=true;error.hidden=false;
    canvas.dataset.ready='false';canvas.style.pointerEvents='none';
    announcement.textContent='照片墙显示已中断，请重新载入。';
  });
  canvas.addEventListener('webglcontextrestored',()=>location.reload());
  const loaded = await loadCollection(renderer.capabilities.maxTextureSize);
  const { collection } = loaded;
  let { texture, atlasUrl, atlas } = loaded;
  if(stopped){texture.dispose();return;}
  renderer.setClearColor('#161616');
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  configureTexture(texture);
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
      uAtlas: { value: texture }, uAtlasGrid: { value: new THREE.Vector2(collection.atlasColumns, collection.atlasRows) },
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
      uniform sampler2D uAtlas; uniform vec2 uAtlasGrid; uniform float uAtlasInset;
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
  const homeZoom = () => Math.max(.02,Math.min(.62, (width - 48) / (compact() ? 800 : 1180), (height - 170) / (compact() ? 1150 : 680)));
  const state = { x: coreX(), y: coreY(), zoom: homeZoom(), vx: 0, vy: 0 };
  let fitZoom = overviewZoom(width, height), overview = false;
  let previousTime = 0, dirty = true, moved = false, pinched = false;
  let startX = 0, startY = 0, lastMove = 0;
  let lastPointerType = 'mouse';
  let selected: number | null = null;
  let selectedCell: [number, number] | null = null;
  let located: number | null = null;
  let lastTap: { index: number; time: number; x: number; y: number } | null = null;
  let transition: { x: number; y: number; zoom: number } | null = null;
  const pointers = new Map<number, Point>();
  const keys = new Set<string>();
  let sharperRequested = false;
  async function sharpenPortraits() {
    const sharper = chooseAtlases(collection,renderer.capabilities.maxTextureSize,false)[0];
    if(sharperRequested || !sharper || sharper.tileSize<=atlas.tileSize)return;
    sharperRequested=true;
    try {
      const next=await loadAtlas(sharper);
      if(stopped){next.texture.dispose();return;}
      configureTexture(next.texture);
      const previous=texture;
      texture=next.texture;atlasUrl=next.atlasUrl;atlas=sharper;
      material.uniforms.uAtlas.value=texture;
      material.uniforms.uAtlasInset.value=.5/atlas.tileSize;
      previous.dispose();
      document.querySelectorAll<HTMLElement>('.search-portrait').forEach(portrait=>{portrait.style.backgroundImage=`url("${atlasUrl}")`;});
      change();
    } catch { /* Keep the already verified, usable texture when refinement fails. */ }
  }
  function wake() { if (!stopped && !frame && !document.hidden) frame = requestAnimationFrame(render); }
  function change() { dirty = true; wake(); }
  function halt(keepLocation = false) { transition = null; state.vx = 0; state.vy = 0; if (!keepLocation) located = null; }
  function setView(all: boolean) {
    halt(); overview = all;
    if(all)select(null);
    transition = { x: all ? 0 : coreX(), y: all ? 0 : coreY(), zoom: all ? fitZoom : homeZoom() };
    if (reducedMotion.matches) { Object.assign(state, transition); transition = null; }
    change();
  }
  function zoomAt(factor: number, clientX = width / 2, clientY = height / 2) {
    halt();
    const next = THREE.MathUtils.clamp(state.zoom * factor, fitZoom, 1.8);
    if (next <= fitZoom * 1.001) { setView(true); return; }
    const [x, y] = unbendPoint(clientX - width/2, height/2 - clientY, height);
    state.x += x/state.zoom - x/next;
    state.y += y/state.zoom - y/next;
    state.zoom = next; overview = false; change();
  }
  function hitTest(clientX: number, clientY: number): Hit | null {
    const [x, y] = unbendPoint(clientX-width/2, height/2-clientY, height);
    const wx = x/state.zoom+state.x, wy = y/state.zoom+state.y;
    const [col, row] = nearestCell(wx, wy,compact());
    for (let r = row-1; r <= row+1; r++) for (let c = col-1; c <= col+1; c++) {
      if (isDedication(c,r,compact()) || (overview && !isPrimary(c,r,compact()))) continue;
      const [cx,cy] = cellCenter(c,r,compact());
      if (Math.hypot(wx-cx,wy-cy) <= RADIUS) { const index = personAt(c,r,collection.count,compact(),!overview); return index < 0 ? null : { index, cell: [c,r] }; }
    }
    return null;
  }
  function select(index: number | null, cell?: [number, number]) {
    selectedCell = index === null ? null : cell ?? cellForPerson(index, compact());
    selected = index; material.uniforms.uSelected.value = index ?? -1;
    canvas.dataset.selected = index === null ? '' : collection.people[index].handle;
    bubble.hidden = index === null;
    if (index !== null) {
      const person = collection.people[index];
      document.querySelector('#bubble-name')!.textContent = person.displayName;
      document.querySelector('#bubble-handle')!.textContent = `@${person.handle}`;
      document.querySelector('#bubble-bio')!.textContent = person.bio || (person.bioStatus === 'empty' ? '这位朋友还没有填写个人简介。' : '暂时无法获取这位朋友的简介。');
      document.querySelector<HTMLElement>('#bubble-avatar-note')!.hidden = person.avatarStatus !== 'unavailable';
      document.querySelector<HTMLAnchorElement>('#bubble-link')!.href = `https://x.com/${encodeURIComponent(person.handle)}`;
    }
    announcement.textContent = index === null ? '已取消选中。' : `${collection.people[index].displayName}，@${collection.people[index].handle}。双击或按 Enter 打开 X 主页。`;
    change();
  }
  function openProfile(index: number) {
    window.open(`https://x.com/${encodeURIComponent(collection.people[index].handle)}`, '_blank', 'noopener,noreferrer');
  }
  function positionBubble() {
    if (selected === null || !selectedCell) { bubble.hidden = true; return; }
    const [x,y] = cellCenter(...selectedCell,compact());
    const rawX = (x-state.x)*state.zoom, rawY = (y-state.y)*state.zoom;
    const [dx,dy] = bendPoint(rawX,rawY,height);
    const sx = width/2+dx, sy = height/2-dy;
    const radius = RADIUS*state.zoom*(1+BEND*(rawX*rawX+rawY*rawY)/(height*height));
    if(sx < -radius || sx > width+radius || sy < -radius || sy > height+radius) { bubble.hidden = true; return; }
    bubble.hidden = false;
    bubble.style.maxHeight = '';
    const bw = bubble.offsetWidth;
    let bh = bubble.offsetHeight;
    let left = sx+radius+16, top = sy-bh/2;
    if(left+bw > width-16) {
      left = sx-radius-16-bw;
      if(left < 16) {
        left = sx-bw/2;
        const below = height-90-sy-radius-16, above = sy-radius-16-80;
        const placeBelow = bh <= below || (bh > above && below >= above);
        const available = Math.max(0,placeBelow ? below : above);
        if(available < 120) {
          // A short viewport cannot fit a readable card beside the portrait.
          // Keep a usable, scrollable card inside the space between the controls.
          bubble.style.maxHeight=`${Math.max(100,height-170)}px`;bh=bubble.offsetHeight;
          top=(height-bh)/2;
        } else {
          if(bh > available) { bubble.style.maxHeight = `${available}px`; bh = bubble.offsetHeight; }
          top = placeBelow ? sy+radius+16 : sy-radius-16-bh;
        }
      }
    }
    bubble.style.left = `${Math.max(16,Math.min(left,width-bw-16))}px`;
    bubble.style.top = `${Math.max(80,Math.min(top,height-bh-90))}px`;
  }
  document.querySelector('#bubble-close')!.addEventListener('click',()=>{select(null);canvas.focus({preventScroll:true});});
  function updateTiles() {
    if(state.zoom>.7)void sharpenPortraits();
    const {left,right,top,bottom}=visibleCells(width,height,state.zoom,state.x,state.y,compact());
    const required=overview?collection.count:(right-left+1)*(bottom-top+1);
    if(required>capacity){
      capacity=2**Math.ceil(Math.log2(required));
      scene.remove(mesh);mesh.dispose();indices.dispose();
      indices=new THREE.InstancedBufferAttribute(new Float32Array(capacity),1);
      indices.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('aPortrait',indices);distantGeometry.setAttribute('aPortrait',indices);
      mesh=new THREE.InstancedMesh(geometry,material,capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;scene.add(mesh);
    }
    mesh.geometry=state.zoom<.2?distantGeometry:geometry;
    let instance = 0, primary = 0, fullyVisible = 0;
    const matrices=mesh.instanceMatrix.array;
    for (let row=top; row<=bottom; row++) for (let col=left; col<=right; col++) {
      if (isDedication(col,row,compact()) || (overview && !isPrimary(col,row,compact()))) continue;
      const portrait = personAt(col,row,collection.count,compact(),!overview);
      if (portrait < 0) continue;
      const [x,y] = cellCenter(col,row,compact());
      const [screenX,screenY] = bendPoint((x-state.x)*state.zoom,(y-state.y)*state.zoom,height);
      const margin = TILE*state.zoom;
      if (Math.abs(screenX)>width/2+margin || Math.abs(screenY)>height/2+margin) continue;
      const offset=instance*16;
      matrices[offset]=state.zoom;matrices[offset+5]=state.zoom;matrices[offset+10]=state.zoom;
      matrices[offset+12]=(x-state.x)*state.zoom;matrices[offset+13]=(y-state.y)*state.zoom;
      indices.setX(instance,portrait); instance++;
      if (isPrimary(col,row,compact())) primary++;
      if (overview && portraitFitsViewport(x-state.x,y-state.y,state.zoom,width,height)) fullyVisible++;
    }
    mesh.count=instance;
    mesh.instanceMatrix.clearUpdateRanges();mesh.instanceMatrix.addUpdateRange(0,instance*16);mesh.instanceMatrix.needsUpdate=true;
    indices.clearUpdateRanges();indices.addUpdateRange(0,instance);indices.needsUpdate=true;
    const [dx,dy] = bendPoint((coreX()-state.x)*state.zoom,(coreY()-state.y)*state.zoom,height);
    dedication.style.transform=`translate(calc(-50% + ${dx}px), calc(-50% - ${dy}px)) scale(${state.zoom})`;
    dedication.dataset.compact=String(state.zoom < homeZoom()*.72);
    dedication.hidden=Math.abs(dx)>width+600*state.zoom || Math.abs(dy)>height+400*state.zoom;
    overviewButton.textContent=overview ? '回到中心' : '看见所有人';
    canvas.dataset.visiblePortraits=String(instance); canvas.dataset.primaryPortraits=String(primary);
    canvas.dataset.position=`${Math.round(state.x)},${Math.round(state.y)}`;
    canvas.dataset.zoom=state.zoom.toFixed(4); canvas.dataset.overview=String(overview);
    canvas.dataset.atlasTileSize=String(atlas.tileSize);
    canvas.dataset.fullyVisiblePortraits=overview?String(fullyVisible):'';
    collectionCount.textContent=overview
      ? `全景 ${fullyVisible.toLocaleString('en-US')}/${collection.count.toLocaleString('en-US')} 位 · `
      : `${collection.count} 位已集合 · `;
    positionBubble();
  }
  function render(now: number) {
    frame=0;
    const dt=previousTime ? Math.min(now-previousTime,40) : 16.667; previousTime=now;
    if (transition) {
      const mix=1-Math.exp(-dt/85);
      state.x+=(transition.x-state.x)*mix; state.y+=(transition.y-state.y)*mix;
      state.zoom+=(transition.zoom-state.zoom)*mix;
      if (Math.abs(state.x-transition.x)+Math.abs(state.y-transition.y)<.05 && Math.abs(state.zoom-transition.zoom)<.00005) { Object.assign(state,transition); transition=null; }
      dirty=true;
    } else if (!pointers.size) {
      if (keys.size) {
        const speed=.5*dt/state.zoom;
        if(keys.has('ArrowLeft')) state.x-=speed;
        if(keys.has('ArrowRight')) state.x+=speed;
        if(keys.has('ArrowUp')) state.y+=speed;
        if(keys.has('ArrowDown')) state.y-=speed;
        overview=false; dirty=true;
      }
      if(Math.abs(state.vx)+Math.abs(state.vy)>.002) {
        state.x+=state.vx*dt; state.y+=state.vy*dt;
        const decay=reducedMotion.matches?0:Math.exp(-dt/150);
        state.vx*=decay; state.vy*=decay; dirty=true;
      } else {state.vx=0;state.vy=0;}
    }
    if(dirty) {updateTiles();renderer.render(scene,camera);dirty=false;}
    if(transition || keys.size || (!pointers.size && (state.vx || state.vy))) wake();
  }
  function resize() {
    const wasCompact=compact();
    const wasHome=(Math.abs(state.x-coreX())<1 && Math.abs(state.y-coreY())<1 && Math.abs(state.zoom-homeZoom())<.001) ||
      Boolean(transition && transition.x===coreX() && transition.y===coreY() && transition.zoom===homeZoom());
    const anchorCell=selectedCell && !bubble.hidden ? selectedCell : nearestCell(state.x,state.y,wasCompact);
    const anchorIndex=personAt(...anchorCell,collection.count,wasCompact,true);
    const [anchorX,anchorY]=cellCenter(...anchorCell,wasCompact);
    const anchorOffset=[anchorX-state.x,anchorY-state.y];
    width=innerWidth;height=innerHeight;fitZoom=overviewZoom(width,height);
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    if(wasCompact!==compact() && selected!==null)selectedCell=cellForPerson(selected,compact());
    renderer.setSize(width,height);
    camera.left=-width/2;camera.right=width/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();
    material.uniforms.uHeight.value=height;
    if(located !== null) {
      selectedCell=cellForPerson(located,compact());
      if(selectedCell) {const [x,y]=cellCenter(...selectedCell,compact());state.x=x;state.y=y;state.zoom=compact()?.9:1.05;}
    }
    else if(overview) {state.zoom=fitZoom;state.x=0;state.y=0;}
    else if(wasHome) { state.zoom=homeZoom();state.x=coreX();state.y=coreY(); }
    else {
      if(wasCompact!==compact() && anchorIndex>=0) {
        const cell=cellForPerson(anchorIndex,compact());
        if(cell){const [x,y]=cellCenter(...cell,compact());state.x=x-anchorOffset[0];state.y=y-anchorOffset[1];}
      }
      state.zoom=Math.max(state.zoom,fitZoom);
    }
    clearInput();halt(true);change();
  }
  canvas.addEventListener('wheel',event=>{
    event.preventDefault();
    const unit=event.deltaMode===1?16:event.deltaMode===2?height:1;
    if(event.ctrlKey || event.metaKey) {zoomAt(Math.exp(-event.deltaY*unit*.006),event.clientX,event.clientY);return;}
    halt();overview=false;lastTap=null;
    state.x+=event.deltaX*unit/state.zoom;state.y-=event.deltaY*unit/state.zoom;
    change();
  },{passive:false});
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    lastPointerType=event.pointerType;
    canvas.dataset.keyboard='false';halt();canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,time:event.timeStamp});
    if(pointers.size===1) {moved=false;pinched=false;startX=event.clientX;startY=event.clientY;}
    else {pinched=true;lastTap=null;}
    lastMove=event.timeStamp;
  });
  canvas.addEventListener('pointermove',event=>{
    const last=pointers.get(event.pointerId);
    if(!last) {
      const hover=hitTest(event.clientX,event.clientY)?.index ?? -1;
      if(material.uniforms.uHover.value!==hover){material.uniforms.uHover.value=hover;change();}
      return;
    }
    const before=[...pointers.values()];
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,time:event.timeStamp});
    if(Math.hypot(event.clientX-startX,event.clientY-startY)>5)moved=true;
    if(pointers.size>=2) {
      const after=[...pointers.values()];
      const oldDistance=Math.hypot(before[0].x-before[1].x,before[0].y-before[1].y);
      const distance=Math.hypot(after[0].x-after[1].x,after[0].y-after[1].y);
      const oldX=(before[0].x+before[1].x)/2,oldY=(before[0].y+before[1].y)/2;
      const newX=(after[0].x+after[1].x)/2,newY=(after[0].y+after[1].y)/2;
      if(oldDistance>0)zoomAt(distance/oldDistance,oldX,oldY);
      if(!overview){
        const [ox,oy]=unbendPoint(oldX-width/2,height/2-oldY,height);
        const [nx,ny]=unbendPoint(newX-width/2,height/2-newY,height);
        state.x+=(ox-nx)/state.zoom;state.y+=(oy-ny)/state.zoom;
      }
    } else if(moved) {
      overview=false;
      const [oldX,oldY]=unbendPoint(last.x-width/2,height/2-last.y,height);
      const [newX,newY]=unbendPoint(event.clientX-width/2,height/2-event.clientY,height);
      const dx=(oldX-newX)/state.zoom,dy=(oldY-newY)/state.zoom;
      state.x+=dx;state.y+=dy;
      const dt=Math.max(8,event.timeStamp-last.time);
      state.vx=reducedMotion.matches?0:THREE.MathUtils.clamp(dx/dt,-2.5,2.5);
      state.vy=reducedMotion.matches?0:THREE.MathUtils.clamp(dy/dt,-2.5,2.5);
      lastMove=event.timeStamp;
    }
    change();
  });
  const release=(event: PointerEvent)=>{
    if(!pointers.has(event.pointerId))return;
    pointers.delete(event.pointerId);
    if(event.timeStamp-lastMove>90 || event.type!=='pointerup' || pinched){state.vx=0;state.vy=0;}
    if(!pointers.size && !moved && !pinched && event.type==='pointerup') {
      const hit=hitTest(event.clientX,event.clientY);
      if(event.pointerType==='touch' && hit!==null && lastTap?.index===hit.index && event.timeStamp-lastTap.time<350 && Math.hypot(event.clientX-lastTap.x,event.clientY-lastTap.y)<18) {
        openProfile(hit.index);lastTap=null;
      } else {select(hit?.index ?? null,hit?.cell);lastTap=hit===null || event.pointerType!=='touch'?null:{index:hit.index,time:event.timeStamp,x:event.clientX,y:event.clientY};}
    } else if(moved || pinched)lastTap=null;
    change();
  };
  canvas.addEventListener('pointerup',release);
  canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('lostpointercapture',release);
  canvas.addEventListener('dblclick',event=>{
    event.preventDefault();
    if(moved || pinched || lastPointerType==='touch')return;
    const hit=hitTest(event.clientX,event.clientY);
    if(hit)openProfile(hit.index);
  });
  canvas.addEventListener('pointerleave',()=>{material.uniforms.uHover.value=-1;change();});
  canvas.addEventListener('keydown',event=>{
    if(event.key.startsWith('Arrow')) {event.preventDefault();halt();keys.add(event.key);change();}
    if(event.key==='+' || event.key==='='){event.preventDefault();zoomAt(1.18);}
    if(event.key==='-'){event.preventDefault();zoomAt(1/1.18);}
    if(event.key==='0'){event.preventDefault();setView(true);}
    if(event.key==='Enter'){
      event.preventDefault();
      if(selected!==null)openProfile(selected);
      else {const hit=hitTest(width/2,height/2) ?? hitTest(width/2+width*.36,height/2);if(hit!==null)select(hit.index,hit.cell);}
    }
  });
  window.addEventListener('keydown',()=>{canvas.dataset.keyboard='true';});
  window.addEventListener('keyup',event=>keys.delete(event.key));
  window.addEventListener('keydown',event=>{if(event.key==='Escape' && !keepsake.isOpen && !event.defaultPrevented && !event.isComposing && !composing){select(null);setView(false);canvas.focus({preventScroll:true});}});
  function clearInput(){keys.clear();pointers.clear();state.vx=0;state.vy=0;lastTap=null;previousTime=0;}
  reducedMotion.addEventListener('change',()=>{
    if(reducedMotion.matches){state.vx=0;state.vy=0;if(transition){Object.assign(state,transition);transition=null;}change();}
  });
  window.addEventListener('blur',clearInput);
  canvas.addEventListener('blur',()=>keys.clear());
  window.addEventListener('resize',resize);
  document.addEventListener('visibilitychange',()=>{
    clearInput();
    if(document.hidden && frame){cancelAnimationFrame(frame);frame=0;}
    else change();
  });
  const searchForm = document.querySelector<HTMLFormElement>('#people-search')!;
  const searchInput = document.querySelector<HTMLInputElement>('#search-input')!;
  const searchPanel = document.querySelector<HTMLElement>('#search-panel')!;
  const searchResults = document.querySelector<HTMLElement>('#search-results')!;
  const searchStatus = document.querySelector<HTMLElement>('#search-status')!;
  const searchClear = document.querySelector<HTMLButtonElement>('#search-clear')!;
  const searchIndex = createSearchIndex(collection.people);
  let matches: number[] = [], activeMatch = -1, composing = false;
  function closeSearch() {
    searchPanel.hidden = true;
    searchInput.setAttribute('aria-expanded','false');
    searchInput.removeAttribute('aria-activedescendant');
    activeMatch = -1;
  }
  const keepsake = createKeepsake({
    selection: () => selected===null ? null : { index:selected, person:collection.people[selected] },
    pause: () => { halt(true);clearInput();closeSearch(); },
    portrait: async index => {
      let image=texture.image as HTMLImageElement;
      let temporary: THREE.Texture | undefined;
      const largest=collection.atlases.reduce((best,item)=>item.tileSize>best.tileSize?item:best);
      if(largest.tileSize>atlas.tileSize) {
        try { temporary=(await loadAtlas(largest)).texture;image=temporary.image as HTMLImageElement; }
        catch { /* The already verified atlas remains usable for the keepsake. */ }
      }
      try {
        const size=image.naturalWidth/collection.atlasColumns;
        const portrait=document.createElement('canvas');portrait.width=size;portrait.height=size;
        const context=portrait.getContext('2d');
        if(!context)throw new Error('Portrait export unavailable');
        context.drawImage(image,...portraitSourceRect(index,collection.count,collection.atlasColumns,size),0,0,size,size);
        return portrait;
      } finally { temporary?.dispose(); }
    },
  });
  function activateMatch(index: number, scroll = true) {
    activeMatch = index;
    [...searchResults.children].forEach((element,i)=>element.setAttribute('aria-selected',String(i===index)));
    const option=searchResults.children[index];
    if(option) {searchInput.setAttribute('aria-activedescendant',option.id);if(scroll)option.scrollIntoView({block:'nearest'});}
    else searchInput.removeAttribute('aria-activedescendant');
  }
  function locatePerson(index: number) {
    const cell = cellForPerson(index,compact());
    if(!cell)return;
    halt();keys.clear();overview=false;located=index;
    const [x,y]=cellCenter(...cell,compact());
    select(index,cell);
    searchInput.value=`@${collection.people[index].handle}`;
    searchClear.hidden=false;closeSearch();
    canvas.focus({preventScroll:true});
    transition={x,y,zoom:compact()?.9:1.05};
    if(reducedMotion.matches){Object.assign(state,transition);transition=null;}
    change();
  }
  function updateSearch() {
    searchClear.hidden=!searchInput.value;
    const query=normalize(searchInput.value).replace(/^@+/, '');
    searchResults.replaceChildren();matches=[];
    if(!query){closeSearch();return;}
    matches=findPeople(searchIndex,query);
    searchStatus.textContent=matches.length ? `${matches.length} 位朋友 · 选择头像即可定位` : '这次合影中暂时没有找到。试试完整的 @用户名。';
    const options=document.createDocumentFragment();
    matches.forEach((index,position)=>{
      const person=collection.people[index];
      const option=document.createElement('button');option.type='button';option.className='search-result';option.id=`search-option-${index}`;
      option.setAttribute('role','option');option.tabIndex=-1;
      option.setAttribute('aria-posinset',String(position+1));option.setAttribute('aria-setsize',String(matches.length));
      const portrait=document.createElement('span');portrait.className='search-portrait';portrait.setAttribute('aria-hidden','true');
      portrait.style.backgroundImage=`url("${atlasUrl}")`;
      portrait.style.backgroundSize=`${collection.atlasColumns*100}% ${collection.atlasRows*100}%`;
      portrait.style.backgroundPosition=`${index%collection.atlasColumns/Math.max(1,collection.atlasColumns-1)*100}% ${Math.floor(index/collection.atlasColumns)/Math.max(1,collection.atlasRows-1)*100}%`;
      const identity=document.createElement('span');identity.className='search-identity';
      const name=document.createElement('span');name.className='search-name';name.textContent=person.displayName;
      const handle=document.createElement('span');handle.className='search-handle';handle.textContent=`@${person.handle}`;
      identity.append(name,handle);option.append(portrait,identity);options.append(option);
      option.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse')event.preventDefault();});
      option.addEventListener('pointermove',event=>{if(event.pointerType==='mouse')activateMatch(position,false);});
      option.addEventListener('click',()=>locatePerson(index));
    });
    searchResults.append(options);searchResults.scrollTop=0;
    searchPanel.hidden=false;searchInput.setAttribute('aria-expanded','true');activateMatch(matches.length?0:-1);
  }
  searchInput.addEventListener('input',()=>{if(!composing)updateSearch();});
  searchInput.addEventListener('compositionstart',()=>{composing=true;});
  searchInput.addEventListener('compositionend',()=>{composing=false;updateSearch();});
  searchInput.addEventListener('focus',()=>{halt();keys.clear();updateSearch();});
  searchForm.addEventListener('submit',event=>{event.preventDefault();if(!composing && matches.length && !searchPanel.hidden)locatePerson(matches[Math.max(0,activeMatch)]);});
  searchForm.addEventListener('keydown',event=>{
    if(composing || event.isComposing)return;
    if(event.key==='Escape') {event.preventDefault();event.stopPropagation();closeSearch();}
    if(event.target===searchInput && (event.key==='ArrowDown' || event.key==='ArrowUp')) {
      event.preventDefault();
      if(searchPanel.hidden)updateSearch();
      else if(matches.length)activateMatch((activeMatch+(event.key==='ArrowDown'?1:-1)+matches.length)%matches.length);
    }
    if(event.target===searchInput && event.ctrlKey && (event.key==='Home' || event.key==='End') && matches.length && !searchPanel.hidden) {
      event.preventDefault();activateMatch(event.key==='Home'?0:matches.length-1);
    }
  });
  searchClear.addEventListener('click',()=>{searchInput.value='';matches=[];closeSearch();searchClear.hidden=true;select(null);searchInput.focus();});
  document.addEventListener('pointerdown',event=>{if(!searchForm.contains(event.target as Node))closeSearch();});
  searchForm.addEventListener('focusout',event=>{if(!searchForm.contains(event.relatedTarget as Node))closeSearch();});
  searchInput.disabled=false;
  document.querySelectorAll<HTMLButtonElement>('.view-controls button').forEach(button=>{button.disabled=false;});
  document.querySelector('#zoom-in')!.addEventListener('click',()=>zoomAt(1.3));
  document.querySelector('#zoom-out')!.addEventListener('click',()=>zoomAt(1/1.3));
  overviewButton.addEventListener('click',()=>setView(!overview));
  resize();loading.hidden=true;document.body.dataset.ready='true';canvas.dataset.ready='true';
  collectionCount.textContent=`${collection.count} 位已集合 · `;
  canvas.dataset.portraitCount=String(collection.count);announcement.textContent=`已集合 ${collection.count} 位朋友。`;
}
main().catch((reason:unknown)=>{console.error('Portrait wall:',reason instanceof Error?reason.message:'Loading failed');loading.hidden=true;error.hidden=false;});
