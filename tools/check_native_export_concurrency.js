'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const native=fs.readFileSync('index.js','utf8');
const guard=native.match(/async function runNativeExport\([\s\S]*?\n\}/)?.[0];
const inbox=native.match(/  const onWebMessage = useCallback\([\s\S]*?\n  \}, \[[^\n]+\]\);/)?.[0];
assert.ok(guard&&inbox,'Native export lock and WebView dispatcher must exist');
assert.ok(native.includes('const nativeExportBusyRef = useRef(false)'),'Busy state belongs to native App instance');
const preparse=inbox.slice(0,inbox.indexOf('let message; try { message = JSON.parse(raw); }'));
assert.equal((preparse.match(/if \(nativeExportBusyRef\.current\)/g)||[]).length,1,
 'Exactly one early busy guard must protect WebView JSON.parse, without stacked duplicate patches');
for(const kind of ['printPages','printHtml','savePdfHtml','shareBase64','scanBarcodeImage']){
 assert.ok(inbox.includes("runNativeExport(nativeExportBusyRef, () => "+kind+"(message))"),
  'Operation must be serialized: '+kind);
}
for(const kind of ['saveBase64','saveToGallery','savePagesToGallery','printBase64']){
 assert.ok(inbox.includes("if (message.type === '"+kind+"') return runNativeExport(nativeExportBusyRef, async () => {"),
  'Combined save and share must remain inside one native export lock: '+kind);
}
assert.ok(inbox.includes("runNativeExport(nativeExportBusyRef, () => cleanCache())"),
 'Cache cleanup must be locked with active print/share files');
function deferred(){
 let resolve,reject;
 const promise=new Promise((res,rej)=>{resolve=res;reject=rej});
 return {promise,resolve,reject};
}
function fixture(){
 const activities=[],alerts=[],pending=[],busy={current:false};
 const Alert={alert:(...args)=>alerts.push(args)};
 const exports=Object.fromEntries(['scanBarcodeImage','saveBase64','saveToGallery',
  'savePagesToGallery','printPages','printBase64','printHtml','savePdfHtml','shareBase64','cleanCache'].map(kind=>
  [kind,()=>{activities.push(kind);const p=deferred();pending.push(p);return p.promise}]));
 const callback={
  setWebReady:()=>activities.push('ready'),
  openCamera:()=>activities.push('camera'),
  openExternal:()=>activities.push('external'),
  openAppSettings:()=>activities.push('settings'),
  getDeviceInfo:()=>activities.push('device'),
  handleSecurity:()=>activities.push('security'),
  BackHandler:{exitApp:()=>activities.push('exit')},
  ...exports
 };
 const runNativeExport=new Function('Alert',guard+';return runNativeExport')(Alert);
 const args=['useCallback','Alert','MAX_NATIVE_MESSAGE_CHARS','nativeExportBusyRef','runNativeExport',
  'setWebReady','openCamera','scanBarcodeImage','saveBase64','saveToGallery',
  'savePagesToGallery','printPages','printBase64','printHtml','savePdfHtml','shareBase64',
  'openExternal','openAppSettings','getDeviceInfo','cleanCache','handleSecurity','BackHandler'];
 const parameters={useCallback:x=>x,Alert,MAX_NATIVE_MESSAGE_CHARS:256,nativeExportBusyRef:busy,runNativeExport,...callback};
 let parses=0;
 const parser={parse:text=>{parses++;return JSON.parse(text)}};
 // Reduce the large-message threshold only inside the test fixture.
 const testInbox=inbox.replace('raw.length > 1024','raw.length > 96');
 const onWebMessage=new Function('JSON',...args,testInbox+';return onWebMessage;')(parser,...args.map(x=>parameters[x]));
 return {dispatch:(type)=>onWebMessage({nativeEvent:{data:JSON.stringify({type})}}),
  dispatchRaw:raw=>onWebMessage({nativeEvent:{data:raw}}),parseCount:()=>parses,activities,alerts,pending,busy};
}
async function check(){
 const f=fixture();
 const first=f.dispatch('printPages');
 assert.equal(f.busy.current,true,'First print must lock large file operations');
 const duplicate=await f.dispatch('saveBase64');
 assert.equal(duplicate,false,'Second heavy export must be rejected');
 assert.deepEqual(f.activities,['printPages'],'Rejected request must not call other exporter');
 const destructiveCleanup=await f.dispatch('cleanCache');
 assert.equal(destructiveCleanup,false,'Cache cleanup must not delete a PDF while printing');
 const beforeRejectedParse=f.parseCount();
 const earlyRejected=await f.dispatchRaw(JSON.stringify({type:'saveBase64',data:'x'.repeat(140)}));
 assert.equal(earlyRejected,false,'Overlapping large file must fail before parsing');
 assert.equal(f.parseCount(),beforeRejectedParse,'A second large export must not allocate parsed JSON while busy');
 assert.ok(!f.activities.includes('cleanCache'),'No cleanup is allowed before print releases temporary files');
 assert.ok(f.alerts.some(a=>a[0].includes('عملية حفظ أو طباعة جارية')));
 await f.dispatch('getDeviceInfo');
 await f.dispatch('security');
 await f.dispatchRaw(JSON.stringify({type:'security',payload:{requestId:'r',note:'a'.repeat(140)}}));
 await f.dispatch('webBootReady');
 assert.deepEqual(f.activities,['printPages','device','security','security','ready'],
  'Lightweight device and security messages must stay responsive');
 f.pending[0].resolve('printed');
 assert.equal(await first,'printed');
 assert.equal(f.busy.current,false,'Successful print must release the lock');
 const after=f.dispatch('saveBase64');
 assert.equal(f.activities.at(-1),'saveBase64','Next export runs after print has completed');
 f.pending[1].reject(Error('device storage unavailable'));
 assert.equal(await after,false,'Unexpected export failure is caught and shown');
 assert.equal(f.busy.current,false,'Unexpected failure must release the lock');
 assert.ok(f.alerts.some(a=>a[0].includes('تعذرت معالجة الملف')));

 const next=f.dispatch('scanBarcodeImage');
 assert.equal(f.busy.current,true);
 const overlaid=await f.dispatch('shareBase64');
 assert.equal(overlaid,false,'Barcode image scan must not overlap sharing');
 f.pending[2].resolve(true);
 await next;
 assert.equal(f.busy.current,false);

 const malformedCount=f.activities.length;
 await f.dispatchRaw('not json');
 await f.dispatchRaw(JSON.stringify({type:'printPages',filler:'x'.repeat(300)}));
 assert.equal(f.activities.length,malformedCount);
 assert.ok(f.alerts.some(a=>a[0]==='الملف كبير جداً'));

 const recovered=f.dispatch('saveToGallery');
 assert.equal(f.busy.current,true);
 f.pending[3].resolve(true);
 await recovered;
 assert.equal(f.busy.current,false);
 const cleaning=f.dispatch('cleanCache');
 assert.equal(f.busy.current,true,'Cache cleanup locks native file operations');
 assert.equal(f.activities.at(-1),'cleanCache');
 const printDuringCleanup=await f.dispatch('printPages');
 assert.equal(printDuringCleanup,false,'Printing must not start while cache cleanup is deleting files');
 f.pending[4].resolve(true);
 await cleaning;
 assert.equal(f.busy.current,false,'Completed cache cleanup must release the lock');
 console.log('Native export concurrency passed: print/save/scan serialization, security responsiveness, recovery after errors, and oversized message rejection.');
}
check().catch(error=>{console.error(error);process.exitCode=1});
