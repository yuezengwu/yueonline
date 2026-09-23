import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateCollection, chooseAtlases } from '../src/collection.js';
import { LAYOUT_CAPACITY } from '../src/original-layout.js';
const root=new URL('../public/assets/',import.meta.url);
const data=JSON.parse(readFileSync(new URL('people.json',root),'utf8'));

test('every published atlas has the exact bytes referenced by the collection',()=>{
  assert.equal(validateCollection(data,LAYOUT_CAPACITY),data);
  for(const atlas of data.atlases){
    const bytes=readFileSync(new URL(atlas.file,root));
    assert.equal(bytes.length,atlas.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),atlas.sha256);
  }
});

test('malformed, duplicate, out-of-capacity and stale collection manifests fail before rendering',()=>{
  const changes=[
    d=>{d.schemaVersion=1;}, d=>{d.count--;}, d=>{d.count=LAYOUT_CAPACITY+1;}, d=>{d.layoutCapacity--;},
    d=>{d.people[1000]=d.people[0];}, d=>{d.people[1000].profileUrl='https://example.com/';},
    d=>{d.people[1000].avatarStatus='invented';}, d=>{d.people[0].bioStatus='empty';d.people[0].bio='not empty';},
    d=>{d.atlasRows--;}, d=>{d.atlases=[];}, d=>{d.atlases[0].file='portraits.webp';},
    d=>{d.atlases[0].width++;}, d=>{d.atlases[0].sha256='bad';}, d=>{d.originalCount=1000;},
    d=>{d.portraits.pop();}, d=>{d.portraits[0].file='../portrait.webp';},
    d=>{d.portraits[0].width=8192;}, d=>{d.portraits[0].bytes=9999999;},
    d=>{d.atlases.push(d.atlases[0]);},
  ];
  for(const change of changes){const broken=structuredClone(data);change(broken);assert.throws(()=>validateCollection(broken,LAYOUT_CAPACITY));}
});

test('small preview snapshots remain usable in development but are rejected in production',()=>{
  const preview=structuredClone(data);
  preview.preview=true;preview.count=2;preview.originalCount=2;preview.people=preview.people.slice(0,2);preview.atlasRows=1;
  preview.portraits=preview.portraits.slice(0,2);
  for(const atlas of preview.atlases)atlas.height=atlas.tileSize;
  assert.equal(validateCollection(preview,LAYOUT_CAPACITY,true),preview);
  assert.throws(()=>validateCollection(preview,LAYOUT_CAPACITY));
});

test('texture selection respects device limits, mobile memory and fallback order',()=>{
  // Fixed dimensions exercise exact fallback boundaries independently of how
  // many rows the growing real collection needs.
  const fixture={atlases:[64,32,16].map(tileSize=>({tileSize,bytes:1024,width:64*tileSize,height:55*tileSize}))};
  assert.deepEqual(chooseAtlases(fixture,8192,false).map(a=>a.tileSize),[64,32,16]);
  assert.deepEqual(chooseAtlases(fixture,8192,true,true).map(a=>a.tileSize),[32,16]);
  assert.deepEqual(chooseAtlases(fixture,4096,false).map(a=>a.tileSize),[64,32,16]);
  assert.deepEqual(chooseAtlases(fixture,2048,true).map(a=>a.tileSize),[32,16]);
  assert.deepEqual(chooseAtlases(fixture,1024,false).map(a=>a.tileSize),[16]);
  assert.deepEqual(chooseAtlases(fixture,512,false),[]);
  const tooBig=structuredClone(fixture);tooBig.atlases[1].bytes=2*1024*1024;
  assert.deepEqual(chooseAtlases(tooBig,8192,false,true).map(a=>a.tileSize),[16]);
  const memory={atlases:[{tileSize:64,bytes:1024,width:4096,height:5000}]};
  assert.equal(chooseAtlases(memory,8192,false).length,1);
  assert.equal(chooseAtlases(memory,8192,true).length,0);
  for(const size of [2048,4096,8192,16384])for(const compact of [false,true])
    for(const atlas of chooseAtlases(data,size,compact))assert.ok(Math.max(atlas.width,atlas.height)<=size);
});
