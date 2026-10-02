const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const web=path.join(root,'web');
const errors=[];
const read=p=>fs.readFileSync(p,'utf8');
const need=(src,marker,label)=>{if(!src.includes(marker))errors.push(`${label}: missing ${marker}`)};
const no=(src,marker,label)=>{if(src.includes(marker))errors.push(`${label}: forbidden ${marker}`)};
for(const file of ['settings-corrections-runtime.js','settings-enhancements-runtime.js','device-name-runtime.js','document-vault-runtime.js']){
  const src=read(path.join(web,file));
  try{new vm.Script(src,{filename:file})}catch(e){errors.push(`${file} syntax: ${e.message}`)}
}
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
const typography=read(path.join(web,'typography-runtime.js'));
need(typography,'if(!save()){custom=before','custom font import rollback on persistence failure');
need(typography,'return false','font persistence failure must be observable');
for(const m of ["const oldState=localStorage.getItem(KEY),oldCustom=localStorage.getItem(CUSTOM_KEY)","localStorage.setItem(KEY,oldState)","localStorage.setItem(CUSTOM_KEY,oldCustom)",'تم التراجع عن التغيير غير المحفوظ'])need(typography,m,'atomic typography persistence '+m);
need(typography,'function reloadPersisted()','restored typography must reload persisted state');
need(typography,'custom=load(CUSTOM_KEY,[])','restored custom fonts must reload from storage');
const loader=read(path.join(web,'device-name-runtime.js'));
for(const marker of ['settings-corrections-runtime.js','loadSettingsCorrections()','await loadSettingsCorrections();'])need(loader,marker,'settings loader');
no(loader,'wifi-sync-guard-runtime.js','obsolete Wi-Fi guard loader');
no(loader,'loadWifiSyncGuard','obsolete Wi-Fi guard loader function');
if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write('Settings checks passed: authenticated device count, exact current-device labeling, no fake devices, privacy capture control, broader storage estimate, honest Google sharing, safe reset scope, fail-closed Wi-Fi-only sync, and printer profile offsets/borderless behavior.\n');