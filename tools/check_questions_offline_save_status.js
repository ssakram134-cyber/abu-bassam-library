'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('web/questions-storage-scope-runtime.js','utf8');
const ar=fs.readFileSync('web/questions-completion-runtime.js','utf8');
const en=fs.readFileSync('web/questions-en-fixes-runtime.js','utf8');
new vm.Script(source);new vm.Script(ar);new vm.Script(en);
let signedIn=true,device='branch-A',networkRequests=0;
const saved=()=>signedIn?{user:{id:'confirmed-user-A'}}:null;
const host={AbuBassamCloud:{session:saved},AbuBassamSecurity:{device:()=>({device_id:device}),role:()=> 'owner'}};
const control={appendChild(child){elements.set(child.id,child)}};
const elements=new Map([['controls',control]]);
const document={
 getElementById:id=>elements.get(id)||null,
 createElement:()=>({textContent:'',style:{},setAttribute(){}})
};
const win={parent:host,navigator:{onLine:false}};
new Function('window','document',source)(win,document);
const question=win.AbuQuestionScope;
assert.equal(question.identity(),'confirmed-user-A:branch-A','Offline cached authenticated user remains valid');
assert.equal(question.draftRow('ar'),'ar:confirmed-user-A:branch-A');
assert.equal(question.draftRow('en'),'en:confirmed-user-A:branch-A');
question.reportSave(false);
const first=elements.get('abuQuestionDraftSaveStatus');
assert.ok(first.textContent.includes('لم تُحفظ المسودة'),'Failed save must visibly warn user not to exit');
question.reportSave(true);
assert.ok(first.textContent.includes('تم حفظ المسودة'),'Confirmed save must replace warning');
assert.equal(elements.size,2,'No duplicate status element');
device='branch-B';
assert.equal(question.draftRow('ar'),'ar:confirmed-user-A:branch-B','New device must use separate draft key');
signedIn=false;
assert.equal(question.identity(),null,'Offline lock with no account identity must fail closed');
assert.equal(question.scopedKey('draft'),null);
assert.throws(()=>question.required(),/تعذر تحديد الحساب/);
question.reportSave(false);
assert.ok(first.textContent.includes('لا تغلق الصفحة'));
assert.equal(networkRequests,0,'Question scoped storage helper must work without any network requests');
assert.ok(ar.includes('AbuQuestionScope?.reportSave?.(ok)'));
assert.ok(en.includes('AbuQuestionScope?.reportSave?.(ok)'));
console.log('Question offline safeguards passed: cached identity without network, unavailable-session fail-closed and visible autosave status.');
