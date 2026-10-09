'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','web/document-vault-runtime.js'),'utf8');
new vm.Script(source);
function section(start,end){
 const at=source.indexOf(start),until=source.indexOf(end,at+start.length);
 assert.ok(at>=0&&until>at,'missing '+start);
 return source.slice(at,until)
}
const snapshotSource=section('function syncSnapshot(', 'async function dbMarkSyncedIfUnchanged(');
const applySource=section('async function dbApplySyncIfUnchanged(', 'function addCss()');
const syncSnapshot=new Function(snapshotSource+';return syncSnapshot')();
const before=(id='file-1')=>({
 id,name:'Book.pdf',folder:'زيد',category:'file',mime:'application/pdf',size:5,
 blob:{size:5,type:'application/pdf'},syncState:'pending',syncRevision:'r1',
 updatedAt:'2026-10-09',remoteUpdatedAt:'server-v1',deleted:false
});
function simulate(items){
 let saved=new Map(items.map(item=>[item.id,{...item}])),transactions=0,aborts=0;
 const database={transaction(name,mode){
   assert.equal(name,'items');assert.equal(mode,'readwrite');transactions++;
   const next=new Map(saved);
   let pending=0,finished=false;
   const tx={
     aborted:false,error:null,oncomplete:null,onerror:null,onabort:null,
     abort(){if(!this.aborted){this.aborted=true;aborts++}},
     objectStore(){return{
       get(id){
         const req={onsuccess:null,onerror:null,result:null};
         dispatch(()=>{req.result=next.get(id);req.onsuccess?.()});
         return req
       },
       openCursor(){
         const req={onsuccess:null,onerror:null,result:null},keys=[...next.keys()];
         let index=0;
         const step=()=>{
           req.result=index<keys.length?{
             value:next.get(keys[index]),
             continue(){index++;dispatch(step)}
           }:null;
           req.onsuccess?.()
         };
         dispatch(step);
         return req
       },
       add(item){
         if(next.has(item.id))throw new Error('DUPLICATE_ID');
         next.set(item.id,item)
       },
       put(item){next.set(item.id,item)},
       delete(id){next.delete(id)}
     }}
   };
   function dispatch(work){
     pending++;
     queueMicrotask(()=>{
       if(!tx.aborted){try{work()}catch(error){tx.error=error;tx.abort()}}
       pending--;
       if(pending===0&&!finished){
         finished=true;
         queueMicrotask(()=>{
           if(tx.aborted)tx.onabort?.();
           else {saved=next;tx.oncomplete?.()}
         })
       }
     })
   }
   return tx
 }};
 const apply=new Function('openDb','STORE','MAX_ITEMS','syncSnapshot',applySource+';return dbApplySyncIfUnchanged')(
   async()=>database,'items',1000,syncSnapshot
 );
 return {apply,get saved(){return saved},get transactions(){return transactions},get aborts(){return aborts}}
}

(async()=>{
 const original=before(),incoming={...original,name:'RemoteBook.pdf',syncRevision:'rRemote',syncState:'synced'};
 let db=simulate([original]);
 assert.equal(await db.apply(original.id,original,incoming),true);
 assert.equal(db.saved.get(original.id).name,'RemoteBook.pdf','Unchanged row may accept the new remote revision');

 db=simulate([{...original,syncRevision:'locally-edited',blob:{size:8,type:'application/pdf'},size:8}]);
 assert.equal(await db.apply(original.id,original,incoming),false,'Stale remote result cannot overwrite newer local revision');
 assert.equal(db.saved.get(original.id).syncRevision,'locally-edited');

 db=simulate([{...original,syncRevision:'locally-edited'}]);
 assert.equal(await db.apply(original.id,original,null),false,'Stale tombstone cannot remove newer edit');
 assert.equal(db.saved.size,1);

 db=simulate([original]);
 assert.equal(await db.apply(original.id,original,null),true,'Matching tombstone can finalize deletion');
 assert.equal(db.saved.size,0);

 db=simulate([original]);
 const conflictCopy={...original,id:'copy-2',syncRevision:'copy-r1'};
 assert.equal(await db.apply(original.id,original,incoming,conflictCopy),true);
 assert.equal(db.saved.size,2,'Copy and remote revision must be committed in one transaction');
 assert.equal(db.transactions,1);
 assert.equal(db.saved.get('copy-2').name,'Book.pdf');
 assert.equal(db.saved.get(original.id).name,'RemoteBook.pdf');

 db=simulate([{...original,syncRevision:'r2'}]);
 assert.equal(await db.apply(original.id,original,incoming,conflictCopy),false);
 assert.equal(db.saved.size,1,'Conflict copy not created for outdated local state');
 assert.equal(db.saved.has('copy-2'),false);

 db=simulate([]);
 assert.equal(await db.apply(original.id,null,incoming),true);
 assert.equal(db.saved.get(original.id).name,'RemoteBook.pdf');
 db=simulate([original]);
 assert.equal(await db.apply(original.id,null,incoming),false,'Newly-created local file cannot be overwritten by cloud sync');
 assert.equal(db.saved.get(original.id).name,'Book.pdf');

 db=simulate([{...original,syncState:'synced'}]);
 assert.equal(await db.apply(original.id,original,null),false,'Already synced status is protected');
 db=simulate([{...original,remoteUpdatedAt:'server-v2'}]);
 assert.equal(await db.apply(original.id,original,null),false,'Different server baseline is protected');


 // Downloading a new item cannot silently push a full archive past 1000.
 const seed=Array.from({length:999},(_,index)=>before('existing-'+index));
 db=simulate(seed);
 const inboundA={...incoming,id:'remote-A'},inboundB={...incoming,id:'remote-B'};
 assert.equal(await db.apply(inboundA.id,null,inboundA),true);
 await assert.rejects(db.apply(inboundB.id,null,inboundB),/VAULT_LIMIT_1000/);
 assert.equal(db.saved.size,1000);
 assert.equal(db.saved.has(inboundB.id),false,'Full archive rejects new cloud download without partial writes');

 // A remote conflict requiring an extra local copy fails closed at capacity.
 db=simulate([...seed,original]);
 await assert.rejects(db.apply(original.id,original,incoming,conflictCopy),/VAULT_LIMIT_1000/);
 assert.equal(db.saved.size,1000);
 assert.equal(db.saved.get(original.id).name,'Book.pdf','Original local edit remains untouched');
 assert.equal(db.saved.has(conflictCopy.id),false,'No half-written conflict copy');

 // Replacing the same active ID needs no extra slot at capacity.
 db=simulate([...seed,original]);
 assert.equal(await db.apply(original.id,original,incoming),true);
 assert.equal(db.saved.size,1000);

 // When a remote deletion wins, storing the remaining local version reuses its slot.
 db=simulate([...seed,original]);
 assert.equal(await db.apply(original.id,original,null,conflictCopy),true);
 assert.equal(db.saved.size,1000);
 assert.equal(db.saved.has(original.id),false);
 assert.equal(db.saved.has(conflictCopy.id),true);

 // Pending deletion tombstones are not live files and must not consume capacity.
 db=simulate([...seed,{...original,deleted:true,blob:null,size:0,syncState:'synced'}]);
 assert.equal(await db.apply('new-cloud',null,{...incoming,id:'new-cloud'}),true);
 assert.equal([...db.saved.values()].filter(item=>!item.deleted).length,1000);

 assert.match(source,/if\(!await dbApplySyncIfUnchanged\(item\.id,item,null,copy\)\)/);
 assert.match(source,/if\(!await dbApplySyncIfUnchanged\(item\.id,item,remoteItem\(remote,remoteBlob,remoteVersion\),localCopy\)\)/);
 assert.match(source,/if\(data\.deleted\)\{if\(here&&!await dbApplySyncIfUnchanged\(id,here,null\)\)/);
 assert.match(source,/if\(!await dbApplySyncIfUnchanged\(id,here\|\|null,remoteItem\(data,blob,remoteVersion\)\)\)/);
 assert.match(source,/if\(!confirmed\)autoSyncRerunRequested=true/,'Existing upload guard preserved');
 console.log('Archive sync race tests passed: guarded delete, remote replace, atomic conflict copies, new ID collision and stale revisions');
})().catch(e=>{console.error(e);process.exitCode=1});
