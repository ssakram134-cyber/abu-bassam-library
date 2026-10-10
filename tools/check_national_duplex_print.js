'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('web/national-id-runtime.js','utf8');new Function(source);
const outputs=[],prints=[],messages=[],created=[];
const ctx={fillRect(){},save(){},translate(){},rotate(){},drawImage(){},restore(){},getImageData(){return{data:new Uint8ClampedArray(16)}},putImageData(){}};
const canvas=()=>({width:0,height:0,style:{},getContext(){return ctx},toDataURL(){return 'data:image/jpeg;base64,VEVTVA=='},classList:{add(){},remove(){}}});
class PDFMock{
 constructor(opts){this.opts=opts;this.pages=[[]];created.push(this)}
 addPage(...options){this.pageOptions=options;this.pages.push([])}
 addImage(data,mime,x,y,width,height){this.pages.at(-1).push({data,mime,x,y,width,height})}
 output(){return 'data:application/pdf;base64,VEVTVA=='}
}
const native={saveBase64:(...args)=>outputs.push(args),printBase64:(...args)=>prints.push(args)};
const window={Android:native,jspdf:{jsPDF:PDFMock},addEventListener(){}};
const document={getElementById:()=>null,querySelector:()=>null,addEventListener(){},createElement:kind=>kind==='canvas'?canvas():null};
const injected=source.replace('window.Nat={','window.__duplexAudit={S,buildDuplexPdf,duplexPagePlacement};window.Nat={');
assert.notEqual(source,injected);
new Function('window','document','Android','jspdf','alert',injected)(window,document,native,window.jspdf,x=>messages.push(String(x)));
const audit=window.__duplexAudit;
const face=(w,h)=>({im:{naturalWidth:w,naturalHeight:h},b:100,c:100,s:100,rot:0,gray:0,bw:false,crop:null});
audit.S.front=face(1800,1200);audit.S.back=face(1200,1800);
window.Nat.saveDuplexPdf();
assert.equal(created.length,1);
assert.equal(created[0].pages.length,2,'Two separate PDF sheets are required');
for(const page of created[0].pages)assert.equal(page.length,1,'Exactly one face per page');
for(let i=0;i<2;i++){
 const item=created[0].pages[i][0],ratio=i===0?1800/1200:1200/1800;
 assert.ok(Math.abs(item.width/item.height-ratio)<.003,'Photo face must retain aspect ratio');
 assert.ok(item.width<=85.6+.001&&item.height<=54+.001,'Face must fit physical CR80 box');
 assert.ok(Math.abs((item.x+item.width/2)-105)<.0001,'Centered in A4 width');
 assert.ok(Math.abs((item.y+item.height/2)-148.5)<.0001,'Centered in A4 height');
}
assert.equal(outputs[0][1],'application/pdf');
window.Nat.printDuplex();
assert.equal(prints.length,1,'Native two-page PDF must be sent to Android print');
assert.equal(prints[0][1],'application/pdf');
assert.equal(created[1].pages.length,2);
audit.S.back=null;
window.Nat.saveDuplexPdf();
assert.ok(messages.some(m=>m.includes('يجب التقاط الوجه الأمامي والخلفي')),'Partial card must not produce fake duplex');
assert.equal(outputs.length,1);
console.log('Duplex PDF checks passed: independent pages, A4 centering, 85.6x54mm box, aspect ratio, native print and missing-face refusal.');
