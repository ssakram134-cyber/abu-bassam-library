'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const native=fs.readFileSync(path.join(__dirname,'..','index.js'),'utf8');
const bridge=native.match(/const ANDROID_BRIDGE = \x60([\s\S]*?)\x60;/)?.[1];
const printSource=native.match(/  const printPages = useCallback\([\s\S]*?\n  \}, \[\]\);/)?.[0];
const inbox=native.match(/  const onWebMessage = useCallback\([\s\S]*?\n  \}, \[[^\n]+\]\);/)?.[0];
const mutexSource=native.match(/async function runNativeExportOnce\(inFlight, kind, execute, message, report\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(mutexSource,'Native export re-entry guard exists');
const runNativeExportOnce=new Function(mutexSource+'\nreturn runNativeExportOnce')();
assert.ok(bridge&&printSource&&inbox,'Native WebView functions exist');
assert.ok(bridge.includes('var messageLimit = 48 * 1024 * 1024;'));
assert.ok(inbox.includes('raw.length > MAX_NATIVE_MESSAGE_CHARS'));
assert.ok(printSource.includes('MAX_NATIVE_PAGE_COUNT')&&printSource.includes('MAX_NATIVE_PAGE_CHARS'));
async function check(){
 const sent=[],notices=[];
 const window={alert:x=>notices.push(String(x)),ReactNativeWebView:{postMessage:x=>sent.push(JSON.parse(x))}};
 const reduced=bridge.replace('var messageLimit = 48 * 1024 * 1024;','var messageLimit = 256;');
 new Function('window',reduced)(window);
 window.Android.saveBase64('file.pdf','application/pdf','data:application/pdf;base64,AQIDBA==');
 assert.equal(sent.length,1);assert.equal(sent[0].type,'saveBase64');
 window.Android.saveBase64('huge.pdf','application/pdf','x'.repeat(257));
 assert.equal(sent.length,1);assert.ok(notices.some(x=>x.includes('حجم الصور كبير')));
 window.Android.printPages(Array(21).fill('x'),'A4',300);
 assert.equal(sent.length,1);assert.ok(notices.some(x=>x.includes('20 صفحة')));
 window.Android.printPages('a'.repeat(220),'A4',300);
 assert.equal(sent.length,1);assert.ok(notices.some(x=>x.includes('الحد الآمن')));
 const jobs=[],alerts=[];
 const printer=new Function('useCallback','Print','printDimensions','Alert',
 'MAX_NATIVE_PAGE_CHARS','MAX_NATIVE_PAGE_COUNT',printSource+';return printPages;')(
 fn=>fn,{printAsync:async x=>jobs.push(x)},
 ()=>({width:210,height:297}),{alert:(...x)=>alerts.push(x)},5000,20);
 const img='data:image/png;base64,AQIDBA==';
 await printer({pages:JSON.stringify([img,img]),paper:'A4'});
 assert.equal(jobs.length,1);
 await printer({pages:JSON.stringify(Array(21).fill(img)),paper:'A4'});
 await printer({pages:JSON.stringify(['not a data url']),paper:'A4'});
 await printer({pages:'x'.repeat(5001),paper:'A4'});
 assert.equal(jobs.length,1);assert.ok(alerts.length>=3);
 const events=[],nativeAlerts=[],noop=()=>{};
 const receiver=new Function('useCallback','Alert','MAX_NATIVE_MESSAGE_CHARS',
 'runNativeExportOnce','exportInFlightRef','reportExport','setWebFailure',
 'setWebReady','openCamera','scanBarcodeImage','saveBase64','saveToGallery','savePagesToGallery',
 'printPages','printBase64','printHtml','savePdfHtml','shareBase64','openExternal',
 'openAppSettings','getDeviceInfo','cleanCache','handleSecurity','BackHandler',
 inbox+';return onWebMessage;')(
 fn=>fn,{alert:(...x)=>nativeAlerts.push(x)},128,runNativeExportOnce,{current:new Map()},()=>{},()=>{},
 ()=>events.push('ready'),noop,noop,()=>events.push('save'),noop,noop,
 noop,noop,noop,noop,noop,noop,noop,noop,noop,noop,{exitApp:noop});
 await receiver({nativeEvent:{data:'{"type":"webBootReady"}'}});
 await receiver({nativeEvent:{data:'{"type":"saveBase64"}'}});
 assert.deepEqual(events,['ready','save']);
 await receiver({nativeEvent:{data:'x'.repeat(129)}});
 assert.deepEqual(events,['ready','save']);
 assert.equal(nativeAlerts[0][0],'الملف كبير جداً');
 await receiver({nativeEvent:{data:'not-json'}});
 assert.equal(events.length,2);
 const pending=new Map(),calls=[],busy={current:new Map()};
 const mk=kind=>()=>new Promise((resolve,reject)=>{
   calls.push(kind);pending.set(kind,{resolve,reject});
 });
 const noopExport=()=>Promise.resolve();
 const build=new Function('useCallback','Alert','MAX_NATIVE_MESSAGE_CHARS',
   'runNativeExportOnce','exportInFlightRef','reportExport','setWebFailure',
   'setWebReady','openCamera','scanBarcodeImage','saveBase64','saveToGallery','savePagesToGallery',
   'printPages','printBase64','printHtml','savePdfHtml','shareBase64','openExternal',
   'openAppSettings','getDeviceInfo','cleanCache','handleSecurity','BackHandler',
   inbox+';return onWebMessage;');
 const active=build(fn=>fn,{alert:(...args)=>nativeAlerts.push(args)},128,
   runNativeExportOnce,busy,noop,noop,noop,noop,noop,
   mk('saveBase64'),mk('saveToGallery'),mk('savePagesToGallery'),
   mk('printPages'),mk('printBase64'),mk('printHtml'),
   mk('savePdfHtml'),mk('shareBase64'),
   noop,noop,noop,noop,noop,{exitApp:noop});
 const request=(type,more={})=>active({nativeEvent:{data:JSON.stringify({type,...more})}});
 let checked=0;
 for(const type of ['saveBase64','saveToGallery','savePagesToGallery','printPages','printBase64','printHtml','savePdfHtml','shareBase64']){
   const first=request(type,{name:'x'}),repeat=request(type,{name:'x'});
   assert.equal(await repeat,false,'repeat '+type+' must not start another Android operation');checked++;
   assert.equal(calls.filter(x=>x===type).length,1,type+' started once');checked++;
   assert.ok(busy.current.has(type),'operation still protected while active');checked++;
   pending.get(type).resolve(false); // Even if the SAF picker was cancelled.
   assert.equal(await first,true,'native task returned and released');checked++;
   assert.equal(busy.current.has(type),false,'cancel/completion clears guard');checked++;
   const again=request(type,{name:'x'});
   assert.equal(calls.filter(x=>x===type).length,2,'same export can retry after cancel');checked++;
   pending.get(type).resolve();
   assert.equal(await again,true,'retry finishes');checked++;
 }
 const simultaneousSave=request('saveBase64');
 const simultaneousPrint=request('printHtml');
 assert.ok(busy.current.has('saveBase64')&&busy.current.has('printHtml'),'different export types have independent guards');checked++;
 pending.get('saveBase64').resolve();pending.get('printHtml').resolve();
 await Promise.all([simultaneousSave,simultaneousPrint]);
 assert.equal(busy.current.size,0,'independent requests release their state');checked++;
 const failure=request('savePdfHtml');
 pending.get('savePdfHtml').reject(Error('SAF write failure'));
 await assert.rejects(failure,/SAF write failure/);checked++;
 assert.equal(busy.current.size,0,'rejected native export frees pending lock');checked++;
 const retryAfterFailure=request('savePdfHtml');
 pending.get('savePdfHtml').resolve();
 assert.equal(await retryAfterFailure,true,'failure does not permanently block export');checked++;
 assert.equal(busy.current.size,0,'all export locks cleared');checked++;
 console.log('Native export re-entry regression checks passed: '+checked+'/'+checked);

 console.log('WebView bridge size and print safety passed: 3 payload paths and validation of malformed, too-large and excessive-page requests.');
}
check().catch(e=>{console.error(e);process.exitCode=1});
require('./check_native_export_ack.js');
