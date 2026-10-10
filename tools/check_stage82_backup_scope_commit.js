'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const src=read('web/backup-center-runtime.js');
new vm.Script(src);
function cut(from,to){const i=src.indexOf(from),j=src.indexOf(to,i+from.length);assert.ok(i>=0&&j>i,'Missing '+from);return src.slice(i,j)}
const backupSource=cut("async function backupNow(kind='manual',force=false){",'\nasync function downloadBytes(');
const partSource=cut('async function uploadPart(', '\nfunction retention()');
const retrySource=cut('async function retry(', '\nasync function uploadPart(');
const retry=new Function(retrySource+';return retry')();
const uploadPart=new Function('cloud','BUCKET','retry',partSource+';return uploadPart');
function runner(options={}){
 let scope='user:device',busy=false,plans=0,commits=0,uploads=0,refreshes=0,fpChecks=0;
 const state=new Map(),events=[];
 const opts={
  can:()=>true,stateScope:()=>scope, retry,
  status:s=>events.push('status:'+s),
  fingerprint:async()=>{fpChecks++;return options.changedFingerprint&&fpChecks===2?'new-content':'same-content'},
  stateGet:key=>state.get(key)??null,stateSet:(k,v)=>{if(options.failStateWrite)throw Error('LOCAL_STORAGE_FULL');state.set(k,v)},
  stateRemove:key=>{state.delete(key)},
  packageBytes:async()=>({bytes:new Uint8Array([1,2,3]),count:1,trashCount:0}),
  digest:async()=> 'a'.repeat(64),CHUNK:2,
  api:async(action,method,body)=>{
   if(action==='plan'){plans++;if(options.switchAfterPlan)scope='other:device';return{backup_id:'fixed-id',uploads:[{path:'part1',token:'one'},{path:'part2',token:'two'}]}}
   if(action==='commit'){commits++;if(options.failFirstCommit&&commits===1)throw Error('NETWORK_ACK_LOST');if(options.switchAfterCommit)scope='other:device';return{ok:true,already_ready:commits>1}}
   throw Error('UNEXPECTED_API')
  },
  uploadPart:async(path,token,blob,verify)=>{verify();uploads++;if(options.switchAfterFirstPart&&uploads===1)scope='other:device';verify();return true},
  retention:()=>7,log:()=>{},fmt:String,
  refreshList:async()=>{refreshes++;if(options.refreshFails)throw Error('NETWORK_OFFLINE')},
  paint:()=>{},
  Date,Blob,LASTERR:'err',RETRY:'retry',LASTFP:'fp',LAST:'last'
 };
 const backup=new Function(...Object.keys(opts),'let busy=false;\n'+backupSource+';return backupNow')(...Object.values(opts));
 return{backup,events,state,get plans(){return plans},get commits(){return commits},get uploads(){return uploads},get refreshes(){return refreshes},get scope(){return scope}}
}
(async()=>{
 let x=runner({switchAfterPlan:true});
 await assert.rejects(x.backup('manual',true),/BACKUP_SCOPE_CHANGED/);
 assert.equal(x.uploads,0,'No upload after a device switch');
 assert.equal(x.state.has('err'),false,'Do not write failure state into switched account');
 x=runner({switchAfterFirstPart:true});
 await assert.rejects(x.backup('manual',true),/BACKUP_SCOPE_CHANGED/);
 assert.equal(x.uploads,1);
 assert.equal(x.commits,0,'Never commit backup on switched account');
 x=runner({changedFingerprint:true});
 await assert.rejects(x.backup('manual',true),/BACKUP_CHANGED_DURING_CAPTURE/);
 assert.equal(x.plans,0,'Inconsistent archive must not request a plan');
 x=runner({failFirstCommit:true});
 let result=await x.backup('manual',true);
 assert.equal(result.ok,true,'Lost commit acknowledgment should be retried with original ID');
 assert.equal(x.plans,1,'Never make a second upload plan for a lost commit response');
 assert.equal(x.commits,2);
 assert.equal(x.state.get('fp'),'same-content');
 x=runner({switchAfterCommit:true});
 result=await x.backup('manual',true);
 assert.equal(result.ok,true,'Server-confirmed backup must not be reported failed after switching account');
 assert.equal(result.postCommitWarning,true);
 assert.equal(x.commits,1,'No retry needed for a successful commit reply when account changes');
 assert.equal(x.state.has('last'),false,'Do not persist backup success under another account');
 x=runner({refreshFails:true});
 result=await x.backup('manual',true);
 assert.equal(result.ok,true,'Offline UI refresh cannot negate committed backup');
 assert.equal(x.state.get('last')!==undefined,true);
 x=runner({failStateWrite:true});
 result=await x.backup('manual',true);
 assert.equal(result.ok,true,'LocalStorage quota must not misreport server success');
 // The actual signed upload retry must never attempt a second network write under a switched scope.
 let uploadCount=0,switched=false;
 const fn=uploadPart(()=>({client:{storage:{from:()=>({uploadToSignedUrl:async()=>{uploadCount++;switched=true;throw Error('NETWORK_FAILED')}})}}}), 'private',retry);
 await assert.rejects(fn('p','token',{},()=>{if(switched)throw Error('BACKUP_SCOPE_CHANGED')}),/BACKUP_SCOPE_CHANGED/);
 assert.equal(uploadCount,1,'No retry of uploaded chunk after device switch');
 console.log('Stage82 backup scope/commit tests passed: identity switch, incomplete capture, idempotent commit, offline refresh, quota and per-chunk retry checks.');
})().catch(e=>{console.error(e);process.exitCode=1});
