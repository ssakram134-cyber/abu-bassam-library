const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),web=path.join(root,'web'),errors=[];
const read=f=>fs.readFileSync(path.join(web,f),'utf8'),rootRead=f=>fs.readFileSync(path.join(root,f),'utf8');
const need=(s,m,l)=>{if(!s.includes(m))errors.push(`${l}: missing ${m}`)};
const forbid=(s,m,l)=>{if(s.includes(m))errors.push(`${l}: forbidden ${m}`)};
const files=['device-name-runtime.js','feature-recovery-runtime.js','productivity-tools-runtime.js','card-template-library.js','child-card-templates-runtime.js','card-models-runtime.js','standalone-card-models-runtime.js','strict-workflow-runtime.js','login-input-direction-runtime.js','ration-card.html','mawkib-cards.html','thanks-letter.html','certificates.html','envelopes.html','design-studio-runtime.js','envelope-agreement-runtime.js','standalone-card-layouts-plus-runtime.js','app-security-runtime.js'];
for(const f of files)if(!fs.existsSync(path.join(web,f)))errors.push('Missing latest feature asset: '+f);
for(const f of ['login-throttle-fix-runtime.js','cards-section-upgrades-runtime.js','cards-hardening-runtime.js','cards-hardening-fixes-runtime.js','cards-final-audit-runtime.js','touch-stability-runtime.js'])if(fs.existsSync(path.join(web,f)))errors.push('Obsolete patch runtime returned: '+f);

const device=read('device-name-runtime.js');
for(const m of ['async function loadApprovedUi()','script.async=false','await loadSecurity()','signalBootReady()','login-input-direction-runtime.js'])need(device,m,'deterministic startup');
for(const m of ['installSplashWatchdog','login-throttle-fix-runtime.js'])forbid(device,m,'deterministic startup');

const productivity=read('productivity-tools-runtime.js');
for(const m of ['src="about:blank"','data-src="questions-ar.html"','data-src="image-compressor.html"','async function loadAdvancedRuntime()','script.async=false','await loadOne(...spec)'])need(productivity,m,'lazy deterministic productivity');
for(const m of ['cards-section-upgrades-runtime.js','envelopeFrame','src="envelopes.html"'])forbid(productivity,m,'productivity host');

const recovery=read('feature-recovery-runtime.js');
for(const m of ["envelope:{title:'صناعة الظرف',file:'envelopes.html'}",'abu-recovery-frame-load',"cardsPrint','printCards','printGeneral","cardsExportPdf','pdfCreate','pdfSave","cardsExportImage','imageExport','exportOutsideApp"])need(recovery,m,'recovery host');
forbid(recovery,'new MutationObserver(scheduleRecovery)','recovery host');

const lib=read('card-template-library.js'),sandbox={window:{}};vm.runInNewContext(lib,sandbox);const groups=sandbox.window.AbuBassamCardTemplateLibrary;
const expected={personal:5,child:10,login:10,wifi:3,qr:4,ration:10,mawkib:4,'student-thanks':10,envelope:10,certificate:10,thanks:10};
for(const [id,n] of Object.entries(expected)){const g=groups?.find?.(x=>x.id===id);if(!g||g.models?.length!==n)errors.push(`${id}: expected ${n}, got ${g?.models?.length??'missing'}`)}

const ration=read('ration-card.html');for(let i=1;i<=10;i++)need(ration,`value="t${i}"`,`ration model ${i}`);
const mawkib=read('mawkib-cards.html');for(let i=1;i<=4;i++)need(mawkib,`value="t${i}"`,`mawkib model ${i}`);
const thanks=read('thanks-letter.html');for(let i=1;i<=10;i++)need(thanks,`value="t${i}"`,`thanks model ${i}`);
const studio=read('design-studio-runtime.js');for(const m of ['Array.from({length:10}','id:`env-${i+1}`','envelopeTemplate(i)','cardsManageCustomTemplates','cardsTemplatesDelete','cardsEditText'])need(studio,m,'Design Studio');
const layouts=read('standalone-card-layouts-plus-runtime.js');for(const m of ['abuBassamStandaloneCardLayoutV2','safeTextTarget','abu-recovery-frame-load'])need(layouts,m,'standalone layouts');forbid(layouts,'new MutationObserver(watch)','standalone layouts');

const appSecurity=read('app-security-runtime.js');for(const m of ['ATTEMPT_KEY','LOGIN_LOCK_KEY','recordCredentialFailure','clearCredentialFailures','signOut({scope:\'local\'})'])need(appSecurity,m,'core login security');
const direction=read('login-input-direction-runtime.js');for(const m of ["setAttribute('dir','ltr')","setAttribute('autocapitalize','off')","setAttribute('spellcheck','false')"])need(direction,m,'login LTR');

const native=rootRead('index.js');for(const m of ["message.type === 'webBootReady'",'STARTUP_WATCHDOG_MS = 12000',"const APP_ORIGIN = 'https://appassets.androidplatform.net';","originWhitelist={[APP_ORIGIN,'about:*']}",'nativeConfig={{ component: RCTAbuBassamWebView }}','allowFileAccess={false}','allowFileAccessFromFileURLs={false}','allowUniversalAccessFromFileURLs={false}','mixedContentMode="never"','onShouldStartLoadWithRequest','onRenderProcessGone'])need(native,m,'native startup');
for(const m of ['onLoad={() => setWebReady(true)}','onLoadEnd={() => setWebReady(true)}','onLoadProgress={(event) => { if ((event.nativeEvent?.progress || 0) >= 0.35) setWebReady(true); }}'])forbid(native,m,'native startup');
for(const f of files.filter(x=>x.endsWith('.js'))){try{new vm.Script(read(f),{filename:f})}catch(e){errors.push(`${f}: ${e.message}`)}}
if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write('Latest feature audit passed: deterministic startup, canonical card permissions/models, no patch runtimes, safe standalone editing, and explicit web readiness.\n');
