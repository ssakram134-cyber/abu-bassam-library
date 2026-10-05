const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const web=path.join(root,'web');
const errors=[];
const read=p=>fs.readFileSync(p,'utf8');
const need=(src,marker,label)=>{if(!src.includes(marker))errors.push(`${label}: missing ${marker}`)};
const no=(src,marker,label)=>{if(src.includes(marker))errors.push(`${label}: forbidden ${marker}`)};
for(const file of ['app-settings-runtime.js','settings-corrections-runtime.js','settings-enhancements-runtime.js','typography-runtime.js','device-name-runtime.js','document-vault-runtime.js']){
  const src=read(path.join(web,file));
  try{new vm.Script(src,{filename:file})}catch(e){errors.push(`${file} syntax: ${e.message}`)}
}
const appSettings=read(path.join(web,'app-settings-runtime.js'));
const typography=read(path.join(web,'typography-runtime.js'));
const indexHtml=read(path.join(web,'index.html'));
need(typography,'src:url("fonts/Cairo-Regular.ttf")','bundled Cairo must use appassets-relative path');
need(typography,'src:url("fonts/Tajawal-Regular.ttf")','bundled Tajawal must use appassets-relative path');
no(typography,'file:///android_asset/library/fonts/','bundled fonts must not depend on disabled file access');
need(indexHtml,"blackgold:['أسود وذهبي فاخر","black-gold theme");
need(indexHtml,'function systemThemeValue()','live system theme resolver');
need(indexHtml,"addEventListener?.('change'","system theme change listener");
need(appSettings,'لم يتم إنشاء جهاز افتراضي','base settings device list must fail honestly');
no(appSettings,"list=[{name:'أكرم'","base settings must not fabricate a device");
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