'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const content=fs.readFileSync('web/backup-center-runtime.js','utf8');
const start=content.indexOf("async function backupNow(");
const end=content.indexOf("\nasync function downloadBytes(",start);
assert.ok(start>=0&&end>start,'Canonical backup upload must exist');
const runtime=content.slice(start,end);
assert.ok(runtime.includes('const confirmedFp=await fingerprint()') &&
 runtime.includes('if(confirmedFp!==fp)'),'Archive must not mutate during ZIP packaging');
assert.ok(runtime.includes('if(stateScope()===initialScope)'),'Error/retry state must not leak into a new account');
function caseOf(options={}){
 const actions=[],states=new Map();
 let scope='userA:deviceA',perm=true,fpCalls=0;
 const controls={switchAccount:()=>{scope='userB:deviceA'},switchBranch:()=>{scope='userA:deviceB'},deny:()=>{perm=false}};
 const fingerprint=async()=>{
  fpCalls++;
  actions.push('fingerprint:'+fpCalls);
  options.onFingerprint?.(controls,fpCalls);
  return fpCalls===2&&options.changedFingerprint?'b'.repeat(64):'a'.repeat(64)
 };
 const pkg={bytes:Uint8Array.of(1,2,3,4),count:1};
 const stateGet=key=>states.get(scope+':'+key)||null;
 const stateSet=(key,value)=>{actions.push('set:'+scope+':'+key);states.set(scope+':'+key,String(value))};
 const stateRemove=key=>{actions.push('remove:'+scope+':'+key);states.delete(scope+':'+key)};
 const context={
  stateScope:()=>scope,can:()=>perm,
  fingerprint,
  packageBytes:async()=>{
   actions.push('package');options.onPackage?.(controls);return pkg
  },
  digest:async()=>{actions.push('digest');return 'c'.repeat(64)},
  api:async action=>{
   actions.push('api:'+action);options.onApi?.(controls,action);
   if(action==='plan')return {backup_id:'b1',uploads:[{path:'a',token:'t1'},{path:'b',token:'t2'}]};
   return{ok:true}
  },
  uploadPart:async path=>{
   actions.push('upload:'+path);options.onUpload?.(controls,path)
  },
  status:message=>actions.push('status:'+message),
  stateGet,stateSet,stateRemove,
  LAST:'LAST',LASTFP:'LASTFP',LASTERR:'LASTERR',RETRY:'RETRY',
  CHUNK:2,APP:'4.3.2',retention:()=>7,fmt:x=>String(x),
  log:()=>actions.push('log'),paint:()=>actions.push('paint'),
  refreshList:async()=>{actions.push('refresh')},
  Blob:class{constructor(parts){this.size=parts.reduce((n,p)=>n+p.length,0)}}
 };
 const names=Object.keys(context);
 const backupNow=new Function(...names,'let busy=false;'+runtime+';return backupNow;')(...names.map(k=>context[k]));
 return {run:(kind='manual',force=true)=>backupNow(kind,force),actions,states,controls};
}
(async()=>{
 const valid=caseOf();
 assert.deepEqual(await valid.run(),{ok:true,backup_id:'b1'});
 assert.deepEqual(valid.actions.filter(x=>x.startsWith('api:')||x.startsWith('upload:')),
   ['api:plan','upload:a','upload:b','api:commit']);
 assert.equal(valid.states.get('userA:deviceA:LASTFP'),'a'.repeat(64));

 const changedDuringFingerprint=caseOf({onFingerprint:(c,n)=>{if(n===1)c.switchAccount()}});
 await assert.rejects(changedDuringFingerprint.run(),/تغيّر الحساب/);
 assert.ok(!changedDuringFingerprint.actions.includes('package'));
 assert.ok(![...changedDuringFingerprint.states.keys()].some(k=>k.startsWith('userB:')));

 const changedDuringZip=caseOf({onPackage:c=>c.switchBranch()});
 await assert.rejects(changedDuringZip.run(),/تغيّر الحساب/);
 assert.ok(!changedDuringZip.actions.includes('api:plan'));

 const changedContents=caseOf({changedFingerprint:true});
 await assert.rejects(changedContents.run(),/تغيّرت ملفات الأرشيف/);
 assert.ok(!changedContents.actions.includes('api:plan'));
 assert.ok(changedContents.states.has('userA:deviceA:LASTERR'),'Same-scope failure retains its retry state');

 const changedAtPlan=caseOf({onApi:(c,action)=>{if(action==='plan')c.switchAccount()}});
 await assert.rejects(changedAtPlan.run(),/تغيّر الحساب/);
 assert.ok(!changedAtPlan.actions.includes('upload:a'),'Changed user must not upload planned parts');

 const changedAfterPart=caseOf({onUpload:(c,path)=>{if(path==='a')c.switchAccount()}});
 await assert.rejects(changedAfterPart.run(),/تغيّر الحساب/);
 assert.ok(!changedAfterPart.actions.includes('upload:b'));
 assert.ok(!changedAfterPart.actions.includes('api:commit'));

 const revoked=caseOf({onPackage:c=>c.deny()});
 await assert.rejects(revoked.run(),/تغيّر الحساب/);
 assert.ok(!revoked.actions.includes('api:plan'));

 const changedAtCommit=caseOf({onApi:(c,action)=>{if(action==='commit')c.switchAccount()}});
 await assert.rejects(changedAtCommit.run(),/تغيّر الحساب/);
 assert.ok(![...changedAtCommit.states.keys()].some(k=>k.startsWith('userB:')),
   'Committed prior-account backup must not write status under new user');

 const automaticUnchanged=caseOf();
 automaticUnchanged.states.set('userA:deviceA:LASTFP','a'.repeat(64));
 assert.deepEqual(await automaticUnchanged.run('automatic',false),{skipped:true});
 assert.ok(!automaticUnchanged.actions.includes('package'));
 assert.ok(automaticUnchanged.states.has('userA:deviceA:LAST'));

 console.log('Cloud backup upload fence passed: 9 scenarios protecting account changes, multipart uploads, unchanged fingerprints, and retry scope.');
})().catch(e=>{console.error(e);process.exitCode=1});
