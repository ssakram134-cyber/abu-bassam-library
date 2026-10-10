'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const cloud=read('web/backup-center-runtime.js'),hard=read('web/document-vault-hardening-runtime.js');
new vm.Script(cloud);new vm.Script(hard);
const segment=(s,a,b)=>{const start=s.indexOf(a),end=s.indexOf(b,start+a.length);assert.ok(start>=0&&end>start,'Source section absent '+a);return s.slice(start,end)};
const C=segment(cloud,'async function fingerprint(){','\nasync function packageBytes(){');
const CP=segment(cloud,'async function packageBytes(){','\nasync function secret(){');
const HP=segment(hard,'async function backupBytes(){','\nfunction strong(pass){');
const FP=segment(hard,'function restoreFingerprint(row){','\nasync function applyAtomic(');
const AT=segment(hard,'function trashFingerprint(row){','\nasync function blobHash(blob){');
const val=segment(hard,'let declared=0,seenIds=new Set(),seenPaths=new Set();','if(!options.silentConfirm){const msg=');
assert.match(hard,/async function backupTrash\(\)/);assert.match(cloud,/async function trashItems\(\)/);
assert.match(hard,/if\(hasTrash\)await applyAtomicWithTrash\(/);
assert.match(hard,/else await applyAtomic\(prepared,/);
assert.match(hard,/if\(Number\(meta\.expiresAt\)<=now\)continue/,'Expired trash never restored');
assert.match(cloud,/sha256:await digest\(new Uint8Array\(await row\.blob\.arrayBuffer\(\)\)\)/);
assert.match(hard,/const sha256=await blobHash\(row\.blob\)/);
assert.match(hard,/VAULT_TRASH_HASH_MISMATCH/);
assert.match(hard,/scope:restoreScope,blob,deleted:false,syncState:'local-trash'/);
assert.match(hard,/trash\.add\(row\)/);
assert.doesNotMatch(AT,/trash\.clear\(\)/,'Existing local trash must never be cleared');
assert.doesNotMatch(AT,/store\.clear\(\)/,'Existing active sync tombstones must never be cleared');
function blob(data){
 const content=String(data),a=new Uint8Array([...content].map(c=>c.charCodeAt(0)));
 return{size:a.length,type:'application/pdf',async arrayBuffer(){return a.slice().buffer}}
}
const now=Date.now(),scope='user-1:branch-1';
const active={id:'active',name:'invoice.pdf',category:'file',mime:'application/pdf',folder:'زيد',
  manualOrder:2,blob:blob('ACTIVE'),size:6,createdAt:'2026-10-01',updatedAt:'2026-10-05'};
const trow={id:'trash-1',sourceId:'original-7',name:'scan.pdf',category:'file',mime:'application/pdf',
 folder:'علي',manualOrder:3,deletedAtMs:now-86400000,expiresAt:now+29*86400000,
 blob:blob('TRASH'),size:5,scope};
class ZIP{
 constructor(){this.entries={}}
 file(p,v){this.entries[p]=v;return this}
 async generateAsync(){return this.entries}
}
const safe=()=>({});
const cloudExport=new Function('window','JSZip','backupItems','trashItems','dev','stateScope','safeSettings',
 'MAX_TOTAL','MAX_ZIP','digest','APP','Date',CP+'\nreturn packageBytes')(
 {JSZip:ZIP,AbuBassamDevices:{ensure:()=>({id:'branch-1',name:'الفرع'})}},ZIP,
 async()=>[active],async()=>[trow],()=>({device_id:'branch-1'}),()=>scope,safe,
 500*1024*1024,120*1024*1024,async()=>('a'.repeat(64)),'4.3.2',Date);
const hardExport=new Function('window','JSZip','device','trashScope','all','backupTrash','settings',
 'MAX_ITEMS','MAX_FILE','MAX_TOTAL','nice','blobHash','Date',HP+'\nreturn backupBytes')(
 {JSZip:ZIP},ZIP,()=>({id:'branch-1',name:'الفرع'}),()=>scope,async()=>[active],
 async()=>[trow],safe,1000,100*1024*1024,500*1024*1024,s=>String(s),async()=>('b'.repeat(64)),Date);
const format=files=>{
 const m=JSON.parse(files['manifest.json']);
 assert.equal(m.items.length,1);assert.equal(m.trash.length,1);
 assert.equal(m.trashScope,scope);assert.equal(m.trash[0].folder,'علي');
 assert.equal(m.trash[0].manualOrder,3);assert.equal(m.trash[0].sourceId,'original-7');
 assert.equal(m.trash[0].deletedAtMs,trow.deletedAtMs);
 assert.equal(m.trash[0].expiresAt,trow.expiresAt);
 assert.match(m.trash[0].path,/^trash\/000001\//);
 assert.equal(m.trash[0].sha256.length,64);
 assert.ok(files[m.trash[0].path]);
 assert.ok(files[m.items[0].path]);
 assert.notEqual(m.items[0].path,m.trash[0].path);
 return m
};
const mocks=new Map();
const encode={encode:s=>new Uint8Array([...String(s)].map(x=>x.charCodeAt(0)&255))};
const fingerprint=new Function('backupItems','trashItems','digest','TextEncoder','safeSettings',C+'\nreturn fingerprint')(
 async()=>[active],async()=>[trow],
 async a=>{const s=[...new Uint8Array(a instanceof ArrayBuffer?a:a.buffer)].join(',');let h=0;for(const x of s)h=(h*31+x.charCodeAt(0))>>>0;return String(h)},
 class TextEncoder{encode(s){return encode.encode(s)}},safe);
const sourceValidation=new Function('manifest','MAX_FILE','MAX_TOTAL','MAX_ITEMS','trashScope','allowed','recovery','Date',val+'\nreturn {declared,seenPaths}');
function validation(m){return sourceValidation(m,100*1024*1024,500*1024*1024,1000,()=>scope,()=>true,null,Date)}
const restores=new Function('openDb','STORE','crypto','Date','trashScope','scopeOk',FP+AT+'\nreturn {restoreFingerprint,trashFingerprint,applyAtomicWithTrash}') ;
function createDb(currentItems=[],currentTrash=[]){
 let data={items:new Map(currentItems.map(row=>[String(row.id),row])),trash:new Map(currentTrash.map(row=>[String(row.id),row]))},aborts=0,commits=0;
 const db={transaction(stores,mode){
  assert.deepEqual(stores,['items','trash']);assert.equal(mode,'readwrite');
  const stage={items:new Map(data.items),trash:new Map(data.trash)};
  let pending=0,complete=false,aborted=false;
  const tx={oncomplete:null,onabort:null,onerror:null,
   abort(){aborted=true;aborts++},
   objectStore(name){return{
    getAll(){pending++;const req={result:null,onsuccess:null,onerror:null};Promise.resolve().then(()=>{
      req.result=[...stage[name].values()].map(x=>({...x}));req.onsuccess?.();
      if(--pending===0)Promise.resolve().then(()=>{
        if(complete)return;complete=true;
        if(aborted)tx.onabort?.();else{data=stage;commits++;tx.oncomplete?.()}
      })
    });return req},
    put(row){stage[name].set(String(row.id),row)},
    add(row){if(stage[name].has(String(row.id)))throw Error('Duplicate');stage[name].set(String(row.id),row)}
   }}
  };
  return tx
 }};
 const api=restores(async()=>db,'items',{randomUUID:()=>('revision-'+Math.random())},Date,()=>scope,()=>true);
 return {api,get items(){return data.items},get trash(){return data.trash},get aborts(){return aborts},get commits(){return commits}}
}
(async()=>{
 const cloudFiles=(await cloudExport()).bytes;
 const cloudManifest=format(cloudFiles);
 const localFiles=await hardExport();
 const localManifest=format(localFiles);
 assert.equal(cloudManifest.count,1);assert.equal(localManifest.count,1);
 assert.ok(localFiles['app-settings.json']);
 assert.ok(cloudFiles['app-settings.json']);
 const x=await fingerprint();
 const modified={...trow,blob:blob('TRASh')};
 const f2=new Function('backupItems','trashItems','digest','TextEncoder','safeSettings',C+'\nreturn fingerprint')(
 async()=>[active],async()=>[modified],
 async a=>{const s=[...new Uint8Array(a instanceof ArrayBuffer?a:a.buffer)].join(',');let h=0;for(const ch of s)h=(h*31+ch.charCodeAt(0))>>>0;return String(h)},
 class TextEncoder{encode(s){return encode.encode(s)}},safe);
 // Mock test digest must still show a changed-content sensitivity in the trash.
 assert.notEqual(x,await f2(),'Same-size change in trash content must update cloud backup fingerprint');
 const valid={items:[],trash:[localManifest.trash[0]],trashScope:scope};
 assert.equal(validation(valid).seenPaths.size,1);
 assert.throws(()=>sourceValidation(valid,100*1024*1024,500*1024*1024,1000,()=>scope,()=>false,null,Date),/VAULT_TRASH_RESTORE_PERMISSION/);
 assert.equal(validation({items:[]}).seenPaths.size,0,'Older manifests restore without trash');
 for(const bad of [
 {...valid,trashScope:'other:branch'},
 {...valid,trash:[{...valid.trash[0],path:'trash/../../oops'}]},
 {...valid,trash:[{...valid.trash[0],sha256:''}]},
 {...valid,trash:[{...valid.trash[0],expiresAt:valid.trash[0].deletedAtMs+31*86400000}]},
 {...valid,trash:[valid.trash[0],valid.trash[0]]}
 ])assert.throws(()=>validation(bad));
 const db=createDb([active]);
 const row={...trow};
 const good=await db.api.applyAtomicWithTrash([], [row],{scope,replaceAll:false,expectedRows:[active],expectedTrash:[]});
 assert.equal(good,true);assert.equal(db.trash.get(row.id).folder,'علي');
 assert.equal(db.trash.get(row.id).manualOrder,3);
 assert.equal(db.items.get('active').name,'invoice.pdf');
 assert.equal(db.commits,1);
 const again=await db.api.applyAtomicWithTrash([], [{...row,name:'older-snapshot-name'}],
  {scope,expectedRows:[active],expectedTrash:[row]});
 assert.equal(again,true);assert.equal(db.trash.get(row.id).name,'scan.pdf','Never replace newer trash entry');
 const scopeCollision=createDb([active],[{...row,scope:'other:branch'}]);
 await assert.rejects(scopeCollision.api.applyAtomicWithTrash([],[row],{scope,expectedRows:[active],expectedTrash:[]}),/VAULT_TRASH_SCOPE_COLLISION/);
 assert.equal(scopeCollision.trash.get(row.id).scope,'other:branch');assert.equal(scopeCollision.commits,0);
 const concurrent=createDb([active],[row]);
 await assert.rejects(concurrent.api.applyAtomicWithTrash([],[{...row,id:'new'}],
  {scope,expectedRows:[active],expectedTrash:[]}),/VAULT_TRASH_RESTORE_CONFLICT/);
 assert.equal(concurrent.trash.size,1);assert.equal(concurrent.commits,0);
 const expired=createDb([active]);
 await assert.rejects(expired.api.applyAtomicWithTrash([],[{...row,expiresAt:Date.now()-1}],
  {scope,expectedRows:[active],expectedTrash:[]}),/VAULT_TRASH_RESTORE_EXPIRED/);
 assert.equal(expired.trash.size,0);
 const stale=createDb([{...active,updatedAt:'updated-after-restore-start'}]);
 await assert.rejects(stale.api.applyAtomicWithTrash([],[row],
  {scope,expectedRows:[active],expectedTrash:[]}),/VAULT_RESTORE_CONFLICT/);
 assert.equal(stale.trash.size,0);
 const snap=createDb([active]);
 assert.equal(await snap.api.applyAtomicWithTrash([],[row],{scope,replaceAll:true,expectedRows:[active],expectedTrash:[]}),true);
 assert.equal(snap.items.get('active').deleted,true,'Snapshot changes and trash addition must commit together');
 assert.equal(snap.items.get('active').blob,null,'Tombstone must not carry old active content');
 assert.equal(snap.trash.get(row.id).folder,'علي','Folder identity remains unchanged');
 console.log('Trash backup and atomic restore: scoped ZIP manifests, SHA-256, 30-day expiry, folder/order, existing-trash preservation, collisions, transaction rollback and current-file tombstones passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
