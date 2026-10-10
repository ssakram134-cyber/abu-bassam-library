'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('web/national-id-runtime.js','utf8');new Function(source);
const outputs=[],prints=[],messages=[],created=[],canvases=[];
const canvas=()=>{const result={width:0,height:0,style:{},draws:[],toDataURL(){return 'data:image/jpeg;base64,VEVTVA=='},classList:{add(){},remove(){}}};const ctx={fillRect(){},save(){},translate(){},rotate(){},drawImage(...args){result.draws.push(args)},restore(){},getImageData(){return{data:new Uint8ClampedArray(16)}},putImageData(){}};result.getContext=()=>ctx;canvases.push(result);return result};
class PDFMock{
 constructor(opts){this.opts=opts;this.pages=[[]];created.push(this)}
 addPage(...options){this.pageOptions=options;this.pages.push([])}
 addImage(data,mime,x,y,width,height){this.pages.at(-1).push({data,mime,x,y,width,height})}
 output(){return 'data:application/pdf;base64,VEVTVA=='}
}
const native={saveBase64:(...args)=>outputs.push(args),printBase64:(...args)=>prints.push(args)};
const window={Android:native,jspdf:{jsPDF:PDFMock},addEventListener(){}};
const document={getElementById:()=>null,querySelector:()=>null,addEventListener(){},createElement:kind=>kind==='canvas'?canvas():null};
const injected=source.replace('window.Nat={','window.__duplexAudit={S,buildDuplexPdf,duplexFaceCanvas};window.Nat={');
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
 assert.equal(item.width,85.6,'Both physical card footprints must be CR80 width');
 assert.equal(item.height,54,'Both physical card footprints must be CR80 height');
 assert.ok(Math.abs((item.x+item.width/2)-105)<.0001,'Centered in A4 width');
 assert.ok(Math.abs((item.y+item.height/2)-148.5)<.0001,'Centered in A4 height');
 const original=canvases[2*i],card=canvases[2*i+1],draw=card.draws.at(-1);
 assert.equal(card.width,Math.round(85.6/25.4*300),'Card raster width must use 300 DPI');
 assert.equal(card.height,Math.round(54/25.4*300),'Card raster height must use 300 DPI');
 assert.equal(draw.length,5,'Inner source must be fitted in the fixed-size card without crop');
 assert.ok(Math.abs(draw[3]/draw[4]-original.width/original.height)<.0001,'No source image stretching');
 assert.ok(draw[1]>=0&&draw[2]>=0&&draw[1]+draw[3]<=card.width+.01&&draw[2]+draw[4]<=card.height+.01,'Content must fit CR80 bounds');
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
console.log('Duplex PDF checks passed: equal 85.6x54mm footprints, 300dpi letterbox, preserved face ratio, A4 centering and native print.');
