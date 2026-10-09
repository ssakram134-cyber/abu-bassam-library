'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'web/document-vault-runtime.js'), 'utf8');
new vm.Script(source, {filename:'document-vault-runtime.js'});
function between(start,end) {
  const i=source.indexOf(start),j=source.indexOf(end,i+start.length);
  assert.ok(i>=0&&j>i,'Missing vault code section '+start);
  return source.slice(i,j);
}
const scope=between('function syncScope()', 'const state=');
const policy=between('function autoSync()', '\nfunction vaultOwner()');
const hasPending=source.match(/^function hasPending\(\)\{.*\}$/m)?.[0];
assert.ok(hasPending);
let activeUser='account-A',connection='wifi';
const map=new Map([['abuBassamVaultLastSyncV4',String(Date.now())],['abuBassamVaultAutoSyncV4','1']]);
const storage={getItem:key=>map.has(key)?map.get(key):null,setItem:(key,val)=>map.set(key,String(val)),removeItem:key=>map.delete(key)};
const state={items:[]};
const navigator={onLine:true,connection:{get type(){return connection}}};
const window={AbuBassamCloud:{session:()=>({user:{id:activeUser}})},AbuBassamSecurity:{device:()=>({device_id:'device-X'})}};
const sandbox={window,localStorage:storage,navigator,state,Date,
  LAST_SYNC_KEY:'abuBassamVaultLastSyncV4',AUTO_SYNC_KEY:'abuBassamVaultAutoSyncV4',SYNC_POLICY_KEY:'abuBassamSyncPolicyV5'};
vm.runInNewContext(scope+'\n'+policy+'\n'+hasPending+
  '\nthis.api={syncGet,syncSet,automaticDue,autoSync}',sandbox);
const api=sandbox.api;
assert.equal(api.syncGet('abuBassamVaultLastSyncV4'),null,'Unscoped legacy last-sync must not be copied into a new account');
assert.equal(map.has('abuBassamVaultLastSyncV4:account-A:device-X'),false);
assert.equal(api.syncGet('abuBassamVaultAutoSyncV4'),'1','Legacy preference can still be migrated');
api.syncSet('abuBassamVaultLastSyncV4',Date.now());
assert.equal(api.automaticDue(),false,'No pending work immediately after a completed daily sync');
state.items=[{id:'offline-1',syncState:'pending',deleted:false}];
assert.equal(api.automaticDue(),true,'New offline file must sync immediately when network returns');
state.items=[{id:'deleted-1',syncState:'pending',deleted:true}];
assert.equal(api.automaticDue(),true,'Pending deletion must also be synced promptly');
map.set('abuBassamSyncPolicyV5',JSON.stringify({mode:'weekly',wifiOnly:false}));
assert.equal(api.automaticDue(),true,'Weekly sync cannot postpone pending local writes');
map.set('abuBassamSyncPolicyV5',JSON.stringify({mode:'manual',wifiOnly:false}));
assert.equal(api.automaticDue(),false,'Manual-only policy must still be respected');
map.set('abuBassamSyncPolicyV5',JSON.stringify({mode:'daily',wifiOnly:true}));
connection='cellular';
assert.equal(api.automaticDue(),false,'Wi-Fi-only policy must still be respected');
connection='wifi';assert.equal(api.automaticDue(),true);
navigator.onLine=false;assert.equal(api.automaticDue(),false,'Offline remains local-only');
navigator.onLine=true;
activeUser='account-B';
assert.equal(api.syncGet('abuBassamVaultLastSyncV4'),null,'Another account cannot inherit prior account timestamp');
assert.equal(api.automaticDue(),true,'Account B pending changes must not be blocked by account A');

// One IndexedDB transaction per file batch. The fake commits only on complete,
// mimicking IDB transaction atomicity rather than emulating browser storage internals.
const batch=source.match(/^async function dbPutBatch\(items\)\{.*\}$/m)?.[0];
const newItem=source.match(/^function newVaultItem\(.*\)\{.*\}$/m)?.[0];
const addFiles=between('async function addFiles(fileList,category,input){','\nfunction findItem(');
assert.ok(batch&&newItem&&addFiles);
function database(failAt=-1) {
  const saved=[];
  return {
    saved,
    async openDb(){
      return {transaction(){
        let changes=[],aborted=false;
        const tx={
          objectStore(){return {add(item){
            if(changes.length===failAt)throw new Error('QUOTA_OR_DUPLICATE');
            if(saved.some(x=>x.id===item.id)||changes.some(x=>x.id===item.id))throw new Error('DUPLICATE_ID');
            changes.push(item);
          }}},
          abort(){aborted=true;changes=[];queueMicrotask(()=>tx.onabort?.())}
        };
        queueMicrotask(()=>{if(!aborted){saved.push(...changes);tx.oncomplete?.()}});
        return tx;
      }};
    }
  };
}
const createBatch=new Function('openDb','STORE',batch+'\nreturn dbPutBatch;');
const goodDb=database();const putBatch=createBatch(goodDb.openDb,'items');
const entries=[{id:'1',blob:'one'},{id:'2',blob:'two'}];
assert.equal(typeof putBatch,'function');
const testWork=(async()=>{
  await putBatch(entries);
  assert.equal(goodDb.saved.length,2);
  const badDb=database(1),tryBatch=createBatch(badDb.openDb,'items');
  await assert.rejects(tryBatch(entries),/QUOTA_OR_DUPLICATE/);
  assert.equal(badDb.saved.length,0,'Any failure must roll back all files');

  function makeUploader({stored=[],blocked=false,refreshFails=false,initialItems=[]}={}){
    const local=stored.slice(),changes=[],alerts=[],statuses=[],busy=[],timers=[];
    const uploadState={items:initialItems,uploading:false,uploadFolder:'المستمسكات',filter:'all'};
    let release,first=true;
    const dbAll=()=>blocked&&first?(first=false,new Promise(res=>{release=()=>res(local.slice())})):Promise.resolve(local.slice());
    const put=async arr=>{local.push(...arr);changes.push(arr.length)};
    const uploader=new Function('state','dbAll','dbPutBatch','newVaultItem','MAX_ITEMS','setBusy','alert','refresh','logOperation','setSyncStatus','autoSync','navigator','setTimeout','syncNow',addFiles+'\nreturn addFiles;')(
      uploadState,dbAll,put,
      new Function('niceName','uuid','fileMime',newItem+'\nreturn newVaultItem;')(
        n=>String(n),(()=>{let i=0;return()=>String(++i)+'-new'})(),(_name,mime)=>mime||'application/octet-stream'),
      1000,(on)=>busy.push(on),msg=>alerts.push(String(msg)),
      ()=>refreshFails?Promise.reject(Error('VIEW_RENDER_FAILED')):Promise.resolve(),
      ()=>{},msg=>statuses.push(msg),()=>true,{onLine:false},fn=>timers.push(fn),()=>{});
    return{uploader,local,changes,alerts,statuses,busy,timers,uploadState,unblock:()=>release?.()};
  }
  const offline=makeUploader();
  const input={value:'selected'};
  assert.equal(await offline.uploader([{name:'A.png',type:'image/png',size:30},{name:'B.pdf',type:'application/pdf',size:45}],'file',input),true);
  assert.equal(offline.local.length,2);
  assert.equal(offline.changes.length,1,'One atomic batch, not independent file writes');
  assert.equal(offline.local.every(r=>r.syncState==='pending'&&r.blob&&r.deleted===false),true);
  assert.equal(offline.timers.length,0,'No online sync timers while offline');
  assert.equal(input.value,'');
  assert.equal(offline.uploadState.uploading,false);

  const full=makeUploader({stored:Array.from({length:1000},(_,i)=>({id:String(i),deleted:false}))});
  assert.equal(await full.uploader([{name:'overflow',size:1}],'file',null),false);
  assert.equal(full.local.length,1000);
  assert.ok(full.alerts.some(x=>x.includes('1000')));

  const concurrent=makeUploader({blocked:true});
  const firstUpload=concurrent.uploader([{name:'first',size:1}],'file');
  assert.equal(await concurrent.uploader([{name:'second',size:1}],'file'),false);
  concurrent.unblock();
  assert.equal(await firstUpload,true);
  assert.equal(concurrent.local.length,1);
  assert.ok(concurrent.alerts.some(x=>x.includes('دفعة أخرى')));

  const uiError=makeUploader({refreshFails:true});
  assert.equal(await uiError.uploader([{name:'persisted',size:1}],'file'),true);
  assert.equal(uiError.local.length,1);
  assert.ok(uiError.alerts.some(x=>x.includes('حُفظت الدفعة')));
  assert.equal(uiError.alerts.some(x=>x.includes('لم تُحفظ الدفعة')),false);
  console.log('Vault offline/atomic checks passed: no cross-account sync timestamp, prompt pending sync, Wi-Fi/manual policies, single-transaction import, quota, concurrency, and post-commit UI failure.');
})();
testWork.catch(error=>{console.error(error);process.exitCode=1});
