'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const home=fs.readFileSync('web/index.html','utf8');
const poster=fs.readFileSync('web/photo-print-advanced-runtime.js','utf8');
const begin=home.indexOf('function downloadJPG(){');
const mid=home.indexOf('async function downloadPDF(){',begin);
const printStart=home.indexOf('async function printDirectly(){');
const printEnd=home.indexOf('function saveTelegramSettings(){',printStart);
const p1=poster.indexOf('function testPoster(){'),p2=poster.indexOf('function posterPdf(){',p1);
assert.ok(begin>=0&&mid>begin&&printStart>=0&&printEnd>printStart&&p1>=0&&p2>p1,
 'Original photo and poster print handlers must exist');
const jpeg=home.slice(begin,mid),printing=home.slice(printStart,printEnd),posterTest=poster.slice(p1,p2);
assert.ok(jpeg.includes("Android.savePagesToGallery('Abu_Bassam_Page',pages,'image/jpeg',telegramReady()?currentPage:-1)"),
 'Gallery sends an array without nested JSON serialization');
assert.ok(printing.includes('Android.printPages(urls,'),
 'Direct print sends image array');
assert.ok(posterTest.includes('Android.printPages([url],'),
 'Poster test print sends image array');

function fixture({large=false,hasBridge=true}={}){
 const saves=[],prints=[],alerts=[],telegram=[],counters=[0,0];
 const pages=[0,1].map(index=>({
  toDataURL(type){counters[index]++;assert.ok(type==='image/jpeg'||type==='image/png');
   return large?'data:image/jpeg;base64,'+'X'.repeat(65):
   'data:image/jpeg;base64,'+(index?'AgID':'AQID');
  }
 }));
 const Android={
  savePagesToGallery:(...args)=>saves.push(args),
  printPages:(...args)=>prints.push(args)
 };
 const win={Android:hasBridge?Android:null};
 const src=(large?jpeg.replace('totalChars>40*1024*1024','totalChars>100'):jpeg)+printing;
 const f=new Function('pageCanvases','currentPage','telegramSend','alert','window',
   'Android','telegramReady','getPaperPrintKey','printDpi','pagePrintMeta',
   'makePdfDataAsync','document',src+';return {downloadJPG,printDirectly}');
 const callbacks=f(pages,1,(...x)=>telegram.push(x),x=>alerts.push(String(x)),win,
  Android,()=>false,()=> 'A4',()=>300,{paperKey:'CUSTOM:297:210',dpi:150},
  async()=>{throw Error('Unused PDF should not be created')},{createElement:()=>({click(){}})});
 return{callbacks,saves,prints,alerts,telegram,counters};
}
async function test(){
 const native=fixture();
 native.callbacks.downloadJPG();
 assert.equal(native.saves.length,1);
 assert.equal(native.saves[0][0],'Abu_Bassam_Page');
 assert.equal(native.saves[0][2],'image/jpeg');
 assert.ok(Array.isArray(native.saves[0][1]));
 assert.equal(native.saves[0][1].length,2,'Gallery still receives every requested page');
 assert.deepEqual(native.counters,[1,1],'Each JPEG is encoded once');
 assert.equal(native.telegram.length,0,'Native saving must not trigger an overlapping Telegram export');
 assert.equal(native.saves[0][3],-1,'Sharing is off in the default photo print fixture');

 const tooLarge=fixture({large:true});
 tooLarge.callbacks.downloadJPG();
 assert.equal(tooLarge.saves.length,0,'Oversized batches must not cross the bridge');
 assert.ok(tooLarge.alerts.some(x=>x.includes('دفعات أصغر')));

 const printed=fixture();
 await printed.callbacks.printDirectly();
 assert.equal(printed.prints.length,1);
 assert.ok(Array.isArray(printed.prints[0][0]));
 assert.equal(printed.prints[0][1],'CUSTOM:297:210');
 assert.equal(printed.prints[0][2],150);

 const posterCalls=[],posterAlerts=[];
 const testPoster=new Function('buildPoster','posterPlan','pageCanvases','window',
  'Android','alert',posterTest+';return testPoster')(
  ()=>true,()=>({paper:{landscape:false,key:'A4',w:210,h:297},dpi:200}),
  [{toDataURL:()=> 'data:image/png;base64,AQID'}],
  {Android:{printPages:(...args)=>posterCalls.push(args)}},
  {printPages:(...args)=>posterCalls.push(args)},
  x=>posterAlerts.push(x)
 );
 testPoster();
 assert.equal(posterCalls.length,1);
 assert.deepEqual(posterCalls[0][0],['data:image/png;base64,AQID']);
 assert.equal(posterCalls[0][1],'A4');
 assert.equal(posterCalls[0][2],200);

 const rejectedPoster=new Function('buildPoster','posterPlan','pageCanvases','window','Android','alert',
  posterTest.replace('url.length>11_200_000','url.length>10')+';return testPoster')(
  ()=>true,()=>({paper:{landscape:false,key:'A4'},dpi:150}),
  [{toDataURL:()=> 'data:image/png;base64,AQID'}],
  {Android:{printPages:(...args)=>posterCalls.push(args)}},
  {printPages:(...args)=>posterCalls.push(args)},
  x=>posterAlerts.push(x)
 );
 rejectedPoster();
 assert.equal(posterCalls.length,1,'Oversized poster image must not be printed');
 assert.ok(posterAlerts.some(x=>String(x).includes('خفّض دقة توليد')));
 console.log('Native batch array bridge passed: gallery preserves all pages, print metadata unchanged, poster tile array, and batch size rejection.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
