const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const web=path.join(root,'web');
const errors=[];
const readRoot=p=>fs.readFileSync(path.join(root,p),'utf8');
const read=p=>fs.readFileSync(path.join(web,p),'utf8');
const has=(src,token,label)=>{if(!src.includes(token))errors.push(`${label}: missing ${token}`)};
const forbid=(src,token,label)=>{if(src.includes(token))errors.push(`${label}: forbidden ${token}`)};
const required=[
  'index.html','security-bootstrap-guard-runtime.js','app-security-runtime.js','security-hardening-runtime.js','security-extras-runtime.js','password-policy-runtime.js','permission-guard-runtime.js','login-input-direction-runtime.js','device-name-runtime.js','device-reconcile-runtime.js',
  'cards-studio-runtime.js','card-template-library.js','card-models-runtime.js','card-free-layout-runtime.js','standalone-card-layouts-plus-runtime.js','card-templates-v2.html','ration-card.html','mawkib-cards.html','envelopes.html','certificates.html','student-thanks-cards.html','thanks-letter.html',
  'questions-ar.html','questions-en.html','questions-paper-runtime.js','questions-en-fixes-runtime.js','questions-templates-runtime.js','questions-completion-runtime.js','questions-custom-library-runtime.js','question-type-runtime.js','image-compressor.html',
  'document-vault-runtime.js','document-vault-advanced-runtime.js','customer-documents-runtime.js','notification-center-runtime.js','notification-excel-runtime.js','operation-log-privacy-runtime.js','productivity-tools-runtime.js','photo-print-advanced-runtime.js','poster-project-runtime.js',
  'supabase-2.58.0.js','qrcode.js','jszip.min.js','fonts/Cairo-Regular.ttf','fonts/Cairo-Bold.ttf','fonts/Tajawal-Regular.ttf','fonts/Tajawal-Bold.ttf'
];
for(const f of required){const p=path.join(web,f);if(!fs.existsSync(p))errors.push(`Missing web asset: ${f}`);else if(fs.statSync(p).size===0)errors.push(`Empty required asset: ${f}`)}
for(const f of ['cards-hardening-runtime.js','cards-hardening-fixes-runtime.js','cards-final-audit-runtime.js','cards-section-upgrades-runtime.js','questions-final-fixes-runtime.js','login-throttle-fix-runtime.js','touch-stability-runtime.js'])if(fs.existsSync(path.join(web,f)))errors.push(`Obsolete patch runtime returned: ${f}`);
for(const filename of fs.readdirSync(web).filter(n=>n.endsWith('.js'))){try{new vm.Script(read(filename),{filename})}catch(e){errors.push(`${filename}: JavaScript syntax error: ${e.message}`)}}
for(const filename of ['index.html','questions-ar.html','questions-en.html','image-compressor.html','envelopes.html','certificates.html','student-thanks-cards.html','card-templates-v2.html','ration-card.html','mawkib-cards.html','thanks-letter.html']){
  if(!fs.existsSync(path.join(web,filename)))continue;
  const source=read(filename),scripts=/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;let match,index=0;
  while((match=scripts.exec(source))){index++;if(!match[1].trim())continue;try{new vm.Script(match[1],{filename:`${filename}#${index}`})}catch(e){errors.push(`${filename} inline script ${index}: ${e.message}`)}}
}
const packageJson=JSON.parse(readRoot('package.json'));
if(packageJson.version!=='4.3.2')errors.push(`package.json: expected version 4.3.2, got ${packageJson.version}`);
for(const dep of ['expo','react-native','react-native-webview','expo-print','expo-secure-store','expo-local-authentication','expo-camera'])if(!packageJson.dependencies?.[dep])errors.push(`package.json: missing ${dep}`);
const appJson=JSON.parse(readRoot('app.json'));const android=appJson.expo?.android||{};
if(android.package!=='com.abubassam.librarycamera3')errors.push(`app.json: unexpected Android package ${android.package||'missing'}`);
if(String(android.versionCode)!=='432')errors.push(`app.json: expected versionCode 432, got ${android.versionCode}`);
const librarySource=read('card-template-library.js');const sandbox={window:{}};vm.runInNewContext(librarySource,sandbox);const groups=sandbox.window.AbuBassamCardTemplateLibrary;
if(!Array.isArray(groups))errors.push('card-template-library.js: library did not load');
else{
  const expected={personal:5,child:10,login:10,wifi:3,qr:4,ration:10,mawkib:4,'student-thanks':10,envelope:9,certificate:10,thanks:6};
  for(const [id,count] of Object.entries(expected)){const g=groups.find(x=>x.id===id);if(!g)errors.push(`card catalog: missing ${id}`);else if(g.models?.length!==count)errors.push(`card catalog: ${id} expected ${count}, got ${g.models?.length}`);else{const ids=g.models.map(x=>x.id);if(new Set(ids).size!==ids.length)errors.push(`card catalog: duplicate model id in ${id}`)}}
}
const qAr=read('questions-paper-runtime.js');for(const t of ['A4P','A4L','A5P','A5L',"value=\"custom\"",'80,500','window.fitToScreen','window.checkAutoFlow'])has(qAr,t,'Arabic question paper');
forbid(qAr,'A4 فقط','Arabic question paper');
const qEn=read('questions-en-fixes-runtime.js');for(const t of ['A4P','A4L','A5P','A5L','Custom size','Model answer / notes','Day /','window.checkAutoFlow'])has(qEn,t,'English question tools');
forbid(qEn,'A4 only','English question tools');
const qTemplates=read('questions-templates-runtime.js');for(const t of ['التاريخ / ${esc(profile.date','اليوم / ${esc(profile.day','أكرم حاتم الغزالي'])has(qTemplates,t,'question templates');
const gestures=read('questions-gesture-runtime.js');has(gestures,'__ABU_QUESTION_GESTURES_DISABLED__','question gestures');for(const t of ['touchstart','touchmove','pointerdown','pointermove'])forbid(gestures,t,'question gestures');
const productivity=read('productivity-tools-runtime.js');for(const t of ['صياغة الأسئلة','questionsFrame','src="about:blank"','data-src="questions-ar.html"','compressorFrame','data-src="image-compressor.html"'])has(productivity,t,'productivity host');
const bootstrap=read('security-bootstrap-guard-runtime.js');for(const t of ['__ABU_SECURITY_BOOTSTRAP_GUARD_V1__','localStorage.removeItem(LEGACY_TRUST_KEY)','sec.offlineUnlock=denyLegacyOffline','stopImmediatePropagation'])has(bootstrap,t,'security bootstrap guard');
const deviceLoader=read('device-name-runtime.js');for(const t of ['security-bootstrap-guard-runtime.js','loadSecurityBootstrapGuard','loadSecurityHardening()'])has(deviceLoader,t,'security startup order');
const native=readRoot('index.js');for(const t of [
  'expo-local-authentication','expo-secure-store','expo-screen-capture','expo-print','ANDROID_BRIDGE','BackHandler.exitApp','STARTUP_WATCHDOG_MS',
  "originWhitelist={['file://*','about:*']}",'mixedContentMode="never"','onShouldStartLoadWithRequest',"if (message.type === 'webBootReady')",
  'cameraFrameKind','cardDocumentFrame','photoDocumentFrame','openCamera(message.mode, message.frameKind)',
  'if (imagePages.length > 20)','const encodedNameMatch = raw.match(/;name=([^;]+);base64,/i);'
])has(native,t,'index.js');
for(const t of ["originWhitelist={['*']}",'mixedContentMode="always"'])forbid(native,t,'index.js');
for(const t of ['Print.printAsync','Print.printToFileAsync','StorageAccessFramework.createFileAsync'])has(native,t,'native print/export');
const workflow=readRoot('.github/workflows/android.yml');for(const t of ['npm ci --no-audit --no-fund','npm run check:web','assembleRelease','assets/index.android.bundle','apksigner','sha256sum'])has(workflow,t,'android workflow');
const deviceLimit=readRoot('supabase/migrations/202609240009_strict_device_registration_identity.sql');for(const t of ['pg_advisory_xact_lock','DEVICE_LIMIT_REACHED',"v_role:=case when v_count=0 then 'owner' else 'secondary' end","if v_row.active=false then raise exception 'DEVICE_DISABLED'"])has(deviceLimit,t,'strict device migration');
const configurable=readRoot('supabase/migrations/202609240001_configurable_device_limit.sql');for(const t of ['device_limit between 1 and 50','abu_bassam_set_device_limit','DEVICE_LIMIT_BELOW_CURRENT_COUNT'])has(configurable,t,'device limit migration');
const projectText=fs.readdirSync(web).filter(n=>/\.(?:html|js)$/i.test(n)&&n!=='supabase-2.58.0.js').map(n=>read(n)).join('\n');
for(const forbidden of ['api.telegram.org/bot','service_role','sb_secret_','BEGIN PRIVATE KEY'])if(projectText.includes(forbidden))errors.push(`Forbidden secret marker found: ${forbidden}`);
if(/Ahmed Hassan|أحمد حسن/i.test(projectText))errors.push('Project contains a previous designer name');
if(!projectText.includes('أكرم حاتم الغزالي')&&!projectText.includes('Akram Hatem Al-Ghazali'))errors.push('Approved programmer identity is missing');
if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write(`Project checks passed (${required.length} required assets): canonical native startup security, smart camera frames, bounded named image saving, secure bootstrap ordering, syntax, approved card counts, A4/A5/custom questions, native print/PDF, strict device identity, configurable device limit, and secret/designer checks.\n`);
