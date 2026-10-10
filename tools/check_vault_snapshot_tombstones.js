'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'..','web/document-vault-hardening-runtime.js'),'utf8');
new vm.Script(src);
const first=src.indexOf('function restoreFingerprint('),last=src.indexOf('\nfunction restoreSettings(',first);
assert.ok(first>=0&&last>first,'Missing restore atomic section');
const atomicSource=src.slice(first,last);
const row=(id,revision='r1',extra={})=>({
 id,name:id+'.pdf',folder:'زيد',category:'file',mime:'application/pdf',size:7,
 blob:{size:7,type:'application/pdf'},updatedAt:'2026-10-01',createdAt:'2026-10-01',
 syncRevision:revision,syncState:'synced',remoteUpdatedAt:'remote-1',deleted:false,...extra
});
function mockDb(initial){
 let saved=new Map(initial.map(x=>[x.id,x])),transactions=0,abortCount=0,clearCount=0;
 const db={transaction(name,mode){
  assert.equal(name,'items');assert.equal(mode,'readwrite');transactions++;
  const staged=new Map(saved);
  let requestPending=true;
  const tx={oncomplete:null,onerror:null,onabort:null,aborted:false,
   abort(){this.aborted=true;abortCount++},
   objectStore(){return{
      getAll(){
        const req={result:null,onsuccess:null,onerror:null};
        queueMicrotask(()=>{
         req.result=[...staged.values()].map(x=>({...x}));
         req.onsuccess?.();
         queueMicrotask(()=>{
           if(tx.aborted)tx.onabort?.();
           else{saved=staged;tx.oncomplete?.()}
         })
        });
        return req
      },
      put(entry){staged.set(entry.id,entry)},
      clear(){clearCount++;staged.clear()}
   }}
  };
  return tx
 }};
 let seq=0;
 const apply=new Function('openDb','STORE','crypto','Date',atomicSource+';return {applyAtomic,restoreFingerprint}')(
 async()=>db,'items',{randomUUID:()=> 'rev-new-'+(++seq)},Date);
 return {apply:apply.applyAtomic,fingerprint:apply.restoreFingerprint,get saved(){return saved},
  get transactions(){return transactions},get abortCount(){return abortCount},get clearCount(){return clearCount}};
}
(async()=>{
 const active=row('active'),deleted=row('prior-deleted','r-del',{deleted:true,blob:null,size:0,syncState:'pending'}),
  notInBackup=row('removed','r-removed',{syncState:'pending',name:'Recent edit.docx',blob:{size:19,type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},size:19});
 let model=mockDb([active,deleted,notInBackup]);
 const restoredA=row('active','old-restored',{name:'Old version.pdf',remoteUpdatedAt:'',syncState:'pending'});
 const restoredNew=row('new-in-zip','old-zip',{remoteUpdatedAt:'',syncState:'pending'});
 assert.equal(await model.apply([restoredA,restoredNew],{replaceAll:true,expectedRows:[active,deleted,notInBackup]}),true);
 assert.equal(model.transactions,1,'One IndexedDB transaction for snapshot');
 assert.equal(model.clearCount,0,'Never clear pending deletion records');
 assert.equal(model.saved.get('prior-deleted').deleted,true);
 assert.equal(model.saved.get('prior-deleted').syncRevision,'r-del','Original tombstone retains its sync identity');
 const missing=model.saved.get('removed');
 assert.equal(missing.deleted,true,'Removed old item stays as a cloud deletion tombstone');
 assert.equal(missing.blob,null,'Removed contents do not remain in active store');
 assert.equal(missing.syncState,'pending');
 assert.equal(model.saved.get('active').name,'Old version.pdf');
 assert.equal(model.saved.get('active').remoteUpdatedAt,'remote-1','Restore retains remote baseline for safe sync');
 assert.equal(model.saved.get('active').syncState,'pending');
 assert.equal(model.saved.get('new-in-zip').deleted,false);
 assert.equal(model.saved.get('new-in-zip').syncState,'pending');

 model=mockDb([active]);
 await assert.rejects(model.apply([row('new-in-zip')],{replaceAll:true,expectedRows:[row('active','outdated')]}),/VAULT_RESTORE_CONFLICT/);
 assert.equal(model.saved.get('active').deleted,false,'Stale restore never changes any active item');
 assert.equal(model.saved.has('new-in-zip'),false);
 assert.equal(model.abortCount,1,'Stale snapshot is aborted atomically');

 model=mockDb([active,row('local-new')]);
 await assert.rejects(model.apply([row('new')],{replaceAll:true,expectedRows:[active]}),/VAULT_RESTORE_CONFLICT/);
 assert.equal(model.saved.size,2,'Unexpected local file addition blocks stale snapshot');

 model=mockDb([active]);
 await assert.rejects(model.apply([row('same'),row('same')],{replaceAll:true,expectedRows:[active]}),/VAULT_RESTORE_DUPLICATE/);
 assert.equal(model.saved.size,1);
 assert.equal(model.clearCount,0);

 model=mockDb([active,deleted]);
 assert.equal(await model.apply([row('merged')],{replaceAll:false,expectedRows:[active,deleted]}),true);
 assert.equal(model.saved.get('active').deleted,false,'Merge preserves unrelated active file');
 assert.equal(model.saved.get('prior-deleted').deleted,true,'Merge preserves pending deletion');
 assert.equal(model.saved.has('merged'),true);

 model=mockDb([active]);
 await assert.rejects(model.apply([row('merged')],{replaceAll:false,expectedRows:[]}),/VAULT_RESTORE_CONFLICT/);
 assert.equal(model.saved.has('merged'),false,'Stale merge is rejected too');

 assert.match(src,/await applyAtomic\(prepared,\{replaceAll:mode==='snapshot',expectedRows:existing\}\)/);
 assert.doesNotMatch(atomicSource,/store\.clear\(/);
 console.log('Vault snapshot recovery passed: deletion tombstones, remote baseline, atomic stale aborts, merge preservation and duplicate prevention');
})().catch(error=>{console.error(error);process.exitCode=1});
