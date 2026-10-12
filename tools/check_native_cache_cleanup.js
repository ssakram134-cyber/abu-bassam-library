'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const native=fs.readFileSync('index.js','utf8');
const writer=native.match(/  const cleanCache = useCallback\([\s\S]*?\n  \}, \[\]\);/)?.[0];
const dispatcher=native.match(/  const onWebMessage = useCallback\([\s\S]*?\n  \}, \[[^\n]+\]\);/)?.[0];
assert.ok(writer&&dispatcher,'Cache cleaner and WebView handler exist');
assert.ok(dispatcher.includes("runNativeExport(nativeExportBusyRef, () => cleanCache())"),
 'Cache deletion must share the export lock with live print/share files');

function simulate(options={}){
 const alerts=[],deleted=[];
 const FileSystem={
  cacheDirectory:options.noCache?null:'file:///tmp/cache/',
  readDirectoryAsync:async()=>{if(options.failRead)throw Error('cannot list cache');
   return options.entries||['abu_bassam_alpha.pdf','another_app.pdf','abu_bassam_beta.pdf']},
  deleteAsync:async(uri,opts)=>{
   deleted.push([uri,opts]);
   if(options.failedNames?.some(name=>uri.endsWith(name)))throw Error('permission denied')
  }
 };
 const Alert={alert:(...args)=>alerts.push(args)};
 const clean=new Function('useCallback','FileSystem','Alert',
  writer+';return cleanCache;')(callback=>callback,FileSystem,Alert);
 return {clean,alerts,deleted};
}
async function test(){
 const normal=simulate();
 await normal.clean();
 assert.deepEqual(normal.deleted.map(x=>x[0]),[
  'file:///tmp/cache/abu_bassam_alpha.pdf','file:///tmp/cache/abu_bassam_beta.pdf'
 ]);
 assert.deepEqual(normal.deleted[0][1],{idempotent:true});
 assert.equal(normal.alerts[0][0],'تم التنظيف');
 assert.ok(normal.alerts[0][1].includes('حُذف 2 ملف مؤقت'));

 const partial=simulate({failedNames:['beta.pdf']});
 await partial.clean();
 assert.deepEqual(partial.deleted.map(x=>x[0]),[
  'file:///tmp/cache/abu_bassam_alpha.pdf','file:///tmp/cache/abu_bassam_beta.pdf'
 ]);
 assert.equal(partial.alerts[0][0],'تنظيف جزئي');
 assert.ok(partial.alerts[0][1].includes('حُذف 1'));
 assert.ok(partial.alerts[0][1].includes('تعذر حذف 1'));

 const filtered=simulate({entries:[
  'abu_bassam_valid.jpg','abu_bassam_../parent','unrelated_file.pdf',
  'abu_bassam_\\bad','abu_bassam_/bad'
 ]});
 await filtered.clean();
 assert.equal(filtered.deleted.length,1,'Names with path separators are rejected');
 assert.ok(filtered.deleted.every(x=>x[0].startsWith('file:///tmp/cache/')));
 assert.ok(!filtered.deleted.some(x=>x[0].includes('\\')||x[0].includes('/bad')));

 const empty=simulate({entries:[]});
 await empty.clean();
 assert.equal(empty.deleted.length,0);
 assert.ok(empty.alerts[0][1].includes('حُذف 0'));

 const failedList=simulate({failRead:true});
 await failedList.clean();
 assert.equal(failedList.deleted.length,0);
 assert.equal(failedList.alerts[0][0],'تعذر التنظيف');

 const noCache=simulate({noCache:true});
 await noCache.clean();
 assert.equal(noCache.deleted.length,0);
 assert.equal(noCache.alerts[0][0],'تعذر التنظيف');
 console.log('Native cache cleanup passed: scoped files, partial failures, empty cache, unreadable directory and invalid paths.');
}
test().catch(error=>{console.error(error);process.exitCode=1});
