import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/layout.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const layout = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const data = JSON.parse(readFileSync(new URL('../public/people.json', import.meta.url), 'utf8'));

test('the original published cohort keeps its exact membership and order', () => {
  const handles = data.people.slice(0, 995).map(p => p.handle.toLowerCase()).join('\n');
  assert.equal(createHash('sha256').update(handles).digest('hex'), '43116afa71784ce46bcad80b2a1060e221307f58e8e060fe8a7eb3dfeaf1dfd8');
});

for (const compact of [false, true]) {
  test(`infinite exploration has no holes across positive and negative tile boundaries (${compact ? 'mobile' : 'desktop'})`, () => {
    const cols=layout.columnsFor(compact), rows=layout.rowsFor(compact);
    for(let row=-rows;row<rows*2;row++)for(let col=-cols;col<cols*2;col++){
      const index=layout.personAt(col,row,data.count,compact,true);
      if(layout.isDedication(col,row,compact))assert.equal(index,-1);
      else assert.ok(index>=0 && index<data.count, `Empty exploration cell ${col},${row}`);
      if(!layout.isPrimary(col,row,compact))assert.equal(layout.personAt(col,row,data.count,compact),-1);
    }
  });

  test(`overview and exploration agree on every real account position (${compact ? 'mobile' : 'desktop'})`, () => {
    for(let index=0;index<data.count;index++) {
      const cell=layout.cellForPerson(index,compact);
      assert.equal(layout.personAt(...cell,data.count,compact,false),index);
      assert.equal(layout.personAt(...cell,data.count,compact,true),index);
    }
  });
  test(`original portraits keep their published world positions (${compact ? 'mobile' : 'desktop'})`, () => {
    const cols = compact ? 20 : 40, rows = compact ? 52 : 26;
    let index = 0;
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const dedication = compact ? col >= 8 && col < 13 && row >= 22 && row < 30 : col >= 16 && col < 24 && row >= 10 && row < 15;
      if (dedication || index >= 995) continue;
      const cell = layout.cellForPerson(index++, compact);
      assert.ok(cell);
      const [x, y] = layout.cellCenter(...cell, compact);
      assert.equal(x, (col - (cols / 2 - .25) + (row % 2) * .5) * layout.CELL);
      assert.equal(y, ((rows - 1) / 2 - row) * layout.ROW_HEIGHT);
    }
    assert.equal(index, 995);
  });

  test(`every account has one searchable primary position; new accounts fill edge gaps before expanding (${compact ? 'mobile' : 'desktop'})`, () => {
    const seen = new Set();
    for (let row = 0; row < layout.rowsFor(compact); row++) for (let col = 0; col < layout.columnsFor(compact); col++) {
      if (layout.isDedication(col, row, compact)) continue;
      const index = layout.personAt(col, row, data.count, compact);
      if (index < 0) continue;
      assert.ok(!seen.has(index));
      seen.add(index);
      assert.deepEqual(layout.cellForPerson(index, compact), [col, row]);
      assert.equal(layout.isOriginalArea(col, row, compact), index < 1000);
      const world = layout.cellCenter(col, row, compact);
      assert.deepEqual(layout.nearestCell(...world, compact), [col, row]);
    }
    assert.equal(seen.size, data.count);
    for (let index = 0; index < data.count; index++) assert.ok(seen.has(index));
  });

  test(`the original region has no unoccupied portrait cells (${compact ? 'mobile' : 'desktop'})`, () => {
    let occupied = 0;
    for (let row = 0; row < layout.rowsFor(compact); row++) for (let col = 0; col < layout.columnsFor(compact); col++) {
      if (!layout.isOriginalArea(col, row, compact) || layout.isDedication(col, row, compact)) continue;
      assert.ok(layout.personAt(col, row, data.count, compact) >= 0, `Empty cell at ${col},${row}`);
      occupied++;
    }
    assert.equal(occupied, 1000);
  });
}

test('all portrait bounds fit the overview at supported desktop and mobile sizes', () => {
  for (const [width, height] of [[320,568], [375,667], [390,844], [568,320], [390,200], [844,390], [599,800], [600,800], [1024,768], [1440,900], [2560,1440]]) {
    const compact = width < 600, zoom = layout.overviewZoom(width, height);
    for (let index = 0; index < data.count; index++) {
      const [x,y] = layout.cellCenter(...layout.cellForPerson(index,compact), compact);
      for (const dx of [-layout.TILE/2, layout.TILE/2]) for (const dy of [-layout.TILE/2, layout.TILE/2]) {
        const [sx,sy] = layout.bendPoint((x+dx)*zoom, (y+dy)*zoom, height);
        assert.ok(Math.abs(sx) <= width/2 - 21, `${width}×${height}: horizontal clipping`);
        assert.ok(Math.abs(sy) <= height/2 - Math.min(compact ? 96 : 72,height*.3) + 1, `${width}×${height}: vertical clipping`);
      }
    }
  }
});

test('viewport culling keeps every visible primary portrait when zoomed, panned or rotated',()=>{
  for(const [width,height] of [[390,844],[568,320],[390,200],[844,390],[1440,900]]){
    const compact=width<600;
    for(const zoom of [layout.overviewZoom(width,height),.3,1.8])for(const [panX,panY] of [[0,0],[4000,-3000],[-4000,3000]]){
      const bounds=layout.visibleCells(width,height,zoom,panX,panY,compact);
      assert.ok(Object.values(bounds).every(Number.isFinite));
      for(let index=0;index<data.count;index++){
        const [col,row]=layout.cellForPerson(index,compact);
        const [x,y]=layout.cellCenter(col,row,compact);
        const [sx,sy]=layout.bendPoint((x-panX)*zoom,(y-panY)*zoom,height);
        if(Math.abs(sx)<=width/2 && Math.abs(sy)<=height/2){
          assert.ok(col>=bounds.left && col<=bounds.right && row>=bounds.top && row<=bounds.bottom);
        }
      }
    }
  }
});

test('curved hit testing inverts projected portrait positions through pan and zoom', () => {
  for(const height of [320,568,900])for(const zoom of [.05,.3,1.8])for(const x of [-5000,0,5000])for(const y of [-4000,0,4000]){
    const point=[x*zoom,y*zoom];
    const restored=layout.unbendPoint(...layout.bendPoint(...point,height),height);
    assert.ok(Math.abs(restored[0]-point[0])<.001);
    assert.ok(Math.abs(restored[1]-point[1])<.001);
  }
});

test('overview counts only complete portraits inside the viewport, including the reported narrow desktop window',()=>{
  for(const [width,height] of [[806,964],[1440,900],[390,844],[568,320]]){
    const compact=width<600,zoom=layout.overviewZoom(width,height);
    let visible=0;
    for(let index=0;index<data.count;index++){
      const [x,y]=layout.cellCenter(...layout.cellForPerson(index,compact),compact);
      if(layout.portraitFitsViewport(x,y,zoom,width,height))visible++;
    }
    assert.equal(visible,data.count);
  }
  assert.equal(layout.portraitFitsViewport(0,0,1,806,964),true);
  assert.equal(layout.portraitFitsViewport(380,0,1,806,964),false,'A cropped portrait must not count as completely shown');
  assert.equal(layout.portraitFitsViewport(2000,0,1,806,964),false);
});
