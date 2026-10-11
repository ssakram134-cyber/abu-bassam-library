(()=>{
'use strict';
if(window.AbuQuestionScope)return;
function identity(){
 try{
  const host=window.parent&&window.parent!==window?window.parent:window;
  const user=String(host.AbuBassamCloud?.session?.()?.user?.id||'').trim();
  const secured=host.AbuBassamSecurity?.device?.()||{};
  const device=String(secured.device_id||secured.id||host.AbuBassamDevices?.ensure?.()?.id||'').trim();
  // Never guess a user's identity from the last-used name, device alone or unscoped storage.
  if(!user||!device||user.length>150||device.length>150)return null;
  return encodeURIComponent(user)+':'+encodeURIComponent(device)
 }catch(_){return null}
}
function scopedKey(base){const id=identity();return id?String(base)+':'+id:null}
function draftRow(language){const id=identity();return id?String(language)+':'+id:null}
function required(){
 const id=identity();
 if(!id)throw Error('تعذر تحديد الحساب والفرع الموثوقين؛ لم تُحفظ المسودة. افتح حسابك المعتمد أولًا.');
 return id
}
function reportSave(ok){
 const controls=document.getElementById('controls');
 if(!controls)return;
 let element=document.getElementById('abuQuestionDraftSaveStatus');
 if(!element){
  element=document.createElement('span');element.id='abuQuestionDraftSaveStatus';
  element.setAttribute('role','status');element.setAttribute('aria-live','polite');
  element.style.cssText='font-size:11px;padding:4px 7px;border-radius:7px;display:inline-block';
  controls.appendChild(element)
 }
 if(ok===true){
  element.textContent='✓ تم حفظ المسودة';element.style.color='#166534';
 }else{
  element.textContent='⚠ لم تُحفظ المسودة، لا تغلق الصفحة؛ تحقق من الحساب أو مساحة التخزين';
  element.style.color='#b91c1c'
 }
}
window.AbuQuestionScope=Object.freeze({identity,scopedKey,draftRow,required,reportSave,same:id=>!!id&&id===identity(),isOwner:()=>{try{const host=window.parent&&window.parent!==window?window.parent:window;return !!identity()&&host.AbuBassamSecurity?.role?.()==='owner'}catch(_){return false}}});
})();
