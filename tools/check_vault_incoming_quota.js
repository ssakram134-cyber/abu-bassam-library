'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const source=fs.readFileSync('web/document-vault-runtime.js','utf8');
const begin=source.indexOf('async function dbStoreSyncConflict(');
const end=source.indexOf('async function dbDisposeTrashIfCurrent(',begin);
assert.ok(begin>=0&&end>begin,'Canonical synchronization writers must exist');
const code=source.slice(begin,end);
for(const marker of ['store.openCursor()','activeExisting+activeNew>MAX_ITEMS',
  'active>=MAX_ITEMS','localWriteVersion(current)!==localWriteVersion(snapshot)'])
  assert.ok(code.includes(marker),'Missing transaction-time quota guard '+marker);
const records=new Map();
let serial=Promise.resolve(),counter=0;
const clone=v=>v===undefined?v:{...v};
const db={transaction(){
 let unlock;const turn=serial;serial=new Promise(resolve=>{unlock=resolve});
 let working,ended=false,pending=0;
 const ready=turn.then(()=>{working=new Map([...records].map(([id,v])=>[id,clone(v)]))});
 const tx={oncomplete:null,onabort:null,onerror:null,error:null,
   abort(){
    if(ended)return;ended=true;
    queueMicrotask(()=>{tx.onabort?.();unlock()})
   }
 };
 const finish=()=>queueMicrotask(()=>{
   if(ended||pending!==0)return;ended=true;
   records.clear();for(const [id,v] of working)records.set(id,clone(v));
   tx.oncomplete?.();unlock()
 });
 const read=select=>{
   pending++;const q={result:null,onsuccess:null,onerror:null};
   ready.then(()=>queueMicrotask(()=>{
     if(ended)return;
     try{q.result=select();q.onsuccess?.()}catch(err){tx.error=err;q.onerror?.();tx.abort()}
     pending--;finish()
   }));
   return q
 };
 tx.objectStore=()=>({
   get:id=>read(()=>clone(working.get(id))),
   openCursor(){
     pending++;const q={result:null,onsuccess:null,onerror:null};let offset=0,ordered=null;
     const advance=()=>{
       if(ended)return;
       if(!ordered)ordered=[...working.values()];
       if(offset<ordered.length){
         q.result={value:clone(ordered[offset]),continue:()=>{offset++;queueMicrotask(advance)}};
         q.onsuccess?.()
       }else{q.result=null;q.onsuccess?.();pending--;finish()}
     };
     ready.then(()=>queueMicrotask(advance));return q
   },
   put:item=>{
     pending++;working.set(item.id,clone(item));
     queueMicrotask(()=>{pending--;finish()})
   },
   delete:id=>{
     pending++;working.delete(id);queueMicrotask(()=>{pending--;finish()})
   }
 });
 return tx
}};
const writers=new Function('openDb','STORE','localWriteVersion','newWriteRevision','MAX_ITEMS',
 code+';return {dbStoreSyncConflict,dbStoreRemoteIfCurrent}')(
 async()=>db,'items',x=>String(x?._localWriteRev??''),()=>String(++counter),1000
);
const {dbStoreSyncConflict,dbStoreRemoteIfCurrent}=writers;
const active=()=>[...records.values()].filter(row=>!row.deleted).length;
function fill(n){
 records.clear();
 for(let i=0;i<n;i++)records.set('existing'+i,{id:'existing'+i,deleted:false,
   syncState:'synced',_localWriteRev:'v1'})
}
async function expectFull(promise){
 await assert.rejects(promise,/1000 ملف نشط/);
 assert.ok(active()<=1000,'Quota exceeded despite rejected transaction')
}
(async()=>{
 fill(1000);
 await expectFull(dbStoreRemoteIfCurrent(null,{id:'extra',deleted:false,syncState:'synced'}));
 assert.equal(records.has('extra'),false,'Full archive must not import a new remote file');

 fill(999);
 assert.equal(await dbStoreRemoteIfCurrent(null,{id:'last',deleted:false}),true);
 assert.equal(active(),1000,'Last free slot can receive one remote item');

 fill(999);
 const two=await Promise.allSettled([
  dbStoreRemoteIfCurrent(null,{id:'one',deleted:false}),
  dbStoreRemoteIfCurrent(null,{id:'two',deleted:false})
 ]);
 assert.equal(two.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(two.filter(x=>x.status==='rejected').length,1);
 assert.equal(active(),1000,'Concurrent remote additions must share one serialized quota');

 fill(1000);
 const current=records.get('existing0');
 assert.equal(await dbStoreRemoteIfCurrent(current,{...current,name:'remote edit'}),true);
 assert.equal(active(),1000,'Updates to active files do not consume another slot');

 fill(1000);
 records.set('trashed',{id:'trashed',deleted:true,syncState:'synced',_localWriteRev:'v1'});
 await expectFull(dbStoreRemoteIfCurrent(records.get('trashed'),{
  id:'trashed',deleted:false,syncState:'synced'
 }));
 assert.equal(records.get('trashed').deleted,true,'Failed restore must preserve tombstone');

 fill(1000);
 const snapshot={id:'existing0',deleted:false,syncState:'pending',_localWriteRev:'v1'};
 records.set(snapshot.id,snapshot);
 await expectFull(dbStoreSyncConflict(snapshot,{...snapshot,syncState:'synced'},{
  id:'new-copy',deleted:false,syncState:'pending'
 }));
 assert.equal(records.get(snapshot.id).syncState,'pending','Rejected conflict must not change original');
 assert.equal(records.has('new-copy'),false,'Rejected conflict must not create half a copy');

 fill(1000);
 const deletedRemote={id:'existing0',deleted:true,syncState:'pending',_localWriteRev:'v1'};
 records.set(deletedRemote.id,deletedRemote);
 assert.equal(active(),999);
 assert.equal(await dbStoreSyncConflict(deletedRemote,{...deletedRemote,syncState:'synced'},{
  id:'conflict-copy',deleted:false,syncState:'pending'
 }),true);
 assert.equal(active(),1000,'Replacing a tombstone with one active copy is allowed');

 fill(999);
 const collision={id:'existing0',deleted:false,syncState:'pending',_localWriteRev:'v1'};
 records.set(collision.id,collision);
 await assert.rejects(dbStoreSyncConflict(collision,{...collision},{
  id:'existing1',deleted:false
 }),/معرف نسخة تعارض المزامنة مستخدم مسبقاً/);
 assert.equal(active(),999,'Collision cannot overwrite someone else’s file');

 fill(1000);
 assert.equal(await dbStoreRemoteIfCurrent(null,{id:'new-tombstone',deleted:true}),true);
 assert.equal(active(),1000,'Deleted metadata may be synced without a new active slot');

 console.log('Vault incoming-file quota passed: 9 cases including remote concurrency, conflict copies and rollback.');
})().catch(error=>{console.error(error);process.exitCode=1});
