'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('web/image-compressor.html','utf8');
const found=html.match(/<script>([\s\S]*?)<\/script>/i);
assert.ok(found,'Compressor inline script not found');
const source=found[1],end=source.indexOf("$('uploadArea').onclick=");
assert.ok(end>0,'Compressor functions should be isolated before DOM startup wiring');
const code=source.slice(0,end);
assert.ok(!source.includes("window.parent.postMessage({type:'abuCompressionReady'"),
  'Do not post compressed images to an unhandled parent-message channel');
assert.ok(!/dataUrl\s*=\s*await\s+(readDataUrl|blobUrlData)/.test(source),
  'Encoding all image results eagerly as Base64 would exhaust WebView memory');

const elements=new Map(),revoked=[],created=[],native=[],alerts=[],downloads=[];
const element=id=>{
 if(!elements.has(id)){
  const classes=new Set();
  elements.set(id,{
   value:id==='quality'?'75':'0',style:{},innerHTML:'',textContent:'',disabled:false,src:'',
   classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)},
   removeAttribute(name){if(name==='src')this.src=''},
   setAttribute(){}
  })
 }
 return elements.get(id)
};
const document={
 getElementById:element,
 querySelectorAll:()=>[],
 createElement(tag){
  if(tag==='canvas')return{
   width:0,height:0,
   getContext:()=>({fillRect(){},drawImage(){},imageSmoothingEnabled:false,imageSmoothingQuality:''}),
   toBlob:(done,mime)=>done({size:600,type:mime})
  };
  return{download:'',href:'',click(){downloads.push(this.href)},remove(){}}
 },
 body:{appendChild(){}}
};
const URL={
 createObjectURL(blob){const u='blob:compressed-test-'+(created.length+1);created.push({url:u,blob});return u},
 revokeObjectURL(url){revoked.push(url)}
};
let imageLoads=0,fileReads=0;
class ImageMock{
 naturalWidth=100;naturalHeight=90;
 set src(_){imageLoads++;Promise.resolve().then(()=>this.onload?.())}
}
class FileReaderMock{
 readAsDataURL(blob){fileReads++;this.result='data:'+blob.type+';base64,QUJD';Promise.resolve().then(()=>this.onload?.())}
}
const Android={
 savePagesToGallery:(...args)=>native.push({method:'batch',args}),
 saveToGallery:(...args)=>native.push({method:'single',args})
};
const window={parent:{Android},Android};
const crypto={randomUUID:()=> 'test-uuid'};
const api=new Function('document','window','URL','crypto','Image','FileReader','alert','setTimeout',
 code+';return {compressOne,renderResults,resetResults,saveResults,saveOneResult:window.saveOneResult,'+
 'setState:(source,output)=>{selected=source;results=output},getResults:()=>results}')(
 document,window,URL,crypto,ImageMock,FileReaderMock,m=>alerts.push(String(m)),fn=>Promise.resolve().then(fn)
);
let passed=0;function check(v,s){assert.ok(v,s);passed++}
(async()=>{
 const input={id:'first',url:'blob:original-test',file:{name:'scan.jpg',type:'image/jpeg',size:1024}};
 const result=await api.compressOne(input,0);
 check(result.blob?.size===600&&result.url.startsWith('blob:'),'Image encoding must keep Blob and small preview URL');
 check(fileReads===0&&imageLoads===1,'Processing must not allocate Base64 strings for preview');
 api.setState([input],[result]);api.renderResults();
 check(element('afterImg').src===result.url&&element('results').innerHTML.includes(result.url),
   'Preview and result thumbnails must reuse the Blob URL');
 await api.saveOneResult(0);
 check(native.at(-1)?.method==='single'&&native.at(-1)?.args[0]===result.name&&
  native.at(-1)?.args[2].includes(';name='),'Individual save must use Android gallery API directly');
 check(fileReads===1,'Base64 is generated only on explicit save');
 const second={...result,id:'second',name:'other.png',mime:'image/png',url:'blob:second-test',
  blob:{size:500,type:'image/png'}};
 api.setState([input,{id:'second',url:'blob:original2',file:{name:'other.png',size:900}}],[result,second]);
 await api.saveResults();
 const batch=native.at(-1);
 const pages=batch?.method==='batch'?JSON.parse(batch.args[1]):[];
 check(pages.length===2&&pages[0].includes('scan_compressed_1.jpg')&&
   pages[1].startsWith('data:image/png;name=other.png'),
   'Android batch save must preserve filename and per-image MIME through canonical bridge');
 check(fileReads===3&&native.filter(x=>x.method==='batch').length===1,
   'Mixed-format batch must decode only on request and use one real native call');
 const beforeCalls=native.length;
 api.setState([input],[{...result,compressedBytes:25*1024*1024}]);
 await api.saveResults();
 check(native.length===beforeCalls&&alerts.at(-1).includes('24MB'),
   'Oversized batch must not send a potentially huge JSON message into Android WebView');
 api.setState([input],[result,second]);api.resetResults();
 check(revoked.includes(result.url)&&revoked.includes(second.url)&&element('afterImg').src==='',
   'Discarding results must release both Blob URLs and image preview references');
 api.setState([input],[result]);api.resetResults();
 check(revoked.filter(url=>url===result.url).length===2,
   'A subsequent batch may independently release its own result URL');
 console.log('Image compressor memory checks passed: '+passed+
  ' cases; no eager Base64, Blob cleanup, actual Android bridge and bounded mixed-format saves.')
})().catch(error=>{console.error(error);process.exitCode=1});
