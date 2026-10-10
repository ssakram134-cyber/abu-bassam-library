'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const src=fs.readFileSync('web/national-id-runtime.js','utf8');new Function(src);
const events={},nodes=new Map(),errors=[],exports=[],images=[],readers=[];
const ctx={fillRect(){},drawImage(){},save(){},translate(){},rotate(){},restore(){},getImageData(){return{data:new Uint8ClampedArray(16)}},putImageData(){}};
function el(id){if(!nodes.has(id))nodes.set(id,{id,value:100,textContent:'',innerHTML:'',style:{},classList:{add(){},remove(){}},removeAttribute(){},appendChild(){},scrollIntoView(){},getContext(){return ctx}});return nodes.get(id)}
function canvas(){return {width:0,height:0,style:{},classList:{add(){},remove(){}},getContext(){return ctx},toDataURL(){return 'data:image/jpeg;base64,VEVTVA=='}}}
const document={getElementById:el,querySelector:()=>null,createElement:tag=>tag==='canvas'?canvas():el('new-'+tag),addEventListener:(name,fn)=>events[name]=fn};
const storage=new Map(),localStorage={getItem:key=>storage.get(key)||null,setItem:(key,val)=>storage.set(key,val),removeItem:key=>storage.delete(key)};
class Reader{readAsDataURL(){readers.push(this)}}
class DeferredImage{set src(value){this.naturalWidth=400;this.naturalHeight=300;images.push(this)}}
class MockPdf{addImage(){}output(){return 'data:application/pdf;base64,VEVTVA=='}}
const Android={saveBase64:(...args)=>exports.push(args)};
const window={Android,jspdf:{jsPDF:MockPdf},addEventListener(){}};
const injected=src.replace('window.Nat={','window.__auditNational={S,zoomOpen,fileData};window.Nat={');
assert.notEqual(src,injected);
new Function('window','document','localStorage','FileReader','Image','Android','jspdf','alert','setTimeout',injected)(window,document,localStorage,Reader,DeferredImage,Android,window.jspdf,x=>errors.push(String(x)),()=>0);
const a=window.__auditNational;
const photo=id=>({name:id,src:'data:image/jpeg;base64,VEVTVA==',im:{naturalWidth:400,naturalHeight:300},b:100,c:100,s:100,rot:0,crop:null,gray:0,bw:false});
(async()=>{
 const aborted=a.fileData({name:'cancel.jpg'});readers.at(-1).onabort();await assert.rejects(aborted,/أُلغي استيراد الملف/);
 const first=photo('first'),second=photo('second');a.S.items=[first,second];a.S.sel=0;window.Nat.crop();
 a.S.sel=1;el('cropL').value=10;el('cropR').value=90;el('cropT').value=10;el('cropB').value=90;
 window.Nat.applyCrop();assert.equal(first.crop,null);assert.equal(second.crop,null,'Crop misapplied');
 assert.ok(errors.some(x=>x.includes('تغيرت الصورة')));
 a.S.sel=0;window.Nat.crop();
 el('cropL').value=10;el('cropR').value=90;el('cropT').value=10;el('cropB').value=90;
 window.Nat.applyCrop();assert.equal(first.crop.l,0.1);assert.equal(first.crop.r,0.9);assert.equal(second.crop,null);
 a.zoomOpen('data:image/png;base64,QQ==');const old=window.Nat.zoomPdf();assert.equal(images.length,1);
 events['abu-bassam-auth-changed']();images[0].onload();await old;assert.equal(exports.length,0,'Logout PDF leaked');
 a.zoomOpen('data:image/png;base64,Qg==');const closed=window.Nat.zoomPdf();window.Nat.zoomClose();images[1].onload();await closed;assert.equal(exports.length,0,'Closed PDF leaked');
 a.zoomOpen('data:image/png;base64,Qw==');const allowed=window.Nat.zoomPdf();images[2].onload();await allowed;assert.equal(exports.length,1);assert.equal(exports[0][1],'application/pdf');
 console.log('National asynchronous crop/export checks passed: FileReader abort, cross-photo crop, logout/closed PDF and valid PDF export.');
})().catch(error=>{console.error(error);process.exitCode=1});