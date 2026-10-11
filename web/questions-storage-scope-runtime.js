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
window.AbuQuestionScope=Object.freeze({identity,scopedKey,draftRow,required,same:id=>!!id&&id===identity(),isOwner:()=>{try{const host=window.parent&&window.parent!==window?window.parent:window;return !!identity()&&host.AbuBassamSecurity?.role?.()==='owner'}catch(_){return false}}});
})();
