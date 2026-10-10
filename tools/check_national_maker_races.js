'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('web/national-id-runtime.js','utf8');new Function(source);
const events={},readers=[],pendingImages=[],cameraCalls=[],warnings=[],timers=[];
const ctx={fillRect(){},drawImage(){},save(){},translate(){},rotate(){},restore(){},getImageData(){return{data:new Uint8ClampedArray(4*64*64)}},putImageData(){}};
const elements=new Map();
function element(id){if(!elements.has(id))elements.set(id,{value:100,textContent:'',innerHTML:'',style:{},classList:{add(){},remove(){}},appendChild(){},getContext(){return ctx},toDataURL(){return 'data:image/jpeg;base64,QQ=='},removeAttribute(){}});return elements.get(id)}
function canvas(){return{width:0,height:0,style:{},getContext(){return ctx},toDataURL(){return 'data:image/jpeg;base64,QQ=='}}}
const document={getElementById:element,querySelector:()=>null,createElement:name=>name==='canvas'?canvas():element('other'),addEventListener:(name,fn)=>events[name]=fn};
const localStorage={getItem:()=>null,setItem(){},removeItem(){}};
class Reader{readAsDataURL(f){readers.push(this)}}
let deferImage=false;
class ImageMock{set src(value){this.naturalWidth=64;this.naturalHeight=64;this.width=64;this.height=64;if(deferImage)pendingImages.push(this);else this.onload?.()}}
const window={addEventListener(){},ReactNativeWebView:{postMessage:raw=>cameraCalls.push(JSON.parse(raw))}};
const injected=source.replace('window.Nat={','window.__makerAudit={S,makerFile,addNativeImage};window.Nat={');
assert.notEqual(source,injected);
new Function('window','document','localStorage','FileReader','Image','alert','setTimeout',injected)(window,document,localStorage,Reader,ImageMock,x=>warnings.push(String(x)),fn=>(timers.push(fn),timers.length));
const a=window.__makerAudit;
const file=n=>({name:n,type:'image/jpeg',size:120});
const resolveReader=r=>{r.result='data:image/jpeg;base64,QQ==';r.onload()};
const ticks=async()=>{for(let i=0;i<5;i++)await Promise.resolve()};
(async()=>{
 window.Nat.maker();
 const one=a.makerFile(file('front.jpg')),two=a.makerFile(file('back.jpg'));
 await ticks();assert.equal(readers.length,1,'Second face must not overtake first FileReader');
 resolveReader(readers[0]);await one;await ticks();
 assert.equal(readers.length,2,'Second file should start after first is committed');
 resolveReader(readers[1]);await two;
 assert.equal(a.S.items.length,2,'Two faces expected');
 assert.equal(a.S.items[0].name,'front.jpg');
 assert.equal(a.S.items[1].name,'back.jpg');
 assert.notEqual(a.S.front,a.S.back,'Front/back must remain separate image objects');
 const third=a.makerFile(file('third.jpg'));await third;
 assert.equal(a.S.items.length,2,'Third accidental selection must not append duplicate faces');
 assert.ok(warnings.some(w=>w.includes('اكتمل وجها الهوية')),'Duplicate face must be explained');
 // Cancel pending manual read when a new maker starts.
 window.Nat.maker();const obsolete=a.makerFile(file('stale.jpg'));
 await ticks();const staleReader=readers.at(-1);
 window.Nat.maker();resolveReader(staleReader);await obsolete;
 assert.equal(a.S.front,null,'Old picker result must not become new front');
 // Cancel pending native decode when a new maker starts.
 deferImage=true;const latest=cameraCalls.at(-1);
 window.AbuBassamNativeCameraResult({mode:'maker',requestId:latest.requestId,dataUrl:'data:image/jpeg;base64,QQ=='});
 assert.equal(pendingImages.length,1,'Current native picture should start decoding');
 window.Nat.maker();deferImage=false;pendingImages[0].onload();
 await ticks();assert.equal(a.S.front,null,'Old native image must not reappear after maker restart');
 // Old follow-up picker timer must not reopen a newer maker flow.
 const clicksBefore=element('natMakerInput').clicks||0;for(const t of timers)t();
 assert.equal(element('natMakerInput').clicks||0,clicksBefore,'Old face-picker callback must not reopen after restart');
 console.log('National maker checks passed: serialized faces, no third face, old picker and native results canceled.');
})().catch(error=>{console.error(error);process.exitCode=1});