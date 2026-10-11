'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ar=fs.readFileSync('web/questions-completion-runtime.js','utf8');
const en=fs.readFileSync('web/questions-en-fixes-runtime.js','utf8');
const custom=fs.readFileSync('web/questions-custom-library-runtime.js','utf8');
const arHtml=fs.readFileSync('web/questions-ar.html','utf8');
const enHtml=fs.readFileSync('web/questions-en.html','utf8');
const host=fs.readFileSync('web/productivity-tools-runtime.js','utf8');
const templates=fs.readFileSync('web/questions-templates-runtime.js','utf8');
const maintenance=fs.readFileSync('web/questions-maintenance-runtime.js','utf8');
const questionScope=fs.readFileSync('web/questions-storage-scope-runtime.js','utf8');
new vm.Script(questionScope,{filename:'question account scope'});
new vm.Script(host,{filename:'question host'});
new vm.Script(templates,{filename:'question templates'});
new vm.Script(maintenance,{filename:'question maintenance'});
assert.ok(host.includes("document.addEventListener('abu-bassam-auth-changed',clearQuestionFrameOnAuthChange)"),
 'Switching account must unload the active question iframe');
assert.ok(host.includes("frame.src='about:blank'"),'Previous questions must not remain displayed after logout');
assert.ok(templates.includes('data-apply-template=')&&!templates.includes('onclick="AbuQuestionTemplates.applyTemplate('),
 'Template identifiers must not appear in HTML inline event JavaScript');
assert.ok(maintenance.includes("if(saved!==true)throw Error("),'Question repair must report a failed draft write');
for(const [name,src] of [['Arabic completion',ar],['English completion',en],['custom templates',custom]])
 new vm.Script(src,{filename:name});
for(const [name,html] of [['Arabic',arHtml],['English',enHtml]]){
 const blocks=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
 assert.ok(blocks.length,'Question HTML scripts missing: '+name);
 blocks.forEach((block,index)=>new vm.Script(block,{filename:name+' inline script '+index}));
}
assert.ok(enHtml.includes('if (window.__ABU_QUESTIONS_EN_FIXES_V2__) return;'),'Legacy English timers must stop after durable runtime loads');
assert.ok(custom.includes('data-idb-action="apply"')&&!custom.includes("onclick=\"AbuQuestionCustomLibrary.apply("),
 'Custom template IDs must never be embedded in inline JS handlers');
function between(source,start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Missing draft function block '+start);
 return source.slice(a,b)
}
function draftHarness(language,stored=null){
 const source=language==='ar'?ar:en;
 const block=language==='ar'
  ?between(source,'async function saveDurableDraft(','\nfunction fileToDataUrl(')
  :between(source,'async function durableSave(','\nfunction addCss(');
 const state=(language==='ar'
  ?'let saveTimer=0,hydrating=false,editedDuringHydration=false,resettingDraft=false,draftWrites=Promise.resolve(),draftGeneration=0;'
  :'let saveTimer=0,hydrating=false,editedDuringHydration=false,resettingDraft=false,draftGeneration=0,saveQueue=Promise.resolve();const DRAFT_KEY="EnglishDraft";')
  +'const scope=()=>window.AbuQuestionScope.identity();const sk=k=>window.AbuQuestionScope.scopedKey(k);';
 const box={innerHTML:'first'},alerts=[],records=[],values=new Map(),location={reloadCount:0,reload(){this.reloadCount++}};
 let failDelete=false,storedRow=stored,restoreResolve=null;
 const idbPut=async(html)=>{records.push(html);storedRow={html};return true};
 const idbGet=async()=>storedRow;
 const idbDelete=async()=>!failDelete;
 const localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 const noop=()=>{},window={fitToScreen:noop,AbuQuestionScope:{identity:()=> 'user-A:device-1',scopedKey:key=>key+':user-A:device-1'}};
 const factory=new Function('$','idbPut','idbGet','idbDelete','dbPut','dbGet','dbDelete','localStorage','window','location','alert','confirm','clearTimeout','setTimeout','stableRebind','normalizeHeaders','enhanceAnswers','rebind','enhanceHeader','fit','META_KEY','LOCAL_TS_KEY','IDB_KEY',
  state+block+';return {save:'+(language==='ar'?'saveDurableDraft':'durableSave')+',reset:'+(language==='ar'?'resetDurableDraft':'reset')+',restore:'+(language==='ar'?'restoreDurableIfNeeded':'restoreDurableEnglish')+'};');
 const api=factory(()=>box,idbPut,idbGet,idbDelete,idbPut,idbGet,idbDelete,localStorage,window,location,
  value=>alerts.push(String(value)),()=>true,noop,noop,noop,noop,noop,noop,noop,noop,'meta','ts','ar');
 return {api,box,records,alerts,values,location,setFailDelete:value=>{failDelete=value},setStored:value=>{storedRow=value}};
}
async function verifyDraft(language){
 const instance=draftHarness(language);
 const {api,box,records,alerts,location}=instance;
 const first=api.save();box.innerHTML='second';const second=api.save();
 assert.equal(await first,true);assert.equal(await second,true);
 assert.deepEqual(records,['first','second'],'Draft writes must preserve submission order');
 instance.setFailDelete(true);assert.equal(await api.reset(),false);
 assert.equal(location.reloadCount,0,'Failed IndexedDB delete must not reload editor');
 instance.setFailDelete(false);assert.equal(await api.reset(),true);
 assert.equal(location.reloadCount,1,'Confirmed reset may reload only once');
 assert.ok(alerts.some(x=>/تعذر حذف|reset cancelled/i.test(x)));
 const reloaded=draftHarness(language,{html:'durable-after-local-quota'});
 assert.equal(await reloaded.api.restore(),true,'A recoverable IndexedDB-only draft should load');
 assert.equal(reloaded.box.innerHTML,'durable-after-local-quota');
 return true
}
async function verifyCustomMigration(){
 const fragment=between(custom,'async function migrate(){','\nfunction subjectKey(){');
 const legacyKey='abuQuestionCustomTemplatesV1',store=new Map([[legacyKey,'present']]);
 const rows=[],inserted=[];let fail=true,confirmed=false;
 const factory=new Function('all','put','legacyRows','localStorage','console','Date','confirm','window','inject',
  'const LEGACY="abuQuestionCustomTemplatesV1";let cache=[];const scope=()=>window.AbuQuestionScope.identity();const scopedId=id=>scope()+"|"+id;const unattributedRows=async()=>[];'
  +fragment+';return {migrate,importLegacy,getCache:()=>cache}');
 const win={AbuQuestionScope:{identity:()=> 'user-A:device-1'},parent:{AbuBassamSecurity:{role:()=> 'owner'}}};
 const api=factory(async()=>rows.slice(),async row=>{inserted.push(row.id);if(fail&&row.id==='user-A:device-1|legacy-b')throw Error('QuotaExceeded');rows.push(row)},
  ()=>[{id:'a',html:'one'},{id:'b',html:'two'}],{removeItem:key=>store.delete(key)},{warn(){}},Date,()=>confirmed,win,async()=>{});
 await api.migrate();
 assert.equal(rows.length,0,'Legacy templates must never auto-transfer to an unrelated user');
 assert.equal(store.has(legacyKey),true,'Global templates must remain quarantined');
 assert.equal(await api.importLegacy(),false,'Explicit confirmation is required for legacy import');
 confirmed=true;
 await assert.rejects(api.importLegacy(),/QuotaExceeded/);
 assert.equal(store.has(legacyKey),true,'Failed manual import must not delete global templates');
 assert.equal(rows.length,1);
 fail=false;await api.importLegacy();
 assert.deepEqual(rows.map(x=>x.id),['user-A:device-1|legacy-a','user-A:device-1|legacy-b']);
 await api.importLegacy();
 assert.equal(rows.length,2,'Retrying manual import must not duplicate already imported templates');
 assert.equal(store.has(legacyKey),true,'Successful manual import still preserves original for recovery');
 return true
}
(async()=>{
 await verifyDraft('ar');await verifyDraft('en');await verifyCustomMigration();
 console.log('Question draft integrity checks passed: Arabic and English ordered writes, failed-reset isolation, IDB-only recovery, and retryable lossless template migration.');
})().catch(e=>{console.error(e);process.exitCode=1});
