const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const web=path.join(root,'web');
const errors=[];
const read=p=>fs.readFileSync(p,'utf8');
const need=(src,marker,label)=>{if(!src.includes(marker))errors.push(`${label}: missing ${marker}`)};
const no=(src,marker,label)=>{if(src.includes(marker))errors.push(`${label}: forbidden ${marker}`)};
for(const file of ['app-settings-runtime.js','settings-corrections-runtime.js','settings-enhancements-runtime.js','typography-runtime.js','device-name-runtime.js','document-vault-runtime.js','document-vault-hardening-runtime.js']){
  const src=read(path.join(web,file));
  try{new vm.Script(src,{filename:file})}catch(e){errors.push(`${file} syntax: ${e.message}`)}
}
const appSettings=read(path.join(web,'app-settings-runtime.js'));
const enhancements=read(path.join(web,'settings-enhancements-runtime.js'));
const typography=read(path.join(web,'typography-runtime.js'));
const indexHtml=read(path.join(web,'index.html'));
need(typography,'src:url("fonts/Cairo-Regular.ttf")','bundled Cairo must use appassets-relative path');
need(typography,'src:url("fonts/Tajawal-Regular.ttf")','bundled Tajawal must use appassets-relative path');
need(typography,"const EMBEDDED_FONTS=new Set(['cairo','tajawal'])",'bundled font families must be protected');
need(typography,"if(EMBEDDED_FONTS.has(name.toLowerCase()))throw new Error",'custom fonts must not override bundled Cairo/Tajawal');
need(typography,'function normalizeCustomFont(font)','restored custom fonts must use a validation gate');
need(typography,'.map(normalizeCustomFont).filter(Boolean)','persisted/restored font arrays must be filtered');
need(typography,"!['ttf','otf'].includes(format)",'restored fonts must be limited to TTF/OTF');
need(typography,'data.length>3*1024*1024','restored custom font payloads must be bounded');
need(typography,"format==='otf'?sig==='OTTO'",'restored custom fonts must verify the font signature');
need(typography,'normalizeCustomFont({name,data,format:ext})','interactive font imports must pass the same validator as restored fonts');
need(typography,'return true}catch(e){alert','typography persistence must report success/failure');
need(typography,'if(!save()){if(exists>=0)custom[exists]=previous;else custom.pop()','font import must roll back after persistence failure');
need(typography,'const previousCustom=custom.slice(),previousState=clone(state)','font deletion must snapshot state before persistence');
need(typography,'if(!save()){custom=previousCustom;state=previousState','font deletion must roll back after persistence failure');
need(typography,'const previousState=clone(state),previousCustom=custom.slice()','typography restore must snapshot existing settings');
need(typography,'if(!save()){state=previousState;custom=previousCustom;applyApp();return false}','typography restore must roll back after persistence failure');
for(const marker of ['appScalePreset(85)','appScalePreset(100)','appScalePreset(120)','appScalePreset(140)','صغير','عادي','كبير جدًا'])need(typography,marker,'UI text size preset '+marker);
need(typography,"const DEFAULT_ROLE_GROUPS={name:{label:'الاسم',roles:['name']},title:{label:'العناوين',roles:['title','institution']},secondary:{label:'المعلومات الثانوية',roles:['secondary','info','details']},footer:{label:'الشريط السفلي',roles:['footer']}}",'badge default role groups');
for(const marker of ['Regular','Medium','Bold Italic','Sharp','function roleDefault(group,field,value)'])need(typography,marker,'per-role badge typography '+marker);
need(typography,"window.AbuBassamPermissions?.can?.(key)===true",'font settings must fail closed for secondary devices');
need(typography,"['appFont','appScale'].includes(field)?'settingsFonts':'settingsCardFonts'",'app and badge font settings must use separate permissions');
need(typography,"canAnySetting(['settingsFonts','settingsCardFonts'])",'font library access must require at least one font permission');
need(typography,"document.querySelectorAll('#abuRoleDefaults select,#abuRoleDefaults input').forEach(el=>el.disabled=!cardAllowed)",'badge default controls must disable without settingsCardFonts');
need(typography,'vnd\\.ms-opentype','Android OTF MIME type must remain supported');
no(typography,'file:///android_asset/library/fonts/','bundled fonts must not depend on disabled file access');
need(indexHtml,"blackgold:['أسود وذهبي فاخر","black-gold theme");
need(indexHtml,'function systemThemeValue()','live system theme resolver');
need(indexHtml,"addEventListener?.('change'","system theme change listener");
need(appSettings,'لم يتم إنشاء جهاز افتراضي','base settings device list must fail honestly');
no(appSettings,"list=[{name:'أكرم'","base settings must not fabricate a device");
no(appSettings,"SYNC_POLICY_KEY,WA_KEY].forEach(key=>localStorage.removeItem(key))",'base settings reset must preserve sync and WhatsApp');
need(appSettings,'id="abuWaQuickShare"','WhatsApp enabled setting must expose a real share action');
need(appSettings,'function applyWhatsAppSetting()','WhatsApp toggle must affect the share UI');
need(appSettings,'async function shareWhatsApp()','WhatsApp share must await the real backup result');need(appSettings,"const ok=await window.DocumentVault.backup('share');if(!ok)return false",'WhatsApp share must stop when backup/share is cancelled or fails');need(appSettings,"log('مشاركة نسخة عبر WhatsApp','تم فتح شاشة مشاركة Android');return true",'WhatsApp share must log only after a successful share handoff');
need(appSettings,"if(wa.enabled===false){alert('فعّل مشاركة WhatsApp من الإعدادات أولًا.');return false}",'WhatsApp share action must honor disabled setting');
need(appSettings,'async function backup(mode)','settings backup must await the real backup result');
need(appSettings,"ok?'تم إنشاء النسخة الاحتياطية ✓':'لم تُنشأ نسخة احتياطية.'",'settings backup status must reflect the real result');
need(appSettings,'async function sync()','settings sync must aggregate actual sync results');
need(appSettings,'const vaultResult=hasVault?await Promise.resolve(DocumentVault.syncNow()).catch(()=>false):null','settings sync must track vault result explicitly');need(appSettings,'settingsResult=hasSettings?await Promise.resolve(AbuBassamOps.sync()).catch(()=>false):null','settings sync must track settings result explicitly');need(appSettings,"if(window.AbuBassamDevices?.heartbeat)Promise.resolve(AbuBassamDevices.heartbeat()).catch(()=>false)",'device heartbeat must be auxiliary only');need(appSettings,"اكتملت مزامنة الإعدادات، لكن أرشيف الملفات لم يكتمل.",'settings sync must distinguish partial completion');
need(appSettings,'async function google()','Google share must await backup/share preparation');
need(appSettings,"if(!ok){if(state)state.textContent='لم تبدأ مشاركة Google.';return false}",'Google share must not claim success when backup/share did not start');
need(appSettings,'id="abuArchiveAutoSync"','automatic archive control must be visible in settings');
need(appSettings,'function archiveAutoSync(value)','automatic archive control must have real behavior');
need(appSettings,'function setAutoSyncState(value)','archive and sync toggles must share one canonical state');
need(appSettings,'DocumentVault?.setAutoSync','automatic archive setting must drive the document vault');
for(const marker of [
  "function requirePermission(key,label='')",
  "function requireAny(keys,label='')",
  "function theme(key){if(!requirePermission('settingsThemes'))",
  "function fonts(){if(!requireAny(['settingsFonts','settingsCardFonts']",
  "async function backup(mode){if(!requirePermission('backupCreate'))",
  "if(mode==='share'&&!requirePermission('backupShare'))",
  "async function sync(){if(!requirePermission('syncManual'))",
  "function cloudLogin(){if(!requirePermission('cloudSettings'))",
  "function autoSync(value){if(!requirePermission('syncAutomatic'))",
  "function archiveAutoSync(value){if(!requirePermission('syncAutomatic'))",
  "function syncPolicy(){if(!requirePermission('syncSettings'))",
  "nextWifi!==!!previous.wifiOnly&&!requirePermission('syncWifiOnly')",
  "function saveWhatsApp(){if(!requirePermission('settingsWhatsApp'))",
  "async function shareWhatsApp(){if(!requirePermission('whatsappBackup'))",
  "async function google(){if(!requirePermission('googleShare'))",
  "function printSettings(){if(!requirePermission('settingsPrinting'))",
  "function systemSettings(){if(!requirePermission('settingsPermissions'))",
  "async function storage(){if(!requirePermission('settingsStorage'))",
  "function cleanCache(){if(!requirePermission('settingsStorage'))",
  "function resetDefaults(){if(!requirePermission('settingsReset'))"
])need(appSettings,marker,'source-level settings permission '+marker);
for(const marker of [
  "requirePermission('printerProfiles')",
  "requirePermission('printerDpi')",
  "requirePermission('printerBorderless')",
  "requirePermission('printerCalibration')",
  "requirePermissions(['printerProfiles','printerAdd'])",
  "requirePermissions(['printerProfiles','printerDelete'])",
  "requirePermissions(['printerProfiles','printerSetDefault'])",
  "requirePermissions(['settingsPrinting','printerProfiles'])"
])need(enhancements,marker,'granular printer permission '+marker);
need(appSettings,"if(policy.mode==='manual'){policy.mode='daily'",'enabling automatic sync must not remain trapped in manual policy');
const fix=read(path.join(web,'settings-corrections-runtime.js'));
for(const marker of [
  "nativeSecurity('privacyMode'",'abuPrivacyCapture','navigator.storage?.estimate',
  'لم يتم إنشاء جهاز افتراضي','device_id||device.id','RESET_KEYS=',
  'لا يوجد تسجيل دخول مباشر إلى Google','connectionClass()','wifiOnly()',
'abuBassamActivePrinterProfileV1',
  'transform:translate(${x}mm,${y}mm)','p.borderless?0',
  'e.applyPrinter=applyPrinterSafe'
])need(fix,marker,'settings corrections');
const reset=(fix.match(/const RESET_KEYS=\[([^\]]*)\]/)||[])[1]||'';
if(/SyncPolicy|WhatsApp|WA_KEY|AUTO_SYNC/i.test(reset))errors.push('settings reset: must not clear sync or WhatsApp settings');
const vaultHardening=read(path.join(web,'document-vault-hardening-runtime.js'));
need(vaultHardening,"return true}catch(e){alert('تعذر إنشاء النسخة:",'plain vault backup must report success and failure');
need(vaultHardening,"if(!confirm('النسخة ZIP العادية غير مشفرة",'plain vault backup must allow explicit cancellation');
need(vaultHardening,"mode==='share'&&!allowed('backupShare')",'vault backup sharing must require backupShare at source');
const vault=read(path.join(web,'document-vault-runtime.js'));
for(const marker of ['function wifiVerified()',"return type==='wifi'",'policy.wifiOnly&&!wifiVerified()','const current=localStorage.getItem(SYNC_POLICY_KEY)'])need(vault,marker,'canonical Wi-Fi-only sync policy');
no(vault,'knownNonWifi()','obsolete fail-open Wi-Fi detection');
const enh=read(path.join(web,'settings-enhancements-runtime.js'));
need(enh,'abu_bassam_owner_device_count','device count RPC');
need(enh,'AbuBassamDeviceRegistry?.count','device registry count');
no(enh,".from('abu_bassam_devices')",'device count direct table access');
const loader=read(path.join(web,'device-name-runtime.js'));
for(const marker of ['settings-corrections-runtime.js','loadSettingsCorrections()','await loadSettingsCorrections();'])need(loader,marker,'settings loader');
no(loader,'wifi-sync-guard-runtime.js','obsolete Wi-Fi guard loader');
no(loader,'loadWifiSyncGuard','obsolete Wi-Fi guard loader function');
if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write('Settings checks passed: authenticated device count, exact current-device labeling, no fake devices, privacy capture control, broader storage estimate, honest Google sharing, safe reset scope, fail-closed Wi-Fi-only sync, and printer profile offsets/borderless behavior.\n');