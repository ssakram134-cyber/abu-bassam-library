'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('index.js','utf8');
const begin='  const savePdfHtml = useCallback(async ({ name, html }) => {';
const finish='  const writeTemporaryFile = useCallback(';
const start=source.indexOf(begin),end=source.indexOf(finish,start+begin.length);
assert.ok(start>=0&&end>start,'Native PDF callback not found');
const implementation=source.slice(start,end);
const calls=[],messages=[];let granted=true,failWrite=false;
const FileSystem={
 cacheDirectory:'file:///cache/',
 EncodingType:{Base64:'base64'},
 StorageAccessFramework:{
  getUriForDirectoryInRoot:()=> 'content://downloads',
  requestDirectoryPermissionsAsync:async()=>({granted,directoryUri:'content://selected'}),
  createFileAsync:async()=> 'content://selected/print.pdf',
  writeAsStringAsync:async(...args)=>{calls.push(['write',...args]);if(failWrite)throw Error('Storage full')}
 },
 readAsStringAsync:async()=> 'JVBERi0=',
 deleteAsync:async(uri)=>{calls.push(['delete',uri])}
};
const Print={printToFileAsync:async()=>({uri:'file:///cache/print-generated.pdf',base64:'JVBERi0='})};
const Alert={alert:(...args)=>messages.push(args)};
const factory=new Function('useCallback','FileSystem','Print','Alert','safeName',
 implementation+';return savePdfHtml');
const action=factory(fn=>fn,FileSystem,Print,Alert,name=>String(name).replace(/[^A-Za-z0-9_.-]/g,'_'));
(async()=>{
 granted=false;
 await action({name:'questions.pdf',html:'<html>Question</html>'});
 assert.equal(calls.filter(x=>x[0]==='delete').length,1,'PDF cache must be deleted after cancellation');
 assert.equal(calls.filter(x=>x[0]==='write').length,0,'Cancelled selection must not write');
 calls.length=0;granted=true;
 await action({name:'questions.pdf',html:'<html>Question</html>'});
 assert.equal(calls.filter(x=>x[0]==='write').length,1);
 assert.equal(calls.filter(x=>x[0]==='delete').length,1,'PDF cache must be deleted after success');
 assert.ok(messages.some(m=>m[0]==='تم حفظ PDF'),'Success must be reported only after write');
 calls.length=0;failWrite=true;
 await action({name:'questions.pdf',html:'<html>Question</html>'});
 assert.equal(calls.filter(x=>x[0]==='delete').length,1,'PDF cache must be deleted on write failure');
 assert.ok(messages.some(m=>m[0]==='تعذر حفظ PDF'),'Write failure must be reported');
 console.log('Android PDF lifecycle checks passed: user cancellation, successful write, failed write and cache cleanup on all paths.');
})().catch(err=>{console.error(err);process.exitCode=1});
