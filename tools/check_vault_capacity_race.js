'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('web/document-vault-runtime.js','utf8');
const start=source.indexOf('async function dbPut(item){'),end=source.indexOf('async function dbAckPending(',start);
assert.ok(start>=0&&end>start,'Canonical vault writer not found');
const code=source.slice(start,end);
for(const marker of [
 "const scan=store.openCursor()",
 "if(item.deleted||(existing&&!existing.deleted)){write();return}",
 "if(!cursor.value?.deleted&&++active>=MAX_ITEMS)",
 "tx.abort();return",
 "failure||tx.error"
])assert.ok(code.includes(marker),'Atomic quota guard missing: '+marker);
const rows=new Map();
const clone=x=>x==null?x:{...x};
const micro=fn=>Promise.resolve().then(fn);
let previous=Promise.resolve(),seq=0;
const database={transaction(){
 const turn=previous;
 let release;
 previous=new Promise(resolve=>{release=resolve});
 let finished=false,working=null;
 const ready=turn.then(()=>{working=new Map([...rows.entries()].map(([k,v])=>[k,clone(v)]))});
 const tx={oncomplete:null,onerror:null,onabort:null,
   abort(){if(finished)return;finished=true;micro(()=>{tx.onabort?.();release()})},
   objectStore(){
    const request=(fetch)=>{
     const r={onsuccess:null,onerror:null,result:null};
     ready.then(()=>micro(()=>{if(finished)return;r.result=fetch();r.onsuccess?.()}))
       .catch(e=>{tx.error=e;r.onerror?.()});
     return r
    };
    return {
     get:id=>request(()=>clone(working.get(id))),
     openCursor(){
      let index=0,ordered=null;
      const r={onsuccess:null,onerror:null,result:null};
      const emit=()=>{
       if(finished)return;
       if(!ordered)ordered=[...working.values()];
       if(index>=ordered.length){r.result=null;r.onsuccess?.();return}
       r.result={value:clone(ordered[index]),continue(){index++;micro(emit)}};
       r.onsuccess?.()
      };
      ready.then(()=>micro(emit));
      return r
     },
     put(item){
      working.set(item.id,clone(item));
      micro(()=>{
       if(finished)return;
       finished=true;
       rows.clear();for(const [key,value] of working)rows.set(key,value);
       tx.oncomplete?.();
       release()
      })
     }
    }
   }
 };
 return tx
}};
const dbPut=new Function('openDb','STORE','newWriteRevision','MAX_ITEMS',code+';return dbPut')(
 async()=>database,'items',()=>String(++seq),1000
);
const active=()=>[...rows.values()].filter(x=>!x.deleted).length;
let checked=0;
function check(v,label){assert.ok(v,label);checked++}
(async()=>{
 for(let i=0;i<999;i++)rows.set('a'+i,{id:'a'+i,deleted:false,name:'preexisting'});
 rows.set('trash',{id:'trash',deleted:true,name:'30 day deletion'});
 const results=await Promise.allSettled([
  dbPut({id:'new-A',deleted:false,name:'new-A'}),
  dbPut({id:'new-B',deleted:false,name:'new-B'})
 ]);
 check(results.filter(r=>r.status==='fulfilled').length===1,'Two simultaneous uploads must reserve only one remaining slot');
 check(results.filter(r=>r.status==='rejected').length===1,'One excess upload must be rejected');
 check(active()===1000&&rows.has('trash'),'Concurrent insert must preserve quota and existing trash');
 const one=rows.get('a1');
 await dbPut({...one,name:'modified'});
 check(active()===1000&&rows.get('a1').name==='modified','Editing a file must not consume another slot');
 await dbPut({id:'additional-tombstone',deleted:true,name:'deleted'});
 check(active()===1000&&rows.get('additional-tombstone').deleted,'Deleted tombstones must not count as active files');
 await assert.rejects(()=>dbPut({...rows.get('trash'),deleted:false,name:'restored'}),/1000 ملف نشط/);
 check(rows.get('trash').deleted&&active()===1000,'Restoring while full must not revive a deleted file');
 const rejected=await Promise.allSettled([dbPut({id:'new-C',deleted:false}),dbPut({id:'new-D',deleted:false})]);
 check(rejected.every(r=>r.status==='rejected')&&active()===1000,'New items must remain blocked once full');
 // Drop one active file into the trash; this must release exactly one slot.
 await dbPut({...rows.get('a2'),deleted:true,deletedAt:new Date().toISOString(),syncState:'pending'});
 check(active()===999,'Moving existing file to trash frees a slot without removing data');
 await dbPut({...rows.get('trash'),deleted:false,name:'restored'});
 check(active()===1000&&!rows.get('trash').deleted,'Restoration succeeds when there is exactly one free slot');
 console.log('Vault IndexedDB capacity tests passed: '+checked+' cases; active quota held under concurrent writes and trash restore.')
})().catch(e=>{console.error(e);process.exitCode=1});
