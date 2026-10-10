'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','web/document-vault-runtime.js'),'utf8');
new vm.Script(source);
function between(start,end){
 const from=source.indexOf(start),to=source.indexOf(end,from+start.length);
 assert.ok(from>=0&&to>from,'Missing '+start);
 return source.slice(from,to);
}
const snapshot=new Function(between('function syncSnapshot(','async function dbMarkSyncedIfUnchanged(')+';return syncSnapshot')();
const remoteItem=new Function('niceName',between('function remoteItem(','async function syncNow(')+';return remoteItem')(name=>String(name));
const reconcileSrc=between('async function dbReconcileRemoteDeletionToTrashIfUnchanged(','\nfunction addCss()');
const day=86400000;
let serial=0;
const row=(id='shared')=>({
 id,name:'Original.pdf',category:'file',folder:'زيد',mime:'application/pdf',
 size:5,blob:{size:5,type:'application/pdf'},createdAt:'2026-10-01',updatedAt:'2026-10-09',
 syncRevision:'local-1',remoteUpdatedAt:'server-old',syncState:'synced',deleted:false
});
function model(rows=[],{rejectTrash=false,onRead=null}={}){
 let items=new Map(rows.map(x=>[x.id,{...x}])),trash=new Map(),aborts=0;
 let scope='owner:device-1',allowed=true;
 const db={transaction(names,mode){
  assert.deepEqual(names,['items','trash']);
  assert.equal(mode,'readwrite');
  const draftItems=new Map(items),draftTrash=new Map(trash);
  const tx={
   aborted:false,onabort:null,oncomplete:null,onerror:null,error:null,
   abort(){this.aborted=true;aborts++},
   objectStore(name){
    const store=name==='items'?draftItems:draftTrash;
    return{
     get(id){
      const req={result:null,onsuccess:null,onerror:null};
      queueMicrotask(()=>{
       onRead?.();
       req.result=store.get(id);
       try{req.onsuccess?.()}catch(e){tx.error=e;tx.abort()}
       queueMicrotask(()=>{
        if(tx.aborted)tx.onabort?.();
        else{items=draftItems;trash=draftTrash;tx.oncomplete?.()}
       })
      });
      return req
     },
     add(v){if(rejectTrash&&name==='trash')throw new Error('TRASH_WRITE_FAILED');if(store.has(v.id))throw new Error('DUPLICATE_ID');store.set(v.id,v)},
     put(v){store.set(v.id,v)},
     delete(id){store.delete(id)}
    }
   }
  };
  return tx
 }};
 const reconcile=new Function('openDb','STORE','TRASH_STORE','syncScope','vaultScopeOk','syncSnapshot','remoteItem','niceName','TRASH_MS','uuid',reconcileSrc+';return dbReconcileRemoteDeletionToTrashIfUnchanged')(
  async()=>db,'items','trash',()=>scope,()=>allowed,snapshot,remoteItem,x=>String(x),30*day,()=> 'trash-'+(++serial)
 );
 return{reconcile,get items(){return items},get trash(){return trash},get aborts(){return aborts},
  setScope(v){scope=v},setAllowed(v){allowed=v}}
}
(async()=>{
 const original=row(),deleted={...original,blob:null,size:0,deleted:true,syncState:'pending',syncRevision:'delete-rev'};
 const edited={...original,name:'Remote revised.pdf',updatedAt:'2026-10-09T12:00:00Z',storagePath:'remote-file'};
 const remoteBlob={size:18,type:'application/pdf'};
 let m=model([deleted]);
 assert.equal(await m.reconcile(deleted,{remoteEdited:edited,remoteBlob,remoteVersion:'server-new'}),true);
 assert.equal(m.items.get('shared').deleted,true,'Local delete must NOT turn into a live remote file');
 assert.equal(m.items.get('shared').syncState,'pending');
 assert.equal(m.items.get('shared').remoteUpdatedAt,'server-new');
 assert.notEqual(m.items.get('shared').syncRevision,'delete-rev');
 assert.equal(m.trash.size,1);
 const archived=[...m.trash.values()][0];
 assert.equal(archived.sourceId,'shared');
 assert.equal(archived.scope,'owner:device-1');
 assert.equal(archived.blob,remoteBlob,'The actual revised remote bytes stay recoverable');
 assert.match(archived.name,/تعديل جهاز آخر/);
 assert.equal(archived.syncState,'local-trash');
 assert.ok(archived.expiresAt-archived.deletedAtMs===30*day);
 assert.ok(archived.deletedAtMs<=Date.now()&&archived.deletedAtMs>Date.now()-10000);

 // When the same server revision is already captured, the next pass may upload deletion.
 assert.equal(m.items.get('shared').remoteUpdatedAt,'server-new');
 assert.equal(m.items.get('shared').deleted,true);
 m=model([{...deleted,syncRevision:'newer-local-revision'}]);
 assert.equal(await m.reconcile(deleted,{remoteEdited:edited,remoteBlob,remoteVersion:'server-new'}),false);
 assert.equal(m.trash.size,0,'Stale cloud work cannot append a duplicate or change the deletion');

 // A cloud deletion should not erase the last copy from the other device.
 m=model([original]);
 assert.equal(await m.reconcile(original),true);
 assert.equal(m.items.has(original.id),false);
 assert.equal(m.trash.size,1);
 const recovered=[...m.trash.values()][0];
 assert.equal(recovered.blob,original.blob);
 assert.equal(recovered.sourceId,original.id);
 assert.equal(recovered.folder,'زيد');
 assert.equal(recovered.name,original.name);
 assert.equal(recovered.expiresAt-recovered.deletedAtMs,30*day);

 m=model([{...original,blob:null}]);
 await assert.rejects(m.reconcile({...original,blob:null}),/VAULT_TRASH_EMPTY/);
 assert.equal(m.items.size,1);
 assert.equal(m.trash.size,0);

 m=model([original],{rejectTrash:true});
 await assert.rejects(m.reconcile(original),/TRASH_WRITE_FAILED/);
 assert.equal(m.items.has(original.id),true,'Trash transaction abort cannot delete active file');
 assert.equal(m.trash.size,0);
 assert.equal(m.aborts,1);

 m=model([deleted],{rejectTrash:true});
 await assert.rejects(m.reconcile(deleted,{remoteEdited:edited,remoteBlob,remoteVersion:'server-new'}),/TRASH_WRITE_FAILED/);
 assert.equal(m.items.get('shared').remoteUpdatedAt,'server-old','Failed copy must not advance sync baseline');

 // An account switch / revoked permissions during the transaction aborts cleanly.
 let switched;
 m=model([original],{onRead:()=>switched.setScope('other:device')});
 switched=m;
 await assert.rejects(m.reconcile(original),/VAULT_TRASH_SCOPE/);
 assert.equal(m.items.size,1);
 assert.equal(m.trash.size,0);

 m=model([deleted]);
 await assert.rejects(m.reconcile(deleted,{remoteEdited:edited,remoteBlob:null,remoteVersion:'server-new'}),/VAULT_DELETE_CONFLICT_INVALID/);
 assert.equal(m.items.get('shared').deleted,true);

 // Source integration: upload conflict and pull deletion share the transactional recycle-bin guard.
 assert.match(source,/if\(!await dbReconcileRemoteDeletionToTrashIfUnchanged\(item,\{remoteEdited:remote,remoteBlob,remoteVersion\}\)\)/);
 assert.match(source,/if\(data\.deleted\)\{if\(here&&!await dbReconcileRemoteDeletionToTrashIfUnchanged\(here\)\)/);
 assert.doesNotMatch(source,/dbApplySyncIfUnchanged\(item\.id,item,remoteItem\(remote,remoteBlob,remoteVersion\)\)/);
 assert.match(source,/if\(deletionConflictsSaved\)\{/);
 console.log('Archive cross-device trash tests passed: no deletion resurrection, recoverable remote changes, remote delete retention, scoped atomic aborts');
})().catch(e=>{console.error(e);process.exitCode=1});