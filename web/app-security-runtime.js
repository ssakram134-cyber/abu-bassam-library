(()=>{
'use strict';
if(window.__ABU_APP_SECURITY_V1__)return;
window.__ABU_APP_SECURITY_V1__=true;

const $=id=>document.getElementById(id);
const MAIN_USERNAME='akrama1992';
const MAIN_EMAIL='akrama1992@gmail.com';
const APP_VERSION=String(window.__ABU_APP_META__?.version||'');
const MAX_DEVICES=5;
const DEVICE_ID_KEY='abuBassamLockedDeviceIdV3';
const DEVICE_NAME_KEY='abuBassamLockedDeviceNameV3';
const LOCK_MINUTES_KEY='abuBassamSecurityLockMinutesV1';
const APPEARANCE_SYNC_KEY='abuBassamAppearanceSyncV1';
const PREVIOUS_THEME_KEY='abuBassamPreviousThemeV1';
const BIO_KEY='abu_bassam_biometric_enabled_v1';
const SECRET_KEY='abu_bassam_device_secret_v1';
const ATTEMPT_KEY='abuBassamLoginAttemptsV1';
const LOGIN_LOCK_KEY='abuBassamLoginLockUntilV1';
const BLOCK_COUNT_KEY='abuBassamLoginBlockCountV1';
const SECONDARY_DEFAULT={edit:false,print:false,export:false,appearance:false,sync:false,security:false,devices:false,reset:false};
const OWNER_PERMISSIONS={edit:true,print:true,export:true,appearance:true,sync:true,security:true,devices:true,reset:true};
const pending=new Map();
let requestSeq=0;
let currentDevice=null;
let deviceSessionEpoch=0;
let deviceSecret='';
let deviceSecretPending=null;
let unlocked=false;
let busy=false;
let lastBackgroundAt=0;
let exitArmedAt=0;
let appearanceStamp='';
let maintenanceTimer=null;
let deviceInfo={name:'Android',model:'Android',os:'Android',androidVersion:'',appVersion:APP_VERSION};

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function clone(v){return JSON.parse(JSON.stringify(v))}
function readJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')||clone(fallback)}catch(e){return clone(fallback)}}
function writeJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch(e){}}
function log(title,details=''){try{window.AbuBassamOps?.add?.({type:'settings',title,section:'الأمان',details})}catch(e){}}
function cloud(){return window.AbuBassamCloud||null}
function client(){return cloud()?.client||null}
function identity(){return window.AbuBassamDevices?.ensure?.()||{id:localStorage.getItem(DEVICE_ID_KEY)||'',name:localStorage.getItem(DEVICE_NAME_KEY)||''}}
function roleLabel(){return currentDevice?.role==='owner'?'رئيسي':'فرعي'}
function permissions(){return currentDevice?.role==='owner'?OWNER_PERMISSIONS:Object.assign({},SECONDARY_DEFAULT,currentDevice?.permissions||{})}
function can(name){return !!permissions()[name]}
// The validated offline gate is managed by security-hardening-runtime.js;
// a hidden gate alone must not be treated as authorization.
function sessionUnlocked(){return unlocked||window.AbuBassamSecurity?.isOfflineSession?.()===true}
function nativeAvailable(){return window.AbuBassamNativeSecurity?.available?.()===true}
function nativeRequest(action,payload={}){
  const api=window.AbuBassamNativeSecurity;
  if(api?.request)return api.request(action,payload);
  if(action==='deviceInfo')return Promise.resolve({name:'متصفح الاختبار',model:'Browser',os:'web',androidVersion:'',appVersion:APP_VERSION});
  if(action==='biometricStatus')return Promise.resolve({available:false,enrolled:false,types:[]});
  if(action==='biometricAuth')return Promise.resolve({success:false,error:'native_unavailable'});
  return Promise.reject(new Error('NATIVE_SECURITY_REQUIRED'))
}
window.AbuBassamNativeAppState=function(payload){
  const state=payload?.state||payload;
  if(state==='background'||state==='inactive'){lastBackgroundAt=Number(payload?.at)||Date.now();return}
  if(state==='active'&&lastBackgroundAt){const elapsed=Date.now()-lastBackgroundAt;lastBackgroundAt=0;const mins=Number(localStorage.getItem(LOCK_MINUTES_KEY)||5);if(sessionUnlocked()&&mins>=0&&elapsed>=mins*60000)lock('انتهت مهلة القفل التلقائي')}
};

function randomSecret(){
  const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);let raw='';bytes.forEach(b=>raw+=String.fromCharCode(b));return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
}
async function getSecret(){
  if(deviceSecret)return deviceSecret;
  if(deviceSecretPending)return deviceSecretPending;
  // A failed SecureStore write must never be cached as a registered device key.
  // Coalesce concurrent callers so they cannot generate competing secrets.
  const pending=(async()=>{
    let stored=String(await nativeRequest('secureGet',{key:SECRET_KEY})||'');
    if(!stored){
      const generated=randomSecret();
      await nativeRequest('secureSet',{key:SECRET_KEY,value:generated});
      stored=String(await nativeRequest('secureGet',{key:SECRET_KEY})||'');
      if(stored!==generated)throw new Error('SECURE_DEVICE_SECRET_PERSIST_FAILED');
    }
    deviceSecret=stored;
    return stored
  })();
  deviceSecretPending=pending;
  try{return await pending}finally{if(deviceSecretPending===pending)deviceSecretPending=null}
}
async function getBiometricEnabled(){return String(await nativeRequest('secureGet',{key:BIO_KEY})||'')==='1'}
async function setBiometricEnabled(value){if(value)await nativeRequest('secureSet',{key:BIO_KEY,value:'1'});else await nativeRequest('secureDelete',{key:BIO_KEY});renderSecurityCard()}
async function biometricStatus(){try{return await nativeRequest('biometricStatus')}catch(e){return{available:false,enrolled:false,types:[],error:e.message}}}
async function biometricAuth(reason='فتح مكتبة أبو بسام'){try{return await nativeRequest('biometricAuth',{reason})}catch(e){return{success:false,error:e.message}}}

function addCss(){if($('abuSecurityStyle'))return;const s=document.createElement('style');s.id='abuSecurityStyle';s.textContent=`
.abu-security-gate{position:fixed;z-index:40000;inset:0;background:linear-gradient(145deg,#10242e,#0b544e 60%,#3f2a1f);display:flex;align-items:center;justify-content:center;padding:14px;direction:rtl}.abu-security-gate.hide{display:none}.abu-security-card{width:min(440px,100%);max-height:94vh;overflow:auto;background:#fffaf3;color:#2b211d;border-radius:24px;padding:18px;box-shadow:0 22px 70px #000a;text-align:center}.abu-security-card img{width:72px;height:72px;border-radius:18px}.abu-security-card h2{font-size:19px;margin:8px 0 3px}.abu-security-card p{font-size:9px;color:#75675e;line-height:1.8}.abu-security-card input,.abu-security-card select{width:100%;min-height:46px;border:1px solid #c8b9ad;border-radius:11px;background:#fff;color:#222;padding:9px;margin:4px 0;text-align:center}.abu-security-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:7px}.abu-security-actions button{min-height:44px;border:0;border-radius:11px;background:#087f72;color:#fff;font-weight:900}.abu-security-actions .secondary{background:#6b5648}.abu-security-actions .wide{grid-column:1/-1}.abu-security-error{min-height:20px;color:#a62e3b;font-size:9px;margin-top:6px;line-height:1.6}.abu-security-device{font-size:8px;color:#087f72;font-weight:900;margin-top:5px}.abu-control-dock{position:fixed;z-index:30000;right:7px;bottom:8px;display:grid;grid-template-columns:repeat(4,40px);gap:5px;background:#0f172ad9;padding:6px;border-radius:15px;box-shadow:0 8px 22px #0006;direction:ltr}.abu-control-dock button{width:40px;height:40px;border:0;border-radius:10px;background:#ffffff17;color:#fff;font-size:18px;font-weight:900}.abu-control-dock button:last-child{background:#9f2735}.abu-control-toast{position:fixed;z-index:41000;left:50%;bottom:70px;transform:translateX(-50%) translateY(20px);opacity:0;transition:.2s;background:#111e;color:#fff;padding:9px 15px;border-radius:20px;font-size:10px;white-space:nowrap;pointer-events:none}.abu-control-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}body.abu-focus-mode .hero,body.abu-focus-mode #abuMainTabs,body.abu-focus-mode>.abu-programmer-stamp{display:none!important}body.abu-focus-mode .app{max-width:none!important}.abu-security-setting-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.abu-security-setting-grid button,.abu-security-setting-grid select{min-height:41px;border:0;border-radius:10px;background:#087f72;color:#fff;font-size:8px;font-weight:900;padding:5px}.abu-security-setting-grid select{background:#fff;color:#222;border:1px solid #b8957655}.abu-security-line{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px;border-radius:10px;background:#087f720b;margin:6px 0;font-size:9px;font-weight:900}.abu-security-line input{width:auto}.abu-device-modal{position:fixed;z-index:39000;inset:0;background:#000c;display:none;align-items:center;justify-content:center;padding:10px}.abu-device-modal.show{display:flex}.abu-device-dialog{width:min(650px,100%);max-height:94vh;overflow:auto;background:#fffaf3;color:#241f1b;border-radius:20px;padding:12px}.abu-device-head{display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#fffaf3;padding-bottom:8px}.abu-device-head button{width:34px;height:34px;border:0;border-radius:50%;font-size:20px}.abu-device-row{border:1px solid #d7c8bc;border-radius:13px;padding:9px;margin:7px 0;background:#fff}.abu-device-row.owner{border-color:#b98b36;background:#fff9e8}.abu-device-row.off{opacity:.58}.abu-device-row b{font-size:10px}.abu-device-row small{display:block;color:#766b64;font-size:8px;line-height:1.6}.abu-device-row-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.abu-device-row-actions button{border:0;border-radius:8px;background:#087f72;color:#fff;padding:7px 9px;font-size:8px;font-weight:900}.abu-device-row-actions .danger{background:#a62d3a}.abu-device-row-actions .alt{background:#6b5648}.abu-perm-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}.abu-perm-grid label{display:flex;align-items:center;justify-content:space-between;background:#f0ebe5;border-radius:8px;padding:7px;font-size:8px;font-weight:900}.abu-security-badge{display:inline-block;padding:3px 8px;border-radius:20px;background:#e7f4f1;color:#087f72;font-size:8px;font-weight:900}.abu-security-badge.owner{background:#fff0bd;color:#7d5614}@media(max-width:400px){.abu-control-dock{grid-template-columns:repeat(4,36px)}.abu-control-dock button{width:36px;height:36px}.abu-security-actions,.abu-security-setting-grid{grid-template-columns:1fr}.abu-security-actions .wide{grid-column:auto}}@media print{.abu-control-dock,.abu-control-toast,.abu-security-gate,.abu-device-modal{display:none!important}}
`;document.head.appendChild(s)}

function gateHtml(){return `<div id="abuSecurityGate" class="abu-security-gate"><div class="abu-security-card"><img src="abu_bassam_icon.webp" alt="مكتبة أبو بسام"><h2>🔐 تسجيل الدخول</h2><p>دخول آمن إلى مكتبة أبو بسام. كلمة المرور لا تُحفظ داخل ملفات المشروع أو سجل العمليات.</p><input id="abuLoginUser" autocomplete="username" value="${MAIN_USERNAME}" placeholder="اسم المستخدم"><input id="abuLoginPass" type="password" autocomplete="current-password" placeholder="كلمة المرور"><div class="abu-security-actions"><button id="abuLoginBtn">دخول</button><button id="abuBioLoginBtn" class="secondary">بصمة</button><button id="abuOfflineBtn" class="wide secondary" style="display:none">فتح موثوق دون إنترنت</button></div><div id="abuLoginDevice" class="abu-security-device"></div><div id="abuLoginError" class="abu-security-error"></div></div></div>`}
function controlHtml(){return `<div id="abuControlDock" class="abu-control-dock"><button type="button" title="رجوع" onclick="AbuBassamSecurity.back()">←</button><button type="button" title="الرئيسية" onclick="AbuBassamSecurity.home()">⌂</button><button type="button" title="تكبير مساحة العمل" onclick="AbuBassamSecurity.focus()">⛶</button><button type="button" title="الخروج" onclick="AbuBassamSecurity.exit()">×</button></div><div id="abuControlToast" class="abu-control-toast"></div>`}
function deviceModalHtml(){return `<div id="abuDeviceModal" class="abu-device-modal"><div class="abu-device-dialog"><div class="abu-device-head"><div><b>📱 الأجهزة الموثوقة</b><div style="font-size:8px;color:#756b65">الحد الأقصى ${MAX_DEVICES} أجهزة • الرئيسي يتحكم بالفرعية</div></div><button onclick="AbuBassamSecurity.closeDevices()">×</button></div><div id="abuDeviceList"></div></div></div>`}
function buildUi(){addCss();document.body.insertAdjacentHTML('beforeend',gateHtml()+controlHtml()+deviceModalHtml());$('abuLoginBtn').onclick=login;$('abuBioLoginBtn').onclick=unlockWithBiometric;$('abuOfflineBtn').onclick=offlineUnlock;$('abuLoginPass').addEventListener('keydown',e=>{if(e.key==='Enter')login()});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')lastBackgroundAt=Date.now();else if(lastBackgroundAt){window.AbuBassamNativeAppState({state:'active',at:Date.now()})}})}

function setError(message){if($('abuLoginError'))$('abuLoginError').textContent=message||''}
function toast(message){const el=$('abuControlToast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),1800)}
function emitSecurityState(state){document.dispatchEvent(new CustomEvent('abu-bassam-security-state',{detail:{state,unlocked,device:currentDevice}}))}
function showGate(message=''){deviceSessionEpoch++;unlocked=false;$('abuSecurityGate')?.classList.remove('hide');setError(message);emitSecurityState('locked')}
function hideGate(){unlocked=true;$('abuSecurityGate')?.classList.add('hide');setError('');log('فتح التطبيق',`${roleLabel()} • ${currentDevice?.device_name||''}`);emitSecurityState('unlocked')}

async function fetchDeviceInfo(){try{deviceInfo=Object.assign(deviceInfo,await nativeRequest('deviceInfo')||{})}catch(e){}if($('abuLoginDevice'))$('abuLoginDevice').textContent=`هذا الجهاز: ${deviceInfo.model||deviceInfo.name||'Android'}`;return deviceInfo}
async function ensureDeviceName(){let id=identity(),name=String(localStorage.getItem(DEVICE_NAME_KEY)||'').trim();if(!name||/^(أ?كرم|akram)$/i.test(name)){const suggested=deviceInfo.model||deviceInfo.name||'هاتف المكتبة';name=String(prompt('اكتب اسم هذا الهاتف ليظهر ضمن الأجهزة الموثوقة:',suggested)||'').trim()||suggested;localStorage.setItem(DEVICE_NAME_KEY,name)}return{name,id:id.id}}
function normalizeDevice(data){if(!data)return null;return Array.isArray(data)?data[0]||null:data}
async function registerDevice(){
  const c=client();if(!c)throw new Error('خدمة الدخول غير جاهزة');
  const epoch=deviceSessionEpoch;
  const secret=await getSecret(),named=await ensureDeviceName();
  if(epoch!==deviceSessionEpoch)throw new Error('DEVICE_SESSION_CHANGED');
  const {data,error}=await c.rpc('abu_bassam_register_device',{p_device_id:named.id,p_secret:secret,p_device_name:named.name,p_model:deviceInfo.model||deviceInfo.name||'',p_platform:deviceInfo.os||'Android',p_app_version:APP_VERSION});
  if(epoch!==deviceSessionEpoch)throw new Error('DEVICE_SESSION_CHANGED');
  if(error)throw error;
  const row=normalizeDevice(data);
  if(!row)throw new Error('DEVICE_NOT_AUTHORIZED');
  if(row.active===false)throw new Error('DEVICE_DISABLED');
  currentDevice=row;
  localStorage.setItem(DEVICE_NAME_KEY,row.device_name||named.name);
  renderSecurityCard();
  return row
}
async function touchDevice(){
  if(!unlocked||!cloud()?.isConnected?.()||!navigator.onLine)return;
  const epoch=deviceSessionEpoch;
  try{
    const secret=await getSecret(),id=identity(),name=localStorage.getItem(DEVICE_NAME_KEY)||deviceInfo.model||'هاتف';
    if(epoch!==deviceSessionEpoch||!unlocked)return;
    const {data,error}=await client().rpc('abu_bassam_touch_device',{p_device_id:id.id,p_secret:secret,p_device_name:name,p_model:deviceInfo.model||'',p_platform:deviceInfo.os||'Android',p_app_version:APP_VERSION});
    // A response from before logout/lock may not replace the next session's role.
    if(epoch!==deviceSessionEpoch||!unlocked)return;
    if(error)throw error;
    const row=normalizeDevice(data);
    if(!row)throw new Error('DEVICE_NOT_AUTHORIZED');
    if(row.active===false)throw new Error('DEVICE_DISABLED');
    currentDevice=row
  }catch(e){
    if(epoch===deviceSessionEpoch&&unlocked&&/DEVICE_NOT_AUTHORIZED|DEVICE_DISABLED/i.test(String(e.message||e)))
      lock('هذا الجهاز غير مصرح له بالدخول')
  }
}

function loginRemaining(){return Math.max(0,Number(localStorage.getItem(LOGIN_LOCK_KEY)||0)-Date.now())}
function formatWait(ms){const n=Math.max(1,Math.ceil(ms/1000)),digits='٠١٢٣٤٥٦٧٨٩';return String(n).replace(/\d/g,d=>digits[+d])+' ثانية'}
function clearCredentialFailures(){localStorage.removeItem(ATTEMPT_KEY);localStorage.removeItem(LOGIN_LOCK_KEY);localStorage.removeItem(BLOCK_COUNT_KEY)}
function recordCredentialFailure(message){const attempts=Number(localStorage.getItem(ATTEMPT_KEY)||0)+1;if(attempts<5){localStorage.setItem(ATTEMPT_KEY,String(attempts));setError(String(message||'بيانات الدخول غير صحيحة')+' • المتبقي قبل الانتظار: '+(5-attempts));return}const blocks=Number(localStorage.getItem(BLOCK_COUNT_KEY)||0)+1,duration=Math.min(300000,30000*Math.max(1,blocks));localStorage.setItem(ATTEMPT_KEY,'0');localStorage.setItem(BLOCK_COUNT_KEY,String(blocks));localStorage.setItem(LOGIN_LOCK_KEY,String(Date.now()+duration));setError('محاولات كلمة مرور غير صحيحة كثيرة. انتظر '+formatWait(duration)+' ثم حاول مرة أخرى.')}
function isCredentialFailure(error){
  const code=String(error?.code||'').toLowerCase();
  const message=String(error?.message||error||'');
  return code==='invalid_credentials'||/invalid login credentials/i.test(message)
}
function authError(error){const m=String(error?.message||error||'تعذر تسجيل الدخول');if(/invalid login credentials/i.test(m))return 'اسم المستخدم أو كلمة المرور غير صحيحة.';if(/DEVICE_LIMIT_REACHED/i.test(m))return 'وصل الحساب إلى الحد الأقصى: ٥ أجهزة. احذف جهازًا فرعيًا من الجهاز الرئيسي أولاً.';if(/DEVICE_DISABLED/i.test(m))return 'هذا الجهاز موقوف من الجهاز الرئيسي.';if(/network|fetch/i.test(m))return 'تعذر الاتصال بالإنترنت.';return m.replace(/^.*?error:\s*/i,'')}
async function login(){
  if(busy)return;const wait=loginRemaining();if(wait>0)return setError('الدخول متوقف مؤقتًا بسبب محاولات بيانات اعتماد غير صحيحة. حاول بعد '+formatWait(wait)+'.');const username=String($('abuLoginUser')?.value||'').trim(),password=String($('abuLoginPass')?.value||'');if(username!==MAIN_USERNAME){recordCredentialFailure('اسم المستخدم غير صحيح.');return}if(password.length<8)return setError('أدخل كلمة المرور كاملة.');if(!client())return setError('خدمة الدخول غير جاهزة.');busy=true;setError('جاري التحقق...');let authenticated=false;
  try{
    const result=await client().auth.signInWithPassword({email:MAIN_EMAIL,password});
    if(result.error){
      if(isCredentialFailure(result.error))recordCredentialFailure(authError(result.error));
      else setError(authError(result.error));
      return
    }
    authenticated=!!result.data?.session;clearCredentialFailures();if($('abuLoginPass'))$('abuLoginPass').value='';
    await fetchDeviceInfo();await registerDevice();hideGate();await pullAppearanceIfNeeded();log('تسجيل دخول ناجح',MAIN_USERNAME+' • '+roleLabel())
  }catch(e){
    if(authenticated){try{await client().auth.signOut({scope:'local'})}catch(_){}}
    currentDevice=null;unlocked=false;setError(authError(e));log('فشل تسجيل الدخول',authError(e))
  }finally{busy=false}
}
async function unlockWithBiometric(){
  if(busy)return;busy=true;setError('جاري التحقق من البصمة...');
  try{
    const enabled=await getBiometricEnabled();
    if(!enabled)throw new Error('فعّل تسجيل الدخول بالبصمة أولاً من الإعدادات.');
    // The base biometric handler must NEVER open the app using localStorage trust.
    // Offline authentication belongs exclusively to the HMAC/SecureStore gate.
    if(!navigator.onLine||!cloud()?.isConnected?.())throw new Error('استخدم زر الفتح الآمن دون إنترنت للتحقق من البصمة والثقة المشفّرة.');
    const status=await biometricStatus();
    if(!status.available||!status.enrolled)throw new Error('لا توجد بصمة مفعلة في إعدادات هذا الهاتف.');
    const result=await biometricAuth('افتح مكتبة أبو بسام');
    if(!result?.success)throw new Error(result?.error==='user_cancel'?'تم إلغاء البصمة.':'لم تنجح المصادقة بالبصمة.');
    await fetchDeviceInfo();
    await registerDevice();
    hideGate();
    await pullAppearanceIfNeeded();
    log('فتح بالبصمة',currentDevice?.device_name||'')
  }catch(e){setError(authError(e))}finally{busy=false}
}
function lock(reason='تم قفل التطبيق'){showGate(reason);try{window.getSelection()?.removeAllRanges()}catch(e){} }

async function toggleBiometric(checked){
  const box=$('abuSecurityBio');if(box)box.disabled=true;
  try{if(checked){const status=await biometricStatus();if(!status.available)throw new Error('المصادقة الحيوية غير مدعومة على هذا الجهاز.');if(!status.enrolled)throw new Error('أضف بصمة من إعدادات Android أولاً.');const password=String(prompt('لتفعيل البصمة أدخل كلمة مرور الحساب مرة واحدة. لن يتم حفظها:')||'');if(!password)throw new Error('لم يتم إدخال كلمة المرور.');const result=await client().auth.signInWithPassword({email:MAIN_EMAIL,password});if(result.error)throw result.error;const auth=await biometricAuth('تأكيد تفعيل الدخول بالبصمة');if(!auth?.success)throw new Error('لم يتم تأكيد البصمة.');await setBiometricEnabled(true);log('تفعيل البصمة',currentDevice?.device_name||'');toast('تم تفعيل البصمة ✓')}else{await setBiometricEnabled(false);log('إلغاء البصمة',currentDevice?.device_name||'');toast('تم إلغاء البصمة')}}catch(e){if(box)box.checked=!checked;alert(authError(e))}finally{if(box)box.disabled=false;renderSecurityCard()}
}
function setLockMinutes(value){localStorage.setItem(LOCK_MINUTES_KEY,String(value));log('تغيير القفل التلقائي',String(value));toast('تم حفظ مدة القفل')}

function registryRequired(){const registry=window.AbuBassamDeviceRegistry;if(!registry)throw new Error('DEVICE_REGISTRY_NOT_READY');return registry}
async function openDevices(){if(currentDevice?.role!=='owner')return alert('إدارة الأجهزة متاحة للحساب الرئيسي فقط.');$('abuDeviceModal')?.classList.add('show');try{await registryRequired().render()}catch(e){const box=$('abuDeviceList');if(box)box.textContent='إدارة الأجهزة الآمنة غير جاهزة. أعد فتح التطبيق.'}}
function closeDevices(){$('abuDeviceModal')?.classList.remove('show')}
async function renderDevices(){return registryRequired().render()}
function registryAction(){alert('إدارة الأجهزة الآمنة لم تكتمل بعد. أعد فتح التطبيق.')}
const renameDevice=registryAction,toggleDevice=registryAction,permissionsDevice=registryAction,removeDevice=registryAction;

function securityCardHtml(){const owner=currentDevice?.role==='owner';return `<section id="abuSecuritySettings" class="abu-setting-card" data-settings-keywords="أمان دخول بصمة كلمة مرور أجهزة قفل صلاحيات خروج"><div class="abu-setting-title">🔐 الأمان وتسجيل الدخول</div><div class="abu-security-line"><span>الحساب</span><span><b>${MAIN_USERNAME}</b> • <span class="abu-security-badge ${owner?'owner':''}">${roleLabel()}</span></span></div><div class="abu-security-line"><span>هذا الهاتف</span><span>${esc(currentDevice?.device_name||localStorage.getItem(DEVICE_NAME_KEY)||deviceInfo.model||'—')}</span></div><label class="abu-security-line"><span>تسجيل الدخول بالبصمة</span><input id="abuSecurityBio" type="checkbox" onchange="AbuBassamSecurity.toggleBiometric(this.checked)"></label><div class="abu-security-setting-grid"><select id="abuSecurityLock" onchange="AbuBassamSecurity.setLockMinutes(this.value)"><option value="0">قفل فور مغادرة التطبيق</option><option value="1">بعد دقيقة</option><option value="5">بعد ٥ دقائق</option><option value="15">بعد ١٥ دقيقة</option><option value="60">بعد ساعة</option></select><button onclick="AbuBassamSecurity.lockNow()">🔒 قفل الآن</button>${owner?'<button onclick="AbuBassamSecurity.openDevices()">📱 إدارة الأجهزة (٥)</button>':''}<button onclick="AbuBassamSecurity.restorePreviousTheme()">↶ المظهر السابق</button></div><label class="abu-security-line"><span>مزامنة الثيم والخط بين الأجهزة</span><input id="abuAppearanceSync" type="checkbox" onchange="AbuBassamSecurity.appearanceSync(this.checked)"></label><div class="abu-setting-note" style="margin-top:6px">الثيم والخط يطبقان فعليًا على هذا الجهاز. مزامنة المظهر اختيارية؛ خطوط المطبوعات تبقى مستقلة.</div></section>`}
async function renderSecurityCard(){const body=document.querySelector('#abuSettingsModal .abu-settings-body');if(!body)return;let old=$('abuSecuritySettings');if(old)old.outerHTML=securityCardHtml();else body.insertAdjacentHTML('afterbegin',securityCardHtml());const bio=$('abuSecurityBio');if(bio)bio.checked=await getBiometricEnabled().catch(()=>false);const lockSel=$('abuSecurityLock');if(lockSel)lockSel.value=String(localStorage.getItem(LOCK_MINUTES_KEY)||5);const sync=$('abuAppearanceSync');if(sync)sync.checked=localStorage.getItem(APPEARANCE_SYNC_KEY)==='1';applySecondaryGuards()}
function injectSecurityCard(){renderSecurityCard();document.addEventListener('abu-settings-ready',()=>renderSecurityCard());document.addEventListener('abu-bassam-auth-changed',()=>renderSecurityCard())}

function setSecondaryOwnerOnly(btn,denied){if(!btn)return;if(denied){if(btn.dataset.abuSecurityOwnerGuard!=='1'){btn.dataset.abuSecurityOwnerGuard='1';btn.dataset.abuSecurityPrevDisabled=btn.disabled?'1':'0';btn.dataset.abuSecurityPrevTitle=btn.title||'';btn.dataset.abuSecurityPrevOpacity=btn.style.opacity||''}btn.disabled=true;btn.title='متاح للحساب الرئيسي فقط';btn.style.opacity='.45';return}if(btn.dataset.abuSecurityOwnerGuard==='1'){btn.disabled=btn.dataset.abuSecurityPrevDisabled==='1';if(btn.dataset.abuSecurityPrevTitle)btn.title=btn.dataset.abuSecurityPrevTitle;else btn.removeAttribute('title');btn.style.opacity=btn.dataset.abuSecurityPrevOpacity||'';delete btn.dataset.abuSecurityOwnerGuard;delete btn.dataset.abuSecurityPrevDisabled;delete btn.dataset.abuSecurityPrevTitle;delete btn.dataset.abuSecurityPrevOpacity}}
function applySecondaryGuards(){const denied=(window.AbuBassamSecurity?.role?.()||currentDevice?.role)!=='owner';document.querySelectorAll('#abuSettingsModal button[onclick*="resetDefaults"],#opsClear').forEach(btn=>setSecondaryOwnerOnly(btn,denied))}
function permissionForTarget(target){if(!target)return'';const onclick=String(target.getAttribute?.('onclick')||'');if(/resetDefaults|resetData/.test(onclick))return'reset';if(target.id==='opsClear'||/clearOperations/.test(onclick))return'security';if(/cloudLogin/.test(onclick))return'security';return''}
function guardClicks(){document.addEventListener('click',event=>{if(!sessionUnlocked()||window.AbuBassamSecurity?.role?.()==='owner')return;const target=event.target?.closest?.('button,[role="button"]');const need=permissionForTarget(target);if(need&&!window.AbuBassamSecurity?.can?.(need)){event.preventDefault();event.stopImmediatePropagation();toast('هذه العملية متاحة للحساب الرئيسي فقط')}},true)}

function appearancePayload(){return{theme:localStorage.getItem('theme')||'default',typography:readJson('abuBassamTypographyV5',{})}}
async function pushAppearance(){if(!cloud()?.isConnected?.()||!can('appearance')||currentDevice?.role!=='owner')return;const payload=appearancePayload(),stamp=JSON.stringify(payload);if(stamp===appearanceStamp)return;appearanceStamp=stamp;try{await cloud().upsert('appearance','shared',payload)}catch(e){}}
async function pullAppearanceIfNeeded(){if(localStorage.getItem(APPEARANCE_SYNC_KEY)!=='1'||!cloud()?.isConnected?.())return;try{const row=await cloud().get('appearance','shared');if(!row?.data)return;const data=row.data;if(data.theme){localStorage.setItem(PREVIOUS_THEME_KEY,localStorage.getItem('theme')||'default');localStorage.setItem('theme',data.theme);if(typeof window.applyTheme==='function')window.applyTheme(data.theme)}if(data.typography&&typeof data.typography==='object'){localStorage.setItem('abuBassamTypographyV5',JSON.stringify(data.typography));window.AbuBassamTypography?.applyApp?.()}appearanceStamp=JSON.stringify(appearancePayload())}catch(e){}}
async function appearanceSync(enabled){localStorage.setItem(APPEARANCE_SYNC_KEY,enabled?'1':'0');if(enabled){if(currentDevice?.role==='owner')await pushAppearance();else await pullAppearanceIfNeeded()}log('مزامنة المظهر',enabled?'مفعلة':'متوقفة')}
function installAppearanceHooks(){if(window.AbuBassamSettings?.theme&&!window.AbuBassamSettings.theme.__securityWrapped){const original=window.AbuBassamSettings.theme;const wrapped=function(key){localStorage.setItem(PREVIOUS_THEME_KEY,localStorage.getItem('theme')||'default');const out=original.apply(this,arguments);setTimeout(pushAppearance,80);return out};wrapped.__securityWrapped=true;window.AbuBassamSettings.theme=wrapped}if(window.AbuBassamTypography?.global&&!window.AbuBassamTypography.global.__securityWrapped){const original=window.AbuBassamTypography.global;const wrapped=function(){const out=original.apply(this,arguments);setTimeout(pushAppearance,100);return out};wrapped.__securityWrapped=true;window.AbuBassamTypography.global=wrapped}}function wrapAppearance(){installAppearanceHooks();document.addEventListener('abu-runtime-loaded',installAppearanceHooks);document.addEventListener('abu-settings-ready',installAppearanceHooks)}
function restorePreviousTheme(){const prev=localStorage.getItem(PREVIOUS_THEME_KEY);if(!prev)return toast('لا يوجد مظهر سابق محفوظ');const current=localStorage.getItem('theme')||'default';localStorage.setItem(PREVIOUS_THEME_KEY,current);localStorage.setItem('theme',prev);if(typeof window.applyTheme==='function')window.applyTheme(prev);window.AbuBassamSettings?.open?.();setTimeout(()=>window.AbuBassamSettings?.theme?.(prev),30);toast('تمت استعادة المظهر السابق')}

function clearOrphanInteractionLayers(){
  const backdrop=$('sheetBackdrop');
  if(!backdrop?.classList.contains('show')||document.querySelector('.sheet.show'))return false;
  backdrop.classList.remove('show');
  return true
}
function dismissLayerFallback(el){
  // Missing or broken optional section handlers must not leave touch-blocking
  // layers in the DOM. Preserve style so the section can open normally again.
  for(const state of ['show','on','abu-open'])el.classList.remove(state)
}
function closeTopLayer(){const ordered=['#paperZoomOverlay.show','#abuA4EditorV2.show','#abuPosterAssemblyModal.show','#abuEnhanceModal.show','#abuPosterModal.show','#abuGeoModal.show','#abuRulerModal.show','#abuPresetModal.abu-open','#abuPasswordResetModal.show','#natZoom.show','#custView.on','#custPick.on','#custModal.on','#abuBackupModal.on','#abuVaultAdvancedModal.show','#abuRecoveryModal.show','#abuAccountModal.on','#abuNotificationSheet.show','#abuDeviceModal.show','#abuTextEditor.show','#abuTypographySettings.show','#abuSettingsModal.show','#abuOpsV2.show','#opsSheet.show','.v-modal.show','.cs-modal.show','.nat-modal.show','.sheet.show','.ds-sheet.show'];for(const sel of ordered){const el=document.querySelector(sel);if(!el)continue;try{if(el.id==='paperZoomOverlay'&&typeof window.closePaperZoom==='function')window.closePaperZoom();else if(el.id==='abuA4EditorV2')window.AbuA4CardSheetEditorV2?.close?.();else if(el.id==='abuPosterAssemblyModal')window.AbuPosterProject?.closePreview?.();else if(el.id==='abuEnhanceModal'||el.id==='abuPosterModal')window.AbuPhotoAdvanced?.close?.(el.id);else if(el.id==='abuGeoModal'||el.id==='abuRulerModal')window.AbuPhotoGeometry?.close?.(el.id);else if(el.id==='abuPresetModal')window.AbuPrintPresets?.close?.();else if(el.id==='abuPasswordResetModal')window.AbuBassamPasswordRecovery?.close?.();else if(el.id==='natZoom')window.Nat?.zoomClose?.();else if(el.id==='custView'||el.id==='custPick'||el.id==='custModal')window.AbuCustomerDocs?.closeTop?.();else if(el.id==='abuBackupModal')window.AbuBackupCenter?.close?.();else if(el.id==='abuVaultAdvancedModal')window.AbuDocumentVaultAdvanced?.close?.();else if(el.id==='abuRecoveryModal')window.AbuFeatureRecovery?.close?.();else if(el.id==='abuAccountModal')window.AbuBassamAccount?.close?.();else if(el.id==='abuNotificationSheet')window.AbuBassamNotifications?.close?.();else if(el.id==='abuDeviceModal')closeDevices();else if(el.id==='abuSettingsModal')window.AbuBassamSettings?.close?.();else if(el.id==='abuOpsV2')window.AbuBassamOperationLogV2?.close?.();else if(el.id==='opsSheet')window.AbuBassamOps?.close?.();else if(el.classList.contains('sheet')&&typeof window.closeSheets==='function')window.closeSheets();else dismissLayerFallback(el)}catch(error){console.warn('Abu Bassam layer close failed',el.id,error)}if(el.classList.contains('show')||el.classList.contains('on')||el.classList.contains('abu-open'))dismissLayerFallback(el);clearOrphanInteractionLayers();return true}return clearOrphanInteractionLayers()}
function home(){if(closeTopLayer()){}try{if(typeof window.switchTab==='function')window.switchTab('photos')}catch(e){}document.body.classList.remove('abu-focus-mode');window.scrollTo({top:0,behavior:'smooth'});toast('الرئيسية')}
function focus(){document.body.classList.toggle('abu-focus-mode');toast(document.body.classList.contains('abu-focus-mode')?'وضع تكبير مساحة العمل':'الوضع العادي')}
function back(fromHardware=false){if(!sessionUnlocked())return true;if(closeTopLayer())return true;if(document.body.classList.contains('abu-focus-mode')){document.body.classList.remove('abu-focus-mode');return true}const active=document.querySelector('#abuMainTabs .abu-tab.active');if(active&&active.id!=='tabPhotos'){home();return true}if(window.scrollY>40){window.scrollTo({top:0,behavior:'smooth'});return true}return exit(fromHardware)}
function exit(){const now=Date.now();if(now-exitArmedAt<=2000){exitArmedAt=0;if(window.Android?.exitApp)Android.exitApp();return true}exitArmedAt=now;toast('اضغط مرة ثانية للخروج');return true}
window.AbuBassamNativeBackPress=function(){back(true)};

async function logout(){
  if(!confirm('تسجيل الخروج من هذا الجهاز؟'))return false;
  // Close the unlocked UI immediately: a slow or offline sign-out must
  // never leave privileged controls available after confirmation.
  currentDevice=null;unlocked=false;showGate('تم تسجيل الخروج.');log('تسجيل خروج');
  // Revoke signed offline trust before a slow/unreachable cloud sign-out.
  // A canceled confirmation never reaches this point.
  try{await window.AbuBassamSecurity?.clearOfflineTrust?.()}catch(error){console.warn('Offline trust deletion failed during logout',error)}
  try{await cloud()?.client?.auth?.signOut?.({scope:'local'})}catch(e){}
  return true
}
function lockNow(){lock('تم قفل التطبيق يدويًا')}

function scheduleMaintenance(delay=60000){clearTimeout(maintenanceTimer);maintenanceTimer=null;if(document.visibilityState==='hidden')return;maintenanceTimer=setTimeout(()=>void maintenanceTick(),Math.max(1000,delay))}
async function maintenanceTick(){maintenanceTimer=null;if(document.visibilityState==='hidden')return;try{if(unlocked)await touchDevice();if(localStorage.getItem(APPEARANCE_SYNC_KEY)==='1'){if(currentDevice?.role==='owner')await Promise.resolve(pushAppearance());else await Promise.resolve(pullAppearanceIfNeeded())}}catch(e){}finally{scheduleMaintenance()}}
function installMaintenance(){scheduleMaintenance();document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){clearTimeout(maintenanceTimer);maintenanceTimer=null}else scheduleMaintenance(1000)})}
async function boot(){
  // Critical startup is local: construct and lock the gate before notifying
  // Android. Cloud/session restoration must not make offline startup hang.
  buildUi();guardClicks();injectSecurityCard();wrapAppearance();
  if(!localStorage.getItem(LOCK_MINUTES_KEY))localStorage.setItem(LOCK_MINUTES_KEY,'5');
  showGate('أدخل بيانات الدخول لفتح التطبيق.');
  installMaintenance();
  void fetchDeviceInfo().catch(error=>console.warn('Device information unavailable',error));
  try{
    const cloudReady=cloud()?.ready?.();
    if(cloudReady&&typeof cloudReady.catch==='function')void cloudReady.catch(()=>{});
  }catch(error){console.warn('Cloud session initialization unavailable',error)}
  void getBiometricEnabled().then(bio=>{
    if(!bio||sessionUnlocked()||!(cloud()?.isConnected?.()&&navigator.onLine))return;
    // Never display the biometric prompt before the approved UI is booted.
    if(window.__ABU_APPROVED_UI_READY__)setTimeout(()=>{if(!sessionUnlocked())void window.AbuBassamSecurity?.unlockWithBiometric?.()},180);
    else document.addEventListener('abu-bassam-approved-ui-ready',()=>{
      if(!sessionUnlocked())void window.AbuBassamSecurity?.unlockWithBiometric?.()
    },{once:true})
  }).catch(()=>{});
}

window.AbuBassamSecurity={
  username:MAIN_USERNAME,email:MAIN_EMAIL,maxDevices:MAX_DEVICES,can,role:()=>currentDevice?.role||'',device:()=>currentDevice,
  login,unlockWithBiometric,toggleBiometric,setLockMinutes,lockNow,logout,
  openDevices,closeDevices,renderDevices,renameDevice,toggleDevice,permissionsDevice,removeDevice,
  appearanceSync,restorePreviousTheme,pushAppearance,pullAppearanceIfNeeded,
  back,home,focus,exit,
  onSessionChanged:async()=>{if(unlocked&&cloud()?.isConnected?.())try{await registerDevice()}catch(e){}},
};

// Export the *completion* of async login-gate initialization, not the moment
// its script finishes evaluating. The native shell must not reveal the UI
// before the gate has been constructed and boot has finished safely.
let resolveSecurityBoot,rejectSecurityBoot;
window.__ABU_SECURITY_BOOT_PROMISE__=new Promise((resolve,reject)=>{
  resolveSecurityBoot=resolve;rejectSecurityBoot=reject
});
// Attach a rejection observer immediately; the device loader also awaits the
// original promise and receives the actual error after loading all guards.
window.__ABU_SECURITY_BOOT_PROMISE__.catch(()=>{});
function startSecurityBoot(){
  Promise.resolve().then(boot).then(()=>{
    if(!document.getElementById('abuSecurityGate'))throw new Error('SECURITY_GATE_NOT_READY');
    resolveSecurityBoot(true)
  }).catch(rejectSecurityBoot)
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startSecurityBoot,{once:true});else startSecurityBoot();
})();
