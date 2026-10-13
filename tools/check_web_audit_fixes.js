'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const extract=(s,start,end)=>{const a=s.indexOf(start),b=s.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,'Missing source boundaries '+start);return s.slice(a,b)};
async function main(){
 const device=read('web/device-name-runtime.js'),registry=read('web/device-reconcile-runtime.js');
 const guard=read('web/permission-guard-runtime.js'),ocr=read('web/document-vault-offline-ocr-runtime.js');
 const editor=read('web/document-vault-advanced-runtime.js'),native=read('index.js');
 const assets=read('scripts/prepare-android-assets.mjs'),pin=read('web/mediapipe-pin-runtime.js');
 for(const file of ['web/device-name-runtime.js','web/device-reconcile-runtime.js','web/permission-guard-runtime.js','web/document-vault-offline-ocr-runtime.js','web/document-vault-advanced-runtime.js','web/productivity-tools-runtime.js','web/mediapipe-pin-runtime.js'])new Function(read(file));
 for(const token of ["message.type === 'webBootFailed'","webRef.current?.reload()","STARTUP_WATCHDOG_MS = 12000"])assert.ok(native.includes(token),'Missing safe native boot recovery: '+token);
 assert.ok(device.indexOf('await loadSecurity();')<device.indexOf('signalBootReady();'),'Security gate must finish before boot signal');
 assert.ok(device.includes('catch(error){failed.push('),'Optional failures should not skip all other feature scripts');
 const waiting={dataset:{},handlers:{},addEventListener(k,fn){this.handlers[k]=fn},removeEventListener(k){delete this.handlers[k]}};
 const doc={getElementById:()=>waiting,dispatchEvent:()=>{}};
 const load=new Function('document','window','CustomEvent',extract(device,'  function loadScript(id,src,guard){','  const loadFeatureRecovery=')+';return loadScript')(doc,{},function(){});
 let settled=false;
 const pendingLoad=load('existing','example.js','NOT_READY').then(()=>{settled=true});
 await Promise.resolve();
 assert.equal(settled,false,'Existing loading script must not count as ready');
 waiting.handlers.load();
 await pendingLoad;
 assert.equal(settled,true);
 const registryHelpers=extract(registry,'function time(v)','function nativeRequest(');
 const dedupe=new Function('CURRENT_ID',registryHelpers+';return dedupe')(()=> 'phoneA');
 const identical=[
  {device_id:'phoneA',device_name:'جهاز المكتبة',model:'Android',platform:'Android',last_seen:'2026-10-10'},
  {device_id:'phoneB',device_name:'جهاز المكتبة',model:'Android',platform:'Android',last_seen:'2026-10-11'}
 ];
 assert.deepEqual(dedupe(identical).map(x=>x.device_id),['phoneA','phoneB'],'Distinct device IDs must remain visible');
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const htmlFn=new Function('CURRENT_ID','esc','displayName',extract(registry,'function rowHtml(row){','function syncSecurityCardLabel(')+';return rowHtml')(()=> 'phoneA',esc,r=>r.device_name);
 const output=htmlFn({...identical[1],device_name:"O'Neil"});
 assert.ok(!output.includes('onclick='),'Device names must never enter inline JavaScript handlers');
 assert.ok(output.includes('data-device-action="rename"'));
 const node={style:{opacity:'0.9'},dataset:{},title:'Print',removeAttribute(k){if(k==='title')this.title=''}};
 let permitted=false;
 const decorate=new Function('secondary','document','exempt','permissionFor','allowed',extract(guard,'function decorate(){','let decorateQueued=false;')+';return decorate')(()=>true,{querySelectorAll:()=>[node]},()=>false,()=> 'print',()=>permitted);
 decorate();assert.equal(node.style.opacity,'.48');
 permitted=true;decorate();assert.equal(node.style.opacity,'0.9','Restored permission must restore opacity');
 assert.ok(guard.includes('readOnlyException(field)'),'Read-only search fields must still be editable for searching');
 const deferred={};
 class ImageFake{set src(v){Promise.resolve().then(()=>this.onload?.())}}
 const openFn=new Function('getItem','permitted','modal','URL','Image','reset','$','drawPreview','requestAnimationFrame','updateOverlay','alert',
  "let st=null,url='',sessionEpoch=0,openEpoch=0;"+extract(editor,'async function open(id){','function controls(){')+';return {open,current:()=>st?.id}');
 const api=openFn(id=>new Promise(resolve=>deferred[id]=resolve),()=>true,()=>{},{createObjectURL:b=>b.id,revokeObjectURL:()=>{}},ImageFake,()=>{},()=>({classList:{add(){}}}),()=>{},()=>{},()=>{},()=>{});
 const older=api.open('A'),newer=api.open('B');
 deferred.B({id:'B',blob:{id:'B'},mime:'image/png'});await newer;
 deferred.A({id:'A',blob:{id:'A'},mime:'image/png'});await older;
 assert.equal(api.current(),'B','Old editor open must not replace newer one');
 const images={vOcrImage:{src:'',style:{}},vOcrText:{value:''}},jobs={};
 const recognize=new Function('worker','$','setProgress','scheduleIdle','window',
  "let lastImage='',busy=false,recognizeEpoch=0,MAX_OCR_DATA_CHARS=18*1024*1024;"+extract(ocr,'async function recognize(dataUrl){','function fileToData(file){')+';return recognize')(
  async()=>({recognize:key=>new Promise(resolve=>jobs[key]=resolve)}),id=>images[id],()=>{},()=>{},{AbuBassamOps:{add(){}}});
 const sourceA='data:image/png;base64,QQ==',sourceB='data:image/png;base64,Qg==';
 const first=recognize(sourceA),second=recognize(sourceB);
 await Promise.resolve();await Promise.resolve();
 jobs[sourceB]({data:{text:'newest'}});await second;
 jobs[sourceA]({data:{text:'old'}});await first;
 assert.equal(images.vOcrText.value,'newest','Old OCR result must not replace newest');
 for(const marker of ['MEDIAPIPE_ASSETS','selfie_segmentation_solution_wasm_bin.wasm','selfie_segmentation_solution_simd_wasm_bin.wasm'])assert.ok(assets.includes(marker));
 assert.ok(pin.includes("const BASE='vendor/mediapipe/'"));
 console.log('Web audit regressions passed: boot loader, device identity, safe controls, UI permission restore, editor race, OCR race, and offline asset sources.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
