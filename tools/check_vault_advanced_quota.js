'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const source=fs.readFileSync('web/document-vault-advanced-runtime.js','utf8');
const start=source.indexOf('async function putItem('),end=source.indexOf('\nfunction addCss(){',start);
assert.ok(start>=0&&end>start,'Advanced photo writer not found');
const implementation=source.slice(start,end);
assert.ok(implementation.includes('const scan=store.getAll()'),'Capacity scan must occur in transaction');
assert.ok(implementation.includes('length>=MAX_ITEMS'),'New photo must consume remaining active capacity');
const records=new Map();
let sequence=0,serial=Promise.resolve();
const copy=v=>v==null?v:{...v};
const db={transaction(){
 let release;const previous=serial;serial=new Promise(r=>release=r);
 let working,ended=false,pending=0;
 const ready=previous.then(()=>{working=new Map([...records.entries()].map(([key,value])=>[key,copy(value)]))});
 const tx={oncomplete:null,onerror:null,onabort:null,error:null,
  abort(){if(ended)return;ended=true;queueMicrotask(()=>{tx.onabort?.();release()})}
 };
 const complete=()=>queueMicrotask(()=>{
  if(ended||pending!==0)return;ended=true;
  records.clear();for(const [id,val] of working)records.set(id,copy(val));
  tx.oncomplete?.();release()
 });
 function query(fn){
  pending++;const q={result:null,onsuccess:null,onerror:null};
  ready.then(()=>queueMicrotask(()=>{
   if(ended)return;
   try{q.result=fn();q.onsuccess?.()}catch(err){tx.error=err;q.onerror?.();tx.abort()}
   pending--;complete()
  }));
  return q
 }
 tx.objectStore=()=>({
  get:id=>query(()=>copy(working.get(id))),
  getAll:()=>query(()=>[...working.values()].map(copy)),
  put:row=>{pending++;working.set(row.id,copy(row));queueMicrotask(()=>{pending--;complete()})}
 });
 return tx
}};
const putItem=new Function('openDb','STORE','newWriteRevision','itemRevision','MAX_ITEMS',
 implementation+';return putItem')(
 async()=>db,'items',()=>String(++sequence),item=>String(item?._localWriteRev??''),1000
);
const active=()=>[...records.values()].filter(x=>!x.deleted).length;
function fill(number){
 records.clear();
 for(let i=0;i<number;i++)records.set('file'+i,{id:'file'+i,deleted:false,_localWriteRev:'old',name:'source'});
}
(async()=>{
 fill(1000);
 await assert.rejects(putItem({id:'copy',deleted:false}),/1000 ملف نشط/);
 assert.equal(records.size,1000);
 assert.equal(records.has('copy'),false);

 const original=copy(records.get('file0'));
 await putItem({...original,name:'edited'},original);
 assert.equal(records.get('file0').name,'edited');
 assert.equal(active(),1000,'Replacing an active original does not use extra quota');

 fill(999);
 await putItem({id:'last',name:'new photo',deleted:false});
 assert.equal(active(),1000);

 fill(999);
 const results=await Promise.allSettled([
  putItem({id:'copyA',deleted:false}),
  putItem({id:'copyB',deleted:false})
 ]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.filter(r=>r.status==='rejected').length,1);
 assert.equal(active(),1000,'Two photo saves must not exceed one free slot');

 fill(1000);
 records.set('recycle',{id:'recycle',deleted:true,_localWriteRev:'old'});
 const snapshot=copy(records.get('recycle'));
 await assert.rejects(putItem({...snapshot,deleted:false},snapshot),/1000 ملف نشط/);
 assert.equal(records.get('recycle').deleted,true);

 fill(999);
 let passes=0;
 await assert.rejects(putItem({id:'account-switch',deleted:false},null,()=>++passes===1),
  /تغيّر الحساب أو الفرع/);
 assert.equal(records.has('account-switch'),false,'A late account switch must roll back photo save');

 fill(999);
 await assert.rejects(putItem({id:'file0',name:'stale'},{
  id:'file0',_localWriteRev:'wrong'
 }),/تم تعديل الملف أثناء التحرير/);
 assert.equal(records.get('file0').name,'source','Stale photo editor cannot overwrite current image');

 console.log('Advanced photo transactional quota passed: 7 cases including full archive, concurrent copies, restore and account switching.');
})().catch(e=>{console.error(e);process.exitCode=1});
