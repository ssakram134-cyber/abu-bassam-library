const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const web=path.join(root,'web');
const errors=[];
const readWeb=name=>fs.readFileSync(path.join(web,name),'utf8');
const need=(src,m,label)=>{if(!src.includes(m))errors.push(`${label}: missing ${m}`)};
const forbid=(src,m,label)=>{if(src.includes(m))errors.push(`${label}: forbidden ${m}`)};

const required=[
 'index.html','residence-card.html','cards-studio-runtime.js','national-id-runtime.js','document-vault-runtime.js','app-settings-runtime.js','typography-runtime.js','secure-sync-runtime.js','device-name-runtime.js','feature-recovery-runtime.js','app-security-runtime.js','security-extras-runtime.js','productivity-tools-runtime.js','questions-templates-runtime.js','questions-template-tools-runtime.js','questions-paper-runtime.js','questions-gesture-runtime.js','design-studio-runtime.js','envelopes.html','envelope-agreement-runtime.js','certificates.html','questions-ar.html','questions-en.html','image-compressor.html','card-template-library.js','card-templates-v2.html','ration-card.html','mawkib-cards.html','thanks-letter.html','supabase-2.58.0.js','qrcode.js','jszip.min.js','fonts/Cairo-Regular.ttf','fonts/Cairo-Bold.ttf','fonts/Tajawal-Regular.ttf','fonts/Tajawal-Bold.ttf'
];
for(const relative of required)if(!fs.existsSync(path.join(web,relative)))errors.push(`Missing web asset: ${relative}`);

for(const filename of fs.readdirSync(web).filter(n=>n.endsWith('.js'))){try{new vm.Script(readWeb(filename),{filename})}catch(e){errors.push(`${filename}: ${e.message}`)}}
for(const filename of ['index.html','residence-card.html','questions-ar.html','questions-en.html','image-compressor.html','envelopes.html','certificates.html','card-templates-v2.html','card-templates.html','ration-card.html','mawkib-cards.html','thanks-letter.html']){
 if(!fs.existsSync(path.join(web,filename)))continue;
 const source=readWeb(filename),scripts=/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;let match,index=0;
 while((match=scripts.exec(source))){index++;if(!match[1].trim())continue;try{new vm.Script(match[1],{filename:`${filename}#${index}`})}catch(e){errors.push(`${filename} script ${index}: ${e.message}`)}}
}

const indexHtml=readWeb('index.html');
for(const ref of ['supabase-2.58.0.js','secure-sync-runtime.js','device-name-runtime.js','productivity-tools-runtime.js'])need(indexHtml,`src="${ref}"`,'index.html');
if(indexHtml.indexOf('secure-sync-runtime.js')<indexHtml.indexOf('supabase-2.58.0.js'))errors.push('Supabase must load before secure-sync-runtime.js');

const device=readWeb('device-name-runtime.js');
for(const m of ['feature-recovery-runtime.js','app-security-runtime.js','security-extras-runtime.js'])need(device,m,'device-name-runtime.js');
for(const m of ['global-flex-runtime.js','loadGlobalFlex','abuGlobalFlexRuntime'])forbid(device,m,'device-name-runtime.js');

const recovery=readWeb('feature-recovery-runtime.js');
for(const m of ['#abuControlDock','.top-actions{top:76px','width:52px','font-size:24px','abuCardsTemplatesBtn','card-templates-v2.html',"addCardTool(types,'ration'","addCardTool(types,'mawkib'","addCardTool(types,'envelope'","addCardTool(types,'thanks'",'#cardsCenter .cs-photo-actions{display:grid!important','#cardsCenter .cs-type{min-height:84px'])need(recovery,m,'feature-recovery-runtime.js');

const productivity=readWeb('productivity-tools-runtime.js');
for(const m of ['questions-ar.html','questions-en.html','certificates.html','questions-templates-runtime.js','questions-paper-runtime.js','abuPrintQuestion','abuSaveQuestionPdf','abuCompressionReady','abuDesignPrint','prodModeCertificate'])need(productivity,m,'productivity-tools-runtime.js');
for(const m of ['prodModeEnvelope','prodPaneEnvelope','envelopeFrame','src="envelopes.html"'])forbid(productivity,m,'productivity-tools-runtime.js');

const questionPaper=readWeb('questions-paper-runtime.js');
for(const m of ['A4P','A4L','A5P','A5L','مخصص','abuQuestionPaperSettingsV1','@page','ملم','سم','questions-template-tools-runtime.js'])need(questionPaper,m,'questions-paper-runtime.js');
for(const m of ['questions-gesture-runtime.js','abuQuestionGestureExternal','loadGestureRuntime'])forbid(questionPaper,m,'questions-paper-runtime.js');
const gestures=readWeb('questions-gesture-runtime.js');
for(const m of ['__ABU_QUESTION_GESTURES_DISABLED__','restoreNativeTouch','pan-y','manipulation'])need(gestures,m,'questions-gesture-runtime.js');
for(const m of ['touchstart','touchmove','pointerdown','pointermove','abuScale','abuMoveX','abuMoveY'])forbid(gestures,m,'questions-gesture-runtime.js');

const questionTemplates=readWeb('questions-templates-runtime.js');
for(const m of ['math1-','makeScienceTemplate(3','makeScienceTemplate(4','islamic-','نماذج خاصة بالمادة','نماذج عامة','قوالب الأسئلة','أتعلم — ٢ درجة','أتأكد — ٢ درجة','أتحدث — ٢ درجة','أحل — ٢ درجة','أفكر — ٢ درجة','الحفظ — ٢ درجة','الحديث الشريف — ٢ درجة','التلاوة — ٢ درجة','العقائد والعبادات — ١ درجة','المعاني — ١ درجة','السيرة — ١ درجة','الآداب الإسلامية — ١ درجة','abuQuestionHeaderProfileV1','abuQuestionCustomTemplatesV1','MutationObserver','استبدال','قص حر','قفل/فتح','للأمام','للخلف','redo'])need(questionTemplates,m,'questions-templates-runtime.js');

const studio=readWeb('design-studio-runtime.js');
for(const m of ['ENVELOPE_PRESETS','CERT_PRESETS','225x115','DL —','C6 —','#10 —','Array.from({length:10','Array.from({length:9','صناعة الظرف / غلاف الأسئلة','شهادات التقدير','إضافة نماذج','الوحدة','ملم','سم','saveAsTemplate','applyCrop','replaceImage','front','back','lock','abuDesignPrint','abuDesignPdf','abuDesignSaveImage'])need(studio,m,'design-studio-runtime.js');

const library=readWeb('card-template-library.js');
for(const m of ['AbuBassamCardTemplateLibrary','الباج التعريفي','باج الروضة والمدرسة','البطاقة التموينية','كروت المواكب الحسينية','صناعة الظرف / غلاف الأسئلة','كتاب الشكر والتقدير','env-9','t10'])need(library,m,'card-template-library.js');
const count=id=>{const m=library.match(new RegExp(`id:'${id}'[\\s\\S]*?models:\\[([\\s\\S]*?)\\]`));return m?(m[1].match(/\{id:/g)||[]).length:0};
for(const [id,n] of [['ration',10],['mawkib',4],['envelope',9],['thanks',6]])if(count(id)!==n)errors.push(`${id}: expected ${n} templates, got ${count(id)}`);
need(readWeb('card-templates-v2.html'),'جميع النماذج المتفق عليها','card-templates-v2.html');
need(readWeb('card-templates.html'),'card-templates-v2.html','card-templates.html');

for(const [file,markers] of Object.entries({
 'ration-card.html':['اسم رب العائلة','رقم البطاقة التموينية','ملاحظة أسفل الكارت','85.6 × 54','value="t10"',"renderQr(q('rationNumber').value)",'حفظ PDF','حفظ الوجه والظهر'],
 'mawkib-cards.html':['85.6 × 54','qrcode_UTF8.js','اسم المسؤول','رقم الهاتف','حفظ PDF','طباعة'],
 'thanks-letter.html':['كتاب شكر وتقدير','الجهة المانحة','اسم المكرَّم','حفظ PDF','طباعة','نموذج ذهبي رسمي'],
 'envelope-agreement-runtime.js':['التاريخ:','اليوم:','ورق A5 — غلاف فقط','ورق A4 — غلاف فقط','ليست أظرفًا قياسية']
}))for(const m of markers)need(readWeb(file),m,file);

const security=readWeb('app-security-runtime.js');
for(const m of ['MAIN_USERNAME','MAX_DEVICES=5','secureGet','secureSet','biometricStatus','biometricAuth','تسجيل الدخول بالبصمة','قفل الآن','إدارة الأجهزة (٥)','AbuBassamNativeBackPress','OFFLINE_GRACE_MS'])need(security,m,'app-security-runtime.js');
const native=fs.readFileSync(path.join(root,'index.js'),'utf8');
for(const m of ['expo-local-authentication','expo-secure-store','SecureStore.getItemAsync','SecureStore.setItemAsync','LocalAuthentication.authenticateAsync','ANDROID_BRIDGE','BackHandler.exitApp','deviceInfo'])need(native,m,'index.js');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
for(const dep of ['expo-local-authentication','expo-secure-store','expo-screen-capture'])if(!pkg.dependencies?.[dep])errors.push(`Missing native dependency: ${dep}`);
const appConfig=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8')).expo;
if(appConfig.android.package!=='com.abubassam.librarycamera3')errors.push('Unexpected Android package');
if(appConfig.version!=='4.3.2'||appConfig.android.versionCode!==432)errors.push('Unexpected version metadata');

const projectText=fs.readdirSync(web).filter(n=>/\.(?:html|js)$/i.test(n)&&n!=='supabase-2.58.0.js').map(n=>readWeb(n)).join('\n');
for(const forbidden of ['api.telegram.org/bot','service_role','sb_secret_','BEGIN '+'PRIVATE KEY'])if(projectText.includes(forbidden))errors.push(`Forbidden secret marker found: ${forbidden}`);
if(/Ahmed Hassan|أحمد حسن|facebook\.com/i.test(projectText))errors.push('Project contains previous author/social link');
if(!projectText.includes('أكرم حاتم الغزالي')&&!projectText.includes('Akram Hatem Al-Ghazali'))errors.push('Approved programmer identity is missing');

const agents=fs.readFileSync(path.join(root,'AGENTS.md'),'utf8');
for(const m of ['كل بند تم تدقيقه','تم ✅','ناقص ⚠️','غير موجود ❌','يحتاج تحقق 🔍','المرونة العامة معطلة','الباركود والكروت'])need(agents,m,'AGENTS.md');

if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write(`Project checks passed (${required.length} required assets; native touch; Barcode & Cards grouping; templates; questions; envelopes; certificates; security/native integration).\n`);
