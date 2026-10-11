'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib');
const src=fs.readFileSync('scripts/prepare-android-assets.mjs','utf8');
assert.ok(src.includes('const DOCUMENT_ASSETS = ['),'Offline PDF/DOCX/Excel must remain bundled');
assert.ok(src.includes('const OCR_ASSETS = ['),'Offline Arabic/English OCR must remain bundled');
assert.ok(src.includes('for(const [relative,urls,minBytes] of DOCUMENT_ASSETS)'),'Document assets must be downloaded during native packaging');
assert.ok(src.includes("await cp(source, destination, { recursive: true, force: true });"),'Generated assets must copy canonical web files');
assert.ok(!src.includes('await writeFile(path,data)'),'Do not expose partial files');
const start=src.indexOf('function validAssetContent('),end=src.indexOf('// Canonical source is read-only during normal builds.');
assert.ok(start>0&&end>start,'Validation helpers not found');
const helpers=src.slice(start,end);
const files=new Map(),actions=[],responses=[],timers=new Set();
let downloadReads=0,bodyDelay=null;
const validJs=Buffer.from('function safe(){return 3;}\n'+' '.repeat(1000));
const validGz=zlib.gzipSync(Buffer.from('var lang=1;\n'.repeat(3000)));
const api=new Function('URL','Buffer','gunzipSync','stat','readFile','fetch','setTimeout','clearTimeout','AbortController','mkdir','dirname','rename','rm','writeFile','projectRoot','DOWNLOAD_TIMEOUT_MS','process',
 helpers+';return {validAssetContent,existsEnough,fetchWithTimeout,download};')(
 URL,Buffer,zlib.gunzipSync,
 async path=>{if(!files.has(path))throw Error('missing '+path);return {size:files.get(path).length}},
 async path=>{if(!files.has(path))throw Error('missing');return files.get(path)},
 async (url,options)=>{
   if(bodyDelay){
     const resolve=bodyDelay;bodyDelay=null;
     return {ok:true,headers:{get:()=>null},body:{getReader(){let sent=false;return {read(){downloadReads++;if(sent)return Promise.resolve({done:true});sent=true;return new Promise(done=>responses.push(()=>done({done:false,value:validJs})))},releaseLock(){}}}}};
   }
   const buf=url.includes('bad')?Buffer.from('<html>'+('ERROR '.repeat(300))+'</html>'):validJs;
   return {ok:true,headers:{get:()=>String(buf.length)},body:{getReader(){let read=false;return {read:async()=>{if(read)return {done:true};read=true;return {done:false,value:buf}},releaseLock(){}}}}};
 },
 (fn,ms)=>{const id={ms};if(ms===45000)timers.add(id);else queueMicrotask(fn);return id},
 id=>timers.delete(id),
 global.AbortController,
 async()=>{},
 path=>path.split('/').slice(0,-1).join('/'),
 async (temp,dest)=>{actions.push(['rename',temp,dest]);files.set(dest,files.get(temp));files.delete(temp)},
 async path=>{actions.push(['remove',path]);files.delete(path)},
 async (path,data)=>{actions.push(['write',path]);files.set(path,data)},
 '/repo',45000,{pid:111,stdout:{write(){}}}
);
assert.equal(api.validAssetContent(validJs,'viewer.min.js'),true);
assert.equal(api.validAssetContent(Buffer.from('<!doctype html>'+('function'.repeat(200))),'viewer.min.js'),false);
assert.equal(api.validAssetContent(Buffer.from('{"function":"bad"}'),'viewer.min.js'),false);
assert.equal(api.validAssetContent(validGz,'ara.traineddata.gz'),true);
assert.equal(api.validAssetContent(Buffer.from([0x1f,0x8b,8,0,1,2,3]),'ara.traineddata.gz'),false);
(async()=>{
 const path='/tmp/test-pdf.min.js';
 files.set(path,Buffer.from('<html>BAD FILE</html>'.repeat(100)));
 assert.equal(await api.existsEnough(path,30),false,'Cached HTML must be rejected');
 await api.download(['https://example.org/bad','https://example.org/good'],path,20);
 assert.equal(files.get(path).toString(),validJs.toString(),'Valid replacement must become final file');
 assert.ok(actions.some(x=>x[0]==='rename'&&x[2]===path),'Only atomic rename publishes a downloaded asset');
 assert.ok(actions.every(x=>x[0]!=='write'||x[1].includes('.partial-')),'Downloads must write only to temporary paths');
 assert.equal([...files.keys()].filter(k=>k.includes('.partial-')).length,0,'No leftover partial files');
 assert.equal(timers.size,0);
 // Ensure timeout lives while reading response BODY, not just during headers.
 bodyDelay=()=>{};
 const pending=api.fetchWithTimeout('https://example.org/slow',4*1024*1024);
 for(let i=0;i<8&&responses.length===0;i++)await Promise.resolve();
 assert.equal(timers.size,1,'Abort timer must stay active during pending body read');
 while(responses.length){const answer=responses.shift();answer()}
 // Read first chunk and a final done. Fake readable stream releases both queued reads.
 const result=await pending;
 assert.equal(result.length,validJs.length);
 assert.equal(timers.size,0,'Timer must be cleared after body completion');
 await assert.rejects(api.fetchWithTimeout('https://example.org/good',16),/exceeds maximum download size/);
 assert.equal(timers.size,0);
 console.log('Offline asset checks passed: reject HTML/corrupt GZIP, keep timeout through body, bound size, atomic replacement and cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1});
