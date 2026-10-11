(()=>{
'use strict';
if(window.AbuQuestionLegacyDraftRecovery)return;
const DRAFT_DB='AbuBassamQuestionDraftV2',STORE='drafts';
const OLD_KEYS={ar:'abuBassamQuestionDraftArabicV1',en:'abuBassamQuestionDraftEnglishV1'};
let busy=false;
function scope(){return window.AbuQuestionScope}
function eligible(){return !!scope()?.isOwner?.()&&!!scope()?.identity?.()}
function language(){return document.documentElement.lang?.toLowerCase().startsWith('en')?'en':'ar'}
function openDb(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DRAFT_DB,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'id'})};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error('Unable to open question drafts'))
 })
}
async function read(id){
 const db=await openDb();
 try{return await new Promise((resolve,reject)=>{
  const request=db.transaction(STORE,'readonly').objectStore(STORE).get(id);
  request.onsuccess=()=>resolve(request.result||null);
  request.onerror=()=>reject(request.error||Error('Unable to read question draft'))
 })}finally{db.close?.()}
}
async function insertOnly(row,owner){
 const db=await openDb();
 try{
  if(!eligible()||scope().identity()!==owner)throw Error('تغيّر الحساب خلال فتح قاعدة البيانات.');
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,'readwrite');
   tx.objectStore(STORE).add(row);
   tx.oncomplete=resolve;
   tx.onerror=()=>reject(tx.error||Error('Unable to import question draft'));
   tx.onabort=()=>reject(tx.error||Error('Question draft import cancelled'))
  })
 }finally{db.close?.()}
}
async function importDraft(lang=language()){
 const type=lang==='en'?'en':'ar';
 if(busy)return false;
 if(!eligible())throw Error('يتطلب الاستيراد حساب المسؤول الرئيسي الموثق.');
 const owner=scope().identity();
 if(!confirm('هذه مسودة قديمة غير منسوبة إلى حساب. تأكد أنك مالكها قبل نسخها إلى حسابك الحالي. لن تُحذف النسخة القديمة. متابعة؟'))return false;
 busy=true;
 try{
  if(!eligible()||scope().identity()!==owner)throw Error('تغيّر حساب المسؤول أثناء الاستيراد.');
  const target=scope().draftRow(type);
  // An IndexedDB add() below prevents overwriting even when two imports race.
  if(await read(target))throw Error('توجد مسودة سابقة لهذا الحساب؛ احفظها بصورة مستقلة قبل استيراد المسودة القديمة.');
  const old=await read(type);
  let fallback='';try{fallback=String(localStorage.getItem(OLD_KEYS[type])||'')}catch(_){}
  const html=String(old?.html||fallback||'');
  if(!html)throw Error('لم يُعثر على مسودة قديمة لاستردادها.');
  if(!eligible()||scope().identity()!==owner)throw Error('تغيّر الحساب قبل كتابة المسودة.');
  await insertOnly({id:target,html,updatedAt:Date.now()},owner);
  if(!eligible()||scope().identity()!==owner)throw Error('تغيّر الحساب بعد عملية النقل. افحص المسودة عند تسجيل الدخول.');
  alert('تم استيراد نسخة إلى حسابك دون حذف المسودة القديمة. سيُعاد فتح محرر الأسئلة.');
  location.reload();
  return true
 }finally{busy=false}
}
function init(){
 if(!eligible())return;
 const controls=document.getElementById('controls');
 if(!controls||document.getElementById('abuLegacyDraftRecoveryBtn'))return;
 const button=document.createElement('button');
 button.type='button';button.id='abuLegacyDraftRecoveryBtn';button.className='btn btn-undo';
 button.textContent=language()==='en'?'Recover older draft':'استرداد مسودة قديمة';
 button.onclick=()=>importDraft().catch(e=>alert(String(e?.message||e)));
 controls.appendChild(button)
}
window.AbuQuestionLegacyDraftRecovery=Object.freeze({importDraft});
window.addEventListener('message',event=>{
 if(event.source===window.parent&&event.data?.type==='abuBassamTabVisible')init()
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
