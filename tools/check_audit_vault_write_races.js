'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const notification=fs.readFileSync(path.join(root,'web/notification-center-runtime.js'),'utf8');
const vault=fs.readFileSync(path.join(root,'web/document-vault-runtime.js'),'utf8');
new vm.Script(notification,{filename:'notification-center-runtime.js'});
new vm.Script(vault,{filename:'document-vault-runtime.js'});
function slice(a,begin,end){const i=a.indexOf(begin),j=a.indexOf(end,i+begin.length);assert.ok(i>=0&&j>i,'Missing '+begin);return a.slice(i,j)}
const flushing=slice(notification,'async function flushAuditQueue()','\nfunction addCss()');
async function auditScenario(shouldFail=false,changeSameId=false){
  let queue=[{id:'a',details:'old'}],release,started;
  const begun=new Promise(resolve=>started=resolve);
  const save=x=>{queue=x.map(v=>({...v}))};
  const record=async()=>{started();await new Promise(resolve=>release=resolve);if(shouldFail)throw Error('network')};
  const flush=new Function('auditQueue','saveAuditQueue','recordAudit','connected','let auditFlushPromise=null;'+flushing+';return flushAuditQueue')(
    ()=>queue.map(x=>({...x})),save,record,()=>true);
  const pending=flush();await begun;
  queue.push({id:'b',details:'new'});
  if(changeSameId)queue[0]={id:'a',details:'updated during upload'};
  release();await pending;
  assert.ok(queue.some(v=>v.id==='b'),'New audit record must survive an older flush');
  assert.equal(queue.some(v=>v.id==='a'),shouldFail||changeSameId,'Failed/updated audit record must remain queued');
}
const dbFunctions=slice(vault,'function syncSnapshot(','\nfunction addCss()');
const runDb=new Function('openDb','STORE',dbFunctions+';return {syncSnapshot,dbMarkSyncedIfUnchanged}');
function database(seed){
  let stored={...seed};
  return{
    get current(){return stored},
    openDb:async()=>({transaction:()=>{const tx={oncomplete:null,onerror:null,onabort:null,objectStore(){
      return{get(){const r={result:null,onsuccess:null,onerror:null};queueMicrotask(()=>{
        r.result=stored?{...stored}:undefined;r.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.())
      });return r},put(value){stored={...value}}}
    }};return tx}})
  }
}
async function dbScenario(){
  const source={id:'abc',name:'initial',updatedAt:'2026-01-01',size:4,mime:'image/png',blob:{size:4,type:'image/png'},syncRevision:'rev-1',syncState:'pending'};
  const db=database(source),api=runDb(db.openDb,'items');
  assert.equal(await api.dbMarkSyncedIfUnchanged({...source},'server-v1'),true);
  assert.equal(db.current.syncState,'synced');
  assert.equal(db.current.remoteUpdatedAt,'server-v1');
  const changed={...source,syncRevision:'rev-2',name:'changed during upload',syncState:'pending'};
  const other=database(changed),otherApi=runDb(other.openDb,'items');
  assert.equal(await otherApi.dbMarkSyncedIfUnchanged(source,'server-v1'),false);
  assert.equal(other.current.name,'changed during upload');
  assert.equal(other.current.syncState,'pending','Preserve newer pending edits');
  const removed=database({...source,deleted:true,syncRevision:'rev-3',blob:null});
  assert.equal(await runDb(removed.openDb,'items').dbMarkSyncedIfUnchanged(source,'server-v1'),false);
  assert.equal(removed.current.deleted,true,'Preserve deletion during upload');
}
(async()=>{
  await auditScenario(false,false);await auditScenario(true,false);await auditScenario(false,true);await dbScenario();
  assert.match(vault,/if\(!confirmed\)autoSyncRerunRequested=true/,'Queue another sync when write is superseded');
  assert.match(vault,/item\.syncRevision=uuid\(\)/,'Pending local writes need unique revisions');
  console.log('Audit concurrent queue and vault stale upload acknowledgement checks passed')
})().catch(error=>{console.error(error);process.exitCode=1});
