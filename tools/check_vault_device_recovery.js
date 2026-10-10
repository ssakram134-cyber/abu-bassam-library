'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const hard=read('web/document-vault-hardening-runtime.js'),cloud=read('web/backup-center-runtime.js');
new vm.Script(hard);new vm.Script(cloud);
function section(text,a,b){const i=text.indexOf(a),j=text.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,'Missing '+a);return text.slice(i,j)}
const validation=section(hard,'function authorizeOwnerDeviceRecovery(','function trashScope(){');
const restore=section(cloud,'async function restoreCloud(id,','\nasync function deleteCloud(');
function context({uid='u1',id='replacement',role='owner',allowed=true,scope=true}={}){
 const state={uid,id,role,allowed,scope};
 const w={AbuBassamCloud:{session:()=>({user:{id:state.uid}})}};
 const verify=new Function('window','device','role','scopeOk','allowed',validation+'return authorizeOwnerDeviceRecovery;')(
 w,()=>({id:state.id}),()=>state.role,()=>state.scope,()=>state.allowed);
 return {verify,state}
}
const x=context(),source={branchDeviceId:'lost-phone'};
const options={ownerDeviceRecovery:true,recoveryApproved:true,recoveryUserId:'u1',recoverySourceDeviceId:'lost-phone'};
assert.equal(x.verify({branchDeviceId:'replacement'}),null);
assert.deepEqual(x.verify(source,options),{uid:'u1',source:'lost-phone',sourceScope:'u1:lost-phone',scope:'u1:replacement',destination:'replacement'});
assert.throws(()=>x.verify(source),/VAULT_RECOVERY_OWNER_REQUIRED/);
assert.throws(()=>x.verify({branchDeviceId:'replacement'},options),/VAULT_RECOVERY_SOURCE_NOT_DIFFERENT/);
for(const o of [{...options,recoveryApproved:false},{...options,recoveryUserId:'u2'},{...options,recoverySourceDeviceId:'other'}])
 assert.throws(()=>x.verify(source,o),/VAULT_RECOVERY_IDENTITY_MISMATCH/);
for(const bad of [{role:'branch'},{allowed:false},{scope:false}]){
 assert.throws(()=>context(bad).verify(source,options),/VAULT_RECOVERY_OWNER_REQUIRED/)
}
x.state.uid='other';
assert.throws(()=>x.verify(source,options),/VAULT_RECOVERY_IDENTITY_MISMATCH/);
for(const pattern of [
 /if\(recovery&&\(existing\.length>0\|\|\(await backupTrash\(\)\)\.length>0\)\)/,
 /oldItems\.length>0\|\|oldTrash\.some\(row=>row\.scope===scope\)/,
 /VAULT_RECOVERY_ACCESS_CHANGED/,
 /VAULT_TRASH_SCOPE_MISMATCH/,
 /recovery\.sourceScope/,
 /recoveryUserId:recovery\.uid,recoverySourceDeviceId:recovery\.source/,
 /scope:restoreScope,blob,deleted:false/,
 /if\(hasTrash\)await applyAtomicWithTrash/,
 /else await applyAtomic\(prepared/,
 /trxNEVER_MATCH/
].slice(0,-1))assert.match(hard,pattern);
assert.match(hard,/const settingsEntry=zip\.file\('app-settings\.json'\);if\(settingsEntry&&!recovery\)/,'Replacement recovery must not overwrite phone settings');
assert.match(cloud,/data-owner-recovery/);
assert.match(cloud,/prompt\('نسخة الفرع:/);
assert.match(cloud,/transferring!==ownerDeviceRecovery/);
assert.match(cloud,/PRE_RESTORE_BACKUP_NOT_COMMITTED/);
assert.match(cloud,/BACKUP_IDENTITY_CHANGED/);
assert.match(cloud,/recoveryApproved:confirmed/);
assert.match(cloud,/recoverySourceDeviceId:transferring\?source:''/);
function runner({backupBranch='lost-phone',role='owner',answer='استعادة',safety=true,changeUser=false}={}){
 const state={uid:'u1'},events=[],restoreArgs=[];
 const win={AbuBassamCloud:{session:()=>({user:{id:state.uid}})},AbuBassamDevices:{ensure:()=>({id:'replacement'})},AbuDocumentVaultHardening:{restore:async(file,options)=>{restoreArgs.push(options);return true}}};
 const env={
 can:()=>true,role:()=>role,confirm:()=>true,prompt:()=>answer,stateScope:()=>state.uid+':replacement',
 downloadBytes:async()=>{events.push('download');if(changeUser)state.uid='u2';return {bytes:new Uint8Array([1]),backup:{branch_device_id:backupBranch,branch_name:'lost'}}},
 dev:()=>({device_id:'replacement'}),window:win,File:class{constructor(bytes,name){this.name=name}},
 backupNow:async()=>{events.push('safety');if(!safety)throw Error('SAFETY_BACKUP_FAILED');return{ok:true}},
 status:()=>{},api:async()=>({ok:true}),log:(...a)=>events.push(a),stateRemove:()=>{},
 LAST:'last',LASTFP:'fp',retention:()=>7,refreshList:async()=>{},paint:()=>{},alert:s=>events.push('alert '+s)
 };
 const fn=new Function(...Object.keys(env),'let busy=false;\n'+restore+'return restoreCloud;')(...Object.values(env));
 return{fn,events,restoreArgs}
}
(async()=>{
 let r=runner();assert.equal(await r.fn('id'),false);assert.equal(r.restoreArgs.length,0);
 r=runner({role:'branch'});assert.equal(await r.fn('id',{ownerDeviceRecovery:true}),false);assert.equal(r.restoreArgs.length,0);
 r=runner({answer:'لا'});assert.equal(await r.fn('id',{ownerDeviceRecovery:true}),false);assert.equal(r.restoreArgs.length,0);
 r=runner({safety:false});assert.equal(await r.fn('id',{ownerDeviceRecovery:true}),false);assert.equal(r.restoreArgs.length,0);
 r=runner({changeUser:true});assert.equal(await r.fn('id',{ownerDeviceRecovery:true}),false);assert.equal(r.restoreArgs.length,0);
 r=runner({backupBranch:'replacement'});assert.equal(await r.fn('id'),true);assert.equal(r.restoreArgs[0].ownerDeviceRecovery,false);
 r=runner();assert.equal(await r.fn('id',{ownerDeviceRecovery:true}),true);
 assert.deepEqual(r.restoreArgs[0],{mode:'snapshot',silentConfirm:true,ownerDeviceRecovery:true,recoveryApproved:true,recoverySourceDeviceId:'lost-phone',recoveryUserId:'u1'});
 assert.ok(r.events.includes('safety'));
 console.log('Owner replacement recovery passed: old branch denied by default, role/account/source proof, typed approval, committed safety snapshot, no restore on session change, existing same-device restore intact.');
})().catch(e=>{console.error(e);process.exitCode=1});
