import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';


import * as layout from '../src/original-layout.js';
const data = JSON.parse(readFileSync(new URL('../public/assets/people.json', import.meta.url), 'utf8'));

// Independent oracle for the published 2,027-account wall, before its capacity
// grows. This retains the old dimensions, dedication and outer-ring ordering.
function previousPositions(compact) {
  const cols = compact ? 30 : 60, rows = compact ? 76 : 38;
  const innerCols = compact ? 20 : 40, innerRows = compact ? 52 : 26;
  const left = (cols - innerCols) / 2, top = (rows - innerRows) / 2;
  const positions = [], outer = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const dedication = compact ? col >= 13 && col < 18 && row >= 34 && row < 42
      : col >= 26 && col < 34 && row >= 16 && row < 21;
    if (dedication) continue;
    const point = [(col - (cols / 2 - .25) + row % 2 * .5) * layout.CELL,
      ((rows - 1) / 2 - row) * layout.ROW_HEIGHT];
    if (col >= left && col < left + innerCols && row >= top && row < top + innerRows) positions.push(point);
    else outer.push({ point, slot: row * cols + col, distance: Math.max(Math.abs(point[0]) / (innerCols * layout.CELL), Math.abs(point[1]) / (innerRows * layout.ROW_HEIGHT)) });
  }
  outer.sort((a, b) => a.distance - b.distance || a.slot - b.slot);
  return positions.concat(outer.map(({ point }) => point));
}

test('the original published cohort keeps its exact membership and order', () => {
  const handles = data.people.slice(0, 995).map(p => p.handle.toLowerCase()).join('\n');
  assert.equal(createHash('sha256').update(handles).digest('hex'), '43116afa71784ce46bcad80b2a1060e221307f58e8e060fe8a7eb3dfeaf1dfd8');
});

for (const compact of [false, true]) {
  test(`all 2,027 existing portraits keep their exact world coordinates after expansion (${compact ? 'mobile' : 'desktop'})`, () => {
    const previous = previousPositions(compact);
    assert.equal(previous.length, 2240);
    for (let index = 0; index < 2027; index++) {
      assert.deepEqual(layout.cellCenter(...layout.cellForPerson(index, compact), compact), previous[index], `Moved account ${index}`);
    }
    // Unfilled old slots are consumed before any new account enters the new ring.
    for (let index = 2027; index < previous.length; index++) {
      assert.deepEqual(layout.cellCenter(...layout.cellForPerson(index, compact), compact), previous[index]);
    }
  });

  test(`3,500 and 4,000 accounts each have exactly one primary position and invertible hit target (${compact ? 'mobile' : 'desktop'})`, () => {
    for (const count of [3500, 4000, layout.LAYOUT_CAPACITY]) {
      const seen = new Set();
      for (let row = 0; row < layout.rowsFor(compact); row++) for (let col = 0; col < layout.columnsFor(compact); col++) {
        const index = layout.personAt(col, row, count, compact);
        if (index < 0) continue;
        assert.ok(!seen.has(index), `Duplicate account ${index}`);
        seen.add(index);
        assert.deepEqual(layout.cellForPerson(index, compact), [col, row]);
        assert.equal(layout.personAt(col, row, count, compact, true), index);
        const world = layout.cellCenter(col, row, compact);
        for (const [zoom, panX, panY] of [[.04, 0, 0], [.3, 4000, -3000], [1.8, world[0], world[1]]]) {
          const projected = layout.bendPoint((world[0] - panX) * zoom, (world[1] - panY) * zoom, 844);
          const restored = layout.unbendPoint(...projected, 844);
          const hit = layout.nearestCell(restored[0] / zoom + panX, restored[1] / zoom + panY, compact);
          assert.ok(hit[0] === col && hit[1] === row);
          assert.equal(layout.personAt(...hit, count, compact), index);
        }
      }
      assert.equal(seen.size, count);
      assert.equal(layout.cellForPerson(layout.LAYOUT_CAPACITY, compact), null);
    }
  });

  test(`expanded infinite exploration stays populated at distant positive and negative seams (${compact ? 'mobile' : 'desktop'})`, () => {
    const cols = layout.columnsFor(compact), rows = layout.rowsFor(compact);
    for (const count of [3500, 4000]) for (const tileX of [-1000000, -1, 0, 1, 1000000]) for (const tileY of [-1000000, -1, 0, 1, 1000000]) {
      for (const localRow of [-1, 0, 1, Math.floor(rows / 2), rows - 1, rows]) for (const localCol of [-1, 0, 1, Math.floor(cols / 2), cols - 1, cols]) {
        const col = tileX * cols + localCol, row = tileY * rows + localRow;
        const index = layout.personAt(col, row, count, compact, true);
        if (layout.isDedication(col, row, compact)) assert.equal(index, -1);
        else assert.ok(index >= 0 && index < count, `Empty distant cell ${col},${row}`);
        assert.deepEqual(layout.nearestCell(...layout.cellCenter(col, row, compact), compact), [col, row]);
      }
    }
  });

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

test('the exported capacity covers at least 4,000 accounts on both responsive layouts', () => {
  assert.ok(layout.LAYOUT_CAPACITY >= 4000);
  for (const compact of [false, true]) assert.equal(layout.LAYOUT_CAPACITY, layout.columnsFor(compact) * layout.rowsFor(compact) - 40);
});

test('3,500 and 4,000 complete portraits fit every supported viewport without fitting unused capacity', () => {
  for (const [width, height] of [[320,568], [375,667], [390,844], [568,320], [390,200], [844,390], [599,800], [600,800], [806,964], [1024,768], [1440,900], [2560,1440]]) {
    const compact = width < 600;
    for (const count of [3500, 4000]) {
      const zoom = layout.overviewZoom(width, height, count);
      const bounds = layout.visibleCells(width, height, zoom, 0, 0, compact);
      for (let index = 0; index < count; index++) {
        const cell = layout.cellForPerson(index, compact);
        assert.ok(cell[0] >= bounds.left && cell[0] <= bounds.right && cell[1] >= bounds.top && cell[1] <= bounds.bottom);
        const [x, y] = layout.cellCenter(...cell, compact);
        assert.equal(layout.portraitFitsViewport(x, y, zoom, width, height), true, `${width}×${height}: clipped account ${index}/${count}`);
        for (const dx of [-layout.TILE / 2, layout.TILE / 2]) for (const dy of [-layout.TILE / 2, layout.TILE / 2]) {
          const [sx, sy] = layout.bendPoint((x + dx) * zoom, (y + dy) * zoom, height);
          assert.ok(Math.abs(sx) <= width / 2 - 21);
          assert.ok(Math.abs(sy) <= height / 2 - Math.min(compact ? 96 : 72, height * .3) + 1);
        }
      }
    }
    assert.ok(layout.overviewZoom(width, height, 2027) > layout.overviewZoom(width, height, layout.LAYOUT_CAPACITY), 'Empty future capacity must not shrink the current cohort');
  }
});

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
