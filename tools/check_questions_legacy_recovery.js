'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const runtime=fs.readFileSync('web/questions-legacy-draft-recovery-runtime.js','utf8');
const helper=fs.readFileSync('web/questions-storage-scope-runtime.js','utf8');
const arabic=fs.readFileSync('web/questions-ar.html','utf8');
const english=fs.readFileSync('web/questions-en.html','utf8');
new vm.Script(runtime);new vm.Script(helper);
for(const html of [arabic,english]){
 assert.ok(html.indexOf('questions-storage-scope-runtime.js')<html.indexOf('questions-legacy-draft-recovery-runtime.js'));
 assert.ok(html.includes('questions-legacy-draft-recovery-runtime.js'));
}
let user='account-A',device='device-1',role='owner',confirmed=false,reloads=0,readHook=null;
const records=new Map(),alerts=[],saved=new Map();
const host={AbuBassamCloud:{session:()=>({user:{id:user}})},AbuBassamSecurity:{device:()=>({device_id:device}),role:()=>role}};
const document={readyState:'loading',documentElement:{lang:'ar'},addEventListener(){},getElementById:()=>null};
const window={parent:host,addEventListener(){}};
new Function('window',helper)(window);
const storage={getItem:key=>saved.get(key)||null,setItem:(key,v)=>saved.set(key,String(v)),removeItem:key=>saved.delete(key)};
const db={
 close(){},
 get objectStoreNames(){return {contains:()=>true}},
 transaction(){
  const tx={error:null};
  tx.objectStore=()=>({
   get(id){const request={};queueMicrotask(()=>{
    if(readHook)readHook(id);
    request.result=records.get(id)||null;request.onsuccess?.()
   });return request},
   add(row){queueMicrotask(()=>{
    if(records.has(row.id)){
     tx.error=Error('ConstraintError');tx.onerror?.();return
    }
    records.set(row.id,{...row});tx.oncomplete?.()
   })}
  });return tx
 }
};
const indexedDB={open(){const request={};queueMicrotask(()=>{request.result=db;request.onsuccess?.()});return request}};
const location={reload:()=>{reloads++}};
new Function('window','document','indexedDB','localStorage','confirm','alert','location',runtime)(
 window,document,indexedDB,storage,()=>confirmed,m=>alerts.push(String(m)),location
);
const run=window.AbuQuestionLegacyDraftRecovery.importDraft;
async function error(p,pattern){await assert.rejects(p,pattern)}
(async()=>{
 records.set('ar',{id:'ar',html:'old-Arabic-IDB'});
 saved.set('abuBassamQuestionDraftEnglishV1','old-English-local');
 confirmed=false;assert.equal(await run('ar'),false);assert.equal(records.size,1);
 confirmed=true;role='subuser';await error(run('ar'),/المسؤول الرئيسي/);role='owner';
 assert.equal(await run('ar'),true);
 const row='ar:account-A:device-1';assert.equal(records.get(row).html,'old-Arabic-IDB');
 assert.equal(records.get('ar').html,'old-Arabic-IDB','Recovery must not delete the original');
 assert.equal(reloads,1);await error(run('ar'),/توجد مسودة/);
 user='account-B';
 assert.equal(await run('en'),true);
 assert.equal(records.get('en:account-B:device-1').html,'old-English-local');
 assert.ok(saved.has('abuBassamQuestionDraftEnglishV1'));
 user='account-A';
 // A login change while reading a legacy draft is refused before insertion.
 records.delete('ar:account-A:device-1');
 readHook=id=>{if(id==='ar')user='account-C'};
 await error(run('ar'),/تغيّر الحساب/);
 assert.equal(records.has('ar:account-A:device-1'),false);
 user='account-A';readHook=null;role='owner';
 records.set('ar:account-A:device-1',{id:'ar:account-A:device-1',html:'existing-new'});
 await error(run('ar'),/توجد مسودة/);
 assert.equal(records.get('ar:account-A:device-1').html,'existing-new');
 assert.ok(alerts.some(x=>x.includes('تم استيراد')));
 console.log('Question legacy recovery passed: explicit owner approval, Arabic IDB, English local draft, existing-draft protection, account-change refusal and source preservation.');
})().catch(e=>{console.error(e);process.exitCode=1});
