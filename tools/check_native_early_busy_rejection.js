'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const source=fs.readFileSync('index.js','utf8');
const guard=source.match(/async function runNativeExport\([\s\S]*?\n\}/)?.[0];
const inbox=source.match(/  const onWebMessage = useCallback\([\s\S]*?\n  \}, \[[^\n]+\]\);/)?.[0];
assert.ok(guard&&inbox,'The Android dispatcher and export guard must exist');
assert.ok(inbox.indexOf('if (nativeExportBusyRef.current) {')>=0 &&
 inbox.indexOf('if (nativeExportBusyRef.current) {')<inbox.indexOf('JSON.parse(raw)') &&
 inbox.includes('raw.slice(0, 128)'),
 'Busy heavy requests must be rejected before JSON.parse using bounded header inspection');
assert.ok(inbox.includes("runNativeExport(nativeExportBusyRef, () => cleanCache())"),
 'Cache cleanup cannot delete an active shared or printed temporary file');

function makeFixture(){
 const events=[],alerts=[],pending=[],busy={current:false};
 let parsing=0;
 const Alert={alert:(...args)=>alerts.push(args)};
 const fakeJson={parse(raw){parsing++;return JSON.parse(raw)}};
 const nextWork=name=>()=>new Promise(resolve=>{events.push(name);pending.push(resolve)});
 const actions=['scanBarcodeImage','saveBase64','saveToGallery','savePagesToGallery',
  'printPages','printBase64','printHtml','savePdfHtml','shareBase64','cleanCache'];
 const callback=Object.fromEntries(actions.map(name=>[name,nextWork(name)]));
 Object.assign(callback,{
  setWebReady:()=>events.push('ready'),
  openCamera:()=>events.push('camera'),
  openExternal:()=>events.push('external'),
  openAppSettings:()=>events.push('settings'),
  getDeviceInfo:()=>events.push('device'),
  handleSecurity:()=>events.push('security'),
  BackHandler:{exitApp:()=>events.push('exit')}
 });
 const runNativeExport=new Function('Alert',guard+';return runNativeExport')(Alert);
 const keys=['useCallback','Alert','JSON','MAX_NATIVE_MESSAGE_CHARS',
  'nativeExportBusyRef','runNativeExport','setWebReady','openCamera',
  ...actions.slice(0,9),'openExternal','openAppSettings','getDeviceInfo',
  'cleanCache','handleSecurity','BackHandler'];
 const data={useCallback:f=>f,Alert,JSON:fakeJson,MAX_NATIVE_MESSAGE_CHARS:2048,
  nativeExportBusyRef:busy,runNativeExport,...callback};
 const receive=new Function(...keys,inbox+';return onWebMessage;')(...keys.map(k=>data[k]));
 return{send:payload=>receive({nativeEvent:{data:JSON.stringify(payload)}}),
  raw:text=>receive({nativeEvent:{data:text}}),
  parsed:()=>parsing,events,pending,alerts,busy};
}
(async()=>{
 const f=makeFixture();
 const original=f.send({type:'printPages',pages:['data:image/png;base64,AQID']});
 assert.equal(f.busy.current,true);
 assert.equal(f.parsed(),1);

 const second=await f.send({type:'saveBase64',data:'A'.repeat(1024)});
 assert.equal(second,false);
 assert.equal(f.parsed(),1,'Busy large request must never be JSON-parsed');
 assert.deepEqual(f.events,['printPages']);
 assert.ok(f.alerts.some(x=>x[0].includes('عملية حفظ أو طباعة جارية')));

 const cleanup=await f.send({type:'cleanCache'});
 assert.equal(cleanup,false);
 assert.equal(f.parsed(),1,'Blocked cache clear must not parse its message or delete an active print file');
 assert.deepEqual(f.events,['printPages']);

 await f.send({type:'security',action:'deviceInfo'});
 assert.equal(f.parsed(),2,'Security messages remain dispatchable while busy');
 assert.deepEqual(f.events,['printPages','security']);

 // Non-standard JSON key order still reaches the authoritative task lock.
 const oddOrder=await f.raw('{"name":"later","type":"shareBase64"}');
 assert.equal(oddOrder,false);
 assert.equal(f.parsed(),3);
 assert.deepEqual(f.events,['printPages','security']);

 f.pending[0]('printed');
 assert.equal(await original,'printed');
 assert.equal(f.busy.current,false);

 const next=f.send({type:'cleanCache'});
 assert.equal(f.parsed(),4);
 assert.equal(f.events.at(-1),'cleanCache','Cache cleanup is allowed after the print finishes');
 f.pending[1]('cleaned');
 assert.equal(await next,'cleaned');
 assert.equal(f.busy.current,false);

 const another=f.send({type:'saveBase64'});
 assert.equal(f.events.at(-1),'saveBase64','Future saves are not stuck behind a stale lock');
 f.pending[2]('saved');
 assert.equal(await another,'saved');

 const huge=await f.send({type:'printPages',payload:'z'.repeat(2200)});
 assert.equal(huge,undefined);
 assert.ok(f.alerts.some(x=>x[0]==='الملف كبير جداً'));
 assert.equal(f.events.filter(x=>x==='printPages').length,1);
 console.log('Native pre-JSON busy rejection passed: repeated heavy exports, cache-clean race, alternate JSON order, security access and recovery.');
})().catch(e=>{console.error(e);process.exitCode=1});
