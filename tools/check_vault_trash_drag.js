'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'web/document-vault-runtime.js'),'utf8');
const hard=fs.readFileSync(path.join(root,'web/document-vault-hardening-runtime.js'),'utf8');
const advanced=fs.readFileSync(path.join(root,'web/document-vault-advanced-runtime.js'),'utf8');
const branch=fs.readFileSync(path.join(root,'web/branch-vault-runtime.js'),'utf8');
for(const js of [source,hard,advanced,branch])new vm.Script(js);
function between(src,start,end){
 const i=src.indexOf(start),j=src.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,'Missing '+start);
 return src.slice(i,j);
}
assert.match(source,/indexedDB\.open\(DB_NAME,2\)/);
assert.match(hard,/indexedDB\.open\(DB,2\)/);
assert.match(advanced,/indexedDB\.open\(DB_NAME,2\)/);
for(const js of [source,hard,advanced]){
 assert.match(js,/createObjectStore\('trash',\{keyPath:'id'\}\)/,'Trash DB migration must preserve existing items');
 assert.match(js,/createIndex\('expiresAt','expiresAt'\)/,'Expiry index');
}
assert.match(source,/data-filter="trash"/);
assert.match(source,/TRASH_DAYS=30/);
assert.match(source,/if\(state\.filter==='trash'\)\{renderTrash\(\);return\}/);
assert.match(source,/setInterval\(\(\)=>\{if\(document\.visibilityState!=='hidden'\)void refresh\(\)\.catch\(\(\)=>\{\}\)\},3600000\)/);
assert.match(source,/async function deleteItem\(id\)/);
assert.match(source,/await trashFile\(item\)/);
assert.match(branch,/vaultRestoreDeleted:'استعادة الملفات المحذوفة'/);
assert.match(branch,/vaultPermanentDelete:'الحذف النهائي'/);
assert.match(source,/touch-action:none/);
assert.match(source,/addEventListener\('pointerdown'/);
assert.match(source,/addEventListener\('pointermove'/);
assert.match(source,/addEventListener\('pointerup'/);
assert.match(source,/addEventListener\('pointercancel'/);
assert.match(source,/data-vault-drag=/);
assert.match(source,/function bindTouchReorder\(\)/);

const day=86400000,epoch=Date.parse('2026-10-09T10:00:00Z');let time=epoch,seq=0;
class TestDate extends Date{static now(){return time}}
const uid=()=> 'owner:device-1',newId=()=> 'uid-'+(++seq);
const row=(id,folder='زيد')=>({id,name:id+'.jpg',folder,manualOrder:1,blob:{size:5,type:'image/jpeg'},size:5,category:'image',mime:'image/jpeg',createdAt:'2026-10-01',updatedAt:'2026-10-01',syncRevision:'rev1',syncState:'synced',deleted:false});
const initial=row('photo-1');
function fakeDb(seed=[initial]){
 let items=new Map(seed.map(x=>[x.id,x])),trash=new Map(),txCount=0,aborts=0;
 return {
  get items(){return items},get trash(){return trash},get txCount(){return txCount},get aborts(){return aborts},
  async openDb(){return{transaction(names,mode){
   assert.equal(mode,'readwrite');txCount++;
   const itemsCopy=new Map(items),trashCopy=new Map(trash);const stores={items:itemsCopy,trash:trashCopy};
   let pending=0,finished=false;
   const tx={oncomplete:null,onerror:null,onabort:null,aborted:false,
    abort(){this.aborted=true;aborts++},
    objectStore(name){assert.ok(stores[name],'Missing store '+name);const map=stores[name];
     return {
      get(id){const req={result:null,onsuccess:null,onerror:null};pending++;queueMicrotask(()=>{
        req.result=map.get(id);req.onsuccess?.();pending--;settle()
      });return req},
      getAll(){const req={result:null,onsuccess:null,onerror:null};pending++;queueMicrotask(()=>{
        req.result=[...map.values()];req.onsuccess?.();pending--;settle()
      });return req},
      add(value){assert.equal(map.has(value.id),false);map.set(value.id,value)},
      put(value){map.set(value.id,value)},
      delete(id){map.delete(id)}
     }
    }
   };
   function settle(){if(pending===0&&!finished){finished=true;queueMicrotask(()=>{
    if(tx.aborted)tx.onabort?.();
    else{items=itemsCopy;trash=trashCopy;tx.oncomplete?.()}
   })}}
   return tx
  }}}
 }
}
const ops=between(source,'async function dbTrashAll()','\nfunction syncSnapshot(');
const directory=between(source,'function folderEntries(','\nasync function toggleFavorite(');
function api(db,scope=uid){
 return new Function('openDb','STORE','TRASH_STORE','TRASH_MS','MAX_ITEMS','syncScope','vaultScopeOk','uuid','Date','folderEntries',ops+
  ';return {dbTrashAll,purgeExpiredTrash,trashFile,restoreTrashRecord,permanentlyDeleteTrash,trashScopeOk}')(
  db.openDb.bind(db),'items','trash',30*day,1000,scope,()=>true,newId,TestDate,
  (rows,folder)=>rows.filter(x=>!x.deleted&&x.folder===folder));
}
const folderCode=between(source,'async function reorderByDrop(','\nfunction bindTouchReorder(');
(async()=>{
 let db=fakeDb(),vault=api(db),original=db.items.get('photo-1');
 const trashId=await vault.trashFile(original);
 assert.equal(db.txCount,1,'Delete and trash save in one IndexedDB transaction');
 assert.equal(db.items.get('photo-1').deleted,true);
 assert.equal(db.items.get('photo-1').blob,null,'Pending sync tombstone contains no binary data');
 assert.equal(db.trash.get(trashId).blob,original.blob);
 assert.equal(db.trash.get(trashId).expiresAt,epoch+30*day);
 assert.equal(db.trash.get(trashId).scope,'owner:device-1');
 const id2=await vault.restoreTrashRecord(trashId);
 assert.notEqual(id2,'photo-1','Restoration uses a new ID, safe after synced deletion');
 assert.equal(db.items.get(id2).blob,original.blob);
 assert.equal(db.items.get(id2).folder,'زيد');
 assert.equal(db.items.get(id2).deleted,false);
 assert.equal(db.items.get(id2).syncState,'pending');
 assert.equal(db.items.get('photo-1').deleted,true,'Old delete tombstone remains for sync');
 assert.equal(db.trash.size,0,'Trash is removed only after successful restore');
 db=fakeDb();vault=api(db);const t=await vault.trashFile(db.items.get('photo-1'));
 time=epoch+29*day;assert.equal(await vault.purgeExpiredTrash(),0);
 assert.equal(db.trash.has(t),true);
 time=epoch+30*day;assert.equal(await vault.purgeExpiredTrash(),1);
 assert.equal(db.trash.size,0);
 await assert.rejects(vault.restoreTrashRecord(t),/VAULT_TRASH_SCOPE/);
 time=epoch;
 db=fakeDb();vault=api(db);const t2=await vault.trashFile(db.items.get('photo-1'));
 await assert.rejects(api(db,()=> 'other:device-2').restoreTrashRecord(t2),/VAULT_TRASH_SCOPE/);
 assert.equal(db.trash.has(t2),true,'Wrong account cannot erase someone else\'s trash');
 const erased=await vault.permanentlyDeleteTrash(t2);
 assert.equal(erased,true);assert.equal(db.trash.size,0);
 db=fakeDb([...Array.from({length:1000},(_,i)=>row('full-'+i)),row('deleted-1')]);vault=api(db);
 const t3=await vault.trashFile(db.items.get('deleted-1'));
 await assert.rejects(vault.restoreTrashRecord(t3),/VAULT_LIMIT_1000/);
 assert.equal(db.trash.has(t3),true,'Quota error preserves recoverable copy');

 let reorderCall=null;
 const state={filter:'folder:زيد',sort:'manual',items:[{id:'a',folder:'زيد',manualOrder:1},{id:'b',folder:'زيد',manualOrder:2},{id:'c',folder:'زيد',manualOrder:3}]};
 const reorder=new Function('state','folderEntries','organizeItem',folderCode+';return reorderByDrop')(
 state,(rows,folder)=>rows.filter(x=>x.folder===folder).sort((a,b)=>a.manualOrder-b.manualOrder),
 async(...args)=>{reorderCall=args;return true});
 assert.equal(await reorder('a','c'),true);assert.deepEqual(reorderCall,['a','reorder','زيد',3]);
 assert.equal(await reorder('c','a'),true);assert.deepEqual(reorderCall,['c','reorder','زيد',1]);
 assert.equal(await reorder('a','a'),false);
 state.filter='all';assert.equal(await reorder('a','c'),false);
 console.log('30-day recycle bin and touch reorder checks passed: atomic trash, restore, expiry, scope, quota, and drag positions');
})().catch(e=>{console.error(e);process.exitCode=1});
