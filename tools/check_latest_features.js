const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),web=path.join(root,'web'),errors=[];
const read=f=>fs.readFileSync(path.join(web,f),'utf8');
const need=(s,m,l)=>{if(!s.includes(m))errors.push(`${l}: missing ${m}`)};
const forbid=(s,m,l)=>{if(s.includes(m))errors.push(`${l}: forbidden ${m}`)};

const files=['device-name-runtime.js','feature-recovery-runtime.js','productivity-tools-runtime.js','card-template-library.js','child-card-templates-runtime.js','card-models-runtime.js','standalone-card-models-runtime.js','login-throttle-fix-runtime.js','login-input-direction-runtime.js','ration-card.html','mawkib-cards.html','thanks-letter.html','certificates.html','envelopes.html','design-studio-runtime.js'];
for(const f of files)if(!fs.existsSync(path.join(web,f)))errors.push(`Missing latest feature asset: ${f}`);

const device=read('device-name-runtime.js');
for(const m of ['dismissSplash','installSplashWatchdog','setTimeout(dismissSplash,1800)','login-throttle-fix-runtime.js','login-input-direction-runtime.js'])need(device,m,'startup/login loader');

const productivity=read('productivity-tools-runtime.js');
for(const m of ['src="about:blank"','data-src="questions-ar.html"','data-src="image-compressor.html"','ensureQuestionFrame','ensureCompressorFrame'])need(productivity,m,'lazy productivity');
for(const m of ['envelopeFrame','abuModeEnvelope','abuPaneEnvelope','src="envelopes.html"','الأسئلة والظروف'])forbid(productivity,m,'questions placement');

const recovery=read('feature-recovery-runtime.js');
for(const m of ["envelope:{title:'صناعة الظرف',file:'envelopes.html'}", "addCardTool(types,'envelope'", "addCardTool(types,'thanks'", "addCardTool(types,'certificate'", 'abuCardsTemplatesBtn','abuSectionTemplatesBtn','top:76px','width:52px','height:52px','scheduleRecovery'])need(recovery,m,'cards recovery');
forbid(recovery,"types.querySelector('[data-type=\"envelope\"]')?.remove()",'cards recovery');

const lib=read('card-template-library.js');
const count=id=>{const m=lib.match(new RegExp(`id:'${id}'[\\s\\S]*?models:\\[([\\s\\S]*?)\\]`));return m?(m[1].match(/\{id:/g)||[]).length:0};
for(const [id,n] of [['personal',5],['child',10],['login',10],['wifi',3],['qr',4],['ration',1],['mawkib',10],['envelope',9],['certificate',10],['thanks',6]])if(count(id)!==n)errors.push(`${id}: expected ${n}, got ${count(id)}`);
for(const m of ["id:'envelope'",'env-1','env-9','route:\'envelopes.html\''])need(lib,m,'template library');

const child=read('child-card-templates-runtime.js');
const childIds=new Set((child.match(/id:'child-[a-z]+'/g)||[]).map(x=>x.slice(4,-1)));if(childIds.size!==10)errors.push(`child real layouts expected 10, got ${childIds.size}`);
for(const m of ['templateCss','child-clouds','child-hearts','child-nature','child-space','child-rainbow','child-garden','child-shapes','child-balloons','child-board','child-future'])need(child,m,'child templates');
const models=read('card-models-runtime.js');for(const m of ['personal-5','login-10','wifi-3','qr-4','cssPersonal','cssLogin','cssWifi','cssQr','printCss'])need(models,m,'card models');
const standalone=read('standalone-card-models-runtime.js');for(const m of ['t5#front','t6#front','t7#front','t8#front','t9#front','t10#front',"o.value!=='t1'",'MAWKIB_EXTRA_CSS'])need(standalone,m,'standalone card models');

const thanks=read('thanks-letter.html');for(const m of ['1 — الإطار الملكي','2 — الشريط الجانبي','3 — الوسام المركزي','4 — الترويسة الأكاديمية','5 — اللوحة الهندسية','6 — الرسمي المبسط'])need(thanks,m,'thanks layouts');
const studio=read('design-studio-runtime.js');for(const m of ['Array.from({length:9','الكحلي والذهبي','العنابي الرسمي','الأزرق الأكاديمي','الأخضر الهندسي','الإطار الهندسي'])need(studio,m,'envelope layouts');

const login=read('login-throttle-fix-runtime.js');for(const m of ['credentialFailure(message)','deviceOrPostAuthFailure(message)','recordCredentialFailure','clearFailures','cloneNode(true)'])need(login,m,'login throttle fix');
const direction=read('login-input-direction-runtime.js');for(const m of ["dir','ltr", "lang','en", 'autocapitalize','spellcheck','unicodeBidi'])need(direction,m,'login LTR');

for(const f of files.filter(x=>x.endsWith('.js'))){try{new vm.Script(read(f),{filename:f})}catch(e){errors.push(`${f}: ${e.message}`)}}
for(const f of ['ration-card.html','mawkib-cards.html','thanks-letter.html','certificates.html','envelopes.html']){const s=read(f),rx=/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;let m,i=0;while((m=rx.exec(s))){i++;if(!m[1].trim())continue;try{new vm.Script(m[1],{filename:`${f}#${i}`})}catch(e){errors.push(`${f}#${i}: ${e.message}`)}}}

if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write('Latest feature audit passed: splash watchdog, lazy question/compressor loading, envelope/thanks/certificates in Cards, per-section model buttons, exact real-template counts, login LTR/throttle fixes, and syntax checks.\n');
