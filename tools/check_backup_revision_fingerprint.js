'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const source=fs.readFileSync('web/backup-center-runtime.js','utf8');
const start=source.indexOf('async function fingerprint(){'),end=source.indexOf('async function packageBytes(){',start);
assert.ok(start>=0&&end>start,'Automatic backup fingerprint must exist');
const body=source.slice(start,end);
assert.ok(body.includes('x._localWriteRev'), 'Local write token must be in backup fingerprint');
let items=[],settings={};
const f=new Function('backupItems','safeSettings','TextEncoder','digest',
 body+';return fingerprint')(
 async()=>items,()=>settings,class{encode(s){return s}},
 async string=>String(string)
);
(async()=>{
 const original={id:'photo1',name:'photo.png',blob:{size:2048},updatedAt:'2026-10-12T12:00:00Z',
   _localWriteRev:'rev1',category:'image',mime:'image/png',folder:'work'};
 items=[original];
 const baseline=await f();
 assert.equal(await f(),baseline,'Identical archive produces identical fingerprint');
 items=[{...original,_localWriteRev:'rev2'}];
 assert.notEqual(await f(),baseline,'Same-size same-timestamp image edit must trigger backup');
 items=[{...original,mime:'image/jpeg'}];
 assert.notEqual(await f(),baseline,'Document MIME change triggers backup');
 items=[{...original,category:'file'}];
 assert.notEqual(await f(),baseline,'Category change triggers backup');
 items=[{...original,deleted:true,deletedAt:'2026-10-12T13:00:00Z'}];
 assert.notEqual(await f(),baseline,'Trash changes trigger backup');
 items=[original,{id:'second',name:'second',blob:{size:9},_localWriteRev:'a'}];
 const first=await f();
 items.reverse();
 assert.equal(await f(),first,'Fingerprint must be stable independent of IndexedDB item order');
 settings={theme:'dark'};
 assert.notEqual(await f(),first,'Relevant settings changes trigger backup');
 console.log('Backup fingerprint regression passed: 7 cases including same-size image revisions and stable ordering.');
})().catch(e=>{console.error(e);process.exitCode=1});
