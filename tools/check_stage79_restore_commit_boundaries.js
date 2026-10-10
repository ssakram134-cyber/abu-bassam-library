'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const hard=read('web/document-vault-hardening-runtime.js'),cloud=read('web/backup-center-runtime.js');
new vm.Script(hard);new vm.Script(cloud);
function segment(src,a,b){const i=src.indexOf(a),j=src.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,'Missing '+a);return src.slice(i,j)}
const settingsCode=segment(hard,'const MODERN_PRINT_BACKUP_KEYS=','\nfunction bytesToB64(');
const finalizeCode=segment(hard,'function validatedBackupSettings(','\nasync function safeRestore(');
const dbCode=segment(hard,'async function safeRestore(', '\nwindow.AbuDocumentVaultHardening=');
assert.ok(dbCode.indexOf("const settingsEntry=zip.file('app-settings.json')")<dbCode.indexOf('await applyAtomicWithTrash(prepared,preparedTrash,{'),
 'Validate settings before committing an archive with trash');
assert.ok(dbCode.indexOf("const settingsEntry=zip.file('app-settings.json')")<dbCode.indexOf('else await applyAtomic(prepared,{'),
 'Validate settings before committing legacy backup without trash');
assert.match(dbCode,/committed=true; \/\/ IndexedDB transaction completed/);
assert.match(dbCode,/if\(committed\)\{/);
assert.match(dbCode,/return await finishRestoredArchive/);
const memory=new Map([['abuBassamCardsPrintPreferencesV1','card-old'],['abuBassamDpiEnabledV1','1'],['abuBassamPrintSettingsV1','photo-old']]);
let failKey='',writes=[];
const storage={
 getItem:k=>memory.has(k)?memory.get(k):null,
 setItem:(k,v)=>{writes.push(k);if(k===failKey)throw Error('QUOTA_BLOCKED');memory.set(k,String(v))},
 removeItem:k=>{writes.push(k);if(k===failKey)throw Error('STORAGE_BLOCKED');memory.delete(k)},
 key:i=>[...memory.keys()][i]??null,get length(){return memory.size}
};
const funcs=new Function('localStorage',settingsCode+';'+finalizeCode+';return {restoreSettings,validatedBackupSettings,finishRestoredArchive};')(storage);
assert.throws(()=>funcs.validatedBackupSettings({format:'AbuBassamSettings',settings:[]}),/VAULT_SETTINGS_INVALID/);
assert.throws(()=>funcs.validatedBackupSettings({format:'AbuBassamSettings',settings:{abuBassamDpiEnabledV1:33}}),/VAULT_SETTINGS_INVALID_VALUE/);
assert.throws(()=>funcs.validatedBackupSettings({format:'AbuBassamSettings',settings:{abuBassamCardsPrintPreferencesV1:'x'.repeat(500000)}}),/VAULT_SETTINGS_INVALID_VALUE/);
assert.equal(funcs.validatedBackupSettings({format:'Unknown',settings:{}}),null);
const valid=funcs.validatedBackupSettings({format:'AbuBassamSettings',settings:{
 abuBassamCardsPrintPreferencesV1:'card-new',abuBassamDpiEnabledV1:'0',abuBassamPrintSettingsV1:'photo-new'
}});
failKey='abuBassamDpiEnabledV1';
assert.throws(()=>funcs.restoreSettings(valid,'snapshot'),/VAULT_SETTINGS_SAVE_FAILED/);
assert.equal(memory.get('abuBassamCardsPrintPreferencesV1'),'card-old','Rollback earlier changed preference after quota failure');
assert.equal(memory.get('abuBassamDpiEnabledV1'),'1');
assert.equal(memory.get('abuBassamPrintSettingsV1'),'photo-old');
failKey='';
funcs.restoreSettings(valid,'snapshot');
assert.equal(memory.get('abuBassamCardsPrintPreferencesV1'),'card-new');
assert.equal(memory.get('abuBassamDpiEnabledV1'),'0');
assert.equal(memory.get('abuBassamPrintSettingsV1'),'photo-new');
const finalize=(env,settings)=>new Function('window','alert','restoreSettings',
 finalizeCode+';return finishRestoredArchive')(
 env.window,env.alert,settings);
const run=async()=>{
 let alerts=[],viewCalls=0;
 const f=finalize({window:{AbuBassamOps:{add:()=>{}},DocumentVault:{onShow:async()=>{viewCalls++;throw Error('VIEW_CRASH')}}},alert:m=>alerts.push(m)},()=>{throw Error('QUOTA')});
 assert.equal(await f(2,null,'snapshot',{},valid),true,'Archive commit must stay successful when post-commit settings/UI fail');
 assert.ok(alerts.some(m=>m.includes('تم حفظ 2 عنصر')&&m.includes('تعذر تحديث')));
 assert.equal(viewCalls,1);
 let outputs=[];
 const a=finalize({window:{DocumentVault:{onShow:async()=>{}}},alert:m=>outputs.push(m)},()=>{});
 assert.equal(await a(3,null,'merge',{silentSuccess:true},null),true);
 assert.equal(outputs.length,0);
 const recovery=finalize({window:{DocumentVault:{onShow:async()=>{}}},alert:()=>{}},()=>{throw Error('Old device settings applied')});
 assert.equal(await recovery(1,{uid:'one'},'snapshot',{silentSuccess:true},null),true,'Owner replacement must not receive settings');
 const restoreCloudSrc=segment(cloud,'async function restoreCloud(', '\nasync function deleteCloud(');
 assert.match(restoreCloudSrc,/try\{await refreshList\(\)\}catch\(_\)\{/);
 assert.match(restoreCloudSrc,/if\(identity!==stateScope\(\)\)\{\s*status\('حُفظ الأرشيف/);

 // Execute the actual cloud restore code with injected, deterministic network interruptions.
 const cloudRestore=new Function(...Object.keys({
   dummy:true
 }), 'return null'); // Ensure a callable harness in Node and in the V8 source checks.
 const restoreCloudCode=segment(cloud,'async function restoreCloud(', '\nasync function deleteCloud(');
 function cloudScenario({offlineBeforeDownload=false,offlineAfterRestore=false,failedSafetySnapshot=false,sessionChangesAfterRestore=false}={}){
  let user='u1',restored=0;
  const statuses=[],alerts=[],events=[];
  const window={
   AbuBassamCloud:{session:()=>({user:{id:user}})},
   AbuBassamDevices:{ensure:()=>({id:'device1'})},
   AbuDocumentVaultHardening:{restore:async()=>{restored++;events.push('committed');if(sessionChangesAfterRestore)user='u2';return true}}
  };
  const vars={
   can:()=>true,role:()=> 'owner',confirm:()=>true,prompt:()=> 'استعادة',
   stateScope:()=>user+':device1',
   downloadBytes:async()=>{events.push('download');if(offlineBeforeDownload)throw Error('NETWORK_OFFLINE');return{bytes:new Uint8Array([1]),backup:{branch_device_id:'device1',branch_name:'test'}}},
   dev:()=>({device_id:'device1'}),window,
   File:class{constructor(bytes,name){this.bytes=bytes;this.name=name}},
   backupNow:async()=>{events.push('safety');if(failedSafetySnapshot)throw Error('OFFLINE_SAFETY_NOT_COMMITTED');return{ok:true}},
   status:m=>statuses.push(String(m)),
   api:async()=>({ok:true}),log:()=>{},
   stateRemove:()=>{},LAST:'last',LASTFP:'fp',retention:()=>7,
   refreshList:async()=>{events.push('refresh');if(offlineAfterRestore)throw Error('NETWORK_OFFLINE')},
   paint:()=>{},alert:m=>alerts.push(String(m))
  };
  const fn=new Function(...Object.keys(vars),'let busy=false;\n'+restoreCloudCode+'\nreturn restoreCloud;')(...Object.values(vars));
  return{fn,statuses,alerts,events,get restored(){return restored}}
 }
 const offlineBefore=cloudScenario({offlineBeforeDownload:true});
 assert.equal(await offlineBefore.fn('test-backup'),false,'No archive mutation when download fails offline');
 assert.equal(offlineBefore.restored,0);
 assert.ok(offlineBefore.alerts.some(x=>x.includes('NETWORK_OFFLINE')));
 const safety=cloudScenario({failedSafetySnapshot:true});
 assert.equal(await safety.fn('test-backup'),false,'No archive mutation without committed safety backup');
 assert.equal(safety.restored,0);
 const offlineAfter=cloudScenario({offlineAfterRestore:true});
 assert.equal(await offlineAfter.fn('test-backup'),true,'Refresh network failure after commit must not report archive restore failure');
 assert.equal(offlineAfter.restored,1);
 assert.ok(offlineAfter.statuses.some(s=>s.includes('اكتملت الاستعادة محليًا')));
 const changed=cloudScenario({sessionChangesAfterRestore:true});
 assert.equal(await changed.fn('test-backup'),true,'Committed restore must report saved state even if login changes after commit');
 assert.equal(changed.restored,1);
 assert.ok(changed.statuses.some(s=>s.includes('الحساب السابق')));
 assert.ok(!changed.events.includes('refresh'),'Do not request another user cloud list after session change');
 console.log('Stage79 restore boundaries passed: parse before commit, localStorage rollback on throw, committed archive status after settings/UI failure, and download-before/refresh-after network interruption behavior.');
};
run().catch(e=>{console.error(e);process.exitCode=1});
