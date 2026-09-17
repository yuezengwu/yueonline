import type { Person } from './collection';

const WIDTH = 1200, HEIGHT = 900;
const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';

export function portraitSourceRect(index: number, count: number, columns: number, tileSize: number): [number, number, number, number] {
  if (!Number.isInteger(index) || index < 0 || index >= count || !Number.isInteger(columns) || columns < 1 || !Number.isInteger(tileSize) || tileSize < 1) throw new Error('Invalid portrait');
  return [index % columns * tileSize, Math.floor(index / columns) * tileSize, tileSize, tileSize];
}

export function fitLabel(text: string, maxWidth: number, measure: (value: string) => number): string {
  const singleLine = text.replace(/\s+/gu, ' ').trim();
  if (measure(singleLine) <= maxWidth) return singleLine;
  const parts = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(singleLine)].map(part => part.segment);
  while (parts.length && measure(`${parts.join('')}…`) > maxWidth) parts.pop();
  return `${parts.join('')}…`;
}

function drawPortrait(context: CanvasRenderingContext2D, image: CanvasImageSource, x: number, y: number, radius: number) {
  context.save();
  context.shadowColor = '#0008'; context.shadowBlur = 36; context.shadowOffsetY = 18;
  context.beginPath(); context.arc(x,y,radius,0,Math.PI*2); context.fillStyle='#292929';context.fill();
  context.shadowColor='transparent';
  context.clip(); context.drawImage(image,x-radius,y-radius,radius*2,radius*2);
  context.restore();
  context.beginPath();context.arc(x,y,radius+1,0,Math.PI*2);context.strokeStyle='#ffffff45';context.lineWidth=2;context.stroke();
}

function drawIdentity(context: CanvasRenderingContext2D, name: string, handle: string, x: number) {
  let size=36;
  do { context.font=`400 ${size}px ${FONT}`; if(context.measureText(name).width<=420 || size<=24)break;size-=2; } while(size>=24);
  context.fillStyle='#e5e5e5';context.textAlign='center';
  context.fillText(fitLabel(name,420,value=>context.measureText(value).width),x,620);
  context.font=`400 23px ${FONT}`;context.fillStyle='#92928f';context.fillText(`@${handle}`,x,663);
}

async function makeCard(person: Person, portrait: HTMLCanvasElement): Promise<Blob> {
  const author = document.querySelector<HTMLImageElement>('#dedication img')!;
  await Promise.all([author.decode(),document.fonts.ready]);
  const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;
  const context=canvas.getContext('2d');
  if(!context)throw new Error('Image export unavailable');
  context.fillStyle='#161616';context.fillRect(0,0,WIDTH,HEIGHT);
  const glow=context.createRadialGradient(600,380,50,600,380,620);
  glow.addColorStop(0,'#eeeadf13');glow.addColorStop(1,'#eeeadf00');
  context.fillStyle=glow;context.fillRect(0,0,WIDTH,HEIGHT);
  context.strokeStyle='#ffffff1b';context.lineWidth=1;context.strokeRect(32.5,32.5,1135,835);
  context.textBaseline='alphabetic';context.fillStyle='#eeece7';context.font=`400 76px ${FONT}`;
  const title=document.querySelector('.milestone-label')!.textContent!.replace(/\s+/g,' ').trim();
  context.fillText(title,96,164);
  const date=document.querySelector('.signature')!.textContent!.match(/\d{4}\.\d{2}/)?.[0];
  if(date){context.textAlign='right';context.font=`400 21px ${FONT}`;context.fillStyle='#8e8e89';context.fillText(date,1104,156);}
  drawPortrait(context,portrait,336,408,142);
  drawPortrait(context,author,864,408,142);
  context.textAlign='center';context.fillStyle='#777772';context.font='italic 48px Georgia, serif';context.fillText('&',600,424);
  drawIdentity(context,person.displayName,person.handle,336);
  drawIdentity(context,'岳增五','ZengwuY',864);
  if(person.avatarStatus==='unavailable'){
    context.font=`400 18px ${FONT}`;context.fillStyle='#858580';context.fillText('头像暂不可用，以默认图留念',336,701);
  }
  context.beginPath();context.moveTo(96,750);context.lineTo(1104,750);context.strokeStyle='#ffffff20';context.stroke();
  context.textAlign='left';context.font=`400 28px ${FONT}`;context.fillStyle='#b5b3ae';context.fillText('感谢相遇',96,814);
  context.textAlign='right';context.font=`400 22px ${FONT}`;context.fillStyle='#858580';context.fillText('yueonline.com',1104,814);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Image export failed')),'image/png'));
}

export function createKeepsake(options: {
  selection: () => { index: number; person: Person } | null;
  portrait: (index: number) => Promise<HTMLCanvasElement>;
  pause: () => void;
}) {
  const trigger=document.querySelector<HTMLButtonElement>('#bubble-photo')!;
  const dialog=document.querySelector<HTMLDialogElement>('#photo-dialog')!;
  const picture=document.querySelector<HTMLImageElement>('#photo-preview')!;
  const status=document.querySelector<HTMLElement>('#photo-status')!;
  const download=document.querySelector<HTMLAnchorElement>('#photo-download')!;
  const retry=document.querySelector<HTMLButtonElement>('#photo-retry')!;
  const description=document.querySelector<HTMLElement>('#photo-description')!;
  let generation=0, imageUrl:string|null=null, person:{index:number;person:Person}|null=null;

  function clearImage() {
    picture.hidden=true;picture.removeAttribute('src');download.hidden=true;download.removeAttribute('href');
    if(imageUrl){URL.revokeObjectURL(imageUrl);imageUrl=null;}
  }
  async function generate() {
    if(!person)return;
    const current=++generation, selected=person;
    clearImage();retry.hidden=true;dialog.setAttribute('aria-busy','true');status.textContent='正在生成合影…';
    try {
      const portrait=await options.portrait(selected.index);
      if(current!==generation || !dialog.open)return;
      const blob=await makeCard(selected.person,portrait);
      if(current!==generation || !dialog.open)return;
      imageUrl=URL.createObjectURL(blob);
      picture.alt=`${selected.person.displayName}（@${selected.person.handle}）与岳增五（@ZengwuY）的纪念合影`;
      picture.src=imageUrl;
      await picture.decode();
      if(current!==generation || !dialog.open)return;
      download.href=imageUrl;download.download=`yue-with-${selected.person.handle}.png`;
      picture.hidden=false;download.hidden=false;
      status.textContent='保存这张合影，或在手机上长按图片保存。';
    } catch {
      if(current!==generation || !dialog.open)return;
      clearImage();status.textContent='合影暂时生成失败，请重试。';retry.hidden=false;
    } finally {if(current===generation)dialog.removeAttribute('aria-busy');}
  }
  trigger.addEventListener('click',()=>{
    const selected=options.selection();
    if(!selected || dialog.open)return;
    person=selected;options.pause();
    description.textContent=`${selected.person.displayName} × 岳增五`;
    dialog.showModal();void generate();
  });
  retry.addEventListener('click',()=>void generate());
  document.querySelector('#photo-close')!.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close();});
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;
    const rect=dialog.getBoundingClientRect();
    if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)dialog.close();
  });
  dialog.addEventListener('close',()=>{generation++;person=null;clearImage();dialog.removeAttribute('aria-busy');trigger.focus({preventScroll:true});});
  return { get isOpen(){return dialog.open;} };
}
