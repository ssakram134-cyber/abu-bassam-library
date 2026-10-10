'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','web/document-vault-runtime.js'),'utf8');
const hard=fs.readFileSync(path.join(__dirname,'..','web/document-vault-hardening-runtime.js'),'utf8');
new vm.Script(source);new vm.Script(hard);
const section=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i+a.length);assert.ok(i>=0&&j>i);return s.slice(i,j)};
const code=section(source,'const pendingTrashOperations=new Set();','\nfunction syncSnapshot(');
function harness(config={}){
 const events=[],alerts=[],state={filter:'trash'};let call=0;
 const env={requireVault:()=>true,
 restoreTrashRecord:async id=>{events.push('restore:'+id);call++;if(config.restore)return config.restore()},
 permanentlyDeleteTrash:async id=>{events.push('delete:'+id);if(config.remove)return config.remove()},
 state,refresh:async()=>{events.push('refresh');if(config.refresh)throw Error('UI_CRASH')},
 autoSync:()=>false,navigator:{onLine:false},scheduleAutoSync:()=>{},
 logOperation:type=>events.push('log:'+type),alert:msg=>alerts.push(msg),confirm:()=>true};
 return {...new Function(...Object.keys(env),code+';return{restoreTrash,eraseTrash,pendingTrashOperations}')(...Object.values(env)),
 events,alerts,get calls(){return call}};
}
(async()=>{
 let unblock;let x=harness({restore:()=>new Promise(resolve=>{unblock=resolve})});
 const first=x.restoreTrash('a');
 assert.equal(await x.restoreTrash('a'),false,'Duplicate tap must be blocked');
 assert.equal(await x.eraseTrash('a'),false,'Erase cannot race with restore of same item');
 assert.equal(x.calls,1);unblock();
 assert.equal(await first,true);
 assert.equal(x.pendingTrashOperations.size,0);
 x=harness({restore:async()=>{throw Error('QuotaExceededError')}});
 assert.equal(await x.restoreTrash('b'),false);
 assert.deepEqual(x.events,['restore:b'],'Quota rejection must not perform post-commit UI actions');
 x=harness({refresh:true});
 assert.equal(await x.restoreTrash('c'),true,'Committed restore is successful even if UI fails');
 assert.ok(x.alerts.some(m=>m.includes('تمت استعادة الملف')));
 assert.equal(x.calls,1);
 x=harness({refresh:true});
 assert.equal(await x.eraseTrash('d'),true,'Committed permanent delete is successful despite UI');
 assert.ok(x.alerts.some(m=>m.includes('اكتمل الحذف النهائي')));
 x=harness({remove:async()=>{throw Error('QuotaExceededError')}});
 assert.equal(await x.eraseTrash('e'),false);
 assert.deepEqual(x.events,['delete:e']);
 const fn=section(hard,'async function safeRestore(file,options={}){','\nwindow.AbuDocumentVaultHardening=');
 let resolveBytes;
 const file={size:1,arrayBuffer:()=>new Promise(resolve=>{resolveBytes=resolve})};
 const restore=new Function('allowed','MAX_ZIP','Date','alert','window','isEncrypted','$',
 'let restoreLockedUntil=0,restoreInFlight=false;\n'+fn+';return safeRestore')(
 ()=>true,1024,Date,()=>{},{JSZip:null},()=>false,()=>null);
 const firstZip=restore(file,{silentError:true});
 assert.equal(await restore(file,{silentError:true}),false,'ZIP restore must be single-flight');
 resolveBytes(new ArrayBuffer(1));
 assert.equal(await firstZip,false);
 assert.equal(await restore({size:0,arrayBuffer:async()=>new ArrayBuffer(0)},{silentError:true}),false,'ZIP lock must release on failure');

 // Model an IndexedDB QuotaExceededError at the actual items.add call.
 // The same transaction has not committed trash.delete; the original trash row must survive.
 const trashRecordSrc=section(source,'async function restoreTrashRecord(trashId){','\nasync function permanentlyDeleteTrash(');
 const now=Date.now(),original={id:'deleted-photo',sourceId:'photo',scope:'u1:device1',
   name:'original.jpg',folder:'أكرم',expiresAt:now+86400000,blob:{size:11,type:'image/jpeg'},deleted:false};
 const trash=new Map([[original.id,original]]),items=new Map(),operations=[];
 let aborts=0;
 const db={transaction(names,mode){
   assert.deepEqual(names,['items','trash']);
   assert.equal(mode,'readwrite');
   let tx;
   const makeRequest=(value)=>{const req={result:null,onsuccess:null,onerror:null};
     queueMicrotask(()=>{req.result=value;req.onsuccess?.()});return req};
   tx={oncomplete:null,onerror:null,onabort:null,
     abort(){aborts++;queueMicrotask(()=>tx.onabort?.())},
     objectStore(name){
       return name==='trash'?{
         get:id=>makeRequest(trash.get(id)),
         delete:id=>operations.push('trash-delete:'+id),
       }:{
         getAll:()=>makeRequest([...items.values()]),
         add:()=>{operations.push('items-add-attempt');throw Error('QuotaExceededError')},
       }
     }
   };
   return tx
 }};
 const restoreRecord=new Function('openDb','syncScope','Date','uuid','vaultScopeOk',
   'folderEntries','MAX_ITEMS','STORE','TRASH_STORE',trashRecordSrc+';return restoreTrashRecord')(
   async()=>db,()=> 'u1:device1',Date,()=> 'new-restored-id',()=>true,
   ()=>[],1000,'items','trash');
 await assert.rejects(restoreRecord('deleted-photo'),/QuotaExceededError/);
 assert.equal(aborts,1);
 assert.deepEqual(operations,['items-add-attempt'],'No trash deletion can execute before failed item add');
 assert.equal(trash.has('deleted-photo'),true,'Failed storage write must retain original trash Blob');
 assert.equal(trash.get('deleted-photo').blob,original.blob);
 assert.equal(items.size,0);
 console.log('Stage80 trash restore/delete locks, quota-driven IndexedDB abort, committed receipts and ZIP single-flight passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
