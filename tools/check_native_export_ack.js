'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const native=fs.readFileSync(path.join(root,'index.js'),'utf8');
const productivity=fs.readFileSync(path.join(root,'web/productivity-tools-runtime.js'),'utf8');
const compressor=fs.readFileSync(path.join(root,'web/image-compressor.html'),'utf8');
const helper=native.match(/async function runNativeExportOnce\(inFlight, kind, execute, message, report\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(helper,'canonical export queue missing');
const run=new Function(helper+'\nreturn runNativeExportOnce')();
let checks=0;
const eq=(a,b,label)=>{assert.equal(a,b,label);checks++};
const yes=(v,label)=>{assert.ok(v,label);checks++};
const report=[];
const sendReport=(kind,message,outcome)=>report.push({kind,id:message.requestId,...outcome});
const pending=[],busy=new Map();
const defer=name=>()=>new Promise((resolve,reject)=>pending.push({name,resolve,reject}));
(async()=>{
 const one={requestId:'abu-export-1',name:'first.pdf',data:'file-A'};
 const two={requestId:'abu-export-2',name:'second.pdf',data:'file-B'};
 const three={requestId:'abu-export-3',name:'third.pdf',data:'file-C'};
 const a=run(busy,'saveBase64',defer('first'),one,sendReport);
 const b=run(busy,'saveBase64',defer('second'),two,sendReport);
 const dupe=run(busy,'saveBase64',defer('dupe'),one,sendReport);
 eq(await dupe,false,'exact in-flight duplicate ignored');
 eq(report.find(x=>x.id===one.requestId)?.status,'duplicate','duplicate receives correlated notice');
 eq(report.find(x=>x.id===two.requestId)?.status,'queued','distinct second save queued');
 eq(pending.length,1,'second save not overlapping Android chooser');
 const beyond=run(busy,'saveBase64',defer('third'),three,sendReport);
 eq(await beyond,false,'bounded queue reports overflow');
 eq(report.find(x=>x.id===three.requestId)?.status,'busy','queue overflow explicitly reported');
 const independent=run(busy,'printHtml',defer('print'),{requestId:'abu-export-print',html:'<p>x</p>'},sendReport);
 eq(pending.length,2,'print can execute independently');
 pending.find(x=>x.name==='first').resolve({status:'saved',count:1,name:'first.pdf'});
 eq(await a,true,'first saved');
 eq(report.find(x=>x.id===one.requestId&&x.status==='saved')?.count,1,'first save acknowledged');
 await Promise.resolve();await Promise.resolve();
 eq(pending.length,3,'queued distinct second save starts automatically');
 pending.find(x=>x.name==='second').resolve({status:'cancelled'});
 eq(await b,true,'cancelled second save releases queue');
 eq(report.find(x=>x.id===two.requestId&&x.status==='cancelled')?.status,'cancelled','cancellation not falsely saved');
 pending.find(x=>x.name==='print').resolve({status:'submitted'});
 eq(await independent,true,'independent print finishes');
 eq(report.find(x=>x.kind==='printHtml')?.status,'submitted','print ack never claims physical printing');
 eq(busy.size,0,'queues drained');
 const broken=run(busy,'savePdfHtml',async()=>{throw Error('disk write failed')},{requestId:'abu-export-bad'},sendReport);
 await assert.rejects(broken,/disk write failed/);checks++;
 eq(report.find(x=>x.id==='abu-export-bad')?.status,'failed','unexpected failure acknowledged');
 eq(busy.size,0,'failure releases native coordinator');
 const bridge=native.match(/const ANDROID_BRIDGE = \x60([\s\S]*?)\x60;/)?.[1];
 yes(bridge,'bridge available');
 const messages=[],events=[];
 const window={ReactNativeWebView:{postMessage:raw=>messages.push(JSON.parse(raw))},alert:()=>{},dispatchEvent:e=>events.push(e)};
 const CustomEvent=function(type,opts){this.type=type;this.detail=opts.detail};
 new Function('window','CustomEvent',bridge)(window,CustomEvent);
 const id1=window.Android.saveBase64('a.docx','application/docx','data:application/docx;base64,AQIDBA==');
 const id2=window.Android.saveBase64('b.docx','application/docx','data:application/docx;base64,AQIDBA==');
 yes(/^abu-export-[a-z0-9-]+$/.test(id1),'save returns valid request ID');
 yes(id1!==id2,'separate saves get unique request IDs');
 eq(messages[0].requestId,id1,'native inbox preserves request ID');
 eq(messages[1].requestId,id2,'second request ID preserved');
 window.AbuBassamNativeExportResult({requestId:id1,status:'cancelled',type:'saveBase64'});
 eq(events.length,1,'valid result arrives as UI event');
 eq(events[0].detail.status,'cancelled','cancellation delivered to UI');
 window.AbuBassamNativeExportResult({requestId:'invalid',status:'saved'});
 eq(events.length,1,'unrelated/malformed receipt dropped');

 const bodyFor=name=>{
  const match=native.match(new RegExp('  const '+name+' = useCallback\\([\\s\\S]*?\\n  \\}, \\[\\]\\);'));
  assert.ok(match,'canonical '+name+' handler');
  return match[0];
 };
 function saveHarness(name,permission=true,fail=false){
  let writes=0;
  const alerts=[];
  const FileSystem={
   StorageAccessFramework:{getUriForDirectoryInRoot:()=> 'root',requestDirectoryPermissionsAsync:async()=>({granted:permission,directoryUri:'dir'})},
   cacheDirectory:'file:///tmp/',EncodingType:{Base64:'base64'},
   deleteAsync:async()=>{},readAsStringAsync:async()=> 'AQIDBA=='
  };
  const Print={printToFileAsync:async()=>({uri:'file:///tmp/p.pdf',base64:'AQIDBA=='})};
  const splitDataUrl=s=>({mime:String(s).slice(5).split(';')[0],base64:String(s).split(';base64,')[1]});
  const writeSafFile=async()=>{writes++;if(fail)throw Error('write rejected')};
  const safeName=s=>String(s||'file.pdf');
  const useCallback=fn=>fn;
  const fn=new Function('useCallback','splitDataUrl','safeName','FileSystem','Print','writeSafFile','Alert',
   bodyFor(name)+'\nreturn '+name)(useCallback,splitDataUrl,safeName,FileSystem,Print,writeSafFile,{alert:(...args)=>alerts.push(args)});
  return{fn,alerts,count:()=>writes};
 }
 const mime='image/png',png='data:image/png;base64,AQIDBA==';
 for(const type of ['saveBase64','saveToGallery','savePdfHtml']){
  const payload=type==='savePdfHtml'?{name:'a.pdf',html:'<p>document</p>'}:{name:'a.png',mime,data:png};
  const cancelled=saveHarness(type,false);
  eq((await cancelled.fn(payload)).status,'cancelled',type+' user cancel acknowledged');
  eq(cancelled.count(),0,type+' cancellation writes no file');
  const saved=saveHarness(type,true);
  eq((await saved.fn(payload)).status,'saved',type+' durable SAF completion');
  eq(saved.count(),1,type+' persisted one file');
  const fail=saveHarness(type,true,true);
  eq((await fail.fn(payload)).status,'failed',type+' write failure exposed');
 }
 const batch=saveHarness('savePagesToGallery',true);
 const partial=await batch.fn({prefix:'test',pages:JSON.stringify([png,'invalid']),mime:'image/png'});
 eq(partial.status,'partial','batch reports partial save');
 eq(partial.count,1,'partial count verified');
 eq(partial.failed,1,'partial failures verified');
 const noBatch=saveHarness('savePagesToGallery',false);
 eq((await noBatch.fn({pages:JSON.stringify([png])})).status,'cancelled','batch cancellation confirmed');
 yes(productivity.includes('onNativeQuestionExportResult'),'questions result listener present');
 yes(productivity.includes('watchNativeQuestionExport(Android.saveBase64('),'Word and ZIP caller IDs tracked');
 yes(compressor.includes('onNativeSaveResult'),'compressor result listener present');
 yes(compressor.includes('trackNativeSave(bridge.saveToGallery('),'single-image save ID tracked');
 yes(compressor.includes('trackNativeSave(bridge.savePagesToGallery('),'batch save ID tracked');
 console.log('Native correlated save acknowledgements and bounded queue: '+checks+'/'+checks+' checks passed');
})().catch(error=>{console.error(error);process.exitCode=1});
