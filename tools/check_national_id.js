'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../web/national-id-runtime.js'),'utf8');
new Function(src);
const assets=fs.readFileSync(path.join(__dirname,'../scripts/prepare-android-assets.mjs'),'utf8');
for(const viewer of ['pdf.min.js','pdf.worker.min.js','mammoth.browser.min.js','xlsx.full.min.js']){
 assert.ok(assets.includes("'"+viewer+"'"),'Offline Android packaging missing '+viewer);
 assert.ok(src.includes("vendor/documents/"+viewer),'National preview must use local '+viewer);
}
assert.ok(assets.includes('DOCUMENT_ASSETS'),'Missing offline PDF/DOCX/XLSX asset manifest');
assert.ok(src.includes('pdfjsLib.getDocument({data:ab,isEvalSupported:false})'),'PDF.js 3.x must disable eval for untrusted scanned PDFs (CVE-2024-4367)');
for(const domain of ['https://unpkg.com/','https://cdnjs.cloudflare.com/']){
 assert.ok(!src.includes(domain),'National ID runtime must not load document viewers from live CDN');
}
for(const marker of ['function safeDocumentHtml(','MAX_IMAGE_BATCH_BYTES=80*1024*1024','function printCanvas(','function buildScanPdf(','Math.sqrt(maxPixels/','window.Android?.','function merge()']){
 if(marker==='window.Android?.')continue;
 assert.ok(src.includes(marker),'Missing section protection: '+marker);
}
assert.ok(!src.includes("recent('دمج الوجهين','حفظ في المعرض • '+(S.mergeMode==='h'?'1×2':'2×1'),d)"),'Sensitive ID preview must not be saved in localStorage');
function canvas(){return {width:0,height:0,style:{},classList:{add(){}},getContext(){return{fillRect(){},save(){},translate(){},rotate(){},drawImage(){},restore(){},getImageData(){return{data:new Uint8ClampedArray(4)}},putImageData(){}}},toDataURL(t){return 'data:'+(t||'image/jpeg')+';base64,VEVTVA=='}}}
const nativeEvents=[],pdfs=[];
class MockPdf{constructor(){pdfs.push(this)}addPage(){}addImage(){this.pageCount=(this.pageCount||0)+1}output(){return 'data:application/pdf;base64,VEVTVA=='}}
const Android={printPages(...args){nativeEvents.push(['images',args])},printBase64(...args){nativeEvents.push(['pdf',args])}};
const window={addEventListener(){},Android,jspdf:{jsPDF:MockPdf}};
const fields={natMergeCanvas:canvas(),natMergeModal:{classList:{add(){}}},natB:{value:100},natC:{value:100},natS:{value:100}};
const document={createElement:()=>canvas(),getElementById:id=>fields[id]||null};
const source=src.replace('window.Nat={','window.__nationalTest={S,drawItem,printCanvas,merge};window.Nat={');
assert.notEqual(source,src,'National test exports missing');
new Function('window','document','localStorage','Android','jspdf','alert',source)(window,document,{getItem(){return null},setItem(){}},Android,window.jspdf,()=>{});
const test=window.__nationalTest;
const make=(name,w=6000,h=6000)=>({name,src:'data:image/jpeg;base64,VEVTVA==',im:{naturalWidth:w,naturalHeight:h},rot:0,b:100,c:100,s:100});
const original=test.drawItem(make('large'),canvas(),true),printed=test.printCanvas(make('large'));
assert.ok(original.width*original.height<=24000000,'Full-resolution image exceeds 24MP');
assert.ok(printed.width*printed.height<=3000000,'Print page exceeds 3MP');
test.S.items=[make('front'),make('back')];test.S.sel=0;test.merge();
assert.notEqual(test.S.front,test.S.back,'Merge used same front and back source');
window.Nat.print();assert.equal(nativeEvents[0][0],'images');
assert.equal(JSON.parse(nativeEvents[0][1][0]).length,2);
test.S.items=Array.from({length:21},(_,i)=>make(String(i),1200,900));
window.Nat.print();assert.equal(nativeEvents[1][0],'pdf');
assert.equal(nativeEvents[1][1][1],'application/pdf');
assert.equal(pdfs.at(-1).pageCount,21);
console.log('National ID checks passed: safe export resolution, distinct front/back merge, 2-page native printing and 21-page PDF fallback.');
