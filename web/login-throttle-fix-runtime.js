(()=>{
'use strict';
if(window.__ABU_LOGIN_THROTTLE_FIX_V1__)return;
window.__ABU_LOGIN_THROTTLE_FIX_V1__=true;

const ATTEMPT_KEY='abuBassamLoginAttemptsV1';
const LOGIN_LOCK_KEY='abuBassamLoginLockUntilV1';
const BLOCK_COUNT_KEY='abuBassamLoginBlockCountV1';
const PATCH_MARKER='abuBassamLoginThrottleFixV1';
const $=id=>document.getElementById(id);

function lockUntil(){return Number(localStorage.getItem(LOGIN_LOCK_KEY)||0)}
function remaining(){return Math.max(0,lockUntil()-Date.now())}
function setMessage(message){const el=$('abuLoginError');if(el)el.textContent=message||''}
function formatSeconds(ms){const n=Math.max(1,Math.ceil(ms/1000)),digits='٠١٢٣٤٥٦٧٨٩';return String(n).replace(/\d/g,d=>digits[+d])+' ثانية'}
function clearFailures(){localStorage.removeItem(ATTEMPT_KEY);localStorage.removeItem(LOGIN_LOCK_KEY);localStorage.removeItem(BLOCK_COUNT_KEY)}
function credentialFailure(message){return /اسم المستخدم أو كلمة المرور غير صحيحة|اسم المستخدم غير صحيح|أدخل كلمة المرور كاملة|invalid login credentials/i.test(String(message||''))}
function deviceOrPostAuthFailure(message){return /DEVICE_|هذا الجهاز|تعذر تسجيل الجهاز|غير مصرح له بالدخول|الحد الأقصى: ٥ أجهزة/i.test(String(message||''))}
function recordCredentialFailure(message){
  const attempts=Number(localStorage.getItem(ATTEMPT_KEY)||0)+1;
  if(attempts<5){localStorage.setItem(ATTEMPT_KEY,String(attempts));setMessage(`${message} • المتبقي قبل الانتظار: ${5-attempts}`);return}
  const blocks=Number(localStorage.getItem(BLOCK_COUNT_KEY)||0)+1;
  const duration=Math.min(300000,30000*Math.max(1,blocks));
  localStorage.setItem(ATTEMPT_KEY,'0');
  localStorage.setItem(BLOCK_COUNT_KEY,String(blocks));
  localStorage.setItem(LOGIN_LOCK_KEY,String(Date.now()+duration));
  setMessage(`محاولات كلمة مرور غير صحيحة كثيرة. انتظر ${formatSeconds(duration)} ثم حاول مرة أخرى.`)
}
async function guardedLogin(){
  const wait=remaining();if(wait>0){setMessage(`الدخول متوقف مؤقتًا بسبب محاولات كلمة مرور غير صحيحة. حاول بعد ${formatSeconds(wait)}.`);return}
  const security=window.AbuBassamSecurity;
  if(!security||typeof security.login!=='function')return setMessage('خدمة الدخول غير جاهزة.');
  const gate=$('abuSecurityGate');
  await security.login();
  if(gate?.classList.contains('hide')){clearFailures();return}
  const message=String($('abuLoginError')?.textContent||'').trim();
  if(credentialFailure(message)){recordCredentialFailure(message);return}
  if(deviceOrPostAuthFailure(message))clearFailures();
  if(message&&!/جاري/i.test(message))setMessage(message)
}
function replaceHandlers(){
  const oldButton=$('abuLoginBtn'),oldPass=$('abuLoginPass');
  if(!oldButton||!oldPass||!window.AbuBassamSecurity?.login)return false;
  if(oldButton.dataset.abuThrottleFix==='1')return true;
  const pass=oldPass.cloneNode(true);pass.value=oldPass.value||'';oldPass.replaceWith(pass);
  const button=oldButton.cloneNode(true);oldButton.replaceWith(button);
  button.dataset.abuThrottleFix='1';button.removeAttribute('data-throttled');button.onclick=guardedLogin;
  pass.addEventListener('keydown',event=>{if(event.key!=='Enter')return;event.preventDefault();guardedLogin()});
  return true
}
function init(){
  if(localStorage.getItem(PATCH_MARKER)!=='1'){
    clearFailures();
    localStorage.setItem(PATCH_MARKER,'1');
  }
  let tries=0;
  const timer=setInterval(()=>{tries++;if(replaceHandlers()||tries>120)clearInterval(timer)},50);
  new MutationObserver(()=>replaceHandlers()).observe(document.documentElement,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
