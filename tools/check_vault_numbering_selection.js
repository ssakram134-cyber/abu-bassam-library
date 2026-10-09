'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'..','web/document-vault-runtime.js'),'utf8');
new vm.Script(src);
function between(a,b){const i=src.indexOf(a),j=src.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,'Missing section '+a);return src.slice(i,j)}
const body=between('function numberedName(','function planFolderTransfer(');
const item=(id,name,folder,position,revision='r1')=>({id,name,folder,manualOrder:position,syncRevision:revision,createdAt:'2026-01-01',updatedAt:'2026-01-01',syncState:'synced',deleted:false,blob:{size:4}});
let seq=0;
function db(seed){
 let saved=seed.map(x=>({...x})),aborted=0,writeCount=0;
 return {get saved(){return saved},get aborted(){return aborted},get writes(){return writeCount},
  openDb:async()=>({transaction(name,mode){
   assert.equal(name,'items');assert.equal(mode,'readwrite');
   const staged=new Map(saved.map(x=>[x.id,x]));
   const tx={oncomplete:null,onerror:null,onabort:null,aborted:false,
     abort(){this.aborted=true;aborted++},
     objectStore(){return{
       getAll(){const r={onsuccess:null,onerror:null,result:saved.map(x=>({...x}))};
         queueMicrotask(()=>{r.onsuccess?.();queueMicrotask(()=>{
           if(tx.aborted)tx.onabort?.();
           else{saved=[...staged.values()];tx.oncomplete?.()}
         })});return r},
       put(value){staged.set(value.id,value);writeCount++}
     }}
   };
   return tx
  }})}
}
const seed=[
 item('f1','final.jpg','زيد',3),
 item('f2','budget.xlsx','زيد',1),
 item('f3','report.pdf','زيد',2),
 item('f4','leave-alone.png','علي',1)
];
const niceName=name=>String(name);
const api=(d)=>new Function('niceName','uuid','MAX_ITEMS','openDb','STORE','Date',body+'return {numberedName,planFolderNumbering,commitFolderNumbering,folderEntries}')(
 niceName,()=> 'revision-'+(++seq),1000,d.openDb,'items',Date);
(async()=>{
 const d=db(seed),f=api(d);
 assert.equal(f.numberedName('004_old.pdf',2),'002_old.pdf','Repeated numbering must not stack prefixes');
 assert.equal(f.numberedName('presentation.pdf',3),'003_presentation.pdf');
 assert.equal(f.numberedName('notes.docx',1000),'1000_notes.docx');
 const snapshot=new Map(seed.filter(x=>x.folder==='زيد').map(x=>[x.id,x.syncRevision]));
 assert.equal(await f.commitFolderNumbering('زيد',snapshot),3);
 assert.deepEqual(f.folderEntries(d.saved,'زيد').map(x=>x.name),['001_budget.xlsx','002_report.pdf','003_final.jpg']);
 assert.equal(d.saved.find(x=>x.id==='f4').name,'leave-alone.png');
 const next=new Map(d.saved.filter(x=>x.folder==='زيد').map(x=>[x.id,x.syncRevision]));
 assert.equal(await f.commitFolderNumbering('زيد',next),0,'Running again leaves names unchanged');
 const before=JSON.stringify(d.saved),priorWrites=d.writes;
 const old=new Map([['f1','bad'],['f2',next.get('f2')],['f3',next.get('f3')]]);
 await assert.rejects(f.commitFolderNumbering('زيد',old),/VAULT_STALE_FOLDER/);
 assert.equal(JSON.stringify(d.saved),before,'Conflict aborts whole transaction');
 assert.equal(d.writes,priorWrites,'Conflict must not write even one item');
 assert.ok(d.aborted>=1);
 assert.match(src,/id="vBulkToolbar"/);
 assert.match(src,/function selectVisibleFiles\(\)/);
 assert.match(src,/function clearFileSelection\(\)/);
 assert.match(src,/function toggleFileSelection\(id,selected\)/);
 assert.match(src,/selectedIds\.clear\(\);updateVaultAccessUi\(\)/,'Account switch removes temporary file selections');
 assert.match(src,/if\(!\/\^\\d\+\$\/\.test\(answer\.trim\(\)\)\)/,'Numeric position field must accept digits');
 console.log('Archive numbering and multi-select checks passed: idempotence, per-folder order, Office suffixes and atomic rollback')
})().catch(e=>{console.error(e);process.exitCode=1});
