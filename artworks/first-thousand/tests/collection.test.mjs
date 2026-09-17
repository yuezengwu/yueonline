import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

async function sourceModule(name) {
  const source=readFileSync(new URL(`../src/${name}.ts`,import.meta.url),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
const {validateCollection,chooseAtlases}=await sourceModule('collection');
const {createSearchIndex,findPeople}=await sourceModule('search');
const root=new URL('../public/',import.meta.url);
const data=JSON.parse(readFileSync(new URL('people.json',root),'utf8'));

test('every published atlas has the exact bytes referenced by the collection',()=>{
  assert.equal(validateCollection(data,2240),data);
  for(const atlas of data.atlases){
    const bytes=readFileSync(new URL(atlas.file,root));
    assert.equal(bytes.length,atlas.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),atlas.sha256);
  }
});

test('malformed, duplicate, out-of-capacity and stale collection manifests fail before rendering',()=>{
  const changes=[
    d=>{d.schemaVersion=1;}, d=>{d.count--;}, d=>{d.count=2241;},
    d=>{d.people[1000]=d.people[0];}, d=>{d.people[1000].profileUrl='https://example.com/';},
    d=>{d.people[1000].avatarStatus='invented';}, d=>{d.people[0].bioStatus='empty';d.people[0].bio='not empty';},
    d=>{d.atlasRows--;}, d=>{d.atlases=[];}, d=>{d.atlases[0].file='portraits.webp';},
    d=>{d.atlases[0].width++;}, d=>{d.atlases[0].sha256='bad';}, d=>{d.originalCount=1000;},
  ];
  for(const change of changes){const broken=structuredClone(data);change(broken);assert.throws(()=>validateCollection(broken,2240));}
});

test('small preview snapshots remain usable in development but are rejected in production',()=>{
  const preview=structuredClone(data);
  preview.preview=true;preview.count=2;preview.originalCount=2;preview.people=preview.people.slice(0,2);preview.atlasRows=1;
  for(const atlas of preview.atlases)atlas.height=atlas.tileSize;
  assert.equal(validateCollection(preview,2240,true),preview);
  assert.throws(()=>validateCollection(preview,2240));
});

test('texture selection respects device limits, mobile memory and fallback order',()=>{
  assert.deepEqual(chooseAtlases(data,8192,false).map(a=>a.tileSize),[128,64,32]);
  assert.deepEqual(chooseAtlases(data,8192,true).map(a=>a.tileSize),[64,32]);
  assert.deepEqual(chooseAtlases(data,4096,false).map(a=>a.tileSize),[64,32]);
  assert.deepEqual(chooseAtlases(data,2048,true).map(a=>a.tileSize),[32]);
  assert.deepEqual(chooseAtlases(data,1024,false),[]);
  for(const size of [2048,4096,8192,16384])for(const compact of [false,true])
    for(const atlas of chooseAtlases(data,size,compact))assert.ok(Math.max(atlas.width,atlas.height)<=size);
});

test('all 2027 handles, including default avatars and the final new account, can be located exactly',()=>{
  const index=createSearchIndex(data.people);
  data.people.forEach((person,i)=>assert.equal(findPeople(index,` @${person.handle.toUpperCase()} `)[0],i));
  assert.equal(findPeople(index,'＠ＳＥＡＲＣＨ＿ＡＩ')[0],data.people.findIndex(p=>p.handle==='search_ai'));
  assert.equal(data.people.filter(p=>p.avatarStatus==='default').length,39);
  assert.equal(data.people.filter(p=>p.avatarStatus==='unavailable').length,1);
});

test('nickname and partial searches expose every result, with exact and prefix matches first',()=>{
  const people=[{handle:'exact',displayName:'甲'}, {handle:'another',displayName:'exact'},
    {handle:'exact_prefix',displayName:'乙'}, {handle:'prefixname',displayName:'exact name'},
    ...Array.from({length:30},(_,i)=>({handle:`user_exact_${i}`,displayName:'昵称'})),
    {handle:'chinese',displayName:'测试昵称'}, {handle:'unicode',displayName:'Café'}];
  const index=createSearchIndex(people);
  assert.deepEqual(findPeople(index,'exact'),Array.from({length:34},(_,i)=>i));
  assert.equal(findPeople(index,'昵称').length,31);
  assert.deepEqual(findPeople(index,'Cafe\u0301'),[35]);
  assert.deepEqual(findPeople(index,' @ '),[]);
  assert.deepEqual(findPeople(index,'no-such-person'),[]);
});
