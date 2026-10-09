'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'..','web/document-vault-runtime.js'),'utf8');
new vm.Script(code);
function section(a,b){const start=code.indexOf(a),end=code.indexOf(b,start+a.length);assert.ok(start>=0&&end>start,'Missing '+a);return code.slice(start,end)}
const batchSrc=section('async function dbPutBatch(items){','\nasync function dbDelete(');
const editSrc=section('async function commitEditedFile(','\nasync function saveEditedBlob(');
const addSrc=section('async function addBlob(','\nfunction previousVersionName(');
assert.match(addSrc,/await dbPutBatch\(\[item\]\)/,'OCR single-file saves must share quota checks');
assert.match(code,/const previous=\{\.\.\.currentItem\}/,'Capture stable edit revision before prompt or async work');
let idCounter=0;
const uuid=()=> 'uuid-'+(++idCounter);
const row=(id,i=0)=>({
 id,name:'Picture '+id+'.png',blob:{size:17,type:'image/png'},size:17,mime:'image/png',
 category:'image',folder:'زيد',createdAt:'2026-10-09',updatedAt:'2026-10-09',
 syncRevision:'revision-'+i,syncState:'synced',deleted:false
});
function dbMock(initial){
 let saved=new Map(initial.map(x=>[x.id,x])),turn=Promise.resolve(),attempts=0,aborted=0;
 const db={transaction(name,mode){
   assert.equal(name,'items');assert.equal(mode,'readwrite');attempts++;
   const reads=[];
   let staged=null;
   const tx={oncomplete:null,onerror:null,onabort:null,aborted:false,
     abort(){this.aborted=true;aborted++},
     objectStore(){return{
       get(id){const req={result:null,onsuccess:null,onerror:null};reads.push({req,kind:'get',id});return req},
       getAll(){const req={result:null,onsuccess:null,onerror:null};reads.push({req,kind:'all'});return req},
       add(v){if(staged.has(v.id))throw new Error('DUPLICATE');staged.set(v.id,v)},
       put(v){staged.set(v.id,v)}
     }}
   };
   const run=turn.then(async()=>{
     staged=new Map(saved);
     await Promise.resolve();
     for(const job of reads){
       job.req.result=job.kind==='all'?[...staged.values()]:staged.get(job.id);
       job.req.onsuccess?.();
       if(tx.aborted)break
     }
     if(tx.aborted){tx.onabort?.();return}
     saved=staged;
     tx.oncomplete?.()
   });
   turn=run.catch(()=>{});
   return tx
 }};
 return{async openDb(){return db},get items(){return [...saved.values()]},get aborts(){return aborted},get attempts(){return attempts}}
}
function operations(db){
 const batch=new Function('openDb','STORE','MAX_ITEMS',batchSrc+';return dbPutBatch')(db.openDb,'items',1000);
 const edit=new Function('openDb','STORE','MAX_ITEMS','uuid','newVaultItem','previousVersionName','niceName',editSrc+';return commitEditedFile')(
   db.openDb,'items',1000,uuid,
   (name,blob,category,_id,folder)=>row(uuid(),0),
   name=>'original '+name,name=>name
 );
 return {batch,edit}
}
(async()=>{
 let seed=Array.from({length:999},(_,i)=>row('file-'+i,i));
 let db=dbMock(seed),api=operations(db);
 await assert.rejects(api.batch([row('newA'),row('newB')]),/VAULT_LIMIT_1000/);
 assert.equal(db.items.length,999,'Failed 2-file import commits nothing');
 assert.equal(db.aborts,1);
 await api.batch([row('newA')]);
 assert.equal(db.items.length,1000);
 await assert.rejects(api.batch([row('newB')]),/VAULT_LIMIT_1000/);
 assert.equal(db.items.length,1000);

 db=dbMock(seed);api=operations(db);
 const two=await Promise.allSettled([api.batch([row('upload-X')]),api.batch([row('upload-Y')])]);
 assert.equal(two.filter(x=>x.status==='fulfilled').length,1,'Exactly one of two concurrent uploads may fill last slot');
 assert.equal(two.filter(x=>x.status==='rejected').length,1);
 assert.equal(db.items.length,1000,'Concurrent uploads respect 1000-item bound');

 db=dbMock(seed);api=operations(db);
 const previous=seed[0],edited={size:46,type:'image/png'};
 await api.edit(previous,edited,{name:'edited.png'},true);
 assert.equal(db.items.length,1000,'Preserve original uses one new slot');
 assert.equal(db.items.find(x=>x.id===previous.id).blob,edited);
 assert.equal(db.items.filter(x=>x.id!==previous.id&&x.id.startsWith('uuid-')).length,1,'Original saved separately');

 db=dbMock([...seed,row('extra')]);api=operations(db);
 await assert.rejects(api.edit(previous,edited,{},true),/VAULT_LIMIT_1000/);
 assert.equal(db.items.find(x=>x.id===previous.id).blob,previous.blob,'Quota failure retains original and edit target');
 assert.equal(db.items.length,1000);
 await api.edit(previous,edited,{},false);
 assert.equal(db.items.length,1000,'Replace content only, works at 1000');
 assert.equal(db.items.find(x=>x.id===previous.id).blob,edited);

 db=dbMock(seed);api=operations(db);
 const simultaneous=await Promise.allSettled([api.edit(previous,edited,{},true),api.edit(previous,{size:18,type:'image/png'}, {},true)]);
 assert.equal(simultaneous.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(simultaneous.filter(x=>x.status==='rejected').length,1,'Second concurrent edit must be rejected as stale');
 assert.equal(db.items.length,1000,'No duplicate originals on a racing edit');
 assert.equal(db.items.find(x=>x.id===previous.id).syncState,'pending');

 db=dbMock(seed);api=operations(db);
 await assert.rejects(api.batch([row('same-id'),row('same-id')]),/VAULT_DUPLICATE_ITEM/);
 assert.equal(db.items.length,999);
 assert.match(code,/function planFolderTransfer[\s\S]*VAULT_LIMIT_1000/,'Folder copy must retain quota guard');
 console.log('Vault capacity checks passed: atomic 1000 limit for imports, simultaneous uploads, preserved originals, concurrent edits, replacement and OCR inserts');
})().catch(error=>{console.error(error);process.exitCode=1});
