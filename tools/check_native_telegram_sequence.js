'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const native=fs.readFileSync('index.js','utf8');
const html=fs.readFileSync('web/index.html','utf8');
const guard=native.match(/async function runNativeExport\([\s\S]*?\n\}/)?.[0];
const inbox=native.match(/  const onWebMessage = useCallback\([\s\S]*?\n  \}, \[[^\n]+\]\);/)?.[0];
const bridge=native.match(/const ANDROID_BRIDGE = \`([\s\S]*?)\`;/)?.[1];
assert.ok(guard&&inbox&&bridge,'Real native export sources must be discoverable');

let passed=0;const check=(bool,msg)=>{assert.ok(bool,msg);passed++};
const events=[],alerts=[],printed=[],shared=[],pagesSaved=[];
let shareFails=false,saveBehavior=async()=>true,batchBehavior=async()=>({saved:2,savedIndexes:[0,1]}),printBehavior=async()=>true;
const Alert={alert:(...parts)=>alerts.push(parts)};
const runNativeExport=new Function('Alert',guard+';return runNativeExport')(Alert);
const busy={current:false};
const actions={
 setWebReady:()=>{},openCamera:()=>{},scanBarcodeImage:async()=>true,
 saveBase64:async message=>saveBehavior(message),
 saveToGallery:async()=>true,
 savePagesToGallery:async message=>batchBehavior(message),
 printPages:async msg=>{printed.push(msg);return true},
 printBase64:async message=>printBehavior(message),
 printHtml:async()=>true,savePdfHtml:async()=>true,
 shareBase64:async msg=>{events.push('share');shared.push(msg);if(shareFails)throw Error('Share failure');return true},
 openExternal:()=>{},openAppSettings:()=>{},getDeviceInfo:()=>{},cleanCache:async()=>true,
 handleSecurity:()=>{},BackHandler:{exitApp:()=>{}}
};
const keys=['useCallback','Alert','JSON','MAX_NATIVE_MESSAGE_CHARS','nativeExportBusyRef','runNativeExport',
 'setWebReady','openCamera','scanBarcodeImage','saveBase64','saveToGallery','savePagesToGallery',
 'printPages','printBase64','printHtml','savePdfHtml','shareBase64','openExternal','openAppSettings',
 'getDeviceInfo','cleanCache','handleSecurity','BackHandler'];
const values={useCallback:f=>f,Alert,JSON,MAX_NATIVE_MESSAGE_CHARS:1000000,nativeExportBusyRef:busy,runNativeExport,...actions};
const receive=new Function(...keys,inbox+';return onWebMessage')(...keys.map(k=>values[k]));
const dispatch=(type,extra={})=>receive({nativeEvent:{data:JSON.stringify({type,...extra})}});
function flush(){return Promise.resolve().then(()=>Promise.resolve())}
(async()=>{
 // Saving and sharing must be one serialized operation, not two WebView messages.
 let allow;
 saveBehavior=async()=>{events.push('save-start');await new Promise(r=>allow=r);events.push('save-end');return true};
 const promise=dispatch('saveBase64',{name:'test.pdf',mime:'application/pdf',data:'data:application/pdf;base64,AQID',shareAfter:true});
 check(busy.current&&events.join(',')==='save-start','Save must hold native export lock before sharing');
 const duplicate=await dispatch('printPages',{pages:[]});
 check(duplicate===false&&!printed.length,'A separate print request cannot overlap ongoing save');
 allow(true);await promise;
 check(events.join(',')==='save-start,save-end,share'&&!busy.current,
  'Optional share happens only AFTER primary save inside same native export lock');
 check(shared.length===1&&shared[0].name==='test.pdf','Post-save sharing reuses original payload');
 saveBehavior=async()=>false;
 await dispatch('saveBase64',{shareAfter:true});
 check(shared.length===1,'Canceled file picker cannot open sharing');
 saveBehavior=async()=>true;
 await dispatch('saveBase64',{shareAfter:false});
 check(shared.length===1,'Telegram disabled must not open sharing');
 saveBehavior=async()=>true;

 const mixed=['data:image/png;base64,AQID','data:image/jpeg;base64,BAUG'];
 await dispatch('savePagesToGallery',{prefix:'Page',pages:mixed,mime:'image/jpeg',shareIndex:1});
 check(shared.length===2&&shared.at(-1).data===mixed[1]&&shared.at(-1).mime==='image/jpeg',
  'Batch share reuses only the selected saved image, not the entire batch');
 batchBehavior=async()=>({saved:1,savedIndexes:[0]});
 await dispatch('savePagesToGallery',{pages:mixed,shareIndex:1});
 check(shared.length===2,'A failed selected image must never be shared as if it had saved');
 batchBehavior=async()=>({saved:2,savedIndexes:[0,1]});

 await dispatch('printBase64',{shareAfter:true,name:'print.pdf',data:'data:application/pdf;base64,AQID'});
 check(shared.length===3,'Print share must run under the same print export lock');
 printBehavior=async()=>false;
 await dispatch('printBase64',{shareAfter:true});
 check(shared.length===3,'Failed print must not trigger sharing');
 printBehavior=async()=>true;
 shareFails=true;
 await dispatch('saveBase64',{shareAfter:true});
 check(busy.current===false&&alerts.some(a=>a[0].includes('تعذرت معالجة الملف')),
  'Share failures must release export lock without repeating the save');
 shareFails=false;

 // One bridge message includes the sharing preference; no competing postMessage.
 const sent=[];
 const win={alert:()=>{},ReactNativeWebView:{postMessage:x=>sent.push(JSON.parse(x))}};
 new Function('window',bridge)(win);
 win.Android.saveBase64('doc.pdf','application/pdf','data:application/pdf;base64,AQID',true);
 win.Android.savePagesToGallery('pages',mixed,'image/jpeg',1);
 win.Android.printPages(mixed,'A4',300,true);
 check(sent.slice(-3).map(x=>x.type).join(',')==='saveBase64,savePagesToGallery,printPages'&&
   sent.at(-3).shareAfter===true&&sent.at(-2).shareIndex===1&&sent.at(-1).shareAfter===true,
  'The WebView bridge packages one request per action with the Telegram flag');

 // Verify real Web function uses one call rather than Telegram + save or print.
 function extract(start,end){const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a);return html.slice(a,b)}
 const pdf=extract('async function downloadPDF(){','async function printDirectly(){');
 const print=extract('async function printDirectly(){','function saveTelegramSettings(){');
 const jpeg=extract('function downloadJPG(){','async function downloadPDF(){');
 const calls=[],telegram=[];
 const Android={saveBase64:(...args)=>calls.push({kind:'save',args}),
  savePagesToGallery:(...args)=>calls.push({kind:'gallery',args}),
  printPages:(...args)=>calls.push({kind:'print',args})};
 const web=new Function('pageCanvases','currentPage','alert','window','Android','telegramReady',
 'telegramSend','makePdfDataAsync','getPaperPrintKey','printDpi','pagePrintMeta','document',
 jpeg+pdf+print+';return{downloadJPG,downloadPDF,printDirectly}')(
 [{toDataURL:()=>mixed[0]},{toDataURL:()=>mixed[1]}],1,()=>{}, {Android},Android,()=>true,
 (...args)=>telegram.push(args),async()=> 'data:application/pdf;base64,AQID',
 ()=> 'CUSTOM:297:210',()=>300,{paperKey:'CUSTOM:297:210',dpi:300},{createElement:()=>({click(){}})});
 web.downloadJPG();
 await web.downloadPDF();
 await web.printDirectly();
 check(calls.length===3&&telegram.length===0,
  'Photo, PDF and print operations must no longer send a second concurrent Telegram request');
 check(calls[0].kind==='gallery'&&calls[0].args[3]===1&&calls[1].args[3]===true&&
   calls[2].args[3]===true,'Native exports must convey optional share preference');
 console.log('Native Telegram serialization passed: '+passed+
  ' cases; success, cancel, partial gallery save, print failure and one-message bridge.')
})().catch(e=>{console.error(e);process.exitCode=1});
