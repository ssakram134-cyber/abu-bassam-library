'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');

const source=fs.readFileSync('web/document-vault-runtime.js','utf8');
const advanced=fs.readFileSync('web/document-vault-advanced-runtime.js','utf8');
const hardened=fs.readFileSync('web/document-vault-hardening-runtime.js','utf8');
assert.ok(advanced.includes("itemRevision(item)!==itemRevision(st.item)"),'Replacing a photo must reject changes since editor opened');
assert.ok(advanced.includes("await putItem(next,choice==='2'?item:null,()=>epoch===sessionEpoch"),'Advanced photo save must check current revision');
assert.ok(advanced.includes('_localWriteRev:newWriteRevision()'),'Advanced photo editor must change the revision token');
assert.ok(hardened.includes("if(restoreIdentity()!==initialRestoreIdentity||!allowed('vaultRestoreBackup'))"),'Backup restore must cancel if account or branch changes while unpacking');
assert.ok(hardened.includes("for(const item of items)store.put({...item,_localWriteRev:newWriteRevision()})"),'Restoring a backup must invalidate prior sync snapshots');

for(const marker of [
 "if(hasPending())return true",
 "function localWriteVersion(item)",
 "async function dbAckPending(snapshot,remoteVersion,keepPending=false,isCurrent=()=>true)",
 "async function dbStoreSyncConflict(snapshot,replacement,copy,isCurrent=()=>true)",
 "async function dbStoreRemoteIfCurrent(snapshot,replacement,isCurrent=()=>true)",
 "const sessionEpoch=vaultSessionEpoch,sessionScope=syncScope()",
 "ensureSyncSession();const row=await service.get('vault',item.id)",
 "await dbStoreSyncConflict(item,remoteItem(remote,remoteBlob,remoteVersion),localCopy,sessionValid)",
 "await dbAckPending(item,String(saved?.updated_at||''),false,sessionValid)",
 "await dbStoreRemoteIfCurrent(here||null,remoteItem(data,blob,remoteVersion),sessionValid)",
 "ensureSyncSession();await refresh();ensureSyncSession()"
])assert.ok(source.includes(marker),'Missing vault race-protection invariant: '+marker);

const start=source.indexOf('function localWriteVersion(item){');
const end=source.indexOf('async function dbDelete(id){',start);
assert.ok(start>=0&&end>start,'Atomic vault helper functions must remain available');
const code=source.slice(start,end);
const rows=new Map();
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
const db={transaction(){
 const tx={oncomplete:null,onerror:null,onabort:null,objectStore(){
  return{
   get(id){
    const request={result:undefined,onsuccess:null,onerror:null};
    queueMicrotask(()=>{
     request.result=clone(rows.get(id));
     request.onsuccess?.();
     queueMicrotask(()=>tx.oncomplete?.())
    });
    return request
   },
   put(record){rows.set(record.id,clone(record))},
   delete(id){rows.delete(id)}
  }
 }};
 return tx
}};
const helpers=new Function('openDb','STORE',code+';return {dbPut,dbAckPending,dbStoreSyncConflict,dbStoreRemoteIfCurrent}')(async()=>db,'items');
const {dbPut,dbAckPending,dbStoreSyncConflict,dbStoreRemoteIfCurrent}=helpers;
let checks=0;
function verify(ok,message){assert.ok(ok,message);checks++}

async function main(){
 await dbPut({id:'a',name:'old',syncState:'pending'});
 const original=clone(rows.get('a'));
 verify(typeof original._localWriteRev==='string'&&original._localWriteRev.length>4,'Writes receive a unique revision token');
 await dbPut({...original,name:'newer local edit'});
 const stale=await dbAckPending(original,'remote-v1');
 verify(!stale&&rows.get('a').name==='newer local edit'&&rows.get('a').syncState==='pending'&&rows.get('a').remoteUpdatedAt==='remote-v1','Delayed upload cannot erase a new local edit');
 const latest=clone(rows.get('a'));
 verify(await dbAckPending(latest,'remote-v2')&&rows.get('a').syncState==='synced','Stable upload is acknowledged');
 await dbPut({...rows.get('a'),syncState:'pending',name:'p1'});
 const first=clone(rows.get('a'));
 await dbPut({...first,name:'p2'});
 verify(!(await dbStoreSyncConflict(first,{...first,name:'stale remote'}, {id:'copy',name:'unsafe duplicate'}))&&rows.get('a').name==='p2'&&!rows.has('copy'),'Stale conflict does not replace local data or create a duplicate');
 const current=clone(rows.get('a'));
 verify(await dbStoreSyncConflict(current,{...current,name:'remote',syncState:'synced'},{id:'copy',name:'local recovery',syncState:'pending'})&&rows.get('a').name==='remote'&&rows.get('copy').name==='local recovery','Genuine conflict retains both copies atomically');
 const remoteBefore=clone(rows.get('a'));
 await dbPut({...remoteBefore,name:'another local edit',syncState:'pending'});
 verify(!(await dbStoreRemoteIfCurrent(remoteBefore,{...remoteBefore,name:'stale download'}))&&rows.get('a').name==='another local edit','Stale download cannot overwrite local edits');
 verify(await dbStoreRemoteIfCurrent(null,{id:'remote-only',name:'received',syncState:'synced'})&&rows.has('remote-only'),'New remote file is allowed');
 verify(!(await dbStoreRemoteIfCurrent(null,{id:'remote-only',name:'duplicate'}))&&rows.get('remote-only').name==='received','Late remote response cannot replace a newly-created record');
 const record=clone(rows.get('remote-only'));
 await dbPut({...record,name:'edited',syncState:'pending'});
 verify(!(await dbStoreRemoteIfCurrent(record,null))&&rows.get('remote-only').name==='edited','Remote tombstone cannot delete a concurrently edited file');
 await dbPut({...rows.get('remote-only'),syncState:'synced'});
 verify(await dbStoreRemoteIfCurrent(clone(rows.get('remote-only')),null)&&!rows.has('remote-only'),'Old synced tombstone may be purged');
 await dbPut({id:'session',name:'private',syncState:'pending'});
 const held=clone(rows.get('session'));
 verify(!(await dbAckPending(held,'late',false,()=>false))&&rows.get('session').remoteUpdatedAt===undefined&&rows.get('session').syncState==='pending','Account switch blocks a late sync acknowledgement in its transaction');
 verify(!(await dbStoreSyncConflict(held,{...held,name:'wrong account'},{id:'session-copy',name:'unsafe'},()=>false))&&!rows.has('session-copy')&&rows.get('session').name==='private','Account switch blocks creation of stale conflict copies');
 verify(!(await dbStoreRemoteIfCurrent(null,{id:'session-remote',name:'outside branch'},()=>false))&&!rows.has('session-remote'),'Account switch blocks stale remote additions');


 const dueSource=source.split(/\r?\n/).find(x=>x.startsWith('function automaticDue()'));
 assert.ok(dueSource,'Automatic due function must exist');
 const due=new Function('autoSync','navigator','syncPolicy','wifiVerified','syncGet','LAST_SYNC_KEY','hasPending','return ('+dueSource+')');
 function canSync(options={}){
  const {pending=false,mode='daily',online=true,wifiOnly=false,wifi=true,enabled=true}=options;
  return due(()=>enabled,{onLine:online},()=>({mode,wifiOnly}),()=>wifi,()=>String(Date.now()-60000),'last-sync',()=>pending)()
 }
 verify(canSync({pending:true})===true,'Pending changes must sync immediately in daily mode');
 verify(canSync({pending:true,mode:'weekly'})===true,'Pending changes must sync immediately in weekly mode');
 verify(canSync({pending:true,mode:'manual'})===false,'Manual-only must remain manual');
 verify(canSync({pending:true,wifiOnly:true,wifi:false})===false,'Wi-Fi requirement must remain effective');
 verify(canSync({pending:true,online:false})===false,'Offline mode must retain pending changes');
 verify(canSync({pending:true,enabled:false})===false,'Disabled automatic sync must remain off');

 const advancedCode=advanced.slice(advanced.indexOf('function itemRevision(item){'),advanced.indexOf('function addCss(){'));
 const hardeningCode=hardened.slice(hardened.indexOf('function newWriteRevision(){'),hardened.indexOf('async function blobHash('));
 assert.ok(advancedCode.includes('async function putItem(')&&hardeningCode.includes('async function applyAtomic('),'Independent archive writers must be testable');
 const restoreRecords=new Map();
 const restoreDb={transaction(){
  let aborted=false;
  const tx={oncomplete:null,onerror:null,onabort:null,abort(){aborted=true;queueMicrotask(()=>tx.onabort?.())},objectStore(){
   return{
    get(id){const q={result:null,onsuccess:null};queueMicrotask(()=>{q.result=clone(restoreRecords.get(id));q.onsuccess?.();queueMicrotask(()=>{if(!aborted)tx.oncomplete?.()})});return q},
    put(record){restoreRecords.set(record.id,clone(record));queueMicrotask(()=>{if(!aborted)tx.oncomplete?.()})},
    clear(){restoreRecords.clear();queueMicrotask(()=>{if(!aborted)tx.oncomplete?.()})}
   }
  }};
  return tx
 }};
 const {putItem}=new Function('openDb','STORE',advancedCode+';return {putItem}')(async()=>restoreDb,'items');
 const {put,applyAtomic}=new Function('openDb','STORE',hardeningCode+';return {put,applyAtomic}')(async()=>restoreDb,'items');
 await put({id:'original-photo',name:'first'});
 const priorPhoto=clone(restoreRecords.get('original-photo'));
 verify(typeof priorPhoto._localWriteRev==='string'&&priorPhoto._localWriteRev.length>4,'Backup module generates revision tokens');
 await put({...priorPhoto,name:'changed while editor open'});
 const currentPhoto=clone(restoreRecords.get('original-photo'));
 verify(priorPhoto._localWriteRev!==currentPhoto._localWriteRev,'Backup module changes revision on edit');
 let rejected=false;try{await putItem({...priorPhoto,name:'overwritten'},priorPhoto)}catch(_){rejected=true}
 verify(rejected&&restoreRecords.get('original-photo').name==='changed while editor open','Advanced photo editor rejects stale replacement');
 await putItem({...currentPhoto,name:'approved replacement'},currentPhoto);
 const replaced=clone(restoreRecords.get('original-photo'));
 verify(replaced.name==='approved replacement'&&replaced._localWriteRev!==currentPhoto._localWriteRev,'Advanced photo editor commits a current revision');
 await putItem({id:'new-copy',name:'kept separately'});
 verify(restoreRecords.get('new-copy').name==='kept separately','Advanced photo editor can save a separate copy');
 let duplicate=false;try{await putItem({id:'new-copy',name:'duplicate'})}catch(_){duplicate=true}
 verify(duplicate&&restoreRecords.get('new-copy').name==='kept separately','Advanced photo copy cannot overwrite an existing ID');
 await applyAtomic([{...replaced,name:'restored snapshot'}],{replaceAll:true});
 verify(restoreRecords.get('original-photo').name==='restored snapshot'&&restoreRecords.get('original-photo')._localWriteRev!==replaced._localWriteRev&&!restoreRecords.has('new-copy'),'Snapshot restore invalidates old sync revisions');
 const safeRecord=clone(restoreRecords.get('original-photo'));
 let deniedSave=false;
 try{await putItem({...safeRecord,name:'wrong branch'},safeRecord,()=>false)}catch(_){deniedSave=true}
 verify(deniedSave&&restoreRecords.get('original-photo').name==='restored snapshot','Changing branch during photo commit must cancel write');
 let deniedRestore=false;
 try{await applyAtomic([{id:'other-branch',name:'wrong'}],{replaceAll:true,isCurrent:()=>false})}catch(_){deniedRestore=true}
 verify(deniedRestore&&restoreRecords.get('original-photo').name==='restored snapshot'&&!restoreRecords.has('other-branch'),'Changing branch during restore must preserve existing archive');

 console.log('Vault synchronization race checks passed: '+checks+' cases; stale writes, atomic conflicts, safe incoming records and prompt pending sync.')
}
main().catch(e=>{console.error(e);process.exitCode=1});
