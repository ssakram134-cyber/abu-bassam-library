'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('web/document-vault-runtime.js','utf8');
for(const marker of [
 "if(confirmed?.data?.storagePath!==newPath",
 "String(confirmed?.data?.updatedAt||'')!==String(item.updatedAt||'')",
 "const acknowledged=await dbAckPending(item,String(saved?.updated_at||''),false,sessionValid)",
 "if(acknowledged&&oldPath&&oldPath!==newPath)",
 "if(acknowledged&&oldPath)await service.removeVault(oldPath)"
])assert.ok(source.includes(marker),'Unsafe cloud upload acknowledgement guard missing: '+marker);
assert.ok(!source.includes('service.removeVault(newPath).catch'),'Never delete a freshly uploaded cloud file after an unconfirmed RPC response');
const start=source.indexOf('async function syncNow(manual=true){');
const end=source.indexOf('function onShow(){',start);
assert.ok(start>=0&&end>start,'Cannot test canonical synchronization code');
const syncCode=source.slice(start,end);
async function scenario(name){
 let remote={client_id:'doc',data:{id:'doc',name:'document.pdf',mime:'application/pdf',storagePath:'old-revision',deleted:false,updatedAt:'t1'},updated_at:'rev1'};
 let local={id:'doc',name:'document.pdf',category:'file',mime:'application/pdf',size:4,blob:{size:4},createdAt:'t0',updatedAt:'t1',remoteUpdatedAt:'rev1',syncState:'pending',deleted:false,_localWriteRev:'local1'};
 const removed=[],uploaded=[],statuses=[],alerts=[],expectedVersions=[];
 const service={
  get:async()=>remote,
  upsert:async(_kind,id,data,expectedUpdatedAt)=>{
   expectedVersions.push(expectedUpdatedAt);
   if(name!=='failed-upsert'){
    remote={client_id:id,data,updated_at:'rev2'};
    if(name==='concurrent-local-edit')local={...local,name:'newest local edit',updatedAt:'t2',syncState:'pending',_localWriteRev:'local2'}
   }
   if(name==='lost-confirmation')throw Error('response lost after commit');
   if(name==='failed-upsert')throw Error('RPC could not commit');
   return remote
  },
  uploadVault:async()=>{uploaded.push('new-revision');return 'new-revision'},
  removeVault:async path=>{removed.push(path)},
  list:async()=>[remote],
  downloadVault:async()=>({size:4})
 };
 const state={syncing:false,items:[]};
 const scope={
  requireVault:()=>true,state,automaticDue:()=>true,syncPolicy:()=>({wifiOnly:false}),wifiVerified:()=>true,
  navigator:{onLine:true},sessionOk:()=>true,window:{AbuBassamSecurity:{device:()=>({device_id:'test-device'})}},
  setSyncStatus:x=>statuses.push(x),vaultSessionEpoch:0,syncScope:()=> 'test-account:test-device',vaultScopeOk:()=>true,vaultAllowed:()=>true,
  cloud:()=>service,dbAll:async()=>[{...local}],
  dbAckPending:async(original,version)=>{
   if(local._localWriteRev!==original._localWriteRev){local={...local,remoteUpdatedAt:version};return false}
   local={...local,remoteUpdatedAt:version,syncState:'synced'};return true
  },
  dbStoreRemoteIfCurrent:async()=>true,dbStoreSyncConflict:async()=>true,remoteItem:()=>null,uuid:()=>'new-id',niceName:x=>x,
  dbPut:async()=>{},alert:x=>alerts.push(x),refresh:async()=>{state.items=[{...local}]},
  syncSet:()=>{},LAST_SYNC_KEY:'last',logOperation:()=>{}
 };
 const names=Object.keys(scope);
 const fn=new Function(...names,syncCode+';return syncNow')(...names.map(x=>scope[x]));
 const result=await fn(false);
 return {result,removed,uploaded,local,status:statuses.at(-1),alerts,expectedVersions}
}
(async()=>{
 const confirmed=await scenario('lost-confirmation');
 assert.equal(confirmed.result,true,'Lost RPC response after server commit must be reconciled');
 assert.deepEqual(confirmed.expectedVersions,['rev1'],'Update must carry original server revision');
 assert.equal(confirmed.local.syncState,'synced');
 assert.deepEqual(confirmed.removed,['old-revision'],'Only outdated cloud revision is removed after confirmed acknowledgement');
 const failed=await scenario('failed-upsert');
 assert.equal(failed.result,false,'Rejected RPC must stay pending');
 assert.deepEqual(failed.expectedVersions,['rev1'],'Rejected updates must not become unconditional writes');
 assert.equal(failed.local.syncState,'pending');
 assert.deepEqual(failed.removed,[],'Failed RPC with uncertain storage reference must not delete the new upload');
 const edited=await scenario('concurrent-local-edit');
 assert.equal(edited.result,false,'Concurrent local change must remain pending');
 assert.deepEqual(edited.expectedVersions,['rev1'],'Concurrent edits must preserve the version precondition');
 assert.equal(edited.local.name,'newest local edit');
 assert.deepEqual(edited.removed,[],'Do not prune older cloud revisions while a newer local edit is pending');
 console.log('Vault cloud upload safety passed: 3 scenarios; lost acknowledgements, failed RPCs and concurrent local edits.');
})().catch(e=>{console.error(e);process.exitCode=1});
