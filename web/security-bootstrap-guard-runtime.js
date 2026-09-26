(()=>{
'use strict';
if(window.__ABU_SECURITY_BOOTSTRAP_GUARD_V1__)return;
window.__ABU_SECURITY_BOOTSTRAP_GUARD_V1__=true;

const LEGACY_TRUST_KEY='abuBassamSecurityTrustV1';
let timer=0;

function wipeLegacyTrust(){
  try{localStorage.removeItem(LEGACY_TRUST_KEY)}catch(_){}
}
function setError(message){
  const el=document.getElementById('abuLoginError');
  if(el)el.textContent=message;
}
function denyLegacyOffline(){
  wipeLegacyTrust();
  setError('جاري تحميل طبقة الأمان المشددة. فتح التطبيق دون إنترنت يتطلب SecureStore + HMAC + البصمة.');
  return false;
}
function installRuntimeGuard(){
  wipeLegacyTrust();
  if(window.__ABU_SECURITY_HARDENING_V2__){cleanup();return}
  const sec=window.AbuBassamSecurity;
  if(!sec||sec.__bootstrapOfflineGuarded)return;
  const baseBio=typeof sec.unlockWithBiometric==='function'?sec.unlockWithBiometric.bind(sec):null;
  sec.__bootstrapOfflineGuarded=true;
  sec.offlineUnlock=denyLegacyOffline;
  if(baseBio){
    sec.unlockWithBiometric=async function(...args){
      if(!navigator.onLine)return denyLegacyOffline();
      return baseBio(...args);
    };
  }
}
function captureSensitiveClick(event){
  if(window.__ABU_SECURITY_HARDENING_V2__){cleanup();return}
  const target=event.target?.closest?.('#abuOfflineBtn,#abuBioLoginBtn');
  if(!target)return;
  if(target.id==='abuOfflineBtn'||(target.id==='abuBioLoginBtn'&&!navigator.onLine)){
    event.preventDefault();
    event.stopImmediatePropagation();
    denyLegacyOffline();
  }
}
function cleanup(){
  if(timer){clearInterval(timer);timer=0}
  document.removeEventListener('click',captureSensitiveClick,true);
  wipeLegacyTrust();
}

wipeLegacyTrust();
document.addEventListener('click',captureSensitiveClick,true);
installRuntimeGuard();
timer=setInterval(installRuntimeGuard,20);
setTimeout(()=>{if(window.__ABU_SECURITY_HARDENING_V2__)cleanup()},2000);
})();
