'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('web/image-compressor.html','utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(Boolean).at(-1);
assert.ok(script,'Compressor script missing');
new vm.Script(script);
const elements=new Map(),presets=[];
function element(id){
 if(!elements.has(id)){
  const classes=new Set();
  elements.set(id,{id,value:'',innerHTML:'',textContent:'',disabled:false,style:{},dataset:{},
   classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),
    toggle:(x,on)=>{if(on===undefined)on=!classes.has(x);on?classes.add(x):classes.delete(x)}},
   addEventListener(){},click(){},removeAttribute(){},setAttribute(){}});
 }
 return elements.get(id);
}
element('quality').value='75';element('maxDimension').value='0';element('enhanceTarget').value='0';
for(const q of ['50','75','90']){const p=element('preset'+q);p.dataset.q=q;presets.push(p)}
const document={getElementById:element,querySelectorAll:s=>s==='.preset'?presets:[]};
const warnings=[],pending=[],revoked=[];
let seq=0;
const window={addEventListener(){},parent:null,
 __fakeCompress:async(item,index)=>new Promise(resolve=>pending.push(()=>resolve({
   id:item.id,name:'output'+index+'.png',mime:'image/png',dataUrl:'data:image/png;base64,AA==',
   originalName:item.file.name,originalBytes:item.file.size,compressedBytes:50,
   width:100,height:100,quality:'medium',qualityClass:'q-mid',unchanged:false
 })))};
const URL={createObjectURL:()=> 'blob:mock-'+(++seq),revokeObjectURL:v=>revoked.push(v)};
const sandbox={window,document,URL,crypto:{randomUUID:()=> 'id-'+(++seq)},alert:m=>warnings.push(String(m)),
 setTimeout:f=>{queueMicrotask(f);return 1},console,Promise,Math,Number,String,Array,Date};
vm.runInNewContext(script+`
const showResult=window.showResult;
compressOne=window.__fakeCompress;
window.__audit={acceptFiles,processAll,read:()=>({processing,selected:selected.slice(),results:results.slice(),cancelRequested})};
`,sandbox);
const audit=window.__audit;
const photo=n=>({name:n,type:'image/png',size:100});
(async()=>{
 audit.acceptFiles([photo('one.png'),photo('two.png')]);
 assert.equal(audit.read().selected.length,2);
 const task=audit.processAll();
 assert.equal(audit.read().processing,true);
 assert.equal(pending.length,1,'Image conversion should begin with one pending job');
 audit.acceptFiles([photo('intruder.png')]);
 assert.equal(audit.read().selected.length,2,'Adding files during processing must be blocked');
 window.moveItem(0,1);
 assert.equal(audit.read().selected[0].file.name,'one.png','Reorder during processing must be blocked');
 assert.equal(element('quality').disabled,true);
 assert.equal(element('fileInput').disabled,true);
 assert.equal(element('enhanceTarget').disabled,true);
 pending.shift()();
 for(let i=0;i<20&&pending.length===0;i++)await Promise.resolve();
 assert.equal(pending.length,1,'Second job should start after first result');
 assert.equal(audit.read().results.length,1);
 element('quality').oninput({target:{value:'55'}});
 assert.equal(audit.read().results.length,1,'Quality edit during processing must not erase completed work');
 element('cancelBtn').onclick();
 pending.shift()();
 await task;
 assert.equal(audit.read().processing,false);
 assert.equal(audit.read().results.length,1,'Cancelled in-flight conversion must not add a stale result');
 assert.ok(element('summary').textContent.includes('تم الإلغاء'));
 assert.equal(element('fileInput').disabled,false);
 assert.equal(element('enhanceTarget').disabled,false);
 audit.acceptFiles([photo('new.png')]);
 assert.equal(audit.read().selected.length,3,'Add must work after processing ends');
 assert.ok(warnings.some(w=>w.includes('لا يمكن إضافة صور أثناء المعالجة')));
 console.log('Compressor batch race checks passed: add/reorder/settings locked, cancelled job discarded, remaining results retained, controls restored.');
})().catch(e=>{console.error(e);process.exitCode=1});
