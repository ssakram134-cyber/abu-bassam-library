'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const source=fs.readFileSync('web/backup-center-runtime.js','utf8');
new Function(source);
const auditSource=source.replace('window.AbuBackupCenter={',
 'paint=()=>{};status=()=>{};refreshList=async()=>{};window.__backupTest={stateGet,stateSet,backupNow,downloadBytes,restoreCloud,readBoundedPart,due};window.AbuBackupCenter={');
assert.notEqual(auditSource,source,'Unable to expose backup helpers for regression testing');
const prefs=new Map(),status=new Map(),alerts=[];
let userId='owner-A',fetchHandler=null,partReads=0;
const localStorage={
 getItem:k=>prefs.has(k)?prefs.get(k):null,
 setItem:(k,v)=>prefs.set(k,String(v)),
 removeItem:k=>prefs.delete(k),
 key:i=>[...prefs.keys()][i]??null,
 get length(){return prefs.size}
};
const cloud={
 ready:async()=>{},isConnected:()=>true,
 session:()=>({user:{id:userId},access_token:'test-token'})
};
const window={
 AbuBassamCloud:cloud,
 AbuBassamSecurity:{role:()=> 'owner',device:()=>({device_id:'branch-1'})},
 AbuBassamDevices:{ensure:()=>({id:'branch-1'})},
 AbuBassamNativeSecurity:{request:async()=> 'test-secret'}
};
const document={readyState:'loading',addEventListener(){},getElementById:()=>null};
const fetch=async(...args)=>{assert.ok(fetchHandler,'fetch handler must be set');return fetchHandler(...args)};
const nativeCrypto={subtle:crypto.webcrypto.subtle,randomUUID:crypto.randomUUID};
new Function('window','document','localStorage','navigator','crypto','fetch','TextEncoder','Blob','File','setTimeout','setInterval','alert','confirm',auditSource)(
 window,document,localStorage,{onLine:true},nativeCrypto,fetch,TextEncoder,Blob,
 class MockFile{constructor(parts,name){this.parts=parts;this.name=name}},
 (fn,ms)=>{queueMicrotask(fn);return 1},()=>1,m=>alerts.push(String(m)),()=>true
);
const audit=window.__backupTest;
assert.ok(audit);
function apiBody(data){return {ok:true,status:200,json:async()=>data}}
function streamResponse(bytes,declared){
 return {ok:true,status:200,headers:{get:k=>k==='content-length'?String(declared??bytes.length):null},
  body:{getReader(){let done=false;return{
   read:async()=>{partReads++;if(done)return {done:true};done=true;return {done:false,value:bytes}},
   cancel:async()=>{},releaseLock(){}}
  }}};
}
(async()=>{
 // Legacy global settings must never be copied into a newly authenticated user's scope.
 prefs.set('abuBassamBackupAutoV1','0');
 assert.equal(audit.stateGet('abuBassamBackupAutoV1'),null);
 audit.stateSet('abuBassamBackupAutoV1','1');
 assert.equal(audit.stateGet('abuBassamBackupAutoV1'),'1');
 userId='owner-B';
 assert.equal(audit.stateGet('abuBassamBackupAutoV1'),null);
 audit.stateSet('abuBassamBackupAutoV1','0');
 userId='owner-A';assert.equal(audit.stateGet('abuBassamBackupAutoV1'),'1');

 const bytes=Buffer.from('A verified backup example');
 const sha=crypto.createHash('sha256').update(bytes).digest('hex');
 const manifest={backup:{size_bytes:bytes.length,sha256:sha},parts:[{url:'https://storage.example/part'}]};
 fetchHandler=async url=>String(url).includes('action=download')?apiBody(manifest):streamResponse(bytes);
 let result=await audit.downloadBytes('good');
 assert.deepEqual(Buffer.from(result.bytes),bytes,'Valid streamed backup must remain intact');
 assert.equal(result.backup.sha256,sha);

 // Even when a server claims an enormous total, reject it before any part allocation.
 let downloads=0;
 fetchHandler=async url=>{
  if(String(url).includes('action=download'))return apiBody({backup:{size_bytes:120*1024*1024+1,sha256:sha},parts:[{url:'https://storage.example/part'}]});
  downloads++;throw Error('must not download oversized snapshot');
 };
 await assert.rejects(audit.downloadBytes('oversize'),/حجم النسخة غير صالح/);
 assert.equal(downloads,0,'No multipart download may start for oversized metadata');

 // Reject each part before or during streaming when the part violates its budget.
 fetchHandler=async url=>String(url).includes('action=download')?apiBody({
  backup:{size_bytes:5,sha256:sha},parts:[{url:'https://storage.example/oversized'}]
 }):streamResponse(Buffer.from('too many bytes'));
 await assert.rejects(audit.downloadBytes('bad-part'),/جزء النسخة يتجاوز الحجم المسموح/);

 // Switching accounts during the API response must abort before downloading or restoring.
 let fired=false;
 userId='owner-A';
 fetchHandler=async url=>{
  if(String(url).includes('action=download'))return {ok:true,json:async()=>{userId='owner-B';return manifest}};
  fired=true;return streamResponse(bytes);
 };
 await assert.rejects(audit.downloadBytes('wrong-account'),/تغيّر الحساب أو الجهاز/);
 assert.equal(fired,false,'Never fetch private parts after account switch');
 userId='owner-A';

 // A pending restore holds the exclusive lock; another backup must not interleave.
 let finishRequest;
 fetchHandler=async url=>{
  if(String(url).includes('action=download'))return new Promise(resolve=>{finishRequest=resolve});
  return streamResponse(bytes);
 };
 const pending=audit.restoreCloud('in-progress');
 await assert.rejects(audit.backupNow('manual',true),/عملية نسخ احتياطي قيد التنفيذ/);
 for(let i=0;i<20&&!finishRequest;i++)await Promise.resolve();
 assert.ok(finishRequest,'Restore download request should be pending');
 finishRequest(apiBody({backup:{size_bytes:0,sha256:sha},parts:[]}));
 assert.equal(await pending,false,'Invalid interrupted restore must fail');
 assert.equal(alerts.length>0,true);
 console.log('Backup center async checks passed: legacy scope isolation, valid digest, oversized metadata/part rejection, auth-switch abort, and restore exclusivity.');
})().catch(error=>{console.error(error);process.exitCode=1});
