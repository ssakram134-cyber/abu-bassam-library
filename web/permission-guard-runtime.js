(()=>{
'use strict';
if(window.__ABU_PERMISSION_GUARD_V1__)return;
window.__ABU_PERMISSION_GUARD_V1__=true;

const security=()=>window.AbuBassamSecurity;
let toastTimer=null;
function secondary(){return security()?.role?.()==='secondary'}
function allowed(permission){return !secondary()||security()?.can?.(permission)!==false}
function textOf(el){return `${el?.id||''} ${el?.className||''} ${el?.getAttribute?.('onclick')||''} ${el?.getAttribute?.('title')||''} ${el?.textContent||''}`.toLowerCase()}
function exempt(el){return !!el?.closest?.('#abuSecurityGate,#abuSecuritySettings,#abuSecurityExtrasSettings,#abuDeviceModal')}
function permissionFor(el){
  const text=textOf(el);
  if(/device|devices|جهاز|الأجهزة/.test(text)&&/manage|إدارة|remove|delete|إيقاف|تفعيل|صلاح/.test(text))return'devices';
  if(/security|أمان|بصمة|biometric|password|كلمة مرور/.test(text))return'security';
  if(/reset|resetdata|resetdefaults|إعادة ضبط|استعادة الإعدادات/.test(text))return'reset';
  if(/print|طباعة/.test(text))return'print';
  if(/theme|font|typography|appearance|ثيم|خطوط|الخط|مظهر/.test(text))return'appearance';
  if(/sync|cloud|backup|مزامنة|نسخ احتياطي/.test(text))return'sync';
  if(/download|export|savepdf|pdf|gallery|share|تصدير|مشاركة|حفظ في المعرض/.test(text))return'export';
  if(/delete|remove|clear|add|crop|rotate|move|duplicate|replace|edit|resize|قص|تدوير|حذف|إضافة|استبدال|نقل|تحرير|تغيير الحجم/.test(text))return'edit';
  return''
}
function toast(message){
  let el=document.getElementById('abuPermissionToast');if(!el){el=document.createElement('div');el.id='abuPermissionToast';el.style.cssText='position:fixed;z-index:48000;left:50%;bottom:74px;transform:translateX(-50%) translateY(20px);opacity:0;transition:.18s;background:#9f2735;color:#fff;border-radius:20px;padding:9px 14px;font:900 10px Tahoma;pointer-events:none;white-space:nowrap;';document.body.appendChild(el)}
  el.textContent=message;el.style.opacity='1';el.style.transform='translateX(-50%) translateY(0)';clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.style.opacity='0';el.style.transform='translateX(-50%) translateY(20px)'},1800)
}
function deny(permission){const names={edit:'التعديل',print:'الطباعة',export:'الحفظ والتصدير',appearance:'الثيمات والخطوط',sync:'المزامنة',security:'إعدادات الأمان',devices:'إدارة الأجهزة',reset:'إعادة الضبط'};toast(`هذه الصلاحية موقوفة على الجهاز الفرعي: ${names[permission]||permission}`)}
function clickGuard(event){
  if(!secondary())return;const target=event.target?.closest?.('button,a,[role="button"],label');if(!target||exempt(target))return;
  const permission=permissionFor(target);if(permission&&!allowed(permission)){event.preventDefault();event.stopImmediatePropagation();deny(permission)}
}
function editableTarget(target){return target?.closest?.('input,textarea,select,[contenteditable="true"]')}
function fieldGuard(event){
  if(!secondary()||allowed('edit'))return;const field=editableTarget(event.target);if(!field||exempt(field)||field.closest('#abuSettingsModal'))return;
  event.preventDefault();event.stopImmediatePropagation();field.blur?.();deny('edit')
}
function keyGuard(event){
  if(!secondary()||allowed('edit'))return;const field=editableTarget(event.target);if(!field||exempt(field)||field.closest('#abuSettingsModal'))return;
  if(event.key.length===1||['Backspace','Delete','Enter'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();deny('edit')}
}
function restoreDecorated(){
  document.querySelectorAll('[data-abu-permission-guarded="1"]').forEach(el=>{
    el.style.opacity=el.dataset.abuPermissionPrevOpacity||'';
    if(el.dataset.abuPermissionPrevTitle)el.title=el.dataset.abuPermissionPrevTitle;else el.removeAttribute('title');
    delete el.dataset.abuPermissionGuarded;delete el.dataset.abuPermissionPrevOpacity;delete el.dataset.abuPermissionPrevTitle;delete el.dataset.abuPermissionDenied
  })
}
function decorate(){
  if(!secondary()){restoreDecorated();return}
  document.querySelectorAll('button,a,[role="button"]').forEach(el=>{
    if(exempt(el))return;
    const permission=permissionFor(el),denied=!!permission&&!allowed(permission);
    if(denied){
      if(el.dataset.abuPermissionGuarded!=='1'){el.dataset.abuPermissionGuarded='1';el.dataset.abuPermissionPrevOpacity=el.style.opacity||'';el.dataset.abuPermissionPrevTitle=el.title||''}
      el.dataset.abuPermissionDenied='1';el.style.opacity='.48';el.title=`الصلاحية موقوفة: ${permission}`
    }else if(el.dataset.abuPermissionGuarded==='1'){
      el.style.opacity=el.dataset.abuPermissionPrevOpacity||'';
      if(el.dataset.abuPermissionPrevTitle)el.title=el.dataset.abuPermissionPrevTitle;else el.removeAttribute('title');
      delete el.dataset.abuPermissionGuarded;delete el.dataset.abuPermissionPrevOpacity;delete el.dataset.abuPermissionPrevTitle;delete el.dataset.abuPermissionDenied
    }
  })
}
let decorateQueued=false;
function scheduleDecorate(){
  if(decorateQueued)return;
  decorateQueued=true;
  requestAnimationFrame(()=>{decorateQueued=false;decorate()})
}
function boot(){
  document.addEventListener('click',clickGuard,true);
  document.addEventListener('beforeinput',fieldGuard,true);
  document.addEventListener('paste',fieldGuard,true);
  document.addEventListener('drop',fieldGuard,true);
  document.addEventListener('keydown',keyGuard,true);
  document.addEventListener('abu-runtime-loaded',scheduleDecorate);
  document.addEventListener('abu-bassam-auth-changed',scheduleDecorate);
  document.addEventListener('abu-bassam-security-state',scheduleDecorate);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleDecorate()});
  decorate()
}
window.AbuBassamPermissionGuard={allowed,permissionFor,decorate};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
