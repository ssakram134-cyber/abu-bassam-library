'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {jsPDF:BundledJsPdf}=require('../web/jspdf.umd.min.js');
const html=fs.readFileSync('web/index.html','utf8');
function segment(start,end){
 const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Missing PDF export function: '+start);
 return html.slice(a,b)
}
const pdfSource=segment('async function makePdfDataAsync(){','function tgCaption(');
const dlSource=segment('async function downloadPDF(){','async function printDirectly(){');
const printSource=segment('async function printDirectly(){','function saveTelegramSettings(){');
for(const marker of [
 "file?resolve(file):reject(new Error('تعذر ترميز إحدى صفحات PDF'))",
 "jpeg=new Uint8Array(await blob.arrayBuffer())",
 "doc.addImage(jpeg,'JPEG',0,0,pd.w,pd.h)",
 "if(i+1<pages.length)await new Promise(resolve=>setTimeout(resolve,0))",
 "const d=await makePdfDataAsync();",
 "const pages=pageCanvases.slice(),revision=pagePrintMeta;",
 "const ensureCurrent=()=>{",
 "if(imageBytes>28*1024*1024)",
 "const pdf=await makePdfDataAsync();"
])assert.ok((pdfSource+dlSource+printSource).includes(marker),'Missing cooperative PDF memory guard: '+marker);

let printPages=[],saved=[],pdfEvents=[],alerts=[],yieldCount=0,telegram=[];
const stubJspdf={jsPDF:class{
 constructor(opts){this.options=opts;pdfEvents.push({type:'create',opts})}
 addPage(fmt,orient){pdfEvents.push({type:'page',fmt,orient})}
 addImage(data,format,x,y,w,h){
  assert.equal(format,'JPEG');
  pdfEvents.push({type:'image',binary:data instanceof Uint8Array,bytes:data?.length,format,x,y,w,h})
 }
 output(type){assert.equal(type,'datauristring');pdfEvents.push({type:'output'});return 'data:application/pdf;base64,VEVTVA=='}
}};
const canvas=(text,hasBlob=true)=>({
 width:1600,height:900,
 toBlob:hasBlob?(callback,type,quality)=>{
  pdfEvents.push({type:'blob',mime:type,quality});
  callback({arrayBuffer:async()=>new Uint8Array([255,216,text.charCodeAt(0),255,217]).buffer})
 }:undefined,
 toDataURL(){pdfEvents.push({type:'data-url'});return 'data:image/jpeg;base64,QUJD'}
});
const pageCanvases=[canvas('A'),canvas('B'),canvas('C')];
const pagePrintMeta={paper:{w:297,h:210},paperKey:'CUSTOM:297:210',dpi:180};
const main=new Function('jspdf','pageCanvases','pagePrintMeta','getPaperSize','setTimeout',
 pdfSource+';return makePdfDataAsync')(
 stubJspdf,pageCanvases,pagePrintMeta,()=>({w:210,h:297}),fn=>{yieldCount++;fn()}
);
let count=0;function check(b,message){assert.ok(b,message);count++}
(async()=>{
 let out=await main();
 check(out.startsWith('data:application/pdf'),'PDF must yield a valid data URL string');
 check(pdfEvents.filter(x=>x.type==='blob').length===3&&pdfEvents.filter(x=>x.type==='image').every(x=>x.binary),
  'Each page must be passed as binary JPEG rather than allocating Base64');
 check(pdfEvents.filter(x=>x.type==='data-url').length===0,'No JPEG Data URL may be built on the binary path');
 check(yieldCount===2,'PDF encoder should yield between every two pages');
 check(pdfEvents[0].opts.format[0]===297&&pdfEvents[0].opts.orientation==='landscape',
  'Saved poster paper dimensions must survive regardless of current print controls');
 check(pdfEvents.filter(x=>x.type==='page').length===2&&pdfEvents.filter(x=>x.type==='image').length===3,
  'Multi-page PDF must preserve its exact page count');
 const fallback=[canvas('F',false)];
 const withoutBlob=new Function('jspdf','pageCanvases','pagePrintMeta','getPaperSize','setTimeout',
  pdfSource+';return makePdfDataAsync')(stubJspdf,fallback,pagePrintMeta,()=>({w:210,h:297}),fn=>fn());
 pdfEvents.length=0;
 await withoutBlob();
 check(pdfEvents.some(x=>x.type==='data-url')&&pdfEvents.some(x=>x.type==='image'&&!x.binary),
  'Legacy canvas must still work with an image Data URL');
 const broken=[{toBlob:cb=>cb(null)}];
 const rejects=new Function('jspdf','pageCanvases','pagePrintMeta','getPaperSize','setTimeout',
  pdfSource+';return makePdfDataAsync')(stubJspdf,broken,pagePrintMeta,()=>({w:210,h:297}),fn=>fn());
 await assert.rejects(()=>rejects(),/تعذر ترميز إحدى صفحات PDF/);
 count++;
 const htmlRuntime=new Function('pageCanvases','window','Android','alert','document',
  'makePdfDataAsync','telegramSend','telegramReady','getPaperPrintKey','printDpi','pagePrintMeta','currentPage',
  'getPaperSize',dlSource+printSource+';return {downloadPDF,printDirectly}');
 const native={saveBase64:(...args)=>saved.push(args),printPages:(...args)=>printPages.push(args),printBase64:(...args)=>saved.push(args)};
 pdfEvents.length=0;
 const env=htmlRuntime(pageCanvases,{Android:native},native,x=>alerts.push(String(x)),
 {createElement:()=>({click(){}})},main,(...args)=>telegram.push(args),()=>false,
 ()=> 'A4',()=>0,pagePrintMeta,0,()=>({w:210,h:297}));
 await env.downloadPDF();
 check(saved.length===1&&saved[0][1]==='application/pdf','Download PDF must call native save with complete PDF');
 await env.printDirectly();
 check(printPages.length===1&&printPages[0][1]==='CUSTOM:297:210'&&printPages[0][2]===180,
  'Native direct print must preserve generated paper and DPI metadata');
 const expectedPdfEvents=pdfEvents.length;
 check(pdfEvents.filter(e=>e.type==='output').length===1,
  'Native direct printing with Telegram disabled should not allocate a separate PDF');
 const falseNative=htmlRuntime(pageCanvases,{},null,x=>alerts.push(String(x)),{createElement:()=>({click(){}})},
  main,()=>{},()=>false,()=> 'A4',()=>0,pagePrintMeta,0,()=>({w:210,h:297}));
 await falseNative.printDirectly();
 check(pdfEvents.length===expectedPdfEvents,'Printing without native bridge must not allocate a PDF');

 const exampleJPEG=Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ALLAB//Z',
  'base64'
 );
 const actualPdf=new BundledJsPdf({unit:'mm',format:[297,210],orientation:'landscape'});
 actualPdf.addImage(new Uint8Array(exampleJPEG),'JPEG',0,0,297,210);
 actualPdf.addPage([297,210],'landscape');
 actualPdf.addImage(new Uint8Array(exampleJPEG),'JPEG',0,0,297,210);
 const actualBytes=new Uint8Array(actualPdf.output('arraybuffer'));
 check(actualPdf.getNumberOfPages()===2&&actualBytes[0]===37&&actualBytes[1]===80&&
   actualBytes[2]===68&&actualBytes[3]===70,'Bundled jsPDF 2.5.1 must accept real Uint8Array JPEG bytes and produce a two-page PDF');
 console.log('PDF export memory checks passed: '+count+
  ' cases; binary JPEG, UI yields, landscape metadata, legacy fallback and native paths.')
})().catch(error=>{console.error(error);process.exitCode=1});
