(()=>{
'use strict';
if(window.__ABU_SECURITY_EXTRAS_V1__)return;
window.__ABU_SECURITY_EXTRAS_V1__=true;

const $=id=>document.getElementById(id);
const PIN_KEY='abu_bassam_danger_pin_hash_v1';
const PIN_FAIL_KEY='abu_bassam_danger_pin_failures_v1';
const PIN_LOCK_KEY='abu_bassam_danger_pin_lock_until_v1';
const SNAPSHOT_KEY='abuBassamEmergencySnapshotV1';
const PRIVACY_KEY='abuBassamPrivacyModeV1';
let bypassTarget=null;
let snapshotTimer=null;
let privacyHideTimer=null;

function log(title,details=''){try{window.AbuBassamOps?.add?.({type:'settings',title,section:'الأمان',details})}catch(e){}}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function isOwner(){return window.AbuBassamSecurity?.role?.()==='owner'}
function canSecurity(){return window.AbuBassamSecurity?.can?.('security')||isOwner()}
function nativeAvailable(){return window.AbuBassamNativeSecurity?.available?.()===true}
function requireNativeSecurity(){if(nativeAvailable())return true;alert('تعذر الوصول إلى التخزين الآمن في Android. أعد فتح التطبيق قبل تنفيذ هذه العملية الحساسة.');return false}

function nativeRequest(action,payload={}){const api=window.AbuBassamNativeSecurity;if(!api?.request)return Promise.reject(new Error('NATIVE_SECURITY_REQUIRED'));return api.request(action,payload)}
async function digest(value){
  const bytes=new TextEncoder().encode(String(value)),hash=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')
}
async function pinHash(){return String(await nativeRequest('secureGet',{key:PIN_KEY})||'')}
async function pinThrottleState(){
  const failures=Math.max(0,Number(await nativeRequest('secureGet',{key:PIN_FAIL_KEY})||0)||0);
  const lockUntil=Math.max(0,Number(await nativeRequest('secureGet',{key:PIN_LOCK_KEY})||0)||0);
  if(lockUntil&&lockUntil<=Date.now()){await nativeRequest('secureDelete',{key:PIN_LOCK_KEY}).catch(()=>{});return{failures,lockUntil:0}}
  return{failures,lockUntil}
}
async function clearPinFailures(){await nativeRequest('secureDelete',{key:PIN_FAIL_KEY}).catch(()=>{});await nativeRequest('secureDelete',{key:PIN_LOCK_KEY}).catch(()=>{})}
async function recordPinFailure(){
  const state=await pinThrottleState(),failures=state.failures+1;
  if(failures<5){await nativeRequest('secureSet',{key:PIN_FAIL_KEY,value:String(failures)});return{failures,lockUntil:0}}
  const blocks=Math.max(1,Math.floor(failures/5)),duration=Math.min(15*60*1000,30000*(2**Math.min(5,blocks-1))),lockUntil=Date.now()+duration;
  await nativeRequest('secureSet',{key:PIN_FAIL_KEY,value:String(failures)});
  await nativeRequest('secureSet',{key:PIN_LOCK_KEY,value:String(lockUntil)});
  return{failures,lockUntil}
}
function pinWaitText(ms){const seconds=Math.max(1,Math.ceil(ms/1000));return seconds<60?`${seconds} ثانية`:`${Math.ceil(seconds/60)} دقيقة`}
async function verifyStoredPin(reason){
  const state=await pinThrottleState();
  if(state.lockUntil>Date.now()){alert(`تم إيقاف محاولات الرمز مؤقتًا. حاول بعد ${pinWaitText(state.lockUntil-Date.now())}.`);return false}
  const hash=await pinHash();if(!hash)return false;
  const value=String(prompt(`${reason}\nأدخل رمز العمليات الحساسة:`)||'');if(!value)return false;
  if(await digest(value)===hash){await clearPinFailures();return true}
  const failed=await recordPinFailure();
  if(failed.lockUntil>Date.now())alert(`رمز العمليات الحساسة غير صحيح. تم إيقاف المحاولات مؤقتًا لمدة ${pinWaitText(failed.lockUntil-Date.now())}.`);
  else alert(`رمز العمليات الحساسة غير صحيح. المتبقي قبل الإيقاف المؤقت: ${Math.max(0,5-(failed.failures%5))}.`);
  log('فشل تحقق رمز العمليات الحساسة',reason);return false
}
function validPin(value){return /^\d{6,8}$/.test(String(value||''))}
async function setDangerPin(){
  if(!isOwner())return alert('رمز العمليات الحساسة يضبطه الجهاز الرئيسي فقط.');
  if(!requireNativeSecurity())return;
  try{
    const existing=await pinHash();
    if(existing&&!(await verifyStoredPin('تغيير رمز العمليات الحساسة')))return;
    const first=String(prompt('اختر رمزًا رقميًا من ٦ إلى ٨ أرقام للعمليات الحساسة:')||'');if(!validPin(first))return alert('الرمز الجديد يجب أن يتكون من ٦ إلى ٨ أرقام.');
    const second=String(prompt('أعد كتابة الرمز للتأكيد:')||'');if(first!==second)return alert('الرمزان غير متطابقين.');
    await nativeRequest('secureSet',{key:PIN_KEY,value:await digest(first)});await clearPinFailures();log(existing?'تغيير رمز العمليات الحساسة':'إنشاء رمز العمليات الحساسة');alert('تم حفظ رمز العمليات الحساسة داخل التخزين الآمن لهذا الجهاز.');render()
  }catch(e){alert('تعذر حفظ رمز العمليات الحساسة: '+String(e?.message||e))}
}
async function removeDangerPin(){
  if(!isOwner())return alert('هذه العملية للجهاز الرئيسي فقط.');
  if(!requireNativeSecurity())return;
  try{
    const hash=await pinHash();if(!hash)return;
    if(!(await verifyStoredPin('إلغاء رمز العمليات الحساسة')))return;
    await nativeRequest('secureDelete',{key:PIN_KEY});await clearPinFailures();log('إلغاء رمز العمليات الحساسة');render()
  }catch(e){alert('تعذر إلغاء رمز العمليات الحساسة: '+String(e?.message||e))}
}
async function verifyDangerPin(reason='هذه عملية حساسة'){
  if(!isOwner())return false;
  if(!requireNativeSecurity())return false;
  try{
    let hash=await pinHash();
    if(!hash){if(!confirm(`${reason}\nلم يتم إنشاء رمز مستقل للعمليات الحساسة بعد. سيتم إنشاؤه الآن قبل المتابعة.`))return false;await setDangerPin();hash=await pinHash();if(!hash)return false}
    return verifyStoredPin(reason)
  }catch(e){alert('تعذر التحقق من رمز العمليات الحساسة: '+String(e?.message||e));return false}
}

function passwordWeakness(value){
  const external=window.AbuBassamStrongPasswordWeakness||window.AbuBassamSecurityExtras?.passwordWeakness;
  if(typeof external==='function'&&external!==passwordWeakness)return external(value);
  const v=String(value||'');
  if(v.length<12)return'استخدم 12 محرفًا على الأقل.';
  if(!/\p{L}/u.test(v))return'أضف حرفًا واحدًا على الأقل.';
  if(!/\p{N}/u.test(v))return'أضف رقمًا واحدًا على الأقل.';
  if(!/[^\p{L}\p{N}\s]/u.test(v))return'أضف رمزًا خاصًا مثل ! أو # أو @.';
  return''
}
async function changePassword(){
  if(!isOwner())return alert('تغيير كلمة مرور الحساب متاح للجهاز الرئيسي فقط.');
  const c=window.AbuBassamCloud?.client,u=window.AbuBassamCloud?.session?.()?.user,email=String(u?.email||'').trim().toLowerCase();
  if(!c||!email)return alert('سجّل الدخول إلى الحساب الحالي أولًا.');
  const current=String(prompt('أدخل كلمة المرور الحالية لتأكيد الهوية:')||'');if(!current)return;
  const auth=await c.auth.signInWithPassword({email,password:current});if(auth.error)return alert('كلمة المرور الحالية غير صحيحة.');
  const next=String(prompt('أدخل كلمة المرور الجديدة (12 محرفًا على الأقل، حرف + رقم + رمز):')||''),problem=passwordWeakness(next);if(problem)return alert(problem);
  const repeat=String(prompt('أعد كتابة كلمة المرور الجديدة:')||'');if(next!==repeat)return alert('كلمتا المرور غير متطابقتين.');
  const result=await c.auth.updateUser({password:next});if(result.error)return alert('تعذر تغيير كلمة المرور: '+result.error.message);
  try{await c.auth.signOut({scope:'others'})}catch(_){}
  log('تغيير كلمة مرور الحساب');alert('تم تغيير كلمة مرور الحساب بنجاح وإلغاء الجلسات الأخرى قدر الإمكان. لن تُحفظ كلمة المرور داخل التطبيق أو المستودع.')
}
function logout(){window.AbuBassamSecurity?.logout?.()}

function safeSnapshot(){
  const settings={};
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i)||'';
    if(key===SNAPSHOT_KEY||/pass|password|token|secret|session|credential|auth|trust/i.test(key))continue;
    const value=localStorage.getItem(key);if(value==null||value.length>250000)continue;settings[key]=value
  }
  return{format:'AbuBassamEmergencySnapshot',version:1,createdAt:new Date().toISOString(),settings}
}
function createSnapshot(manual=true){
  try{const snapshot=safeSnapshot();localStorage.setItem(SNAPSHOT_KEY,JSON.stringify(snapshot));if(manual){log('إنشاء نقطة أمان',snapshot.createdAt);alert('تم إنشاء نقطة أمان محلية للإعدادات والتصاميم. المستندات الكبيرة في الأرشيف لا تُنسخ داخل هذه النقطة.')}render();return snapshot}catch(e){if(manual)alert('تعذر إنشاء نقطة الأمان: '+e.message);return null}
}
async function restoreSnapshot(){
  if(!isOwner())return alert('استعادة نقطة الأمان متاحة للجهاز الرئيسي فقط.');
  const raw=localStorage.getItem(SNAPSHOT_KEY);if(!raw)return alert('لا توجد نقطة أمان محفوظة.');
  if(!(await verifyDangerPin('استعادة آخر نقطة أمان')))return;
  let snapshot;try{snapshot=JSON.parse(raw)}catch(e){return alert('نقطة الأمان تالفة.')}
  if(!snapshot?.settings||!confirm(`استعادة نقطة الأمان المحفوظة بتاريخ ${new Date(snapshot.createdAt).toLocaleString('ar-IQ')}؟\nستُستبدل إعدادات وتصاميم التخزين المحلي فقط.`))return;
  Object.entries(snapshot.settings).forEach(([key,value])=>{if(!/pass|password|token|secret|session|credential|auth|trust/i.test(key))localStorage.setItem(key,String(value))});
  log('استعادة نقطة أمان',snapshot.createdAt||'');alert('تمت الاستعادة. سيعاد فتح الواجهة لتطبيق الإعدادات.');location.reload()
}
function snapshotInfo(){try{const data=JSON.parse(localStorage.getItem(SNAPSHOT_KEY)||'null');return data?.createdAt?new Date(data.createdAt).toLocaleString('ar-IQ'):'لا توجد نقطة أمان'}catch(e){return'لا توجد نقطة أمان'}}

function privacyCover(){let cover=$('abuPrivacyCover');if(cover)return cover;cover=document.createElement('div');cover.id='abuPrivacyCover';cover.style.cssText='position:fixed;z-index:49999;inset:0;background:#10242e;display:none;align-items:center;justify-content:center;color:#fff;text-align:center;font:900 18px Tahoma;';cover.innerHTML='<div><img src="abu_bassam_icon.webp" style="width:76px;height:76px;border-radius:18px;display:block;margin:0 auto 12px"><div>مكتبة أبو بسام</div><small style="font-size:10px;opacity:.8">المحتوى مخفي لحماية الخصوصية</small></div>';document.body.appendChild(cover);return cover}
async function applyPrivacy(enabled){
  privacyCover();
  if(enabled&&!nativeAvailable()){localStorage.setItem(PRIVACY_KEY,'0');privacyCover().style.display='none';alert('تعذر تفعيل الخصوصية العالية لأن حماية Android الأصلية غير متاحة.');render();return false}
  try{
    if(enabled)await nativeRequest('privacyMode',{enabled:true});else if(nativeAvailable())await nativeRequest('privacyMode',{enabled:false});
    localStorage.setItem(PRIVACY_KEY,enabled?'1':'0');
    if(document.visibilityState==='hidden'&&enabled)privacyCover().style.display='flex';else privacyCover().style.display='none';
    log('وضع الخصوصية العالية',enabled?'مفعّل':'متوقف');render();return true
  }catch(e){localStorage.setItem(PRIVACY_KEY,'0');privacyCover().style.display='none';if(enabled)alert('تعذر تفعيل حماية لقطة الشاشة/المعاينة الحديثة: '+String(e?.message||e));render();return false}
}
function privacyEnabled(){return localStorage.getItem(PRIVACY_KEY)==='1'}
function visibilityPrivacy(){const cover=privacyCover();clearTimeout(privacyHideTimer);privacyHideTimer=null;if(document.visibilityState==='hidden'&&privacyEnabled()){cover.style.display='flex';return}privacyHideTimer=setTimeout(()=>{if(document.visibilityState!=='hidden')cover.style.display='none'},60)}

function extrasHtml(){return `<section id="abuSecurityExtrasSettings" class="abu-setting-card" data-settings-keywords="خصوصية نقطة أمان استعادة رمز حساس حماية recent apps لقطة شاشة كلمة مرور خروج"><div class="abu-setting-title">🛡️ حماية إضافية واستعادة طوارئ</div><label class="abu-security-line"><span>خصوصية عالية ومنع لقطات الشاشة/المعاينة الحديثة</span><input id="abuPrivacyMode" type="checkbox" onchange="AbuBassamSecurityExtras.privacy(this.checked)"></label><div class="abu-security-setting-grid"><button onclick="AbuBassamSecurityExtras.setPin()">🔢 إنشاء/تغيير رمز العمليات الحساسة</button><button onclick="AbuBassamSecurityExtras.removePin()">إلغاء الرمز</button><button onclick="AbuBassamSecurityExtras.changePassword()">🔑 تغيير كلمة مرور الحساب</button><button onclick="AbuBassamSecurityExtras.logout()">⇥ تسجيل الخروج</button><button onclick="AbuBassamSecurityExtras.snapshot()">🛟 نقطة أمان الآن</button><button onclick="AbuBassamSecurityExtras.restore()">♻️ استعادة نقطة الأمان</button></div><div id="abuSnapshotInfo" class="abu-setting-note" style="margin-top:7px">آخر نقطة أمان: ${esc(snapshotInfo())}</div><div class="abu-setting-note">يُطلب الرمز المستقل قبل العمليات الخطرة مثل مسح السجل، إعادة ضبط الإعدادات، حذف جهاز موثوق أو استعادة نقطة أمان. لا تُخزن كلمات المرور داخل نقطة الأمان.</div></section>`}
async function render(){
  const body=document.querySelector('#abuSettingsModal .abu-settings-body');if(!body)return;
  let old=$('abuSecurityExtrasSettings');if(old)old.outerHTML=extrasHtml();else{const security=$('abuSecuritySettings');if(security)security.insertAdjacentHTML('afterend',extrasHtml());else body.insertAdjacentHTML('afterbegin',extrasHtml())}
  const privacy=$('abuPrivacyMode');if(privacy)privacy.checked=privacyEnabled();const info=$('abuSnapshotInfo');if(info)info.textContent='آخر نقطة أمان: '+snapshotInfo();
  const owner=isOwner();document.querySelectorAll('#abuSecurityExtrasSettings button:not([onclick*="logout"])').forEach(button=>{if(!owner){if(button.dataset.abuSecurityExtrasOwnerGuard!=='1'){button.dataset.abuSecurityExtrasOwnerGuard='1';button.dataset.abuSecurityExtrasPrevDisabled=button.disabled?'1':'0';button.dataset.abuSecurityExtrasPrevOpacity=button.style.opacity||''}button.disabled=true;button.style.opacity='.45'}else if(button.dataset.abuSecurityExtrasOwnerGuard==='1'){button.disabled=button.dataset.abuSecurityExtrasPrevDisabled==='1';button.style.opacity=button.dataset.abuSecurityExtrasPrevOpacity||'';delete button.dataset.abuSecurityExtrasOwnerGuard;delete button.dataset.abuSecurityExtrasPrevDisabled;delete button.dataset.abuSecurityExtrasPrevOpacity}})
}
function inject(){render();new MutationObserver(()=>{if(document.querySelector('#abuSettingsModal .abu-settings-body')&&!$('abuSecurityExtrasSettings'))render()}).observe(document.body,{childList:true,subtree:true})}

function dangerousTarget(target){
  if(!target)return'';const onclick=String(target.getAttribute?.('onclick')||'');
  if(target.id==='opsClear'||/resetDefaults|resetData|removeDevice\(/.test(onclick))return target.id==='opsClear'?'مسح سجل العمليات':/removeDevice/.test(onclick)?'حذف جهاز موثوق':'إعادة ضبط بيانات أو إعدادات';
  return''
}
function guardDanger(){document.addEventListener('click',async event=>{const target=event.target?.closest?.('button,[role="button"]');if(!target||target===bypassTarget)return;const reason=dangerousTarget(target);if(!reason)return;if(!isOwner())return;event.preventDefault();event.stopImmediatePropagation();if(await verifyDangerPin(reason)){bypassTarget=target;try{target.click()}finally{setTimeout(()=>{bypassTarget=null},0)}}},true)}

function installTypographyApplyShim(){
  const timer=setInterval(()=>{const t=window.AbuBassamTypography;if(!t)return;if(typeof t.applyApp!=='function')t.applyApp=()=>{let state={};try{state=JSON.parse(localStorage.getItem('abuBassamTypographyV5')||'{}')}catch(e){}if(state.appFont)t.global('appFont',state.appFont);if(state.appScale)t.global('appScale',state.appScale)};clearInterval(timer)},400);
  setTimeout(()=>clearInterval(timer),15000)
}
function startSnapshots(){createSnapshot(false);clearInterval(snapshotTimer);snapshotTimer=setInterval(()=>{if(document.visibilityState!=='hidden')createSnapshot(false)},10*60*1000);window.addEventListener('pagehide',()=>createSnapshot(false));document.addEventListener('visibilitychange',()=>{visibilityPrivacy();if(document.visibilityState==='hidden')createSnapshot(false)})}

async function boot(){privacyCover();inject();guardDanger();installTypographyApplyShim();startSnapshots();await applyPrivacy(privacyEnabled());render()}
window.AbuBassamSecurityExtras={setPin:setDangerPin,removePin:removeDangerPin,verifyDangerPin,changePassword,passwordWeakness,logout,snapshot:()=>createSnapshot(true),restore:restoreSnapshot,privacy:applyPrivacy,render};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();