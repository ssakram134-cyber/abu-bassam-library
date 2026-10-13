'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const file=path.join(__dirname,'..','web','permission-section-guards-runtime.js');
const source=fs.readFileSync(file,'utf8');
const denied=new Set(['logsViewOwn','imageExport','settingsPrinting','cardsEdit']);
const handlers={};
const mk=(extra={})=>({disabled:false,title:'',textContent:'',dataset:{},style:{opacity:'',pointerEvents:''},...extra});
const logs=mk({textContent:'سجل العمليات',title:'سجل أصلي'});
const ordinary=mk({textContent:'زر عادي'});
const fileInput=mk();
const paper=mk({disabled:true});
const photo=mk();
const label=mk({style:{opacity:'0.85',pointerEvents:'auto'}});
let denials=0;
const document={
  readyState:'complete',
  getElementById:(id)=>({imageInput:fileInput,paperSize:paper,photoSize:photo}[id]||null),
  querySelectorAll:(selector)=>selector==='button'?[logs,ordinary]:selector==='label[for="imageInput"]'?[label]:[],
  addEventListener:(name,listener)=>{handlers[name]=listener}
};
const window={
  AbuBassamPermissions:{can:(key)=>!denied.has(key),items:[]}
};
vm.runInNewContext(source,{document,window,alert:()=>{denials++},requestAnimationFrame:(fn)=>fn()}, {filename:file,timeout:1000});
assert.equal(logs.disabled,true,'Denied logs should be disabled');
assert.equal(fileInput.disabled,true,'Denied image input should be disabled');
assert.equal(label.style.pointerEvents,'none','Denied image label should not accept clicks');
assert.equal(paper.disabled,true,'Originally disabled paper selector remains disabled');

denied.clear();
window.AbuPermissionSectionGuards.tick();
assert.equal(logs.disabled,false,'Allowed logs button should return to original state');
assert.equal(logs.title,'سجل أصلي','Original button title should be restored');
assert.equal(fileInput.disabled,false,'Image input should return after permission grant');
assert.equal(label.style.pointerEvents,'auto','Original pointer-events must be restored');
assert.equal(label.style.opacity,'0.85','Original image label opacity must be restored');
assert.equal(paper.disabled,true,'Guard must not enable a control originally disabled elsewhere');

denied.add('cardsEdit');
let prevented=false;
const settingsButton={textContent:'الإعدادات',closest:(selector)=>selector.startsWith('button,')?settingsButton:null};
handlers.click({target:settingsButton,preventDefault:()=>{prevented=true},stopImmediatePropagation:()=>{prevented=true}});
assert.equal(prevented,false,'Settings card must not be treated as a cards-editor action');
const cardButton={textContent:'حذف',closest:(selector)=>selector.startsWith('button,')?cardButton:{}};
denied.add('cardsDelete');
handlers.click({target:cardButton,preventDefault:()=>{prevented=true},stopImmediatePropagation:()=>{prevented=true}});
assert.equal(prevented,true,'A genuinely denied card action must still be blocked');
assert.equal(denials,1,'Denied card action must show a permission explanation');
console.log('Touch/permission behavior: 13 focused assertions passed in a simulated DOM (not Android).');
