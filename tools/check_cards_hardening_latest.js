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
const previews=read('tools/render_card_previews.py');
for(const [name,src] of Object.entries({studio,design,layouts,recovery,preload,ration,mawkib,thanks,student})){
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
need(studio,"student-thanks-cards.html",'student thanks tool must be canonical');
reject(studio,"رقم خط النقل",'obsolete child transport-line field returned');
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
