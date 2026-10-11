'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('web/settings-corrections-runtime.js','utf8');
const native=fs.readFileSync('index.js','utf8');
for(const marker of [
  "saveBase64: function (name, mime, data, requestId)",
  "if (!permission.granted) { report(false",
  "if (confirmationId) report(true);",
  "if (confirmationId) report(false",
  "inject('AbuBassamSettingsBackupResult'"
])assert.ok(native.includes(marker),'Native save confirmation missing: '+marker);
const state=new Map([
 ['theme','dark'],
 ['abuBassamPrintSettingsV1','{"paper":"A4"}'],
 ['abuBassamSyncPolicyV5','{"wifiOnly":true}'],
 ['abuBassamWhatsAppSettingsV5','{"enabled":true}']
]);
const removed=[],messages=[],alerts=[],timers=new Map();
let promptCount=0, nextTimer=1, themeChanges=0, fontResets=0;
const localStorage={
 get length(){return state.size;},
 key:i=>[...state.keys()][i]??null,
 getItem:k=>state.has(k)?state.get(k):null,
 setItem:(k,v)=>state.set(k,String(v)),
 removeItem:k=>{removed.push(k);state.delete(k)}
};
const listeners={};
const document={
 readyState:'loading',
 getElementById:()=>null,
 addEventListener:(event,fn)=>{listeners[event]=fn}
};
const Android={saveBase64:(name,mime,data,requestId)=>messages.push({name,mime,data,requestId})};
const settings={open(){}};
const window={
 Android,AbuBassamSettings:settings,
 AbuBassamTypography:{resetAll:()=>fontResets++},
 applyTheme:()=>themeChanges++,
 addEventListener(){},
 AbuBassamOps:{add(){}}
};
const sandbox={
 window,document,Android,localStorage,navigator:{},
 confirm:()=>{promptCount++;return true},
 alert:x=>alerts.push(String(x)),
 setTimeout:(fn,ms)=>{const id=nextTimer++;timers.set(id,{fn,ms});return id},
 clearTimeout:id=>timers.delete(id),
 btoa:x=>Buffer.from(x,'binary').toString('base64'),
 unescape,encodeURIComponent,Date,JSON,Promise,console
};
vm.runInNewContext(source,sandbox,{filename:'settings-corrections-runtime.js'});
assert.equal(typeof listeners.DOMContentLoaded,'function','Settings initialization missing');
listeners.DOMContentLoaded();
assert.equal(typeof settings.resetDefaults,'function','Reset handler not registered');
(async()=>{
 const first=settings.resetDefaults();
 assert.equal(messages.length,1,'First reset must request one real native export');
 assert.ok(messages[0].requestId.startsWith('settings-backup-'));
 assert.equal(messages[0].mime,'application/json');
 assert.equal(removed.length,0,'Do not delete settings before native save success');
 assert.equal(timers.size,1,'Wait for a bounded native acknowledgement');
 const duplicate=settings.resetDefaults();
 await duplicate;
 assert.equal(messages.length,1,'Repeated presses must not start parallel resets');
 assert.equal(promptCount,1,'Repeated presses must not reopen confirmation');
 window.AbuBassamSettingsBackupResult({requestId:'other-request',ok:true});
 assert.equal(removed.length,0,'Foreign native response must not authorize reset');
 window.AbuBassamSettingsBackupResult({requestId:messages[0].requestId,ok:false,error:'user cancelled'});
 await first;
 assert.equal(removed.length,0,'Cancelled file picker must preserve all settings');
 assert.equal(timers.size,0,'Cancelled request must release timeout');
 assert.ok(alerts.at(-1).includes('لم يتم تغيير الإعدادات'));
 const second=settings.resetDefaults();
 assert.equal(messages.length,2);
 assert.notEqual(messages[0].requestId,messages[1].requestId);
 window.AbuBassamSettingsBackupResult({requestId:messages[0].requestId,ok:true});
 assert.equal(removed.length,0,'Stale acknowledgement must be ignored');
 window.AbuBassamSettingsBackupResult({requestId:messages[1].requestId,ok:true});
 await second;
 assert.ok(removed.includes('theme'));
 assert.ok(removed.includes('abuBassamPrintSettingsV1'));
 assert.equal(state.get('abuBassamSyncPolicyV5'),'{"wifiOnly":true}','Sync policy must survive reset');
 assert.equal(state.get('abuBassamWhatsAppSettingsV5'),'{"enabled":true}','WhatsApp settings must survive reset');
 assert.equal(themeChanges,1);
 assert.equal(fontResets,1);
 assert.equal(timers.size,1,'Only optional UI reopen timer may remain');
 console.log('Settings reset acknowledgement tests passed: no deletion on cancel or stale reply; reset only after confirmed Android write; sync and WhatsApp retained.');
})().catch(e=>{console.error(e);process.exitCode=1});
