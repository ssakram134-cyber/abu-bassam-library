'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const source=fs.readFileSync('web/document-vault-hardening-runtime.js','utf8');
function between(start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Expected backup runtime component missing: '+start);
 return source.slice(a,b);
}
const helper=between('async function readValidatedBackupSettings(zip){','async function safeRestore(file,options={}){');
const restore=between('async function safeRestore(file,options={}){','\nwindow.AbuDocumentVaultHardening=');
const parser=between('function packedLength(entry){','function validateZipCatalog(zip){');
assert.ok(restore.indexOf('await readValidatedBackupSettings(zip)')<restore.indexOf('await applyAtomic(prepared,'),
 'Settings metadata must be validated before committing archive files');
assert.ok(restore.includes("catch(settingsError){"),'Settings failures after file commit must be reported separately');

function scenario({settings='{"format":"AbuBassamSettings","settings":{"theme":"dark"}}',
  packedSize,settingsFailure=false,onSettingsRead=null,missingSettings=false}={}){
 let scope='owner:branch1',committed=false,settingsApplied=0;
 const alerts=[],calls=[];
 const manifest=JSON.stringify({format:'AbuBassamVault',version:6,branchDeviceId:'branch1',items:[]});
 const entry=(raw,size)=>({
  _data:{uncompressedSize:size??raw.length},
  async:async()=>raw
 });
 const zip={file:name=>{
  if(name==='manifest.json')return entry(manifest);
  if(name==='app-settings.json'&&!missingSettings)return {
   _data:{uncompressedSize:packedSize??settings.length},
   async:async()=>{calls.push('settings-read');onSettingsRead?.(()=>{scope='other-account'});return settings}
  };
  return null
 }};
 const existing=[{id:'existing',deleted:false,name:'original',_localWriteRev:'keep'}];
 const locals={
  file:{size:64,name:'vault.zip',arrayBuffer:async()=>new Uint8Array([80,75,3,4]).buffer},
  allowed:()=>true,restoreIdentity:()=>scope,
  MAX_ZIP:125829120,MAX_TOTAL:524288000,MAX_MANIFEST_BYTES:4194304,
  MAX_SETTINGS_BYTES:4194304,MAX_BACKUP_RECORDS:2000,MAX_ITEMS:1000,MAX_FILE:104857600,
  restoreLockedUntil:0,isEncrypted:()=>false,
  window:{JSZip:true,AbuBassamOps:{add:()=>{}},DocumentVault:{onShow:async()=>{}}},
  JSZip:{loadAsync:async()=>zip},
  validateZipCatalog:()=>{},
  device:()=>({id:'branch1'}),role:()=> 'owner',confirm:()=>true,
  all:async()=>existing,
  backupBytes:async()=>new Uint8Array(),saveBlob:async()=>{},
  blobHash:async()=>'',nice:x=>x,
  applyAtomic:async()=>{calls.push('commit');committed=true;existing.length=0},
  restoreSettings:()=>{settingsApplied++;calls.push('apply-settings');if(settingsFailure)throw Error('quota denied')},
  alert:m=>alerts.push(String(m)),
  '$':()=>null,
  packedLength:new Function(parser+'return packedLength;')()
 };
 const names=Object.keys(locals);
 const safeRestore=new Function(...names,helper+restore+'\nreturn safeRestore;')(...names.map(x=>locals[x]));
 return {
  async run(){const result=await safeRestore(locals.file,{silentConfirm:true,silentSuccess:true,skipSafetyBackup:true,silentError:false});return {result,committed,settingsApplied,alerts,calls,remaining:existing.length}}
 };
}
(async()=>{
 const malformed=await scenario({settings:'{"format":'}).run();
 assert.equal(malformed.result,false,'Corrupt settings must fail restore');
 assert.equal(malformed.committed,false,'Corrupt settings must never overwrite existing archive');

 const oversized=await scenario({packedSize:4194305}).run();
 assert.equal(oversized.result,false);
 assert.equal(oversized.committed,false,'Excessive settings size must block commit');

 const badShape=await scenario({settings:'{"format":"AbuBassamSettings","settings":[]}' }).run();
 assert.equal(badShape.result,false);
 assert.equal(badShape.committed,false,'Invalid settings object cannot trigger file commit');

 const good=await scenario().run();
 assert.equal(good.result,true);
 assert.equal(good.committed,true);
 assert.equal(good.settingsApplied,1);
 assert.deepEqual(good.calls,['settings-read','commit','apply-settings'],'Settings must be parsed before commit');

 const noSettings=await scenario({missingSettings:true}).run();
 assert.equal(noSettings.result,true);
 assert.equal(noSettings.committed,true);
 assert.equal(noSettings.settingsApplied,0);

 const storageFull=await scenario({settingsFailure:true}).run();
 assert.equal(storageFull.result,true,'Committed archive files cannot be reported as rolled back');
 assert.equal(storageFull.committed,true);
 assert.ok(storageFull.alerts.some(x=>x.includes('تمت استعادة الملفات')),'Partial settings error must be explained');

 const switched=await scenario({onSettingsRead:change=>change()}).run();
 assert.equal(switched.result,false);
 assert.equal(switched.committed,false,'Switching account during async settings read must block archive commit');


 const restoreImpl=between('function restoreSettings(snap,mode){','function safeSettingKey(');
 const safeKeyImpl=between('function safeSettingKey(k){','function settings(){');
 function exerciseSettings(initial,snapshot,{mode='snapshot',blockedKey=null}={}){
  const entries=new Map(Object.entries(initial));
  const storage={
   get length(){return entries.size},
   key:index=>[...entries.keys()][index],
   getItem:key=>entries.has(key)?entries.get(key):null,
   setItem:(key,value)=>{if(key===blockedKey)throw Error('QuotaExceededError');entries.set(key,String(value))},
   removeItem:key=>entries.delete(key)
  };
  const apply=new Function('localStorage',safeKeyImpl+restoreImpl+';return restoreSettings')(storage);
  let error=null;
  try{apply({settings:snapshot},mode)}catch(e){error=e}
  return{entries:Object.fromEntries(entries),error}
 }
 const quota=exerciseSettings({theme:'old',abuBassamPrintSettings:'prior'},{
  theme:'new',abuBassamPrintSettings:'new printer'
 },{blockedKey:'abuBassamPrintSettings'});
 assert.match(String(quota.error),/QuotaExceededError/,'Quota failures must remain visible');
 assert.deepEqual(quota.entries,{theme:'old',abuBassamPrintSettings:'prior'},
  'A settings write failure must restore all previously changed keys');
 const replaced=exerciseSettings({theme:'old',abuBassamTypography:'unused'},{
  theme:'new'
 });
 assert.equal(replaced.error,null,'Normal settings snapshot should succeed');
 assert.deepEqual(replaced.entries,{theme:'new'},'Snapshot must remove obsolete safe keys');
 const merged=exerciseSettings({theme:'old',abuBassamTypography:'retain'},{
  theme:'new'
 },{mode:'merge'});
 assert.deepEqual(merged.entries,{theme:'new',abuBassamTypography:'retain'},
  'Merge must keep unrelated existing settings');
 const oversize=exerciseSettings({theme:'old'},{theme:'a'.repeat(500001)});
 assert.match(String(oversize.error),/يتجاوز الحد/,'Oversized setting must be rejected before commit');
 assert.equal(oversize.entries.theme,'old','Oversized values must not partially write settings');
 console.log('Archive restore settings preflight passed: 7 restore scenarios and 4 direct localStorage rollback tests.');

})().catch(e=>{console.error(e);process.exitCode=1});
