'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('web/index.html','utf8');
const a=html.indexOf('async function printDirectly(){');
const b=html.indexOf('function saveTelegramSettings(){',a);
assert.ok(a>=0&&b>a,'Canonical browser print handler exists');
const printSource=html.slice(a,b);
assert.ok(printSource.includes('totalSize>40*1024*1024'),'Browser must bound aggregate image batch size');
assert.ok(printSource.includes('Android.printPages(urls,'),'No double JSON-serialization on print handoff');
assert.ok(!printSource.includes('Android.printPages(JSON.stringify(urls)'),'Do not allocate redundant JSON page strings');
const instrumented=printSource.replace('totalSize>40*1024*1024','totalSize>72');
async function scenario(pages,share=false){
 const requests=[],warnings=[];let pdfCount=0;
 const canvases=pages.map(data=>({toDataURL:()=>data}));
 const handler=new Function('window','Android','telegramReady','telegramSend',
 'makePdfDataAsync','getPaperPrintKey','printDpi','alert',
 'let pageCanvases=arguments[8],pagePrintMeta={paperKey:"A4",dpi:300};'+
 instrumented+';return printDirectly;')(
 {Android:{printBase64:()=>{}}},
 {printPages:(...args)=>requests.push(args)},
 ()=>share,()=>{},
 async()=>{pdfCount++;return 'pdf'},
 ()=> 'A4',()=>300,message=>warnings.push(String(message)),canvases
 );
 await handler();
 return {requests,warnings,pdfCount}
}
(async()=>{
 const photo='data:image/png;base64,AQIDBA==';
 const normal=await scenario([photo,photo]);
 assert.equal(normal.requests.length,1);
 assert.ok(Array.isArray(normal.requests[0][0]));
 assert.deepEqual(normal.requests[0][0],[photo,photo]);
 assert.equal(normal.requests[0][1],'A4');
 assert.equal(normal.pdfCount,0,'Do not generate PDF unnecessarily for native image printing');

 const tooLarge=await scenario([photo,'data:image/png;base64,'+'A'.repeat(74)]);
 assert.equal(tooLarge.requests.length,0,'Oversized page batches must not enter native bridge');
 assert.ok(tooLarge.warnings.some(x=>x.includes('دفعات أصغر')));
 assert.equal(tooLarge.pdfCount,0,'Failed print must not create an extra PDF');

 const empty=await scenario([]);
 assert.equal(empty.requests.length,0);
 assert.ok(empty.warnings.some(x=>x.includes('أضف صورة')));
 console.log('Browser print handoff passed: native receives one array, no double JSON/PDF work, and oversized batch stops before transfer.');
})().catch(e=>{console.error(e);process.exitCode=1});
