'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'web/document-vault-runtime.js'),'utf8'),backup=fs.readFileSync(path.join(root,'web/document-vault-hardening-runtime.js'),'utf8');
new vm.Script(source);new vm.Script(backup);
const begin=source.indexOf('function folderEntries('),end=source.indexOf('\nasync function toggleFavorite(',begin);
assert.ok(begin>=0&&end>begin,'Folder operations present');
const operations=source.slice(begin,end);
let sequence=0;const uuid=()=> 'test-revision-'+(++sequence);
const planner=new Function('uuid','MAX_ITEMS',operations+';return {planFolderTransfer,folderEntries,commitFolderTransfer}')(uuid,1000);
const row=(id,folder,order,revision='r1')=>({id,folder,manualOrder:order,name:id+'.jpg',category:'image',blob:{size:7,id},mime:'image/jpeg',size:7,createdAt:'2026-10-01',updatedAt:'2026-10-01',syncRevision:revision,syncState:'synced',deleted:false});
const files=[row('z1','زيد',1),row('z2','زيد',2),row('z3','زيد',3),row('a1','علي',1),row('a2','علي',2)];
const patch=(base,changes)=>{const out=new Map(base.map(x=>[x.id,{...x}]));for(const x of changes)out.set(x.id,x);return [...out.values()]};
const labels=(rows,folder)=>planner.folderEntries(rows,folder).map(x=>x.id);
let changes=planner.planFolderTransfer(files,'z2','علي','move',1,'r1');
let after=patch(files,changes);
assert.deepEqual(labels(after,'زيد'),['z1','z3'],'Move removes file from source');
assert.deepEqual(labels(after,'علي'),['z2','a1','a2'],'Move puts file in target position 1');
assert.equal(after.find(x=>x.id==='z2').blob,files[1].blob,'Move keeps original content');
assert.equal(after.find(x=>x.id==='z2').folder,'علي');
assert.deepEqual(planner.folderEntries(after,'علي').map(x=>x.manualOrder),[1,2,3]);
changes=planner.planFolderTransfer(files,'z3','زيد','reorder',1,'r1');
after=patch(files,changes);
assert.deepEqual(labels(after,'زيد'),['z3','z1','z2'],'Reorder to first position within same folder');
changes=planner.planFolderTransfer(files,'z1','زيد','reorder',3,'r1');
after=patch(files,changes);
assert.deepEqual(labels(after,'زيد'),['z2','z3','z1'],'Reorder to third position');
changes=planner.planFolderTransfer(files,'z1','علي','copy',2,'r1');
after=patch(files,changes);
const ali=planner.folderEntries(after,'علي');
assert.equal(ali.length,3);
assert.equal(ali[1].copyOf,'z1');
assert.equal(ali[1].blob,files[0].blob,'Copied file retains bytes');
assert.deepEqual(labels(after,'زيد'),['z1','z2','z3'],'Copy leaves source items and order untouched');
assert.equal(changes.filter(x=>x.folder==='زيد').length,0,'Copy to another folder must not rewrite source');
assert.equal(files.length,5,'Planner does not mutate input');
changes=planner.planFolderTransfer(files,'z2','زيد','copy',1,'r1');
after=patch(files,changes);
assert.equal(planner.folderEntries(after,'زيد')[0].copyOf,'z2','Paste a copy in position 1');
assert.throws(()=>planner.planFolderTransfer(files,'z1','علي','move',1,'other-revision'),/VAULT_STALE_ITEM/);
assert.throws(()=>planner.planFolderTransfer(files,'z1','زيد','reorder',4,'r1'),/VAULT_POSITION_INVALID/);
assert.throws(()=>planner.planFolderTransfer(files,'z1','علي','copy',0,'r1'),/VAULT_POSITION_INVALID/);
assert.throws(()=>planner.planFolderTransfer(files,'z1','علي','reorder',1,'r1'),/VAULT_FOLDER_MISMATCH/);
const full=Array.from({length:1000},(_,i)=>row('item-'+i,'حافظة',i+1));
assert.throws(()=>planner.planFolderTransfer(full,'item-0','أخرى','copy',1,'r1'),/VAULT_LIMIT_1000/);
assert.match(source,/state\.sort='manual'/,'Folder operations activate manual sort');
assert.match(source,/id="vFolderTabs"/,'Custom archive folders are navigable');
assert.match(source,/function pickIntoFolder\(kind\)/,'File picker supports selected custom folder');
assert.match(source,/state\.uploadFolder=state\.filter\.slice\(7\)/,'Selected folder is used for upload');
assert.match(source,/onclick="DocumentVault\.pasteToFolder\(\)"/,'Folder paste control exists');
assert.match(source,/copyItem,cutItem,pasteToFolder,moveItem,reorderItem/,'Controls exported');
assert.match(source,/clip\.scope!==syncScope\(\)/,'Clipboard scoped to account and device');
assert.match(source,/state\.clipboard=null;state\.selectedIds\.clear\(\);updateVaultAccessUi\(\)/,'Sign out clears temporary cut/copy and multi-select');
assert.match(source,/manualOrder:Number\.isInteger\(item\.manualOrder\)/,'Manual order included in server metadata');
assert.match(source,/manualOrder:Number\.isInteger\(data\.manualOrder\)/,'Order read back from server');
assert.match(backup,/manualOrder:Number\.isInteger\(item\.manualOrder\)/,'Order included in backup manifest');
assert.match(backup,/manualOrder:Number\.isInteger\(meta\.manualOrder\)/,'Order restored from backups');
(async()=>{
 const snapshots=files.map(x=>({...x}));
 let databaseData=snapshots.slice(),writes=0,aborts=0;
 const fakeDb={
  transaction(_store,mode){
   assert.equal(mode,'readwrite');
   const staged=new Map(databaseData.map(x=>[x.id,x]));
   const tx={
    aborted:false,oncomplete:null,onerror:null,onabort:null,
    objectStore(){return{getAll(){
       const req={result:databaseData.map(x=>({...x})),onsuccess:null,onerror:null};
       queueMicrotask(()=>{req.onsuccess?.();queueMicrotask(()=>{if(tx.aborted){aborts++;tx.onabort?.()}else{databaseData=[...staged.values()];tx.oncomplete?.()}})});
       return req
     },put(entry){writes++;staged.set(entry.id,entry)}
    }},
    abort(){tx.aborted=true}
   };
   return tx
  }
 };
 const commit=new Function('uuid','MAX_ITEMS','openDb','STORE',operations+';return commitFolderTransfer')(uuid,1000,async()=>fakeDb,'items');
 await commit('z3','علي','move',3,'r1');
 assert.deepEqual(labels(databaseData,'علي'),['a1','a2','z3'],'Atomic transfer persisted');
 assert.deepEqual(labels(databaseData,'زيد'),['z1','z2']);
 const before=databaseData.map(x=>({...x})),initialWrites=writes;
 await assert.rejects(commit('z1','علي','move',2,'wrong'),/VAULT_STALE_ITEM/);
 assert.deepEqual(databaseData,before,'Failed transfer leaves data unchanged');
 assert.equal(writes,initialWrites,'Stale transfer must not write');
 assert.ok(aborts>=1,'Invalid transaction rolls back');
 console.log('Vault folders passed: copy, cut/move, manual positions 1/3, atomic rollback, scope and backup/sync metadata');
})().catch(error=>{console.error(error);process.exitCode=1});
