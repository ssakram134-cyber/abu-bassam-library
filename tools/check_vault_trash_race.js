'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('web/document-vault-runtime.js','utf8');
for(const marker of [
 'async function dbDisposeTrashIfCurrent(snapshot,permanent=false,isCurrent=()=>true)',
 'async function dbRestoreTrashIfCurrent(snapshot,isCurrent=()=>true)',
 "localWriteVersion(current)!==localWriteVersion(snapshot)",
 "if(!isCurrent()||!current?.deleted",
 "await dbDisposeTrashIfCurrent(item,false,isCurrent)",
 "await dbDisposeTrashIfCurrent(item,true,()=>",
 "await dbRestoreTrashIfCurrent(item,isCurrent)",
 "if(rows.filter(row=>!row.deleted).length>=MAX_ITEMS)",
 "if(current.syncState==='pending')"
])assert.ok(source.includes(marker),'Missing atomic trash invariant: '+marker);
const begin=source.indexOf('async function dbDisposeTrashIfCurrent('),end=source.indexOf('function addCss()',begin);
assert.ok(begin>=0&&end>begin,'Trash transaction helpers must be available');
const code=source.slice(begin,end),rows=new Map(),copy=v=>v==null?v:{...v};
let revision=0;
const db={transaction(){
 let aborted=false;
 const tx={
  oncomplete:null,onerror:null,onabort:null,
  abort(){aborted=true;queueMicrotask(()=>tx.onabort?.())},
  objectStore(){
   const request=get=>{
    const r={result:null,onsuccess:null,onerror:null};
    queueMicrotask(()=>{r.result=get();r.onsuccess?.();queueMicrotask(()=>{if(!aborted)tx.oncomplete?.()})});
    return r
   };
   return {
    get:id=>request(()=>copy(rows.get(id))),
    getAll:()=>request(()=>[...rows.values()].map(copy)),
    put:row=>rows.set(row.id,copy(row)),
    delete:id=>rows.delete(id)
   }
  }
 };
 return tx
}};
const {dbDisposeTrashIfCurrent,dbRestoreTrashIfCurrent}=new Function(
 'openDb','STORE','localWriteVersion','newWriteRevision','TRASH_RETENTION_MS','MAX_ITEMS',
 code+';return {dbDisposeTrashIfCurrent,dbRestoreTrashIfCurrent}'
)(async()=>db,'items',x=>String(x?._localWriteRev??''),()=>String(++revision),30*86400000,1000);
const expired=new Date(Date.now()-31*86400000).toISOString();
const recent=new Date(Date.now()-86400000).toISOString();
let passed=0;
function check(condition,message){assert.ok(condition,message);passed++}
(async()=>{
 rows.set('a',{id:'a',name:'restored',deleted:true,deletedAt:expired,syncState:'synced',blob:{size:4},_localWriteRev:'v1'});
 const old=copy(rows.get('a'));
 rows.set('a',{...rows.get('a'),deleted:false,_localWriteRev:'v2'});
 check(await dbDisposeTrashIfCurrent(old)==='skipped'&&rows.get('a').name==='restored','Expired stale snapshot cannot delete restored file');
 rows.set('a',{...rows.get('a'),deleted:true,_localWriteRev:'v3'});
 check(await dbDisposeTrashIfCurrent(old)==='skipped'&&rows.has('a'),'Expired stale snapshot cannot delete newer tombstone');
 check(await dbDisposeTrashIfCurrent(copy(rows.get('a')))==='deleted'&&!rows.has('a'),'Genuine expired synced trash is deleted');
 rows.set('pending',{id:'pending',deleted:true,deletedAt:expired,syncState:'pending',blob:{size:4},size:4,_localWriteRev:'p1'});
 check(await dbDisposeTrashIfCurrent(copy(rows.get('pending')))==='cleared'&&rows.get('pending').deleted&&rows.get('pending').size===0&&!rows.get('pending').blob,'Expired pending deletion keeps tombstone for cloud sync');
 check(rows.get('pending')._localWriteRev!=='p1','Removing expired blob also invalidates stale versions');
 rows.set('fresh',{id:'fresh',deleted:true,deletedAt:recent,syncState:'synced',blob:{size:4},_localWriteRev:'f1'});
 check(await dbDisposeTrashIfCurrent(copy(rows.get('fresh')))==='skipped'&&rows.has('fresh'),'Recent trash stays available until 30 days');
 check(await dbDisposeTrashIfCurrent(copy(rows.get('pending')),true)==='skipped'&&rows.has('pending'),'Permanent delete refuses pending cloud tombstone');
 check(await dbDisposeTrashIfCurrent(copy(rows.get('fresh')),true)==='deleted'&&!rows.has('fresh'),'Manual delete accepts current synced trash');
 rows.set('restore',{id:'restore',deleted:true,deletedAt:recent,syncState:'synced',blob:{size:2},_localWriteRev:'r1'});
 const before=copy(rows.get('restore'));
 check(await dbRestoreTrashIfCurrent(before)==='restored'&&!rows.get('restore').deleted&&rows.get('restore').syncState==='pending','Current trash file restores atomically into sync queue');
 check(await dbRestoreTrashIfCurrent(before)==='changed','Repeated stale restore cannot overwrite newest image');
 rows.set('other',{id:'other',deleted:true,deletedAt:recent,syncState:'synced',blob:{size:2},_localWriteRev:'o1'});
 check(await dbRestoreTrashIfCurrent(copy(rows.get('other')),()=>false)==='changed'&&rows.get('other').deleted,'Account change prevents late restore');
 check(await dbDisposeTrashIfCurrent(copy(rows.get('other')),true,()=>false)==='skipped'&&rows.has('other'),'Account change prevents late permanent delete');
 rows.set('another',{id:'another',deleted:true,deletedAt:recent,syncState:'synced',blob:{size:2},_localWriteRev:'c1'});
 rows.set('another',{...rows.get('another'),_localWriteRev:'c2'});
 check(await dbDisposeTrashIfCurrent({id:'another',_localWriteRev:'c1'},true)==='skipped'&&rows.has('another'),'Manual delete refuses old revision');
 console.log('Vault trash race tests passed: '+passed+' cases; 30-day expiry, restore and manual purge cannot overwrite newer files.')
})().catch(e=>{console.error(e);process.exitCode=1});
