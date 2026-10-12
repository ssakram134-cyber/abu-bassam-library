'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');

const source=fs.readFileSync('web/document-vault-runtime.js','utf8');
for(const marker of [
 "if(hasPending())return true",
 "function localWriteVersion(item)",
 "async function dbAckPending(snapshot,remoteVersion,keepPending=false,isCurrent=()=>true)",
 "async function dbStoreSyncConflict(snapshot,replacement,copy,isCurrent=()=>true)",
 "async function dbStoreRemoteIfCurrent(snapshot,replacement,isCurrent=()=>true)",
 "const sessionEpoch=vaultSessionEpoch,sessionScope=syncScope()",
 "ensureSyncSession();const row=await service.get('vault',item.id)",
 "await dbStoreSyncConflict(item,remoteItem(remote,remoteBlob,remoteVersion),localCopy)",
 "await dbAckPending(item,String(saved?.updated_at||''))",
 "await dbStoreRemoteIfCurrent(here||null,remoteItem(data,blob,remoteVersion))",
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
 verify(original._localWriteRev===1,'Writes receive a monotonic revision');
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
 console.log('Vault synchronization race checks passed: '+checks+' cases; stale writes, atomic conflicts, safe incoming records and prompt pending sync.')
}
main().catch(e=>{console.error(e);process.exitCode=1});
