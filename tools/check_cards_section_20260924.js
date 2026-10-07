const fs=require('fs'),vm=require('vm');
function read(p){if(!fs.existsSync(p))throw new Error('missing '+p);return fs.readFileSync(p,'utf8')}
function need(src,token,label){if(!src.includes(token))throw new Error('cards check failed: '+label)}
for(const p of ['web/cards-section-upgrades-runtime.js','web/cards-hardening-runtime.js','web/cards-hardening-fixes-runtime.js','web/cards-final-audit-runtime.js'])if(fs.existsSync(p))throw new Error('cards check failed: obsolete patch runtime returned '+p);
const loader=read('web/productivity-tools-runtime.js'),studio=read('web/cards-studio-runtime.js'),freeLayout=read('web/card-free-layout-runtime.js'),a4=read('web/a4-card-sheet-editor-v2-runtime.js'),standalone=read('web/standalone-card-layouts-plus-runtime.js'),models=read('web/card-models-runtime.js'),plus=read('web/card-models-plus-runtime.js'),library=read('web/card-template-library.js');
for(const src of [loader,studio,freeLayout,a4,standalone,models,plus])new Function(src);
const sandbox={window:{}};vm.runInNewContext(library,sandbox);const groups=sandbox.window.AbuBassamCardTemplateLibrary;
const expected={personal:10,child:10,login:10,wifi:10,qr:10,ration:10,mawkib:4,'student-thanks':10,envelope:10,certificate:10,thanks:10};
for(const [id,count] of Object.entries(expected)){const g=groups.find(x=>x.id===id);if(!g||g.models.length!==count)throw new Error(`cards check failed: ${id} expected ${count}, got ${g?.models?.length??'missing'}`)}
for(const f of ['card-models-plus-runtime.js','standalone-card-layouts-plus-runtime.js','card-free-layout-runtime.js','a4-card-sheet-editor-v2-runtime.js'])need(loader,f,'loader '+f);
for(const id of ['personal-6','personal-7','personal-8','personal-9','personal-10','wifi-4','wifi-5','wifi-6','wifi-7','wifi-8','wifi-9','wifi-10','qr-5','qr-6','qr-7','qr-8','qr-9','qr-10'])need(plus,id,'extended card model '+id);
need(plus,'api.models=function(type){return [...original.models(type),...(EXTRA[type]||[])]','extended model API must expose all models');
need(loader,'async function loadAdvancedRuntime()','advanced runtime loader must be sequential');
need(studio,'scanBarcodeGallery','gallery barcode source action');
need(studio,'student-thanks-cards.html','student thanks source route');
need(studio,"cardsPrint','printCards','printGeneral",'print guard');
need(studio,"cardsExportPdf','pdfCreate','pdfSave",'PDF guard');
need(studio,"cardsExportImage','imageExport','exportOutsideApp",'image export guard');
need(studio,"cardsA4Layout','printA4",'A4 output guard');
need(studio,'printCardDirect','CR80 output guard');
need(freeLayout,'تحرير الباج','explicit card edit mode');
need(freeLayout,'abuBassamCardEditModeV1','card edit mode persistence');
need(a4,"DIRS=['nw','n','ne','e','se','s','sw','w']",'eight resize handles');
need(a4,"page.classList.contains('duplex-page'))return [...page.querySelectorAll(':scope > .cut:not(.duplex-empty)')]",'duplex A4 cards must be selectable while spacer slots stay non-editable');
need(a4,'function rotate','rotation handle');
need(standalone,'safeTextTarget','standalone text safety');
need(standalone,'abuBassamStandaloneCardLayoutV2','standalone editor persistence');
console.log('cards section checks passed: canonical permissions, exact model counts, CR80/A4 output controls, free layout, A4 editor V2, and no patch runtimes.');
