'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const studio=read('web/cards-studio-runtime.js'),editor=read('web/a4-card-sheet-editor-v2-runtime.js');
new vm.Script(studio);new vm.Script(editor);
function cut(code,start,end){
 const i=code.indexOf(start),j=code.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,'Missing print source '+start);
 return code.slice(i,j)
}
const layout=cut(studio,'function printGeometry(','\nfunction queueCount(');
const printing=cut(studio,'function printDocument(){','\nfunction recordHistory(');
const status={textContent:''};
let jobs=[{id:'first',width:85.6,height:53.98},{id:'second',width:85.6,height:53.98}];
const state={output:'cr80',sides:'both',width:54,height:85.6,gap:2,marginX:7,marginY:5,bleed:1,flip:'horizontal',copies:1};
const print=new Function('state','expandedJobs','cardHtml','fullPrintCss','freeLayoutCss','cap','$','queueCount','validatePrintBarcodes',
 layout+'\n'+printing+'\nreturn {printGeometry,printDocument,renderStatus,a4SheetRows,duplexSheetSlots}')(
 state,()=>jobs,(model,side)=>'<div data-id="'+model.id+'" data-side="'+side+'"></div>',
 ()=>'.print{}',()=>'',(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0)),()=>status,()=>jobs.length,()=>true
);
assert.deepEqual(print.printGeometry(jobs),{w:85.6,h:53.98});
let html=print.printDocument();
assert.match(html,/@page\{size:85\.6mm 53\.98mm;margin:0\}/);
assert.match(html,/data-id="first"/);
assert.match(html,/data-id="second"/);
print.renderStatus();
assert.match(status.textContent,/85\.6 × 53\.98 ملم/,'Queue dimensions must override active card');
jobs=[{...jobs[0]},{id:'portrait',width:54,height:85.6}];
assert.throws(()=>print.printDocument(),/مقاسات مختلفة/,'No silent stretch of mixed-size queued cards');
print.renderStatus();
assert.match(status.textContent,/تعذر تخطيط الطباعة/);
jobs=[{width:85.6,height:53.98}];
state.output='a4-duplex';state.sides='both';
html=print.printDocument();
assert.match(html,/data-duplex-side="front" data-duplex-flip="horizontal"/);
assert.match(html,/data-duplex-side="back" data-duplex-flip="horizontal"/);
assert.equal((html.match(/class="duplex-page"/g)||[]).length,2);
state.flip='vertical';
html=print.printDocument();
assert.match(html,/data-duplex-flip="vertical"/);
state.sides='front';
html=print.printDocument();
assert.equal((html.match(/class="duplex-page"/g)||[]).length,1);
assert.doesNotMatch(html,/data-duplex-side="back"/);
jobs=[{width:Infinity,height:54}];
assert.throws(()=>print.printDocument(),/غير صالح/);
const integrity=cut(editor,'function duplexCells(page){','function run(){');
const window={AbuBassamSecurity:{role:()=> 'secondary'},AbuBassamPermissions:{can:()=>true}};
const api=new Function('allPages','getG','W','H','window',integrity+
 '\nreturn {checkDuplexAlignment,canFinalize,duplexCells}')(
 doc=>doc.pages,el=>el.geometry,210,297,window
);
const card=(x,y,w=85.6,h=53.98,r=0)=>({classList:{contains:s=>s==='pair-card'},geometry:{x,y,w,h,r}});
const empty=()=>({classList:{contains:s=>s==='duplex-empty'}});
const page=(side,flip,cells)=>({classList:{contains:s=>s==='duplex-page'},dataset:{duplexSide:side,duplexFlip:flip},children:cells});
const horizontal={pages:[
 page('front','horizontal',[card(18.4,120),card(106,120)]),
 page('back','horizontal',[card(18.4,120),card(106,120)])
]};
assert.equal(api.checkDuplexAlignment(horizontal),true,'Default physical positions must mirror');
horizontal.pages[1].children[1].geometry.x+=2;
assert.throws(()=>api.checkDuplexAlignment(horizontal),/فقدت بطاقة محاذاة/);
horizontal.pages[1].children[1].geometry.x-=2;
horizontal.pages[0].children[0].geometry.r=22;
assert.throws(()=>api.checkDuplexAlignment(horizontal),/فقدت بطاقة محاذاة/);
horizontal.pages[1].children[1].geometry.r=-22;
assert.equal(api.checkDuplexAlignment(horizontal),true,'Equal and opposing rotations retain print alignment');
const vertical={pages:[
 page('front','vertical',[card(18.4,93.52),empty(),card(18.4,149.5),card(106,149.5)]),
 page('back','vertical',[card(18.4,93.52),card(106,93.52),card(18.4,149.5),empty()])
]};
assert.equal(api.checkDuplexAlignment(vertical),true,'Vertical flip must mirror rows including blank slots');
vertical.pages[1].children[3]=card(106,149.5);
assert.throws(()=>api.checkDuplexAlignment(vertical),/اختلاف موقع بطاقة/);
assert.equal(api.checkDuplexAlignment({pages:[page('front','horizontal',[card(18.4,120)])]}),true,'Front-only prints remain possible');
assert.equal(api.checkDuplexAlignment({pages:[page('back','horizontal',[card(18.4,120)])]}),true,'Back-only prints remain possible');
assert.equal(api.checkDuplexAlignment({pages:[]}),true,'Other A4 document layouts pass unchanged');
assert.throws(()=>api.checkDuplexAlignment({pages:[page('front','horizontal',[card(18,120)]),page('front','horizontal',[card(106,120)]),page('back','horizontal',[card(106,120)])]}),/غير متساوية/);
assert.equal(api.canFinalize('print'),true);
assert.equal(api.canFinalize('pdf'),true);
window.AbuBassamPermissions.can=k=>k!=='pdfSave';
assert.equal(api.canFinalize('print'),true);
assert.equal(api.canFinalize('pdf'),false,'Revoked PDF permission blocks stale A4 editor');
window.AbuBassamPermissions.can=k=>k!=='printA4';
assert.equal(api.canFinalize('print'),false);
assert.equal(api.canFinalize('pdf'),false);
window.AbuBassamSecurity.role=()=> 'owner';
assert.equal(api.canFinalize('pdf'),true);
assert.match(editor,/if\(!canFinalize\(job\.kind\)\)/);
assert.match(editor,/try\{checkDuplexAlignment\(doc\)\}/);
console.log('Print geometry regression passed: queued CR80 dimensions, A4 flip metadata, duplex slot mirroring with blank cells, manual edit misalignment/rotation, one-sided modes and late permission revocation.');
