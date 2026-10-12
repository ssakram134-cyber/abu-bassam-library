'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const src=fs.readFileSync('web/document-vault-hardening-runtime.js','utf8');
const from=src.indexOf('function archiveRevisionFingerprint(');
const to=src.indexOf('async function blobHash(',from);
assert.ok(from>=0&&to>from,'Atomic backup restore implementation must exist');
const script=src.slice(from,to);
for(const marker of [
 'expectedBefore=null',
 'const scan=store.getAll()',
 "current.length!==expected.size",
 'expected.get(String(row.id))!==archiveRevisionFingerprint(row)',
 'finalRows.size>MAX_BACKUP_RECORDS',
 'filter(row=>!row.deleted).length>MAX_ITEMS',
 'function rejectTransaction(message)',
 'if(replaceAll)store.clear()',
 "if(!isCurrent())return rejectTransaction"
])assert.ok(script.includes(marker),'Missing atomic restore gate: '+marker);
assert.ok(src.includes("expectedBefore:existing"),'Backup restore must pass its original local snapshot to the transaction');

const rows=new Map(),clone=v=>v==null?v:{...v};
const micro=fn=>Promise.resolve().then(fn);
let sequence=0,tail=Promise.resolve();
const database={transaction(){
 const prev=tail;
 let unlock;
 tail=new Promise(resolve=>{unlock=resolve});
 let working,completed=false;
 const ready=prev.then(()=>{working=new Map([...rows].map(([id,item])=>[id,clone(item)]))});
 const tx={oncomplete:null,onabort:null,onerror:null,error:null,abort(){
  if(completed)return;
  completed=true;
  micro(()=>{tx.onabort?.();unlock()})
 }};
 tx.objectStore=()=>({
  getAll(){
   const request={result:null,onsuccess:null,onerror:null};
   ready.then(()=>micro(()=>{
    if(completed)return;
    request.result=[...working.values()].map(clone);
    request.onsuccess?.();
    micro(()=>{
     if(completed)return;
     completed=true;
     rows.clear();for(const [id,item] of working)rows.set(id,item);
     tx.oncomplete?.();unlock()
    })
   })).catch(error=>{tx.error=error;request.onerror?.()});
   return request
  },
  clear(){working.clear()},
  put(item){working.set(String(item.id),clone(item))}
 });
 return tx
}};
const applyAtomic=new Function('openDb','STORE','MAX_ITEMS','MAX_BACKUP_RECORDS','newWriteRevision',
 script+';return applyAtomic')(async()=>database,'items',1000,2000,()=>String(++sequence));
const saved=()=>[...rows.values()].map(clone);
const put=(id,name='document',deleted=false)=>rows.set(id,{id,name,deleted,updatedAt:'2026-10-12T10:00:00Z',size:4,blob:deleted?null:{size:4},_localWriteRev:'rev-'+id});
const unchanged=(original)=>JSON.stringify([...rows])===JSON.stringify(original);
let count=0;
function pass(condition,message){assert.ok(condition,message);count++}
(async()=>{
 put('a','first');
 const before=saved();
 await applyAtomic([{id:'a',name:'replaced',deleted:false}],{replaceAll:true,expectedBefore:before});
 pass(rows.size===1&&rows.get('a').name==='replaced','Stable snapshot replacement works');
 pass(typeof rows.get('a')._localWriteRev==='string'&&rows.get('a')._localWriteRev!=='rev-a','Restore changes version token');

 const initial=saved();
 await applyAtomic([{id:'b',name:'merged',deleted:false}],{replaceAll:false,expectedBefore:initial});
 pass(rows.size===2&&rows.get('a').name==='replaced'&&rows.get('b').name==='merged','Unchanged merge preserves existing file');

 const original=saved();
 rows.set('a',{...rows.get('a'),name:'newer live edit',_localWriteRev:'newer'});
 const afterEdit=[...rows];
 await assert.rejects(()=>applyAtomic([{id:'a',name:'old backup',deleted:false}],{expectedBefore:original}),/تغيّرت ملفات الأرشيف/);
 pass(unchanged(afterEdit)&&rows.get('a').name==='newer live edit','Old merge cannot overwrite newer file');

 const snapshot=saved();
 put('new-during-restore','saved concurrently');
 const afterInsert=[...rows];
 await assert.rejects(()=>applyAtomic([{id:'c',deleted:false}],{expectedBefore:snapshot}),/تغيّرت ملفات الأرشيف/);
 pass(unchanged(afterInsert),'New local file prevents stale whole-archive merge');

 const prior=saved();
 rows.delete('b');
 const afterDelete=[...rows];
 await assert.rejects(()=>applyAtomic([{id:'d',deleted:false}],{expectedBefore:prior}),/تغيّرت ملفات الأرشيف/);
 pass(unchanged(afterDelete),'Local deletion during unpack prevents stale merge');

 rows.clear();for(let i=0;i<1000;i++)put('full-'+i);
 const full=saved(),fullState=[...rows];
 await assert.rejects(()=>applyAtomic([{id:'overflow',deleted:false}],{expectedBefore:full}),/1000 ملف نشط/);
 pass(unchanged(fullState)&&rows.size===1000,'Full archive merge never accepts 1001st active file');

 rows.clear();for(let i=0;i<2000;i++)put('deleted-'+i,'trash',true);
 const trash=saved(),trashState=[...rows];
 await assert.rejects(()=>applyAtomic([{id:'extra-trash',deleted:true}],{expectedBefore:trash}),/2000 سجل إجمالي/);
 pass(unchanged(trashState)&&rows.size===2000,'Merge cannot exceed total 2000 records');

 rows.clear();for(let i=0;i<999;i++)put('active-'+i);
 const concurrent=saved();
 const results=await Promise.allSettled([
  applyAtomic([{id:'save-one',deleted:false}],{expectedBefore:concurrent}),
  applyAtomic([{id:'save-two',deleted:false}],{expectedBefore:concurrent})
 ]);
 pass(results.filter(x=>x.status==='fulfilled').length===1&&results.filter(x=>x.status==='rejected').length===1,
  'Two concurrent merges based on same snapshot cannot both commit');
 pass([...rows.values()].filter(x=>!x.deleted).length===1000,'Concurrent merges preserve 1000 active limit');

 const untouched=[...rows];
 await assert.rejects(()=>applyAtomic([{id:'cross-account',deleted:false}],{expectedBefore:saved(),isCurrent:()=>false}),/تغيّر الحساب أو الفرع/);
 pass(unchanged(untouched),'Account change leaves all current records untouched');

 rows.clear();put('kept');
 const safeState=[...rows];
 await assert.rejects(()=>applyAtomic([{id:'dup',deleted:false},{id:'dup',deleted:false}],{replaceAll:true,expectedBefore:saved()}),/معرفات مكررة/);
 pass(unchanged(safeState),'Duplicate IDs in snapshot are rejected without partial writes');

 rows.clear();
 const oversized=Array.from({length:1001},(_,i)=>({id:'new-'+i,deleted:false}));
 await assert.rejects(()=>applyAtomic(oversized,{replaceAll:true,expectedBefore:[]}),/1000 ملف نشط/);
 pass(rows.size===0,'Oversized replacement snapshot does not partially overwrite archive');
 await assert.rejects(()=>applyAtomic([{id:'x',deleted:false}],{replaceAll:true}),/يلزم فحص حالة الأرشيف/);
 pass(rows.size===0,'Calling restore without original snapshot fails closed');
 console.log('Vault restore concurrency checks passed: '+count+' cases; stale merges and over-capacity snapshots rejected atomically.')
})().catch(error=>{console.error(error);process.exitCode=1});
