'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','scripts/prepare-android-assets.mjs'),'utf8');
const start=source.indexOf('function validAssetContent(data,path)');
const end=source.indexOf('\n\n\n// Canonical source',start);
assert.ok(start>=0&&end>start);
const functions=source.slice(start,end);
new vm.Script(functions);
assert.match(functions,/return Buffer\.from\(await response\.arrayBuffer\(\)\)/);
assert.match(functions,/}finally\{clearTimeout\(timer\)\}/);
assert.match(functions,/await writeFile\(temporary,data\);\s*await rename\(temporary,path\)/);
assert.match(functions,/await rm\(temporary,\{force:true\}\)/);
assert.doesNotMatch(functions,/await writeFile\(path,data\)/);
function factory(deps){
 const names=['stat','readFile','gunzipSync','fetch','AbortController','setTimeout','clearTimeout','Buffer','DOWNLOAD_TIMEOUT_MS',
   'mkdir','dirname','writeFile','rename','rm','process','projectRoot','URL'];
 return new Function(...names,functions+';return{fetchWithTimeout,download}')(...names.map(n=>deps[n]))
}
(async()=>{
 let timer=null,cleared=0,aborted=false,bodyReject;
 class Controller{
  constructor(){this.signal={}}
  abort(){aborted=true;if(bodyReject)bodyReject(Error('AbortError'))}
 }
 const first=factory({
  stat:async()=>({size:0}),readFile:async()=>new Uint8Array(),gunzipSync:()=>new Uint8Array(12000),fetch:async()=>({ok:true,arrayBuffer:()=>new Promise((resolve,reject)=>{bodyReject=reject})}),
  AbortController:Controller,setTimeout:cb=>{timer=cb;return 17},clearTimeout:()=>{cleared++},
  Buffer,DOWNLOAD_TIMEOUT_MS:45000,mkdir:async()=>{},dirname:()=>'/',
  writeFile:async()=>{},rename:async()=>{},rm:async()=>{},process:{pid:200,stdout:{write:()=>{}}},
  projectRoot:'/',URL:class{constructor(url){this.hostname=url.split('/')[2]}}
 });
 const pending=first.fetchWithTimeout('https://cdn.test/ocr');
 await Promise.resolve();await Promise.resolve();
 assert.equal(cleared,0,'Download timeout must survive an HTTP headers-only response');
 assert.equal(typeof timer,'function');
 timer();
 await assert.rejects(pending,/AbortError/);
 assert.equal(aborted,true);assert.equal(cleared,1);
 const store=new Map(),events=[];
 let writeAttempts=0;
 const second=factory({
  stat:async p=>{if(!store.has(p))throw Error('ENOENT');return{size:store.get(p).length}},
  readFile:async p=>store.get(p),gunzipSync:()=>new Uint8Array(12000),
  fetch:async()=>({ok:true,arrayBuffer:async()=>{
    const bytes=new Uint8Array(32000).fill(32),s='var TesseractWorker = function () {};';
    for(let i=0;i<s.length;i++)bytes[i]=s.charCodeAt(i);
    return bytes.buffer
  }}),
  AbortController:class{constructor(){this.signal={}}abort(){}},
  setTimeout:cb=>{cb();return 1},clearTimeout:()=>{},
  Buffer,DOWNLOAD_TIMEOUT_MS:45000,mkdir:async()=>{},dirname:()=>'/assets',
  writeFile:async(p,buf)=>{writeAttempts++;store.set(p,Buffer.from(buf));events.push('temp-write:'+p);
    if(writeAttempts===1)throw Error('ENOSPC')},
  rename:async(src,dst)=>{assert.ok(store.has(src));assert.equal(store.has(dst),false);
    store.set(dst,store.get(src));store.delete(src);events.push('rename:'+dst)},
  rm:async p=>{store.delete(p);events.push('cleanup:'+p)},
  process:{pid:200,stdout:{write:()=>{}}},projectRoot:'/',URL:class{constructor(url){this.hostname=url.split('/')[2]}}
 });
 await second.download(['https://cdn.test/asset'],'/assets/tesseract.min.js',30000);
 assert.equal(writeAttempts,2,'Write failure must retry and only publish the finished asset');
 assert.equal(store.get('/assets/tesseract.min.js').length,32000);
 assert.equal(store.has('/assets/tesseract.min.js.partial-200'),false);
 assert.equal(events.filter(e=>e.startsWith('rename:')).length,1);
 const scripts=JSON.parse(fs.readFileSync(path.join(__dirname,'..','package.json'),'utf8')).scripts['check:web'].split(' && ');
 assert.ok(scripts.length>=110);assert.equal(new Set(scripts).size,scripts.length);
 console.log('Fresh audit B: network body timeout survives headers, aborts stalled transfers, incomplete downloads never replace valid offline OCR files.');
})().catch(error=>{console.error(error);process.exitCode=1});
