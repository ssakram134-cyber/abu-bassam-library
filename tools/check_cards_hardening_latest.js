const fs=require('fs');
function read(p){if(!fs.existsSync(p))throw new Error(`missing ${p}`);return fs.readFileSync(p,'utf8')}
function need(src,token,label){if(!src.includes(token))throw new Error(`cards canonical check failed: ${label}`)}
function reject(src,token,label){if(src.includes(token))throw new Error(`cards canonical check failed: ${label}`)}
for(const obsolete of ['web/cards-hardening-runtime.js','web/cards-hardening-fixes-runtime.js','web/cards-final-audit-runtime.js','web/cards-section-upgrades-runtime.js']){
  if(fs.existsSync(obsolete))throw new Error('obsolete patch runtime still exists: '+obsolete)
}
const studio=read('web/cards-studio-runtime.js');
const design=read('web/design-studio-runtime.js');
const layouts=read('web/standalone-card-layouts-plus-runtime.js');
const recovery=read('web/feature-recovery-runtime.js');
const preload=read('web/envelope-preload-runtime.js');
const ration=read('web/ration-card.html');
const mawkib=read('web/mawkib-cards.html');
const thanks=read('web/thanks-letter.html');
const student=read('web/student-thanks-cards.html');
const freeLayout=read('web/card-free-layout-runtime.js');
const a4=read('web/a4-card-sheet-editor-v2-runtime.js');
const previews=read('tools/render_card_previews.py');
for(const [name,src] of Object.entries({studio,design,layouts,recovery,preload,ration,mawkib,thanks,student,freeLayout,a4})){
  if(name!=='preload'&&name!=='ration'&&name!=='mawkib'&&name!=='thanks'&&name!=='student')new Function(src)
}
need(studio,"function requireOutputPermission()",'output-specific permissions must be canonical');
need(studio,"cardsA4Layout','printA4",'A4 output requires layout and A4 print permissions');
need(studio,"printCardDirect",'CR80 output permission is missing');
need(studio,"cardsExportPdf','pdfCreate','pdfSave",'PDF permission set is missing');
need(studio,"cardsExportImage','imageExport','exportOutsideApp",'image export permission set is missing');
need(studio,"cardsEditText",'text editing permission is missing');
need(studio,"cardsImportImage",'image import permission is missing');
need(studio,"scanBarcodeGallery",'gallery barcode action must be canonical');
need(studio,"input.setAttribute('capture','environment')",'camera barcode fallback must restore rear-camera capture after gallery use');
need(studio,"CardsStudio.flipPhoto('x')",'photo tools must expose horizontal flip');
need(studio,"CardsStudio.flipPhoto('y')",'photo tools must expose vertical flip');
need(studio,'photoTransformCss','photo preview and print must share flip/rotation transform');
need(studio,'flipPhoto,focusCrop','photo flip must be part of CardsStudio API');
reject(studio,"photoTransform={zoom:1,x:0,y:0,rotate:0};",'all photo transform resets must initialize flip state');
reject(freeLayout,"el.dataset.abuLayoutRole==='photo'||el.dataset.abuLayoutRole==='qr'",'photo frame aspect ratio must not be locked');
need(freeLayout,"lock=el.dataset.abuLayoutRole==='qr'||el.dataset.abuLayoutRole==='callqr'",'QR frames must retain aspect ratio while photo crop stays free');
need(studio,"/^\\d{8,15}$/.test(digits)?digits:''",'WhatsApp QR must reject obviously invalid short numbers');
need(studio,"function normalizeDigits(value)",'phone QR must normalize Arabic and Persian digits');
need(studio,"replace(/[٠-٩]/g",'Arabic-Indic phone digits must be supported');
need(studio,"replace(/[۰-۹]/g",'Persian phone digits must be supported');
need(studio,"if(d.kind==='phone')return'tel:'+phoneDigits(content)",'generic phone QR must use normalized digits');
need(studio,"qrSvg('tel:'+phoneDigits(emergency))",'child emergency call QR must normalize phone digits');
need(studio,"student-thanks-cards.html",'student thanks tool must be canonical');
reject(studio,"رقم خط النقل",'obsolete child transport-line field returned');
reject(studio,"d.line",'obsolete child transport-line data reference returned');
reject(studio,"NOTE:خط النقل",'obsolete child transport-line payload returned');
need(studio,"URL:https://wa.me/",'child QR must expose guardian WhatsApp contact');
need(studio,"child:{name:'',age:'',address:",'child badge must retain an explicit age field');
need(studio,"field('العمر (بالسنوات)','age','number')",'child badge form must expose age input');
need(studio,"'العمر: '+(d.age||'')",'child QR payload must include age');
need(studio,"${row('العمر',d.age?String(d.age)+' سنوات':'')}",'child badge back must display age');
need(studio,"vcardText",'vCard payload values must be escaped');
need(studio,"qrcode.stringToBytesFuncs['UTF-8']",'card QR generation must force UTF-8');
const baseModels=read('web/card-models-runtime.js'),plusModels=read('web/card-models-plus-runtime.js'),childModels=read('web/child-card-templates-runtime.js');
for(const [name,src] of [['base card models',baseModels],['extended card models',plusModels],['child templates',childModels]]){reject(src,'new MutationObserver',name+' must not install a global DOM observer');reject(src,'setInterval(',name+' must not poll continuously for runtime readiness')}
need(baseModels,"abu-cards-rendered",'base card models must use explicit card render events');
need(childModels,"abu-cards-rendered",'child templates must use explicit card render events');
need(plusModels,"abu-runtime-loaded",'extended card models must use runtime load events');
need(studio,"editor.openPrint(html,commit)",'A4 print history must wait for editor confirmation');
need(studio,"editor.openPdf(name,html,commit)",'A4 PDF history must wait for editor confirmation');
need(studio,"await Android.requestOutput('printHtml',{html});commit()", 'CR80 print history must wait for native confirmation');
need(studio,"await Android.requestOutput('savePdfHtml',{name,html});commit()", 'CR80 PDF history must wait for native confirmation');
need(studio,"await Android.requestOutput('savePagesToGallery'", 'gallery history must wait for native confirmation');
need(a4,"await Android.requestOutput('savePdfHtml',{name:j.name,html});committed(j)",'A4 PDF history must wait for native confirmation');
need(a4,"await Android.requestOutput('printHtml',{html});committed(j)",'A4 print history must wait for native confirmation');
reject(studio,"}commit();if(window.Android&&Android.printHtml)",'CR80 print history must not be committed before dispatch');
need(studio,"Android.printHtml(html);commit();return result",'CR80 print history must commit only after native dispatch');
reject(studio,"}commit();if(window.Android&&Android.savePdfHtml)",'CR80 PDF history must not be committed before dispatch');
need(studio,"Android.savePdfHtml(name,html);commit();return result",'CR80 PDF history must commit only after native dispatch');
reject(studio,"recordHistory('حفظ '+labels.join(' و')+' في المعرض');if(window.Android&&Android.savePagesToGallery)",'gallery history must not be committed before output dispatch');
need(studio,"'image/png');else pages.forEach((data,index)=>setTimeout(()=>saveImage",'gallery output must dispatch before history is recorded');
need(a4,"onCommit:typeof onCommit==='function'?onCommit:null",'A4 editor must retain a commit callback');
need(a4,"committed(j)",'A4 editor must record only after output dispatch');
need(a4,"Object.assign(el.style,{position:'absolute',margin:'0'})",'A4 editor must preserve moved card positioning in final output');
need(a4,"Object.assign(p.style,{position:'relative',display:'block',padding:'0',overflow:'hidden',boxShadow:'none'})",'A4 output page must retain the editor coordinate system');
reject(studio,"5*h+4*gap+2*my>297",'duplex layout must not hard-code five rows');
need(studio,"duplexRows=Math.floor((297-2*my+gap)/(h+gap))",'duplex rows must be derived from current card height and margins');
need(studio,"capacity=duplexRows*2",'duplex page capacity must follow the dynamic row count');
need(studio,"Array(capacity).fill(null)",'duplex alignment must preserve empty physical slots');
need(studio,"backSlots.push(slots[row*2+1],slots[row*2])",'horizontal duplex must mirror columns including empty slots');
need(studio,"for(let row=duplexRows-1;row>=0;row--)backSlots.push(slots[row*2],slots[row*2+1])",'vertical duplex must mirror the full physical row grid');
need(studio,"duplex-empty{visibility:hidden!important}",'duplex spacer slots must remain invisible while preserving alignment');
need(a4,":scope > .cut:not(.duplex-empty)",'A4 editor must ignore duplex spacer slots');
need(studio,"rows=Math.max(1,Math.floor((297-2*my+gap)/(h+gap)))",'A4 page estimate must use the current card row capacity');
need(studio,"RESET_BACKUP_KEY='abuBassamCardsResetBackupV1'",'card reset must keep a verified local backup');
need(studio,"localStorage.getItem(RESET_BACKUP_KEY)!==json",'card reset backup must be verified before deletion');
need(studio,'restoreResetBackup','card reset backup must be recoverable');
need(studio,"requireCard('backupRestore')",'card reset restore must be permission-gated');
const matrix=read('tools/qr_matrix.js');
need(matrix,"qrcode.stringToBytesFuncs['UTF-8']",'QR matrix helper must force UTF-8');
reject(previews,"رقم خط النقل",'preview tool must not restore obsolete child transport-line field');
need(previews,"هاتف ولي الأمر:",'preview tool must show guardian phone on child back');
need(layouts,"abuBassamStandaloneCardLayoutV2",'standalone free-layout persistence is missing');
need(layouts,"safeTextTarget",'standalone safe text editing is missing');
need(layouts,"cardsEditImage",'standalone image edit permission is missing');
need(layouts,"abu-recovery-frame-load",'standalone layouts must use explicit iframe lifecycle events');
reject(layouts,"new MutationObserver(watch)",'standalone layout global observer returned');
need(design,"Array.from({length:10},(_,i)=>envelopeTemplate(i))",'system envelope set must include env-10');
need(design,"cardsManageCustomTemplates",'custom template permission is missing');
need(design,"cardsTemplatesDelete",'template delete permission is missing');
need(design,"cardsEditText",'Design Studio text permission is missing');
need(design,"cardsExportPdf",'Design Studio PDF permission is missing');
need(design,"cardsExportImage",'Design Studio image export permission is missing');
need(preload,"item.id==='env-10'",'legacy custom env-10 records must still be removed before system templates load');
reject(preload,"state.templateId==='env-10')state.templateId='env-1'",'canonical env-10 must not be downgraded');
for(const [name,src] of [['ration',ration],['mawkib',mawkib],['thanks',thanks],['student',student]]){
  need(src,"function canCard(key)",name+' must enforce permissions in its own source');
  need(src,"cardsPrint','printCards','printGeneral",name+' print guard missing');
  need(src,"cardsExportPdf','pdfCreate','pdfSave",name+' PDF guard missing')
}
need(ration,"cardsExportImage','imageExport','exportOutsideApp",'ration image export guard missing');
for(const id of ['t7','t8','t9','t10'])need(thanks,`value="${id}"`,`thanks template ${id} missing from source`);
need(recovery,"abu-recovery-frame-load",'recovery host must emit explicit iframe lifecycle event');
need(recovery,"cardsExportImage','imageExport','exportOutsideApp",'recovery host image export guard missing');
console.log('canonical cards checks passed: no patch runtimes, fail-closed permissions live in source, env-10 and thanks templates are canonical, and standalone editing uses explicit iframe lifecycle events.');
