'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const offline=read('web/document-vault-offline-ocr-runtime.js');
const core=read('web/document-vault-runtime.js');
const bootstrap=read('web/device-name-runtime.js');
const access=read('web/branch-vault-runtime.js');
const assets=read('scripts/prepare-android-assets.mjs');
for(const code of [offline,core,bootstrap,access])new vm.Script(code);
assert.match(bootstrap,/await loadDocumentVaultHardening\(\);\s*await loadDocumentVaultOfflineOcr\(\)/);
assert.match(bootstrap,/document-vault-offline-ocr-runtime\.js/);
assert.match(offline,/vendor\/tesseract\/tesseract\.min\.js/);
assert.match(offline,/workerPath:'vendor\/tesseract\/worker\.min\.js'/);
assert.match(offline,/langPath:'vendor\/tesseract\/lang'/);
assert.match(offline,/corePath:'vendor\/tesseract\/core'/);
assert.match(offline,/Tesseract\.createWorker\('ara\+eng'/);
assert.doesNotMatch(offline,/https?:\/\/|MutationObserver|setInterval\(/);
assert.doesNotMatch(core,/https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract/i);
assert.match(core,/return engine\.recognize\(dataUrl\)/);
assert.match(core,/if\(!requireVault\('vaultAdd'\)\)return false/);
assert.match(core,/clearOcr\(\);closeModal\('vOcrModal'\)/);
assert.doesNotMatch(offline,/input\.onchange=|MutationObserver|AbuBassamNativeCameraResult=/);
assert.match(offline,/s\.onerror=\(\)=>\{s\.remove\(\);reject/);
assert.match(access,/vaultOcr:'قراءة النص من الصور'/);
for(const file of ['tesseract.min.js','worker.min.js','lang/ara.traineddata.gz','lang/eng.traineddata.gz'])
 assert.ok(assets.includes("'"+file+"'"),file+' must be embedded by Android assets pipeline');
assert.match(assets,/await rm\(destination/);
assert.match(assets,/await cp\(source, destination/);
assert.match(assets,/for\(const \[relative,urls,minBytes\] of OCR_ASSETS\)/);
const handlers={};
const elements={
 vOcrProgress:{textContent:''},vOcrText:{value:'previous text'},vOcrImage:{src:'',style:{display:'none'}}
};
let canOcr=true,scope=true,creatorCalls=0,networkCalls=0,terminated=0;
let pending=[];
const tesseract={
 async createWorker(){creatorCalls++;return{
  recognize(data){return new Promise(resolve=>pending.push({data,resolve}))},
  async terminate(){terminated++}
 }}
};
let now=0,timers=new Map();
const document={
 readyState:'complete',
 getElementById:id=>elements[id]||null,
 addEventListener:(kind,handler)=>{handlers[kind]=handler},
 head:{appendChild(){networkCalls++;throw Error('Unexpected script loader')}}
};
const window={Tesseract:tesseract,AbuBassamBranchVault:{localScopeOk:()=>scope,allowed:key=>canOcr&&key==='vaultOcr'}};
const context={window,document,Tesseract:tesseract,console,Promise,
 setTimeout:(callback,ms)=>{timers.set(++now,{callback,ms});return now},
 clearTimeout:id=>timers.delete(id)};
vm.runInNewContext(offline,context);
const api=window.AbuDocumentVaultOfflineOcr;
assert.ok(api?.recognize);
assert.ok(api?.cancel);
async function tick(){for(let i=0;i<12;i++)await Promise.resolve()}
(async()=>{
 let a=api.recognize('data:image/png;base64,first');
 await tick();assert.equal(pending.length,1);
 pending.shift().resolve({data:{text:'النص الأول'}});
 assert.equal(await a,true);
 assert.equal(elements.vOcrText.value,'النص الأول');
 assert.equal(creatorCalls,1);
 assert.equal(networkCalls,0,'No network scripts, offline worker must be bundled');

 a=api.recognize('data:image/png;base64,stale');
 await tick();assert.equal(pending.length,1);
 let b=api.recognize('data:image/png;base64,current');
 pending.shift().resolve({data:{text:'قديمة'}});
 assert.equal(await a,false,'Stale result must not overwrite current text');
 await tick();assert.equal(pending.length,1);
 assert.match(pending[0].data,/current/);
 pending.shift().resolve({data:{text:'النص الجديد'}});
 assert.equal(await b,true);
 assert.equal(elements.vOcrText.value,'النص الجديد');
 assert.equal(creatorCalls,1,'Reuse worker, avoid duplicate initialization');

 a=api.recognize('data:image/png;base64,cancelled');
 await tick();assert.equal(pending.length,1);
 handlers['abu-bassam-auth-changed']();
 pending.shift().resolve({data:{text:'Private text from old account'}});
 assert.equal(await a,false);
 assert.equal(elements.vOcrText.value,'النص الجديد','Previous account OCR completion must not leak');
 scope=false;
 assert.equal(await api.recognize('data:image/png;base64,unauthorized'),false);
 assert.equal(pending.length,0);
 scope=true;canOcr=false;
 assert.equal(await api.recognize('data:image/png;base64,blocked'),false);
 canOcr=true;
 assert.equal(creatorCalls,1);
 assert.equal(networkCalls,0);
 console.log('Vault offline OCR tests passed: deterministic boot, no CDN, packaged Arabic/English, serialized worker, stale-session cancellation and secondary-device permissions');
})().catch(error=>{console.error(error);process.exitCode=1});
