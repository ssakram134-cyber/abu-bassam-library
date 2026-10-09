'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','web/document-vault-runtime.js'),'utf8');
new vm.Script(source);
function code(a,b){const x=source.indexOf(a),y=source.indexOf(b,x+a.length);assert.ok(x>=0&&y>x,'Missing '+a);return source.slice(x,y)}
const planCode=code('function numberedName(','async function commitFolderNumbering(');
const restoreCode=code('async function commitFolderNumbering(','async function renumberFolder(');
let step=0,account='userA:deviceA';
const uuid=()=> 'revision-'+(++step);
function storeDb(seed){
 let active=new Map(seed.map(x=>[x.id,{...x}])),points=new Map(),aborts=0,txs=0;
 return {
 get items(){return active},get points(){return points},get aborts(){return aborts},get transactions(){return txs},
 async openDb(){return {transaction(stores,mode){
  assert.deepEqual(stores,['items','checkpoints']);assert.equal(mode,'readwrite');txs++;
  const staged={items:new Map(active),checkpoints:new Map(points)};let pending=0,finished=false;
  const tx={oncomplete:null,onerror:null,onabort:null,aborted:false,
   abort(){this.aborted=true;aborts++},
   objectStore(name){
    assert.ok(staged[name]);
    const map=staged[name];
    function request(read){
     pending++;
     const r={result:null,onsuccess:null,onerror:null};
     queueMicrotask(()=>{r.result=read();r.onsuccess?.();pending--;
      if(pending===0&&!finished){finished=true;queueMicrotask(()=>{
       if(tx.aborted)tx.onabort?.();
       else{active=staged.items;points=staged.checkpoints;tx.oncomplete?.()}
      })}});
     return r
    }
    return {
     get:id=>request(()=>map.get(id)),
     getAll:()=>request(()=>[...map.values()].map(x=>({...x}))),
     add(value){if(map.has(value.id))throw Error('DUPLICATE_CHECKPOINT');map.set(value.id,value)},
     put(value){map.set(value.id,value)},
     delete(id){map.delete(id)}
    }
   }
  };
  return tx
 }}}
 }
}
const rows=[
 {id:'a',name:'A.jpg',folder:'زيد',manualOrder:2,syncRevision:'oldA',createdAt:'2026-09-01',updatedAt:'2026-09-01',blob:{size:5},deleted:false},
 {id:'b',name:'B.docx',folder:'زيد',manualOrder:1,syncRevision:'oldB',createdAt:'2026-09-01',updatedAt:'2026-09-01',blob:{size:8},deleted:false},
 {id:'c',name:'C.jpg',folder:'علي',manualOrder:1,syncRevision:'oldC',createdAt:'2026-09-01',updatedAt:'2026-09-01',blob:{size:5},deleted:false}
];
const d=storeDb(rows);
const api=new Function('niceName','uuid','MAX_ITEMS','openDb','STORE','CHECKPOINT_STORE','CHECKPOINT_MS','syncScope','Date',
planCode+restoreCode+'return {commitFolderNumbering,restoreFolderNumberingPoint,checkpointList,purgeExpiredCheckpoints}')(
 n=>String(n),uuid,1000,d.openDb,'items','checkpoints',30*86400000,()=>account,Date);
(async()=>{
 const revisions=new Map([['a','oldA'],['b','oldB']]);
 assert.equal(await api.commitFolderNumbering('زيد',revisions),2);
 assert.equal(d.points.size,1);
 const snapshot=[...d.points.values()][0];
 assert.equal(snapshot.scope,'userA:deviceA');
 assert.equal(snapshot.kind,'folder-numbering');
 assert.equal(snapshot.items.length,2);
 assert.ok(snapshot.expiresAt>snapshot.createdAt);
 assert.equal(snapshot.items.some(x=>Object.hasOwn(x,'blob')),false,'Metadata only, no sensitive binary duplication');
 assert.equal(d.items.get('b').name,'001_B.docx');
 assert.equal(d.items.get('a').name,'002_A.jpg');
 assert.equal(d.items.get('c').name,'C.jpg','Another folder is not changed');
 assert.equal(await api.restoreFolderNumberingPoint(snapshot.id),true);
 assert.equal(d.items.get('a').name,'A.jpg');
 assert.equal(d.items.get('b').name,'B.docx');
 assert.equal(d.points.size,0,'Restored point consumed atomically');
 assert.equal(d.items.get('a').syncState,'pending');
 await assert.rejects(api.restoreFolderNumberingPoint(snapshot.id),/VAULT_CHECKPOINT_UNAVAILABLE/);
 const next=new Map([...d.items.values()].filter(x=>x.folder==='زيد').map(x=>[x.id,x.syncRevision]));
 await api.commitFolderNumbering('زيد',next);
 const point=[...d.points.values()][0],before=JSON.stringify([...d.items.values()]);
 account='otherUser:deviceA';
 await assert.rejects(api.restoreFolderNumberingPoint(point.id),/VAULT_CHECKPOINT_UNAVAILABLE/);
 assert.equal(JSON.stringify([...d.items.values()]),before,'Cross account restore rejected');
 account='userA:deviceA';
 // Mimic another edit on the same file after the checkpoint was recorded.
 d.items.get('a').syncRevision='thirdPartyChange';
 await assert.rejects(api.restoreFolderNumberingPoint(point.id),/VAULT_CHECKPOINT_CONFLICT/);
 assert.equal(d.points.size,1,'Conflicted recovery point remains available for manual investigation');
 const pointData=d.points.get(point.id);pointData.expiresAt=Date.now()-1;
 assert.equal(await api.purgeExpiredCheckpoints(),true);
 assert.equal(d.points.size,0,'Automatic checkpoint expiry deletes only the metadata snapshot');
 assert.ok(d.aborts>=3,'Cross-account, deleted and conflict restores abort');
 assert.match(source,/function restoreLastFolderNumbering\(\)/);
 assert.match(source,/id="vBulkToolbar"/);
 assert.match(source,/↩ استعادة آخر ترقيم/);
 console.log('Vault numbering recovery passed: metadata snapshot, atomic restoration, account scope, conflict protection, and expiry');
})().catch(e=>{console.error(e);process.exitCode=1});
