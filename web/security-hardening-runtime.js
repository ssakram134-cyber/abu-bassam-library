(()=>{
'use strict';
if(window.__ABU_SECURITY_HARDENING_V2__)return;
window.__ABU_SECURITY_HARDENING_V2__=true;

const $=id=>document.getElementById(id);
const LEGACY_TRUST_KEY='abuBassamSecurityTrustV1';
const SECURE_TRUST_KEY='abu_bassam_offline_trust_v2';
const TRUST_REVOCATION_KEY='abuBassamOfflineTrustRevocationPendingV1';
const SECRET_KEY='abu_bassam_device_secret_v1';
const APP_VERSION=String(window.__ABU_APP_META__?.version||'');
const OFFLINE_GRACE_MS=12*60*60*1000;
const CLOCK_SKEW_MS=5*60*1000;
const LOCK_MINUTES_KEY='abuBassamSecurityLockMinutesV1';
let patched=false,lastSealAt=0,offlineSession=false,offlineBackgroundAt=0,offlineEpoch=0,offlineUnlockPending=null,offlineRevalidationPending=null,offlineRevalidationEpoch=-1;

function currentId(){return window.AbuBassamDevices?.ensure?.().id||localStorage.getItem('abuBassamLockedDeviceIdV3')||''}
function nativeAvailable(){return window.AbuBassamNativeSecurity?.available?.()===true}
function online(){return !!(navigator.onLine&&window.AbuBassamCloud?.isConnected?.())}
function enc(v){return new TextEncoder().encode(String(v||''))}
function hex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function constantTime(a,b){a=String(a||'');b=String(b||'');if(a.length!==b.length)return false;let out=0;for(let i=0;i<a.length;i++)out|=a.charCodeAt(i)^b.charCodeAt(i);return out===0}
function cleanLegacy(){localStorage.removeItem(LEGACY_TRUST_KEY)}
function nativeRequest(action,payload={}){const api=window.AbuBassamNativeSecurity;if(!api?.request)return Promise.reject(new Error('NATIVE_SECURITY_REQUIRED'));return api.request(action,payload)}
async function hmac(body,secret){if(!crypto?.subtle)throw new Error('CRYPTO_UNAVAILABLE');const key=await crypto.subtle.importKey('raw',enc(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,enc(body)))}
function serverTime(device){const candidates=[device?.last_seen,device?.updated_at,device?.verified_at,device?.first_seen];for(const value of candidates){const n=Date.parse(value||'');if(Number.isFinite(n)&&n>0)return n}return Date.now()}
function normalizeDevice(device){if(!device||!device.device_id)return null;return{schema:2,device_id:String(device.device_id),device_name:String(device.device_name||''),role:device.role==='owner'?'owner':'secondary',active:device.active!==false,permissions:device.permissions&&typeof device.permissions==='object'?device.permissions:{},verifiedAt:serverTime(device),appVersion:APP_VERSION}}
let trustEpoch=0,trustMutationTail=Promise.resolve(),trustRevokedInMemory=false;
function queueTrustMutation(action){
  // SecureStore calls can finish out of order. Always perform revocations
  // after any write that was already in progress at sign-out time.
  const next=trustMutationTail.catch(()=>{}).then(action);
  trustMutationTail=next.catch(()=>{});
  return next
}
async function seal(device){
  if(!nativeAvailable()||!online())return false;
  const record=normalizeDevice(device);
  if(!record||!record.active||record.device_id!==currentId())return false;
  const epoch=trustEpoch,offlineStart=offlineEpoch;
  const sameSession=()=>{
    const sec=window.AbuBassamSecurity;
    return epoch===trustEpoch&&offlineStart===offlineEpoch&&online()&&
      record.device_id===currentId()&&
      (offlineSession||sec?.isOnlineUnlocked?.()===true)
  };
  if(!sameSession())return false;
  const secret=String(await nativeRequest('secureGet',{key:SECRET_KEY})||'');
  if(!secret||!sameSession())return false;
  const body=JSON.stringify(record),mac=await hmac(body,secret);
  if(!sameSession())return false;
  return queueTrustMutation(async()=>{
    if(!sameSession())return false;
    await nativeRequest('secureSet',{key:SECURE_TRUST_KEY,value:JSON.stringify({body,mac})});
    cleanLegacy();
    if(sameSession()){
      localStorage.removeItem(TRUST_REVOCATION_KEY);
      trustRevokedInMemory=false;
      lastSealAt=Date.now()
    }
    return true
  })
}
async function loadTrust(){if(trustRevokedInMemory||localStorage.getItem(TRUST_REVOCATION_KEY)==='1'||!nativeAvailable())return null;const raw=String(await nativeRequest('secureGet',{key:SECURE_TRUST_KEY})||'');if(!raw)return null;let env;try{env=JSON.parse(raw)}catch(_){return null}if(!env?.body||!env?.mac)return null;const secret=String(await nativeRequest('secureGet',{key:SECRET_KEY})||'');if(!secret)return null;const expected=await hmac(env.body,secret);if(!constantTime(expected,env.mac))return null;let trust;try{trust=JSON.parse(env.body)}catch(_){return null}if(trust?.schema!==2||trust?.appVersion!==APP_VERSION||trust?.device_id!==currentId()||trust?.active===false)return null;const now=Date.now(),verified=Number(trust.verifiedAt||0);if(!verified||now+CLOCK_SKEW_MS<verified||now-verified>OFFLINE_GRACE_MS)return null;return trust}
async function clearTrust(){
  trustEpoch++;
  trustRevokedInMemory=true;
  lastSealAt=0;
  // Persist the denial before trying Android's asynchronous secure deletion.
  // If SecureStore is unavailable, this flag blocks stale trust on next boot.
  try{localStorage.setItem(TRUST_REVOCATION_KEY,'1')}
  catch(error){console.warn('Failed to persist offline revocation flag',error)}
  try{
    await queueTrustMutation(async()=>{
      if(!nativeAvailable())throw new Error('NATIVE_SECURITY_UNAVAILABLE');
      await nativeRequest('secureDelete',{key:SECURE_TRUST_KEY})
    });
    trustRevokedInMemory=false;
    localStorage.removeItem(TRUST_REVOCATION_KEY)
  }catch(error){console.warn('Failed to clear offline trust in SecureStore',error)}
  lastSealAt=0;
  cleanLegacy()
}
async function biometricCheck(){if(!nativeAvailable())throw new Error('الفتح دون إنترنت متاح داخل تطبيق Android فقط.');const status=await nativeRequest('biometricStatus');if(!status?.available||!status?.enrolled)throw new Error('يلزم تفعيل بصمة الجهاز لاستخدام الفتح دون إنترنت.');const result=await nativeRequest('biometricAuth',{reason:'فتح مكتبة أبو بسام دون إنترنت'});if(!result?.success)throw new Error(result?.error==='user_cancel'?'تم إلغاء البصمة.':'لم تنجح المصادقة بالبصمة.');return true}
function applyOfflineDevice(trust){const sec=window.AbuBassamSecurity;if(!sec)return false;sec.__offlineTrust=trust;sec.__offlineRole=trust.role;sec.__offlinePermissions=trust.permissions||{};return true}
function clearOfflineState(){offlineEpoch++;const sec=window.AbuBassamSecurity;offlineSession=false;offlineBackgroundAt=0;if(sec){sec.__offlineTrust=null;sec.__offlineRole='';sec.__offlinePermissions={}}}
function lockOffline(reason){const sec=window.AbuBassamSecurity;clearOfflineState();try{sec?.lockNow?.()}catch(_){}const gate=$('abuSecurityGate');gate?.classList.remove('hide');const err=$('abuLoginError');if(err)err.textContent=reason||'تم قفل الجلسة الآمنة.'}
// Only one biometric challenge may be active. Verify the HMAC trust again
// *after* authentication: connectivity and trust expiry can change meanwhile.
async function secureOfflineUnlock(){
  if(offlineUnlockPending)return offlineUnlockPending;
  const task=performSecureOfflineUnlock();
  offlineUnlockPending=task;
  try{return await task}finally{if(offlineUnlockPending===task)offlineUnlockPending=null}
}
async function performSecureOfflineUnlock(){
  const err=$('abuLoginError'),startEpoch=offlineEpoch;
  try{
    if(online())throw new Error('الإنترنت متاح؛ استخدم تسجيل الدخول أو البصمة العادية.');
    let trust=await loadTrust();
    if(!trust)throw new Error('انتهت أو لم تعد صالحة الثقة دون إنترنت. اتصل بالإنترنت وسجّل الدخول مرة واحدة.');
    await biometricCheck();
    // An explicit lock/logout invalidates any fingerprint prompt still open.
    if(startEpoch!==offlineEpoch)throw new Error('أُلغيت محاولة الفتح بعد قفل الجلسة.');
    if(online())throw new Error('عاد الاتصال بالإنترنت أثناء البصمة. سجّل الدخول للتحقق من الجهاز.');
    trust=await loadTrust();
    if(!trust)throw new Error('انتهت صلاحية الثقة أثناء التحقق. اتصل بالإنترنت لتجديدها.');
    if(startEpoch!==offlineEpoch||online())throw new Error('تغيّرت حالة الأمان أثناء الفتح. حاول من جديد.');
    applyOfflineDevice(trust);
    offlineSession=true;offlineEpoch++;offlineBackgroundAt=0;
    const gate=$('abuSecurityGate');gate?.classList.add('hide');
    if(err)err.textContent='';
    document.dispatchEvent(new CustomEvent('abu-bassam-security-state',{detail:{state:'unlocked',offline:true,device:trust}}));
    const label=$('abuLoginDevice');
    if(label)label.textContent=`هذا الجهاز: ${trust.device_name||'Android'} • ${trust.role==='owner'?'رئيسي':'فرعي'} • Offline آمن`;
    window.AbuBassamOps?.add?.({type:'settings',title:'فتح آمن دون إنترنت',section:'الأمان',details:`بصمة + SecureStore + HMAC • صلاحية ${Math.round(OFFLINE_GRACE_MS/3600000)} ساعة`});
    return true
  }catch(e){if(err)err.textContent=String(e?.message||e);return false}
}
function effectiveRole(){const sec=window.AbuBassamSecurity;if(offlineSession)return sec?.__offlineRole||'';if(sec?.isOnlineUnlocked?.()!==true)return '';return sec?.__baseDevice?.()?.role||''}
function effectiveDevice(){const sec=window.AbuBassamSecurity;if(offlineSession)return sec?.__offlineTrust||null;if(sec?.isOnlineUnlocked?.()!==true)return null;return sec?.__baseDevice?.()||null}
function effectiveCan(name){const sec=window.AbuBassamSecurity;if(offlineSession){if(sec?.__offlineRole==='owner')return true;return !!sec?.__offlinePermissions?.[name]}if(sec?.isOnlineUnlocked?.()!==true)return false;const device=sec?.__baseDevice?.();return !!(device&&sec?.__baseCan?.(name))}
async function refreshLimit(){const sec=window.AbuBassamSecurity;if(!sec)return 5;let limit=Number(localStorage.getItem('abuBassamDeviceLimitV1')||5)||5;try{if(window.AbuBassamDeviceRegistry?.readLimit)limit=Number(await AbuBassamDeviceRegistry.readLimit())||limit}catch(_){}limit=Math.max(1,Math.min(50,limit));sec.maxDevices=limit;document.querySelectorAll('#abuDeviceModal .abu-device-head div div').forEach(el=>{if(/الحد الأقصى/.test(el.textContent||''))el.textContent=`الحد الأقصى ${limit} أجهزة • الرئيسي يتحكم بالفرعية`});const error=$('abuLoginError');if(error&&/الحد الأقصى/.test(error.textContent||''))error.textContent=`وصل الحساب إلى الحد الأقصى المسموح (${limit} جهازًا). غيّر الحد من الجهاز الرئيسي أو احذف جهازًا فرعيًا.`;return limit}
async function updateOfflineButton(){const b=$('abuOfflineBtn');if(!b)return;if(online()||!nativeAvailable()){b.style.display='none';return}try{b.style.display=(await loadTrust())?'block':'none'}catch(_){b.style.display='none'}}
// Deduplicate server checks; a result from a prior locked/logged-out
// session must never re-enable its roles or permissions.
async function revalidateOfflineSession(){
  if(!offlineSession||!online())return true;
  if(offlineRevalidationPending&&offlineRevalidationEpoch===offlineEpoch)return offlineRevalidationPending;
  const epoch=offlineEpoch;
  const task=(async()=>{
    const sec=window.AbuBassamSecurity,c=window.AbuBassamCloud?.client,trust=sec?.__offlineTrust;
    if(!c||!trust){if(offlineSession&&epoch===offlineEpoch)lockOffline('عاد الإنترنت ويجب تسجيل الدخول للتحقق من الجهاز.');return false}
    try{
      const secret=String(await nativeRequest('secureGet',{key:SECRET_KEY})||'');
      if(!secret)throw new Error('DEVICE_SECRET_MISSING');
      if(!offlineSession||epoch!==offlineEpoch)return false;
      const {data,error}=await c.rpc('abu_bassam_touch_device',{p_device_id:currentId(),p_secret:secret,p_device_name:trust.device_name||'هاتف المكتبة',p_model:'',p_platform:'Android',p_app_version:APP_VERSION});
      if(error)throw error;
      const row=Array.isArray(data)?data[0]:data;
      if(!row||row.active===false)throw new Error('DEVICE_DISABLED');
      const refreshed=normalizeDevice(row);
      if(!refreshed)throw new Error('DEVICE_NOT_AUTHORIZED');
      if(!offlineSession||epoch!==offlineEpoch)return false;
      applyOfflineDevice(refreshed);
      await seal(row);
      return offlineSession&&epoch===offlineEpoch
    }catch(_){
      if(offlineSession&&epoch===offlineEpoch)lockOffline('تعذر التحقق من صلاحية هذا الجهاز بعد عودة الإنترنت. سجّل الدخول من جديد.');
      return false
    }
  })();
  offlineRevalidationPending=task;offlineRevalidationEpoch=epoch;
  try{return await task}finally{if(offlineRevalidationPending===task){offlineRevalidationPending=null;offlineRevalidationEpoch=-1}}
}
function patchSecurity(){const sec=window.AbuBassamSecurity;if(!sec||patched)return false;patched=true;sec.__baseCan=sec.can;sec.__baseDevice=sec.device;const baseLogin=sec.login?.bind(sec),baseBio=sec.unlockWithBiometric?.bind(sec),baseLogout=sec.logout?.bind(sec);
  sec.role=effectiveRole;sec.device=effectiveDevice;sec.can=effectiveCan;sec.offlineUnlock=secureOfflineUnlock;sec.isOfflineSession=()=>offlineSession;sec.clearOfflineTrust=clearTrust;sec.refreshDeviceLimit=refreshLimit;sec.offlineGraceHours=OFFLINE_GRACE_MS/3600000;
  if(baseLogin)sec.login=async function(...args){if(/Android/i.test(navigator.userAgent||'')&&!nativeAvailable()){const e=$('abuLoginError');if(e)e.textContent='تعذر الوصول إلى طبقة الأمان في Android. أعد فتح التطبيق أو أعد تثبيته.';return false}const result=await baseLogin(...args);await refreshLimit();const d=sec.__baseDevice?.();if(d&&online()&&d.active!==false){clearOfflineState();await seal(d).catch(()=>{})}cleanLegacy();return result};
  if(baseBio)sec.unlockWithBiometric=async function(...args){if(!online())return secureOfflineUnlock();const result=await baseBio(...args);await refreshLimit();const d=sec.__baseDevice?.();if(d&&online()&&d.active!==false){clearOfflineState();await seal(d).catch(()=>{})}cleanLegacy();return result};
  if(baseLogout)sec.logout=async function(...args){const didLogout=await baseLogout(...args);if(didLogout===true){await clearTrust();clearOfflineState()}return didLogout};
  const loginBtn=$('abuLoginBtn');if(loginBtn)loginBtn.onclick=()=>sec.login();const bioBtn=$('abuBioLoginBtn');if(bioBtn)bioBtn.onclick=()=>sec.unlockWithBiometric();const offlineBtn=$('abuOfflineBtn');if(offlineBtn)offlineBtn.onclick=secureOfflineUnlock;
  refreshLimit();updateOfflineButton();return true
}
async function sealIfOnlineUnlocked(){if(!online()||offlineSession||Date.now()-lastSealAt<60000)return;const sec=window.AbuBassamSecurity,gate=$('abuSecurityGate'),d=sec?.__baseDevice?.();if(sec&&gate?.classList.contains('hide')&&d?.active!==false)await seal(d).catch(()=>{})}
async function enforceOfflineSession(){if(!offlineSession)return;const trust=await loadTrust().catch(()=>null);if(!trust){lockOffline('انتهت صلاحية الفتح دون إنترنت. اتصل بالإنترنت وسجّل الدخول.');return}if(online())await revalidateOfflineSession()}
function onVisibility(){if(document.visibilityState==='hidden'){if(offlineSession)offlineBackgroundAt=Date.now();return}updateOfflineButton();if(offlineSession){const mins=Math.max(0,Number(localStorage.getItem(LOCK_MINUTES_KEY)||5));if(offlineBackgroundAt&&Date.now()-offlineBackgroundAt>=mins*60000){lockOffline('انتهت مهلة القفل التلقائي.');return}offlineBackgroundAt=0;enforceOfflineSession()}else if(online())sealIfOnlineUnlocked()}
function onSecurityState(event){updateOfflineButton();if(event?.detail?.state==='locked'){if(offlineSession)clearOfflineState();else offlineEpoch++;}if(event?.detail?.state==='unlocked'&&online())sealIfOnlineUnlocked()}
function init(){cleanLegacy();if(!patchSecurity())throw new Error('APP_SECURITY_REQUIRED');document.addEventListener('abu-bassam-security-state',onSecurityState);document.addEventListener('abu-bassam-auth-changed',()=>{refreshLimit();updateOfflineButton();if(online())sealIfOnlineUnlocked()});window.addEventListener('online',()=>{refreshLimit();updateOfflineButton();if(offlineSession)revalidateOfflineSession();else setTimeout(sealIfOnlineUnlocked,500)});window.addEventListener('offline',updateOfflineButton);document.addEventListener('visibilitychange',onVisibility);setInterval(enforceOfflineSession,60000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();