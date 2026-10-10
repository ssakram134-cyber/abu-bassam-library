'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','web/document-vault-runtime.js'),'utf8');
const advanced=fs.readFileSync(path.join(__dirname,'..','web/document-vault-advanced-runtime.js'),'utf8');
const branch=fs.readFileSync(path.join(__dirname,'..','web/branch-vault-runtime.js'),'utf8');
new vm.Script(source);
new vm.Script(advanced);
function section(start,end){let i=source.indexOf(start),j=source.indexOf(end,i+start.length);assert.ok(i>=0&&j>i,'Missing '+start);return source.slice(i,j)}
const category=section('function typeOf(item){','\nfunction visibleItems(){');
const ext=name=>(String(name).match(/\.([a-z]+)$/i)||[])[1]||'';
const cat=new Function('ext','isImage',category+';return {typeOf,typeLabel,textEditable}')(ext,x=>x.category==='image');
assert.equal(cat.typeOf({name:'document.docx'}),'word');
assert.equal(cat.typeOf({name:'budget.xlsx'}),'excel');
assert.equal(cat.typeOf({name:'slides.pptx'}),'powerpoint');
assert.equal(cat.typeOf({name:'file.pdf'}),'pdf');
assert.equal(cat.textEditable({name:'notes.txt'}),true);
assert.equal(cat.textEditable({name:'file.docx'}),false);
const mimeSource=section('function fileMime(','\nfunction formatBytes(');
const fileMime=new Function('ext',mimeSource+';return fileMime')(ext);
assert.equal(fileMime('document.docx','application/octet-stream'),'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
assert.equal(fileMime('finance.xlsx',''),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
assert.equal(fileMime('scanned.pdf',''),'application/pdf');
assert.match(source,/function viewObjectUrl\(blob\)/,'Preview URL is independent from thumbnail URLs');
assert.match(source,/if\(id==='vViewModal'&&state\.previewUrl\)/,'Preview URL is released on close');
let sort='modified-desc',filter='all',query='';
const items=[
 {name:'old.docx',mime:'',folder:'',category:'file',createdAt:'2026-01-01',updatedAt:'2026-06-01',size:100},
 {name:'recent.docx',mime:'',folder:'',category:'file',createdAt:'2026-07-01',updatedAt:'2026-05-01',size:80},
 {name:'budget.xlsx',mime:'',folder:'',category:'file',createdAt:'2026-08-01',updatedAt:'2026-09-01',size:160}
];
const display=section('function visibleItems(){','\nfunction render(){');
const listing=new Function('state','ext','isImage','formatTime',category+display+';return visibleItems')(
 {get items(){return items},get filter(){return filter},get sort(){return sort},get query(){return query}},ext,x=>x.category==='image',x=>String(x));
assert.deepEqual(listing().map(x=>x.name),['budget.xlsx','old.docx','recent.docx']);
sort='date-desc';assert.equal(listing()[0].name,'budget.xlsx');
filter='word';assert.equal(listing().length,2);
filter='all';query='2026-05-01';assert.deepEqual(listing().map(x=>x.name),['recent.docx']);
assert.match(source,/\['grid','list','large','details'\]\.includes\(view\)/);
assert.match(source,/id="vLargeBtn"/);
assert.match(source,/id="vDetailsBtn"/);
assert.match(source,/id="vReplaceInput"/);
assert.match(source,/id="vTextEdit"/);
assert.match(source,/state\.filter=folder\?'folder:'\+folder:category==='image'\?'image':'all'/);
assert.match(advanced,/DocumentVault\.saveEditedBlob/);
assert.match(branch,/vaultImageEdit:'تحرير الصور'/);

const atomic=section('async function commitEditedFile(','\nasync function saveEditedBlob(');
function simulate(previous){
 const records=new Map([[previous.id,{...previous}]]),run={writes:0,aborts:0,transactions:0};
 const db={transaction(_name,mode){
   assert.equal(mode,'readwrite');run.transactions++;
   const staged=new Map(records);
   let pending=0,settled=false;
   const tx={
     oncomplete:null,onerror:null,onabort:null,aborted:false,
     objectStore(){return{
       get(id){const request={result:null,onsuccess:null,onerror:null};pending++;
         queueMicrotask(()=>{request.result=staged.get(id);request.onsuccess?.();finish()});return request},
       getAll(){const request={result:null,onsuccess:null,onerror:null};pending++;
         queueMicrotask(()=>{request.result=[...staged.values()];request.onsuccess?.();finish()});return request},
       add(v){assert.equal(staged.has(v.id),false);staged.set(v.id,v);run.writes++},
       put(v){staged.set(v.id,v);run.writes++}
     }},
     abort(){tx.aborted=true;run.aborts++}
   };
   function finish(){pending--;if(!pending&&!settled){settled=true;queueMicrotask(()=>{
     if(tx.aborted)tx.onabort?.();
     else{records.clear();for(const [key,val] of staged)records.set(key,val);tx.oncomplete?.()}
   })}}
   return tx
 }};
 const commit=new Function('openDb','STORE','newVaultItem','previousVersionName','uuid','niceName','MAX_ITEMS',atomic+';return commitEditedFile')(
 async()=>db,'items',
 (name,blob,category,id,folder)=>({id:'original-copy',name,blob,category,folder,syncState:'pending'}),
 name=>'before-'+name,()=> 'revision-new',name=>name,1000
 );
 return {commit,records,run}
}
(async()=>{
 const prev={id:'active',name:'notes.txt',blob:{size:10,type:'text/plain'},mime:'text/plain',category:'file',folder:'books',createdAt:'2026-01-01',syncRevision:'old-version',updatedAt:'2026-01-01'};
 const changed={size:20,type:'text/plain'};
 let sim=simulate(prev);
 assert.equal(await sim.commit(prev,changed,{name:'notes.txt'},true),true);
 assert.equal(sim.records.size,2,'Keep original creates another archive entry atomically');
 assert.equal(sim.records.get('original-copy').blob,prev.blob);
 assert.equal(sim.records.get('active').blob,changed);
 assert.equal(sim.run.transactions,1);
 sim=simulate(prev);
 assert.equal(await sim.commit(prev,changed,{name:'notes.txt'},false),true);
 assert.equal(sim.records.size,1,'Replace mode retains a single entry');
 sim=simulate(prev);
 await assert.rejects(sim.commit({...prev,syncRevision:'other'},changed,{},true));
 assert.equal(sim.records.size,1,'Stale revision does not overwrite or duplicate');
 assert.equal(sim.run.aborts,1);
 const saved=section('async function saveEditedBlob(','\nfunction pickRevisedFile(');
 async function request(choice,access=true,count=1,meta={}){
   const commits=[],alerts=[];
   const fn=new Function('requireVault','findItem','prompt','alert','dbAll','commitEditedFile','refresh','logOperation','autoSync','navigator','scheduleAutoSync','MAX_ITEMS',saved+';return saveEditedBlob')(
     key=>access,
     id=>id==='active'?prev:null,
     ()=>choice,
     x=>alerts.push(x),
     async()=>Array.from({length:count},()=>({deleted:false})),
     async(...args)=>{commits.push(args)},
     async()=>{},
     ()=>{},()=>false,{onLine:false},()=>{},1000
   );
   const ok=await fn('active',changed,meta);return{ok,commits,alerts}
 }
 let r=await request('1');assert.equal(r.ok,true);assert.equal(r.commits[0][3],true);
 r=await request('2');assert.equal(r.ok,true);assert.equal(r.commits[0][3],false);
 r=await request(null);assert.equal(r.ok,false);assert.equal(r.commits.length,0);
 r=await request('1',true,1000);assert.equal(r.ok,false);assert.equal(r.commits.length,0);
 r=await request('1',false);assert.equal(r.ok,false);assert.equal(r.commits.length,0);
 console.log('Vault file manager tests passed: Word/Excel filters, dates, display modes, atomic copy/replace, stale version and cancel behavior')
})().catch(error=>{console.error(error);process.exitCode=1});
