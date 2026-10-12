'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const native=fs.readFileSync(path.join(__dirname,'..','index.js'),'utf8');
const bridge=native.match(/const ANDROID_BRIDGE = \x60([\s\S]*?)\x60;/)?.[1];
const printSource=native.match(/  const printPages = useCallback\([\s\S]*?\n  \}, \[\]\);/)?.[0];
const inbox=native.match(/  const onWebMessage = useCallback\([\s\S]*?\n  \}, \[[^\n]+\]\);/)?.[0];
assert.ok(bridge&&printSource&&inbox,'Native WebView functions exist');
assert.ok(bridge.includes('var messageLimit = 48 * 1024 * 1024;'));
assert.ok(inbox.includes('raw.length > MAX_NATIVE_MESSAGE_CHARS'));
assert.ok(printSource.includes('MAX_NATIVE_PAGE_COUNT')&&printSource.includes('MAX_NATIVE_PAGE_CHARS'));
async function check(){
 const sent=[],notices=[];
 const window={alert:x=>notices.push(String(x)),ReactNativeWebView:{postMessage:x=>sent.push(JSON.parse(x))}};
 const reduced=bridge.replace('var messageLimit = 48 * 1024 * 1024;','var messageLimit = 128;');
 new Function('window',reduced)(window);
 window.Android.saveBase64('file.pdf','application/pdf','data:application/pdf;base64,AQIDBA==');
 assert.equal(sent.length,1);assert.equal(sent[0].type,'saveBase64');
 window.Android.saveBase64('huge.pdf','application/pdf','x'.repeat(129));
 assert.equal(sent.length,1);assert.ok(notices.some(x=>x.includes('حجم الصور كبير')));
 window.Android.printPages(Array(21).fill('x'),'A4',300);
 assert.equal(sent.length,1);assert.ok(notices.some(x=>x.includes('20 صفحة')));
 window.Android.printPages('a'.repeat(100),'A4',300);
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
 const guard=native.match(/async function runNativeExport\([\s\S]*?\n\}/)?.[0];
 assert.ok(guard,'Native concurrent export guard must exist');
 const receiver=new Function('useCallback','Alert','MAX_NATIVE_MESSAGE_CHARS',
 'setWebReady','openCamera','scanBarcodeImage','saveBase64','saveToGallery','savePagesToGallery',
 'printPages','printBase64','printHtml','savePdfHtml','shareBase64','openExternal',
 'openAppSettings','getDeviceInfo','cleanCache','handleSecurity','BackHandler',
 'nativeExportBusyRef',guard+';'+inbox+';return onWebMessage;')(
 fn=>fn,{alert:(...x)=>nativeAlerts.push(x)},128,
 ()=>events.push('ready'),noop,noop,()=>events.push('save'),noop,noop,
 noop,noop,noop,noop,noop,noop,noop,noop,noop,noop,{exitApp:noop},{current:false});
 await receiver({nativeEvent:{data:'{"type":"webBootReady"}'}});
 await receiver({nativeEvent:{data:'{"type":"saveBase64"}'}});
 assert.deepEqual(events,['ready','save']);
 await receiver({nativeEvent:{data:'x'.repeat(129)}});
 assert.deepEqual(events,['ready','save']);
 assert.equal(nativeAlerts[0][0],'الملف كبير جداً');
 await receiver({nativeEvent:{data:'not-json'}});
 assert.equal(events.length,2);
 console.log('WebView bridge size and print safety passed: 3 payload paths and validation of malformed, too-large and excessive-page requests.');
}
check().catch(e=>{console.error(e);process.exitCode=1});
