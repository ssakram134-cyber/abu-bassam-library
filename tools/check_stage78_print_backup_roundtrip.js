'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const hard=read('web/document-vault-hardening-runtime.js');
const cloud=read('web/backup-center-runtime.js');
const cards=read('web/cards-studio-runtime.js');
const photo=read('web/index.html');
new vm.Script(hard);new vm.Script(cloud);new vm.Script(cards);
function chunk(source,start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Missing '+start);
 return source.slice(a,b)
}
const funcs=chunk(hard,'const MODERN_PRINT_BACKUP_KEYS=','\nfunction bytesToB64(');
const cardKey='abuBassamCardsPrintPreferencesV1',dpiKey='abuBassamDpiEnabledV1';
const photoKey='abuBassamPrintSettingsV1',secretKey='abuBassamSecurityToken';
function storage(rows){
 const map=new Map(Object.entries(rows));
 return {map,getItem:k=>map.has(k)?map.get(k):null,
   setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),
   key:i=>[...map.keys()][i]||null,get length(){return map.size}};
}
const cardValue=JSON.stringify({paperType:'glossy',printDpi:600,output:'a4-duplex',copies:4});
const photoValue=JSON.stringify({mediaType:'photo',dpiInput:600,dpiEnabled:true});
const s=storage({[cardKey]:cardValue,[dpiKey]:'1',[photoKey]:photoValue,
  [secretKey]:'test-secret',abuBassamTypographyV1:'arabic'});
const local=new Function('localStorage',funcs+';return {safeSettingKey,settings,restoreSettings};')(s);
for(const key of [cardKey,dpiKey,photoKey,'abuBassamTypographyV1'])assert.equal(local.safeSettingKey(key),true,'Expected allowlisted print/UI key '+key);
for(const key of [secretKey,'abuBassamCardsPrintPreferencesV1Secret','abuBassamDpiEnabledV1Token',
  'abuBassamAuthToken','abuBassamDeviceSecret','abuBassamCustomerPhone'])assert.equal(local.safeSettingKey(key),false,'Sensitive/spoofed key excluded '+key);
const localSettings=local.settings();
assert.equal(localSettings[cardKey],cardValue);
assert.equal(localSettings[dpiKey],'1');
assert.equal(localSettings[photoKey],photoValue);
assert.equal(localSettings[secretKey],undefined);
assert.match(hard,/settings:settings\(\)/,'Local ZIP writes allowlisted settings into app-settings.json');
assert.match(cloud,/settings:safeSettings\(\)/,'Cloud ZIP writes allowlisted settings into app-settings.json');
const cloudSettingsBlock=chunk(cloud,'function safeSettings(){','\nasync function digest(');
const cloudSettings=new Function('window','localStorage',cloudSettingsBlock+';return safeSettings')(
 {AbuDocumentVaultHardening:{safeSettingKey:local.safeSettingKey}},s);
assert.deepEqual(cloudSettings(),localSettings,'Local and cloud allowlists must match exactly');
const fingerprintBlock=chunk(cloud,'async function fingerprint(){','\nasync function packageBytes(){');
const digest=async bytes=>{
 const raw=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 return Array.from(raw).map(n=>String.fromCharCode(n)).join('');
};
const fingerprint=new Function('backupItems','trashItems','digest','TextEncoder','safeSettings',
 fingerprintBlock+';return fingerprint')(
 async()=>[],async()=>[],digest,TextEncoder,cloudSettings);
const run=async()=>{
 const before=await fingerprint();
 assert.ok(before.includes(cardKey)&&before.includes(dpiKey),'Changed print preferences must be detected by cloud fingerprint');
 s.setItem(cardKey,JSON.stringify({paperType:'matte',printDpi:150}));
 assert.notEqual(await fingerprint(),before,'Print preference modification should invalidate backup checkpoint');
 s.setItem(cardKey,cardValue);
 const restoreStore=storage({[cardKey]:'old-card',[dpiKey]:'0',[photoKey]:'old-photo',abuBassamTypographyV1:'old-font'});
 const restore=new Function('localStorage',funcs+';return {restoreSettings,safeSettingKey};')(restoreStore);
 restore.restoreSettings({settings:{[cardKey]:cardValue,[dpiKey]:'1',[photoKey]:photoValue}},'snapshot');
 assert.equal(restoreStore.getItem(cardKey),cardValue);
 assert.equal(restoreStore.getItem(dpiKey),'1');
 assert.equal(restoreStore.getItem(photoKey),photoValue);
 assert.equal(restoreStore.getItem('abuBassamTypographyV1'),null,'Old snapshot semantics still remove absent conventional settings');
 const legacy=storage({[cardKey]:'keep-older-card-preferences',[dpiKey]:'1',[photoKey]:'old-photo'});
 const restoreLegacy=new Function('localStorage',funcs+';return restoreSettings;')(legacy);
 restoreLegacy({settings:{[photoKey]:photoValue}},'snapshot');
 assert.equal(legacy.getItem(cardKey),'keep-older-card-preferences','Legacy ZIP must not delete new card preferences');
 assert.equal(legacy.getItem(dpiKey),'1','Legacy ZIP must not disable saved DPI switch');
 assert.equal(legacy.getItem(photoKey),photoValue);
 assert.match(hard,/const settingsEntry=zip\.file\('app-settings\.json'\);if\(settingsEntry&&!recovery\)/,
  'Replacement device must never import old device print settings');
 assert.match(cards,/const PRINT_PREFS_KEY='abuBassamCardsPrintPreferencesV1'/);
 assert.match(photo,/localStorage\.setItem\('abuBassamDpiEnabledV1'/);
 assert.match(cards,/return normalizePrintPrefs\(JSON\.parse\(localStorage\.getItem\(PRINT_PREFS_KEY\)/);
 console.log('Stage78 print backup roundtrip passed: local/cloud allowlists, print checkpoint changes, same-device restore, legacy backup compatibility, secret exclusion and replacement-device preference isolation.');
};
run().catch(e=>{console.error(e);process.exitCode=1});
