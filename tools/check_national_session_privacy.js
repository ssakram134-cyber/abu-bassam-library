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
const calls=[],requests=[],android={saveBase64:(...args)=>calls.push(['save',...args]),printBase64:(...args)=>calls.push(['print',...args])};
win.Android=android;win.ReactNativeWebView={postMessage:raw=>requests.push(JSON.parse(raw))};
assert.notEqual(src,injected);
new Function('window','document','localStorage','FileReader','Image','alert','Android',injected)(win,doc,storage,Reader,ImageFake,x=>warnings.push(String(x)),android);
const t=win.__auditNat;
const firstKey=t.recentKey();t.recent('فتح مستند','sensitive-name.pdf');assert.ok(keys.get(firstKey).includes('sensitive-name.pdf'));
node('natResultCanvas').width=2200;node('natMergeCanvas').width=3400;keys.set('abuNationalRecentV2','legacy-sensitive-data');t.S.items.push({src:'face'});t.S.front={src:'front'};t.S.back={src:'back'};t.S.doc={name:'private.pdf'};t.S.docReady=true;
t.printMerge();assert.equal(logged.length,0,'Unavailable print backend cannot be recorded as success');
const pending=t.handleImages([{name:'old.jpg',type:'image/jpeg',size:100}],false);assert.ok(reader);
activeUser='second';assert.equal(typeof events['abu-bassam-auth-changed'],'function');events['abu-bassam-auth-changed']();
assert.equal(t.S.items.length,0);assert.equal(t.S.doc,null);assert.equal(t.S.front,null);assert.equal(t.S.back,null);assert.equal(node('natResultCanvas').width,1);assert.equal(node('natMergeCanvas').width,1);assert.ok(!keys.has('abuNationalRecentV2'),'Shared legacy history must be purged');
assert.ok(!t.S.recent.some(r=>r.name==='sensitive-name.pdf'));assert.notEqual(firstKey,t.recentKey());
reader.result='data:image/jpeg;base64,QQ==';reader.onload();
(async()=>{
 await pending;assert.equal(t.S.items.length,0,'Old account image must not return after logout');
 win.Nat.scan();const first=requests.at(-1);
 assert.equal(first.mode,'scan');assert.ok(first.requestId>0,'Camera request must have an identity');
 activeUser='camera-next';events['abu-bassam-auth-changed']();
 const warningsBefore=warnings.length;
 win.AbuBassamNativeCameraResult({mode:'scan',requestId:first.requestId,dataUrl:'bad'});
 assert.equal(warnings.length,warningsBefore,'Stale camera result must be ignored after user switch');
 win.Nat.scan();const second=requests.at(-1);
 win.AbuBassamNativeCameraResult({mode:'scan',requestId:first.requestId,dataUrl:'bad'});
 assert.equal(warnings.length,warningsBefore,'Mismatched request ID must be ignored');
 win.AbuBassamNativeCameraResult({mode:'scan',requestId:second.requestId,dataUrl:'bad'});
 assert.equal(warnings.length,warningsBefore+1,'Current request must be handled');
 win.AbuBassamNativeCameraResult({mode:'scan',requestId:second.requestId,dataUrl:'bad'});
 assert.equal(warnings.length,warningsBefore+1,'Duplicate native camera result must be ignored');
 for(const method of ['saveOpenDoc','galleryOpenDoc','pdfOpenDoc','printOpenDoc']){
  const image=method==='galleryOpenDoc',file={name:image?'private.jpg':'private.pdf',type:image?'image/jpeg':'application/pdf'};
  t.S.doc=file;t.S.docReady=true;const beforeCalls=calls.length,beforeLogs=logged.length,beforeWarnings=warnings.length;
  const action=win.Nat[method](),delayedReader=reader;
  activeUser=method;events['abu-bassam-auth-changed']();
  delayedReader.result='data:application/pdf;base64,AA==';delayedReader.onload();
  await action;
  assert.equal(calls.length,beforeCalls,method+' must not export previous user file');
  assert.equal(logged.length,beforeLogs,method+' must not log false completion');
  assert.equal(warnings.length,beforeWarnings,method+' must not show irrelevant error');
 }
 console.log('National session checks passed: scoped history, logout cleanup, stale camera rejection, duplicate callbacks and four canceled exports.');
})().catch(e=>{console.error(e);process.exitCode=1});
