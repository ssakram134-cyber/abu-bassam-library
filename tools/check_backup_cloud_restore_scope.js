'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const source=fs.readFileSync('web/backup-center-runtime.js','utf8');
const start=source.indexOf('async function restoreCloud(id){');
const end=source.indexOf('\nasync function deleteCloud(id){',start);
assert.ok(start>=0&&end>start,'Canonical cloud restore must exist');
const fn=source.slice(start,end);
assert.ok(fn.includes('const initialScope=stateScope()'),'Cloud restore needs an account and branch fence');
assert.ok(fn.includes('archiveCommitted=restored===true'),'Post-commit failures must not be misreported as a rollback');
function setup(options={}){
 const actions=[],messages=[];
 let scope='userA:branchA',granted=true;
 const data={backup:{branch_device_id:'branchA'},bytes:new Uint8Array([80,75])};
 const context={
  stateScope:()=>scope,
  can:()=>granted,
  confirm:()=>true,
  alert:x=>messages.push(String(x)),
  downloadBytes:async()=>{actions.push('download');options.onDownload?.(controls);return data},
  dev:()=>({device_id:scope.split(':')[1]}),
  window:{
   AbuBassamDevices:{ensure:()=>({id:scope.split(':')[1]})},
   AbuDocumentVaultHardening:{restore:async()=>{
    actions.push('restore');
    options.onRestore?.(controls);
    return options.restoreResult===undefined?true:options.restoreResult
   }}
  },
  File:class{constructor(chunks,name,props){this.name=name;this.size=chunks.reduce((n,x)=>n+x.length,0);this.type=props.type}},
  status:status=>actions.push('status:'+status),
  backupNow:async()=>{actions.push('safety-backup');options.onSafetyBackup?.(controls);if(options.failSafetyBackup)throw Error('safety backup failed');return {ok:true}},
  api:async(action)=>{actions.push('api:'+action);options.onCleanup?.(controls);return {ok:true}},
  retention:()=>7,
  log:()=>actions.push('log'),
  refreshList:async()=>{actions.push('refresh');options.onRefresh?.(controls)},
  paint:()=>actions.push('paint')
 };
 const controls={setScope:x=>{scope=x},revoke:()=>{granted=false}};
 const names=Object.keys(context);
 const {restoreCloud}=new Function(...names,'let busy=false;'+fn+';return {restoreCloud};')(...names.map(n=>context[n]));
 return{run:()=>restoreCloud('snapshot1'),actions,messages,controls};
}
(async()=>{
 const normal=setup();
 assert.equal(await normal.run(),true);
 assert.deepEqual(normal.actions.filter(x=>['download','safety-backup','restore','api:cleanup','log','refresh'].includes(x)),
  ['download','safety-backup','restore','api:cleanup','log','refresh']);

 const switchDuringDownload=setup({onDownload:({setScope})=>setScope('userB:branchA')});
 assert.equal(await switchDuringDownload.run(),false);
 assert.ok(!switchDuringDownload.actions.includes('safety-backup'));
 assert.ok(!switchDuringDownload.actions.includes('restore'));

 const newBranch=setup({onDownload:({setScope})=>setScope('userA:branchB')});
 assert.equal(await newBranch.run(),false);
 assert.ok(!newBranch.actions.includes('restore'));

 const switchDuringBackup=setup({onSafetyBackup:({setScope})=>setScope('userB:branchA')});
 assert.equal(await switchDuringBackup.run(),false);
 assert.ok(!switchDuringBackup.actions.includes('restore'),'Downloaded ZIP must not enter another account');

 const permissionRevoked=setup({onSafetyBackup:({revoke})=>revoke()});
 assert.equal(await permissionRevoked.run(),false);
 assert.ok(!permissionRevoked.actions.includes('restore'));

 const backupFail=setup({failSafetyBackup:true});
 assert.equal(await backupFail.run(),false);
 assert.ok(!backupFail.actions.includes('restore'),'Failed pre-restore backup cannot be bypassed');

 const changedAfterCommit=setup({onRestore:({setScope})=>setScope('userB:branchA')});
 assert.equal(await changedAfterCommit.run(),false);
 assert.ok(!changedAfterCommit.actions.includes('api:cleanup'));
 assert.ok(changedAfterCommit.messages.some(x=>x.includes('تمت استعادة الملفات')),
  'A post-commit account change must be reported as partial completion');

 const refused=setup({restoreResult:false});
 assert.equal(await refused.run(),false);
 assert.ok(!refused.actions.includes('api:cleanup'));

 const changeDuringCleanup=setup({onCleanup:({setScope})=>setScope('userB:branchA')});
 assert.equal(await changeDuringCleanup.run(),false);
 assert.ok(!changeDuringCleanup.actions.includes('log'));
 assert.ok(changeDuringCleanup.messages.some(x=>x.includes('تمت استعادة الملفات')));

 console.log('Cloud restore account fence passed: 9 scenarios, cross-account download and safety-backup switches rejected before archive commit.');
})().catch(e=>{console.error(e);process.exitCode=1});
