const fs=require('fs'),vm=require('vm');
function read(p){if(!fs.existsSync(p))throw new Error('missing '+p);return fs.readFileSync(p,'utf8')}
function need(src,token,label){if(!src.includes(token))throw new Error('cards check failed: '+label)}
for(const p of ['web/cards-section-upgrades-runtime.js','web/cards-hardening-runtime.js','web/cards-hardening-fixes-runtime.js','web/cards-final-audit-runtime.js'])if(fs.existsSync(p))throw new Error('cards check failed: obsolete patch runtime returned '+p);
const loader=read('web/productivity-tools-runtime.js'),studio=read('web/cards-studio-runtime.js'),freeLayout=read('web/card-free-layout-runtime.js'),a4=read('web/a4-card-sheet-editor-v2-runtime.js'),standalone=read('web/standalone-card-layouts-plus-runtime.js'),library=read('web/card-template-library.js');
for(const src of [loader,studio,freeLayout,a4,standalone])new Function(src);
const sandbox={window:{}};vm.runInNewContext(library,sandbox);const groups=sandbox.window.AbuBassamCardTemplateLibrary;
const expected={personal:5,child:10,login:10,wifi:3,qr:4,ration:10,mawkib:4,'student-thanks':10,envelope:10,certificate:10,thanks:10};
for(const [id,count] of Object.entries(expected)){const g=groups.find(x=>x.id===id);if(!g||g.models.length!==count)throw new Error(`cards check failed: ${id} expected ${count}, got ${g?.models?.length??'missing'}`)}
for(const f of ['card-models-plus-runtime.js','standalone-card-layouts-plus-runtime.js','card-free-layout-runtime.js','a4-card-sheet-editor-v2-runtime.js'])need(loader,f,'loader '+f);
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
need(a4,'function rotate','rotation handle');
need(standalone,'safeTextTarget','standalone text safety');
need(standalone,'abuBassamStandaloneCardLayoutV2','standalone editor persistence');
console.log('cards section checks passed: canonical permissions, exact model counts, CR80/A4 output controls, free layout, A4 editor V2, and no patch runtimes.');
