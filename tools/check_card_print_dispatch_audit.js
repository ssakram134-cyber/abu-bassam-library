'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const editor=read('web/a4-card-sheet-editor-v2-runtime.js');
const studio=read('web/cards-studio-runtime.js');
new vm.Script(editor);new vm.Script(studio);
function cut(source,start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Source extraction missing '+start);
 return source.slice(a,b)
}

// Preparing a printable copy must never strip handles or CSS from the live iframe.
const cleanSection=cut(editor,'function clean(doc){','function duplexCells(');
const deletedControls={count:0},livePage={style:{overflow:'visible',boxShadow:'current'}};
const duplicatePage={style:{overflow:'visible',boxShadow:'current'}};
const a4EditorItem={classList:{remove(){}},dataset:{a4bound:'1',a4group:'g1'}};
const cleanedRoot={
 outerHTML:'<html>cloned output</html>',
 querySelectorAll(selector){return selector==='.a4v2-item'?[a4EditorItem]:[{remove(){deletedControls.count++}}]}
};
let copied=0;
const originalRoot={cloneNode(deep){assert.equal(deep,true);copied++;return cleanedRoot}};
const originalDocument={
 documentElement:originalRoot,
 querySelectorAll(){throw Error('Do not mutate the live editor document')}
};
const cleaner=new Function('allPages',cleanSection+';return clean;')(()=>[duplicatePage]);
assert.match(cleaner(originalDocument),/cloned output/);
assert.equal(copied,1);
assert.equal(deletedControls.count,1);
assert.equal(duplicatePage.style.overflow,'hidden','Clone must strip editing presentation');
assert.equal(livePage.style.overflow,'visible','Original editor must remain editable');
assert.equal(livePage.style.boxShadow,'current');
assert.equal(a4EditorItem.dataset.a4bound,undefined);
assert.equal(a4EditorItem.dataset.a4group,undefined);
const openFunctions=cut(editor,'function close(){','function load(html){');
const dispatchFunctions=cut(editor,'function markDispatched(j){','function boot(){');
let accepted=true,allowed=true,alerts=[],requests=[],externalJobs=[],runs=0;
const panel={classList:{add(){},remove(){}},querySelector:()=>({textContent:''})};
const docFrame={contentDocument:{pages:[]}},document={
 getElementById:id=>id==='abuA4EditorV2'?panel:id==='abuA4EditorV2Frame'?docFrame:null,
 open(){},write(){},close(){}
};
const window={print:()=>{runs++}};
const native={};
const editorApi=new Function('document','window','Android','modal','load','isA4','canFinalize','checkDuplexAlignment','clean','direct','alert','console',
 openFunctions+dispatchFunctions+
 ';return{openPrint,openPdf,close,run,active:()=>job}')(
 document,window,native,()=>{},()=>{},()=>true,()=>allowed,()=>true,()=>'<html>edited</html>',
 (type,payload)=>{requests.push({type,payload});return accepted},
 msg=>alerts.push(String(msg)),console
);
let callbacks=0;
editorApi.openPrint('<html>A4</html>',()=>{callbacks++});
assert.equal(callbacks,0,'Opening editor must not log a print');
editorApi.close();
assert.equal(callbacks,0,'Canceling A4 editor must not log a print');
assert.equal(editorApi.active(),null);
editorApi.openPdf('batch.pdf','<html>A4</html>',()=>{callbacks++});
assert.equal(callbacks,0,'Opening PDF preview must not log a save');
allowed=false;
assert.equal(editorApi.run(),false,'Revoked permission must stop dispatch');
assert.equal(callbacks,0,'Permission failure must not log a print');
assert.equal(requests.length,0);
allowed=true;accepted=false;
assert.equal(editorApi.run(),false,'Unavailable Android PDF bridge must fail');
assert.equal(callbacks,0,'Unavailable PDF bridge must not log');
assert.ok(editorApi.active(),'Editor must remain open after a failed PDF send');
const rejected=editorApi.active();
native.savePdfHtml=()=>{throw Error('NATIVE_STORAGE_UNAVAILABLE')};
window.Android=native;
assert.equal(editorApi.run(),false,'Native bridge throwing should keep editor and avoid false audit');
assert.equal(callbacks,0);
assert.equal(editorApi.active(),rejected);
assert.ok(alerts.some(x=>x.includes('NATIVE_STORAGE_UNAVAILABLE')));
delete native.savePdfHtml;
delete window.Android;

accepted=true;
assert.equal(editorApi.run(),true,'Accepted PDF dispatch should complete');
assert.equal(callbacks,1,'Accepted PDF sends one event');
assert.equal(requests.at(-1).type,'savePdfHtml');
assert.equal(requests.at(-1).payload.name,'batch.pdf');
assert.equal(editorApi.active(),null);
editorApi.openPrint('<html>A4</html>',()=>{callbacks++});
assert.equal(editorApi.run(),true);
assert.equal(callbacks,2,'Accepted A4 print sends one event');
assert.equal(requests.at(-1).type,'printHtml');
assert.equal(editorApi.active(),null);
accepted=false;
editorApi.openPrint('<html>A4</html>',()=>{callbacks++});
assert.equal(editorApi.run(),true,'Fallback can request a browser print dialog');
assert.equal(runs,1);
assert.equal(callbacks,3);
assert.equal(editorApi.active(),null);

const cardFunctions=cut(studio,'function printNow(){','async function exportPng(){');
const cardLogs=[],errors=[],cardCalls=[];
const nativeCard={printHtml:html=>{cardCalls.push({kind:'print',html})},savePdfHtml:(name,html)=>{cardCalls.push({kind:'pdf',name,html})}};
const cardState={output:'a4-duplex'};
const windowCard={Android:nativeCard,AbuA4CardSheetEditorV2:{
 openPrint:(html,done)=>{externalJobs.push({kind:'print',html,done});return true},
 openPdf:(name,html,done)=>{externalJobs.push({kind:'pdf',name,html,done});return true}
}};
const cards=new Function('requireCards','requireOutputPermission','printDocument','expandedJobs','state','window','Android',
 'recordHistory','logOperation','console','$','openModal','setTimeout','alert','Date','previewPrint',
 cardFunctions+';return {printNow,savePdf}')(
 ()=>true,()=>true,()=>'<html>A4</html>',()=>[{id:1},{id:2}],cardState,windowCard,nativeCard,
 action=>cardLogs.push({type:'history',action}),
 (type,title,detail)=>cardLogs.push({type,title,detail}),console,
 ()=>({contentWindow:{print:()=>{}}}),()=>{},()=>{},x=>errors.push(x),Date,()=>{}
);
assert.equal(cards.printNow(),true);
assert.equal(externalJobs.length,1);
assert.equal(cardLogs.length,0,'A4 opening must NOT record a completed request');
externalJobs[0].done();
assert.equal(cardLogs.length,2,'A4 print dispatch should write history and operation log');
assert.match(cardLogs[0].action,/إرسال طلب طباعة/);
assert.match(cardLogs[1].title,/إرسال طلب طباعة/);
assert.equal(cards.savePdf(),true);
assert.equal(cardLogs.length,2,'PDF preview is not dispatch');
externalJobs[1].done();
assert.equal(cardLogs.length,4,'A4 PDF dispatch should be recorded once');
assert.match(cardLogs[2].action,/إرسال طلب PDF/);
assert.match(cardLogs[3].title,/إرسال طلب حفظ PDF/);
cardState.output='cr80';
assert.equal(cards.printNow(),undefined,'Native bridge may legitimately return undefined');
assert.equal(cardLogs.length,6,'CR80 history occurs after native bridge receives request');
assert.equal(cards.savePdf(),undefined);
assert.equal(cardLogs.length,8,'CR80 PDF history occurs after native bridge receives request');
const original=nativeCard.printHtml;
nativeCard.printHtml=()=>{throw new Error('NATIVE_PRINT_REJECTED')};
assert.equal(cards.printNow(),false);
assert.equal(cardLogs.length,8,'Failed native dispatch must not add false print history');
assert.ok(errors.some(e=>String(e).includes('NATIVE_PRINT_REJECTED')));
nativeCard.printHtml=original;
windowCard.Android={};
cardState.output='cr80';
const before=cardLogs.length;
cards.savePdf();
assert.equal(cardLogs.length,before,'Unsupported PDF save cannot report success');

assert.match(studio,/editor\.openPrint\(html,dispatched\)/);
assert.match(studio,/editor\.openPdf\(name,html,dispatched\)/);
assert.match(editor,/if\(direct\('savePdfHtml',\{name:j\.name,html\}\)\)return markDispatched\(j\)/);
assert.match(editor,/if\(direct\('printHtml',\{html\}\)\)return markDispatched\(j\)/);
console.log('A4/CR80 dispatch audit passed: previews and cancellation do not create print history; accepted bridge dispatch logs once, permission/bridge failures do not; physical completion remains unconfirmed.');
