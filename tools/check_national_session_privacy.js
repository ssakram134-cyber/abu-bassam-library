'use strict';
const fs=require('fs'),assert=require('node:assert/strict');
const src=fs.readFileSync('web/national-id-runtime.js','utf8');
for(const k of ['nationalSessionEpoch','abu-bassam-auth-changed','function recentKey()','epoch!==nationalSessionEpoch','24_000_000/Math.max(1,pageCount)','await pdf.destroy?.()'])assert.ok(src.includes(k),'Missing national security guard: '+k);
const keys=new Map(),events={},nodes=new Map(),warnings=[],logged=[];let activeUser='first',reader=null;
const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',style:{},classList:{remove(){}},removeAttribute(){}});return nodes.get(id)};
const win={addEventListener(){},AbuBassamCloud:{session:()=>({user:{id:activeUser}})},AbuBassamSecurity:{device:()=>({device_id:'phone'})},AbuBassamOps:{add:r=>logged.push(r)}};
const doc={getElementById:node,querySelector:()=>null,addEventListener:(name,fn)=>events[name]=fn};
const storage={getItem:k=>keys.get(k)||null,setItem:(k,v)=>keys.set(k,v),removeItem:k=>keys.delete(k)};
class Reader{readAsDataURL(){reader=this}}
class ImageFake{set src(value){this.naturalWidth=800;this.naturalHeight=600;this.onload?.()}}
const injected=src.replace('window.Nat={','window.__auditNat={S,recent,recentKey,handleImages,printMerge};window.Nat={');
assert.notEqual(src,injected);
new Function('window','document','localStorage','FileReader','Image','alert',injected)(win,doc,storage,Reader,ImageFake,x=>warnings.push(String(x)));
const t=win.__auditNat;
const firstKey=t.recentKey();t.recent('فتح مستند','sensitive-name.pdf');assert.ok(keys.get(firstKey).includes('sensitive-name.pdf'));
node('natResultCanvas').width=2200;node('natMergeCanvas').width=3400;keys.set('abuNationalRecentV2','legacy-sensitive-data');t.S.items.push({src:'face'});t.S.front={src:'front'};t.S.back={src:'back'};t.S.doc={name:'private.pdf'};t.S.docReady=true;
t.printMerge();assert.equal(logged.length,0,'Unavailable print backend cannot be recorded as success');
const pending=t.handleImages([{name:'old.jpg',type:'image/jpeg',size:100}],false);assert.ok(reader);
activeUser='second';assert.equal(typeof events['abu-bassam-auth-changed'],'function');events['abu-bassam-auth-changed']();
assert.equal(t.S.items.length,0);assert.equal(t.S.doc,null);assert.equal(t.S.front,null);assert.equal(t.S.back,null);assert.equal(node('natResultCanvas').width,1);assert.equal(node('natMergeCanvas').width,1);assert.ok(!keys.has('abuNationalRecentV2'),'Shared legacy history must be purged');
assert.ok(!t.S.recent.some(r=>r.name==='sensitive-name.pdf'));assert.notEqual(firstKey,t.recentKey());
reader.result='data:image/jpeg;base64,QQ==';reader.onload();
(async()=>{await pending;assert.equal(t.S.items.length,0,'Old account image must not return after logout');console.log('National session checks passed: isolated history, login switch cleanup, canceled late imports and false-print-log prevention.');})().catch(e=>{console.error(e);process.exitCode=1});
