'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('web/questions-storage-scope-runtime.js','utf8');
const ar=fs.readFileSync('web/questions-completion-runtime.js','utf8');
const en=fs.readFileSync('web/questions-en-fixes-runtime.js','utf8');
const custom=fs.readFileSync('web/questions-custom-library-runtime.js','utf8');
new vm.Script(source,{filename:'questions-storage-scope-runtime.js'});
for(const code of [ar,en,custom])new vm.Script(code);
let user='account-A',device='device-1';
const host={
 AbuBassamCloud:{session:()=>({user:{id:user}})},
 AbuBassamSecurity:{device:()=>({device_id:device}),role:()=> 'owner'}
};
const window={parent:host};
new Function('window',source)(window);
const scope=window.AbuQuestionScope;
assert.equal(scope.identity(),'account-A:device-1');
assert.equal(scope.draftRow('ar'),'ar:account-A:device-1');
assert.equal(scope.scopedKey('name'),'name:account-A:device-1');
user='account-B';
assert.equal(scope.draftRow('ar'),'ar:account-B:device-1');
user='account-A';device='device-2';
assert.equal(scope.identity(),'account-A:device-2');
device='device-1';user='';
assert.equal(scope.scopedKey('private'),null,'Anonymous session must have no persistent private storage key');
assert.throws(()=>scope.required(),/تعذر تحديد الحساب/);
user='account-A';
function block(code,begin,end){
 const start=code.indexOf(begin),stop=code.indexOf(end,start+begin.length);
 assert.ok(start>=0&&stop>start,'Missing source block '+begin);
 return code.slice(start,stop)
}
function mockDb(){
 const records=new Map();
 const db={
  close(){},
  transaction(){
   const tx={};
   tx.objectStore=()=>({
    get(id){const request={};queueMicrotask(()=>{request.result=records.get(id)||undefined;request.onsuccess?.()});return request},
    getAll(){const request={};queueMicrotask(()=>{request.result=[...records.values()];request.onsuccess?.()});return request},
    put(row){queueMicrotask(()=>{records.set(row.id,{...row});tx.oncomplete?.()})},
    delete(id){queueMicrotask(()=>{records.delete(id);tx.oncomplete?.()})}
   });
   return tx
  }
 };
 return {records,openDb:async()=>db}
}
async function testDraft(language,src,start,end,prefix,put,get,del){
 const db=mockDb(),scopeRow=()=>scope.draftRow(language),active=()=>scope.identity();
 db.records.set(language,{id:language,html:'unattributed-content'});
 const runtime=new Function('dbOpen','rowId','scope','Date','IDB_STORE','STORE',
  block(src,start,end)+';return {put:'+put+',get:'+get+',remove:'+del+'}')(
  db.openDb,scopeRow,active,Date,'drafts','drafts');
 assert.equal(await runtime.get(),null,'Never read old unattributed '+language+' draft');
 user='account-A';assert.equal(await runtime.put('private-A'),true);
 user='account-B';assert.equal(await runtime.get(),null,'Do not display account A draft to account B');
 assert.equal(await runtime.put('private-B'),true);
 user='account-A';assert.equal((await runtime.get()).html,'private-A');
 assert.equal(await runtime.remove(),true);
 assert.equal(await runtime.get(),null);
 user='account-B';assert.equal((await runtime.get()).html,'private-B','Deleting account A must preserve account B');
 assert.equal(db.records.get(language).html,'unattributed-content','Legacy draft must be preserved intact');
 user='account-A'
}
async function testTemplates(){
 const db=mockDb();
 db.records.set('old',{id:'old',name:'Legacy',html:'legacy'});
 db.records.set('account-A:device-1|a',{id:'account-A:device-1|a',scope:'account-A:device-1',name:'A'});
 db.records.set('account-B:device-1|b',{id:'account-B:device-1|b',scope:'account-B:device-1',name:'B'});
 const fragment=block(custom,'async function all(){','\nfunction subjectKey(){');
 const legacyStore=new Map([['abuQuestionCustomTemplatesV1',JSON.stringify([{id:'localLegacy',html:'old'}])]]);
 let confirmed=false;
 const runtime=new Function('openDb','window','localStorage','confirm','console','Date','STORE','LEGACY','inject',
  'const scope=()=>window.AbuQuestionScope.identity();const scopedId=id=>window.AbuQuestionScope.required()+"|"+id;'+
  'const authorizedId=id=>!!scope()&&String(id).startsWith(scope()+"|");let cache=[];'+fragment+
  ';return {all,put,remove,clearAll,migrate,importLegacy,unattributedRows}')(
  db.openDb,{AbuQuestionScope:scope,parent:host},{getItem:k=>legacyStore.get(k)||null,removeItem:k=>legacyStore.delete(k)},
  ()=>confirmed,{warn(){}},Date,'templates','abuQuestionCustomTemplatesV1',async()=>{});
 user='account-A';assert.deepEqual((await runtime.all()).map(x=>x.id),['account-A:device-1|a']);
 user='account-B';assert.deepEqual((await runtime.all()).map(x=>x.id),['account-B:device-1|b']);
 await assert.rejects(runtime.remove('account-A:device-1|a'),/ACCOUNT_SCOPE_REQUIRED/);
 await runtime.clearAll();
 assert.ok(db.records.has('account-A:device-1|a'),'Clearing B cannot delete A');
 assert.ok(db.records.has('old'),'Clearing B cannot delete unattributed templates');
 user='account-A';await runtime.migrate();
 assert.ok(db.records.has('old'),'Automatic migration must not claim old documents');
 assert.equal(await runtime.importLegacy(),false,'Unattributed data requires owner confirmation');
 confirmed=true;await runtime.importLegacy();
 assert.ok(db.records.has('account-A:device-1|legacy-localLegacy'));
 assert.ok(db.records.has('account-A:device-1|legacy-old'));
 assert.ok(db.records.has('old'),'Original old DB record must survive importing');
 assert.ok(legacyStore.has('abuQuestionCustomTemplatesV1'));
 await runtime.importLegacy();assert.equal([...db.records.keys()].filter(k=>k.includes('|legacy-')).length,2);
 await runtime.clearAll();
 assert.ok(db.records.has('old'),'Clearing A must not delete old unattributed data');
 assert.ok(!db.records.has('account-A:device-1|a'),'Account A records should be deletable');
 assert.ok(!db.records.has('account-A:device-1|legacy-old'),'Imported A record should be deletable');
}
(async()=>{
 await testDraft('ar',ar,'async function idbPut(','\nasync function saveDurableDraft(','arabic','idbPut','idbGet','idbDelete');
 await testDraft('en',en,'async function dbPut(','\nasync function durableSave(','english','dbPut','dbGet','dbDelete');
 await testTemplates();
 console.log('Question scoped storage regression passed: two users, two branches, no unauthenticated persistence, distinct draft rows, account-limited template deletion and explicit non-destructive legacy recovery.');
})().catch(e=>{console.error(e);process.exitCode=1});
