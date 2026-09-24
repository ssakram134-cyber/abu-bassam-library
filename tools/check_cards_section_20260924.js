const fs=require('fs');
function read(p){if(!fs.existsSync(p))throw new Error(`missing ${p}`);return fs.readFileSync(p,'utf8')}
function need(src,token,label){if(!src.includes(token))throw new Error(`cards check failed: ${label}`)}
const loader=read('web/productivity-tools-runtime.js');
const upgrades=read('web/cards-section-upgrades-runtime.js');
const plus=read('web/card-models-plus-runtime.js');
const standalone=read('web/standalone-card-layouts-plus-runtime.js');
const a4=read('web/a4-card-sheet-editor-v2-runtime.js');
const library=read('web/card-template-library.js');
const student=read('web/student-thanks-cards.html');
const standaloneBase=read('web/standalone-card-models-runtime.js');
for(const src of [upgrades,plus,standalone,a4,standaloneBase])new Function(src);
for(const f of ['card-models-plus-runtime.js','cards-section-upgrades-runtime.js','standalone-card-layouts-plus-runtime.js'])need(loader,f,`loader ${f}`);
need(upgrades,'a4-card-sheet-editor-v2-runtime.js','refined A4 editor must be loaded after base hooks');
need(upgrades,'data-field="line"','child transport line must be cleared/removed');
need(upgrades,'قراءة من الاستديو','gallery barcode button');
need(upgrades,'.cs-login-value .cs-cap','uppercase letters red in login card');
need(upgrades,'student-thanks-cards.html','student thanks section route');
need(upgrades,'card-models-runtime.js','base card model dependency');
for(const id of ['personal-10','wifi-10','qr-10'])need(plus,id,`real extra model ${id}`);
for(let i=1;i<=10;i++){need(library,`personal-${i}`,`personal model ${i}`);need(library,`login-${i}`,`login model ${i}`)}
for(const id of ['child-clouds','child-future','wifi-10','qr-10'])need(library,id,`catalog model ${id}`);
for(let i=1;i<=10;i++)need(standaloneBase,`'t${i}'`,`standalone model t${i}`);
need(standaloneBase,'student-thanks-cards.html','student template hash routing');
need(standalone,'card.t10','distinct ration/mawkib layout t10');
need(standalone,'abuMawkibOutput','mawkib A4/CR80 selector');
need(a4,'a4v2-count','A4 copy stepper');
need(a4,"DIRS=['nw','n','ne','e','se','s','sw','w']",'eight A4 resize handles');
need(a4,'function rotate','A4 rotation handle');
need(a4,'function copies','A4 quantity duplication');
need(a4,'function isA4','A4-only editor guard');
need(a4,"page.classList.contains('pair-page')",'A4 pair pages');
need(a4,"querySelectorAll('.pair-card')",'every A4 card must be individually editable');
need(a4,'const snapshots=allPages(doc).map','measure original positions before editor layout');
need(library,"id:'student-thanks'",'student thanks catalog section');
for(let i=1;i<=10;i++)need(student,`value="t${i}"`,`student thanks template ${i}`);
need(student,'اسم التلميذ','student name field');need(student,'اسم المعلم','teacher field');need(student,'مدير المدرسة','principal field');
console.log('cards section 2026-09-24 checks passed');
