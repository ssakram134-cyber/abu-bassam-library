const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..'),web=path.join(root,'web'),errors=[];
const read=name=>fs.readFileSync(path.join(web,name),'utf8');
const need=(src,m,label)=>{if(!src.includes(m))errors.push(`${label}: missing ${m}`)};
const forbid=(src,m,label)=>{if(src.includes(m))errors.push(`${label}: forbidden ${m}`)};
const required=['feature-recovery-runtime.js','child-card-templates-runtime.js','card-models-runtime.js','standalone-card-models-runtime.js','strict-workflow-runtime.js','standalone-fold-runtime.js','device-reconcile-runtime.js','question-type-runtime.js','envelope-preload-runtime.js','envelope-tools-runtime.js','card-templates-v2.html','card-template-library.js','ration-card.html','mawkib-cards.html','thanks-letter.html','certificates.html','envelopes.html','envelope-agreement-runtime.js','questions-paper-runtime.js','questions-gesture-runtime.js','productivity-tools-runtime.js','device-name-runtime.js'];
required.forEach(file=>{if(!fs.existsSync(path.join(web,file)))errors.push(`Missing latest feature asset: ${file}`)});

const device=read('device-name-runtime.js');
for(const m of ['global-flex-runtime.js','loadGlobalFlex'])forbid(device,m,'device-name-runtime.js');
for(const m of ['feature-recovery-runtime.js','child-card-templates-runtime.js','card-models-runtime.js','standalone-card-models-runtime.js','strict-workflow-runtime.js','standalone-fold-runtime.js','device-reconcile-runtime.js'])need(device,m,'device-name-runtime.js');

const gestures=read('questions-gesture-runtime.js');
need(gestures,'__ABU_QUESTION_GESTURES_DISABLED__','questions-gesture-runtime.js');
for(const m of ['touchstart','touchmove','pointerdown','pointermove','abuScale','abuMoveX','abuMoveY'])forbid(gestures,m,'questions-gesture-runtime.js');
const paper=read('questions-paper-runtime.js');
for(const m of ['A4P','A4L','A5P','A5L','custom','mm','cm'])need(paper,m,'questions-paper-runtime.js');
forbid(paper,'questions-gesture-runtime.js','questions-paper-runtime.js');

const productivity=read('productivity-tools-runtime.js');
for(const m of ['الأسئلة والظروف','prodModeQuestions','prodPaneQuestions','abuModeEnvelope','abuPaneEnvelope','envelopeFrame','src="envelopes.html"','question-type-runtime.js','questions-ar.html'])need(productivity,m,'productivity-tools-runtime.js');
for(const m of ['prodModeCertificate','prodPaneCertificate','src="certificates.html"'])forbid(productivity,m,'productivity-tools-runtime.js');

const recovery=read('feature-recovery-runtime.js');
for(const m of ['abuCardsTemplatesBtn','abuSectionTemplatesBtn','openSectionTemplates','card-templates-v2.html#',"addCardTool(types,'ration'", "addCardTool(types,'mawkib'", "addCardTool(types,'certificate'", "addCardTool(types,'thanks'",'certificates.html','recoveryMessage'])need(recovery,m,'feature-recovery-runtime.js');
for(const section of ['personal','child','login','wifi','qr','ration','mawkib','certificate','thanks'])need(recovery,`${section}:{title:`,`feature-recovery-runtime.js section ${section}`);
for(const m of ["addCardTool(types,'envelope'","envelope:{title:"])forbid(recovery,m,'feature-recovery-runtime.js');

const library=read('card-template-library.js');
for(const m of ['AbuBassamCardTemplateLibrary','باج الروضة والمدرسة','البطاقة التموينية','كروت المواكب الحسينية','شهادات التقدير','personal-5','child-future','login-10','wifi-3','qr-4','cert-10','t10'])need(library,m,'card-template-library.js');
forbid(library,"id:'envelope'",'card-template-library.js');
const groupCount=id=>{const m=library.match(new RegExp(`id:'${id}'[\\s\\S]*?models:\\[([\\s\\S]*?)\\]`));return m?(m[1].match(/\{id:/g)||[]).length:0};
for(const [id,count] of [['personal',5],['child',10],['login',10],['wifi',3],['qr',4],['ration',1],['mawkib',10],['certificate',10],['thanks',6]])if(groupCount(id)!==count)errors.push(`${id} templates: expected ${count}, got ${groupCount(id)}`);

const child=read('child-card-templates-runtime.js');
for(const m of ['child-clouds','child-hearts','child-nature','child-space','child-rainbow','child-garden','child-shapes','child-balloons','child-board','child-future','templateCss','installPicker'])need(child,m,'child-card-templates-runtime.js');
const ids=child.match(/id:'child-[a-z]+'/g)||[];if(new Set(ids).size!==10)errors.push(`child templates expected 10 unique, got ${new Set(ids).size}`);
const cardModels=read('card-models-runtime.js');
for(const m of ['personal-5','login-10','wifi-3','qr-4','cssPersonal','cssLogin','cssWifi','cssQr','AbuBassamCardModels','printCss'])need(cardModels,m,'card-models-runtime.js');
const standaloneModels=read('standalone-card-models-runtime.js');
for(const m of ['MAWKIB_EXTRA_CSS','t5#front','t6#front','t7#front','t8#front','t9#front','t10#front','ration(doc)','o.value!==\'t1\'','mawkib(doc,win)'])need(standaloneModels,m,'standalone-card-models-runtime.js');

const strict=read('strict-workflow-runtime.js');
for(const m of ['abu-fold-btn','abu-child-collapsed','RATION_CSS','MAWKIB_CSS','foldIframeSection','المعلومات والبيانات','الطباعة والتصدير','certificates.html'])need(strict,m,'strict-workflow-runtime.js');
const standaloneFold=read('standalone-fold-runtime.js');
for(const m of ['__ABU_STANDALONE_FOLD_V1__','foldTemplate','foldThanksExport','النماذج','الطباعة والتصدير','ration-card.html','mawkib-cards.html','thanks-letter.html'])need(standaloneFold,m,'standalone-fold-runtime.js');

const thanks=read('thanks-letter.html');
for(const m of ['1 — الإطار الملكي','2 — الشريط الجانبي','3 — الوسام المركزي','4 — الترويسة الأكاديمية','5 — اللوحة الهندسية','6 — الرسمي المبسط','.t2:before{inset:0 auto 0 0','.t3 .title{display:inline-block','.t4:before{inset:0 0 auto 0','.t5:before{inset:auto -120px','.t6 .title{text-align:right'])need(thanks,m,'thanks-letter.html real layouts');

const qtypes=read('question-type-runtime.js');
for(const m of ['blanks','brackets','definitions','enumeration','points','multiple','truefalse','short','المستوى السهل','المستوى المتوسط','المستوى الصعب','التسلسل','الحفظ','الحديث الشريف','التلاوة','العقائد والعبادات','المعاني','السيرة','الآداب الإسلامية','abu-qtype-select'])need(qtypes,m,'question-type-runtime.js');

const envelopes=read('envelopes.html');
for(const m of ['data-studio-mode="envelope"','envelope-preload-runtime.js','design-studio-runtime.js','envelope-agreement-runtime.js','envelope-tools-runtime.js'])need(envelopes,m,'envelopes.html');
const envTools=read('envelope-tools-runtime.js');
for(const m of ['undo','redo','newPage','signature','prayer','format','saveNow','PAGES_KEY','TEMPLATE_NAMES','blankPage(base=snapshot())','unit:base.unit','w:Number(base.w)','h:Number(base.h)','قوالب','PDF','طباعة'])need(envTools,m,'envelope-tools-runtime.js');
const envAgreement=read('envelope-agreement-runtime.js');
for(const m of ['التاريخ:','اليوم:','ورق A5 — غلاف فقط','ورق A4 — غلاف فقط','ليست أظرفًا قياسية'])need(envAgreement,m,'envelope-agreement-runtime.js');

const cards=read('cards-studio-runtime.js');
for(const m of ['رقم هاتف ولي الأمر','روضة أطفال القادسية','childInstitution(data)'])need(cards,m,'cards-studio-runtime.js');
const ration=read('ration-card.html');for(const m of ['رقم البطاقة التموينية','renderQr(q(\'rationNumber\').value)','CR80 — كارت مباشر','حفظ الوجه والظهر'])need(ration,m,'ration-card.html');
const mawkib=read('mawkib-cards.html');for(const m of ['اسم المسؤول','رقم الهاتف','qrcode_UTF8.js','حفظ PDF'])need(mawkib,m,'mawkib-cards.html');

const reconcile=read('device-reconcile-runtime.js');for(const m of ['dedupe(rows)','CURRENT_ID','displayName(row)','هذا الجهاز','تسمية الجهاز','abu_bassam_devices','onSessionChanged'])need(reconcile,m,'device-reconcile-runtime.js');
const migration=fs.readFileSync(path.join(root,'supabase','migrations','202609210001_device_reconciliation.sql'),'utf8');
for(const m of ['abu_bassam_register_device','abu_bassam_touch_device','abu_bassam_manage_device','role=\'owner\'','30 days','DEVICE_LIMIT_REACHED','unique index'])need(migration,m,'device migration');

for(const file of ['feature-recovery-runtime.js','child-card-templates-runtime.js','card-models-runtime.js','standalone-card-models-runtime.js','strict-workflow-runtime.js','standalone-fold-runtime.js','device-reconcile-runtime.js','question-type-runtime.js','envelope-preload-runtime.js','envelope-tools-runtime.js','envelope-agreement-runtime.js','card-template-library.js','questions-paper-runtime.js','questions-gesture-runtime.js','productivity-tools-runtime.js','device-name-runtime.js']){
 try{new vm.Script(read(file),{filename:file})}catch(error){errors.push(`${file}: ${error.message}`)}
}
for(const file of ['card-templates-v2.html','card-templates.html','ration-card.html','mawkib-cards.html','thanks-letter.html','envelopes.html']){const source=read(file),scripts=/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;let match,index=0;while((match=scripts.exec(source))){index++;if(!match[1].trim())continue;try{new vm.Script(match[1],{filename:`${file}#${index}`})}catch(error){errors.push(`${file} inline script ${index}: ${error.message}`)}}}
if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write('Strict canonical audit passed: exact agreed model counts (personal 5, child 10, login 10, Wi-Fi 3, QR 4, ration 1, mawkib 10, certificates 10), real layout runtimes, foldable controls, Questions & Envelopes, and device reconciliation.\n');
