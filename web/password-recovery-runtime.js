(()=>{
'use strict';
if(window.__ABU_PASSWORD_RECOVERY_V1__)return;
window.__ABU_PASSWORD_RECOVERY_V1__=true;

function accountEmail(){return String(window.AbuBassamSecurity?.email||window.AbuBassamCloud?.session?.()?.user?.email||'').trim().toLowerCase()}
const CALLBACK='abu-bassam-library://auth/callback';
const CALLBACK_KEY='abu_bassam_auth_callback_v1';
const FLOW='password-recovery';
let resetBusy=false;
let callbackBusy=false;
let passwordBusy=false;
let authListenerInstalled=false;
const $=id=>document.getElementById(id);

function setLoginMessage(message,bad=false){
  const el=$('abuLoginError');
  if(!el)return;
  el.textContent=String(message||'');
  el.style.color=bad?'#a62e3b':'#087f72';
}
function cloud(){return window.AbuBassamCloud||null}
function client(){return cloud()?.client||null}

function native(action,payload={}){const api=window.AbuBassamNativeSecurity;if(!api?.request)return Promise.reject(new Error('NATIVE_SECURITY_REQUIRED'));return api.request(action,payload)}
function addUi(){
  if($('abuForgotPassword'))return;
  const style=document.createElement('style');
  style.id='abuPasswordRecoveryStyle';
  style.textContent=`
.abu-forgot-password{width:100%;min-height:36px;margin-top:4px;border:0;background:transparent;color:#087f72;font-weight:900;font-size:10px;text-decoration:underline}.abu-password-reset-modal{position:fixed;z-index:42000;inset:0;display:none;align-items:center;justify-content:center;padding:14px;background:#000c;direction:rtl}.abu-password-reset-modal.show{display:flex}.abu-password-reset-card{width:min(430px,100%);background:#fffaf3;color:#2b211d;border-radius:22px;padding:18px;text-align:center;box-shadow:0 22px 70px #000a}.abu-password-reset-card h3{margin:4px 0 8px}.abu-password-reset-card p{font-size:10px;color:#75675e;line-height:1.7}.abu-password-reset-card input{width:100%;min-height:46px;margin:5px 0;padding:9px;border:1px solid #c8b9ad;border-radius:11px;background:#fff;color:#222;text-align:center}.abu-password-reset-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.abu-password-reset-actions button{min-height:43px;border:0;border-radius:10px;background:#087f72;color:#fff;font-weight:900}.abu-password-reset-actions .secondary{background:#6b5648}.abu-password-reset-status{min-height:21px;margin-top:7px;font-size:9px;line-height:1.6;color:#087f72}`;
  document.head.appendChild(style);
  const pass=$('abuLoginPass');
  if(pass){
    const forgot=document.createElement('button');
    forgot.id='abuForgotPassword';forgot.type='button';forgot.className='abu-forgot-password';forgot.textContent='نسيت كلمة المرور؟ استعادتها من البريد الإلكتروني';
    pass.insertAdjacentElement('afterend',forgot);
    forgot.addEventListener('click',requestPasswordReset);
  }
  const modal=document.createElement('div');
  modal.id='abuPasswordResetModal';modal.className='abu-password-reset-modal';
  modal.innerHTML=`<div class="abu-password-reset-card"><h3>🔑 تعيين كلمة مرور جديدة</h3><p>تم التحقق من رابط الاستعادة المرسل إلى<br><b>${accountEmail()}</b></p><input id="abuNewPassword" type="password" autocomplete="new-password" placeholder="كلمة المرور الجديدة — 12 محرفًا على الأقل مع حرف ورقم ورمز"><input id="abuNewPasswordConfirm" type="password" autocomplete="new-password" placeholder="تأكيد كلمة المرور الجديدة القوية"><div class="abu-password-reset-actions"><button id="abuSaveNewPassword" type="button">حفظ كلمة المرور</button><button id="abuCancelNewPassword" type="button" class="secondary">إلغاء</button></div><div id="abuPasswordResetStatus" class="abu-password-reset-status"></div></div>`;
  document.body.appendChild(modal);
  $('abuSaveNewPassword').addEventListener('click',saveNewPassword);
  $('abuCancelNewPassword').addEventListener('click',()=>closeResetModal(true));
  $('abuNewPasswordConfirm').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();saveNewPassword()}});
}
function resetStatus(message,bad=false){const el=$('abuPasswordResetStatus');if(el){el.textContent=String(message||'');el.style.color=bad?'#a62e3b':'#087f72'}}
function openResetModal(){addUi();$('abuPasswordResetModal')?.classList.add('show');$('abuNewPassword')?.focus();resetStatus('اكتب كلمة مرور جديدة ثم أكدها.')}
async function closeResetModal(signOut=false){
  $('abuPasswordResetModal')?.classList.remove('show');
  if($('abuNewPassword'))$('abuNewPassword').value='';
  if($('abuNewPasswordConfirm'))$('abuNewPasswordConfirm').value='';
  resetStatus('');
  if(signOut){try{await client()?.auth?.signOut?.({scope:'local'})}catch(_){}}
}

async function requestPasswordReset(){
  if(resetBusy)return;
  resetBusy=true;
  const button=$('abuForgotPassword');if(button)button.disabled=true;
  setLoginMessage('جاري إرسال رابط استعادة كلمة المرور...');
  try{
    await cloud()?.ready?.();
    const c=client();if(!c?.auth?.resetPasswordForEmail)throw new Error('خدمة استعادة كلمة المرور غير جاهزة');
    const email=accountEmail();if(!email)throw new Error('تعذر تحديد بريد الحساب المعتمد');
    const {error}=await c.auth.resetPasswordForEmail(email,{redirectTo:`${CALLBACK}?flow=${FLOW}`});
    if(error)throw error;
    setLoginMessage(`تم إرسال رابط الاستعادة إلى ${accountEmail()}. افتح الرسالة واضغط الرابط ثم ارجع إلى التطبيق.`);
  }catch(error){
    const text=String(error?.message||error||'تعذر إرسال رابط الاستعادة');
    setLoginMessage(/rate limit|too many/i.test(text)?'تم طلب الاستعادة عدة مرات. انتظر قليلًا ثم حاول مجددًا.':text,true);
  }finally{resetBusy=false;if(button)button.disabled=false}
}

async function consumeRecoveryCallback(){
  if(callbackBusy)return;
  callbackBusy=true;
  try{
    const raw=String(await native('secureGet',{key:CALLBACK_KEY})||'');
    if(!raw)return;
    let url;try{url=new URL(raw)}catch(_){await native('secureDelete',{key:CALLBACK_KEY});return}
    const base=`${url.protocol}//${url.host}${url.pathname}`;
    if(base!==CALLBACK)return;
    const flow=String(url.searchParams.get('flow')||'');
    if(flow!==FLOW)return;
    const callbackError=url.searchParams.get('error_description')||url.searchParams.get('error');
    if(callbackError){
      await native('secureDelete',{key:CALLBACK_KEY});
      setLoginMessage(`فشل رابط الاستعادة: ${callbackError}`,true);
      return;
    }
    const code=String(url.searchParams.get('code')||'');
    if(!code)return;
    await cloud()?.ready?.();
    const c=client();if(!c?.auth?.exchangeCodeForSession)throw new Error('خدمة التحقق من رابط الاستعادة غير جاهزة');
    const {data,error}=await c.auth.exchangeCodeForSession(code);
    if(error)throw error;
    const email=String(data?.session?.user?.email||data?.user?.email||'').toLowerCase();
    if(email&&email!==accountEmail()){
      await c.auth.signOut({scope:'local'}).catch(()=>{});
      throw new Error('رابط الاستعادة لا يخص حساب مكتبة أبو بسام المعتمد');
    }
    await native('secureDelete',{key:CALLBACK_KEY});
    openResetModal();
    setLoginMessage('تم التحقق من رابط الاستعادة. عيّن كلمة المرور الجديدة.');
  }catch(error){
    await native('secureDelete',{key:CALLBACK_KEY}).catch(()=>{});
    const text=String(error?.message||error||'تعذر التحقق من رابط الاستعادة');
    setLoginMessage(/expired|invalid.*code|flow state/i.test(text)?'رابط الاستعادة منتهي أو مستخدم. اضغط «نسيت كلمة المرور؟» لإرسال رابط جديد.':text,true);
  }finally{callbackBusy=false}
}

async function saveNewPassword(){
  if(passwordBusy)return;
  const password=String($('abuNewPassword')?.value||'');
  const confirmPassword=String($('abuNewPasswordConfirm')?.value||'');
  const policy=window.AbuBassamStrongPasswordWeakness||window.AbuBassamSecurityExtras?.passwordWeakness;
  const problem=typeof policy==='function'?policy(password):(password.length<12?'استخدم 12 محرفًا على الأقل.':!/\p{L}/u.test(password)?'أضف حرفًا واحدًا على الأقل.':!/\p{N}/u.test(password)?'أضف رقمًا واحدًا على الأقل.':!/[^\p{L}\p{N}\s]/u.test(password)?'أضف رمزًا خاصًا مثل ! أو # أو @.':'');
  if(problem)return resetStatus(problem,true);
  if(password!==confirmPassword)return resetStatus('كلمتا المرور غير متطابقتين.',true);
  passwordBusy=true;const button=$('abuSaveNewPassword');if(button)button.disabled=true;resetStatus('جاري حفظ كلمة المرور الجديدة...');
  try{
    const c=client();if(!c?.auth?.updateUser)throw new Error('خدمة تغيير كلمة المرور غير جاهزة');
    const {data,error}=await c.auth.updateUser({password});
    if(error)throw error;
    const email=String(data?.user?.email||'').trim().toLowerCase();
    if(!email||email!==accountEmail())throw new Error('تعذر تأكيد أن الحساب المفتوح يطابق البريد المعتمد');
    await c.auth.signOut({scope:'local'}).catch(()=>{});
    await closeResetModal(false);
    setLoginMessage('تم تغيير كلمة المرور بنجاح ✓ سجّل الدخول الآن بكلمة المرور الجديدة.');
    $('abuLoginPass')?.focus();
  }catch(error){resetStatus(String(error?.message||error||'تعذر تغيير كلمة المرور'),true)}
  finally{passwordBusy=false;if(button)button.disabled=false}
}

function installAuthListener(){
  if(authListenerInstalled)return;
  const c=client();if(!c?.auth?.onAuthStateChange)return;
  authListenerInstalled=true;
  c.auth.onAuthStateChange((event,session)=>{
    if(event==='PASSWORD_RECOVERY'){
      const email=String(session?.user?.email||'').trim().toLowerCase();
      if(email&&email===accountEmail())openResetModal();
      else setLoginMessage('تم رفض جلسة استعادة لا تطابق حساب مكتبة أبو بسام المعتمد.',true);
    }
  });
}
function installAppStateHook(){
  const previous=window.AbuBassamNativeAppState;
  if(previous?.__passwordRecoveryWrapped)return;
  const wrapped=function(payload){
    if(typeof previous==='function')previous(payload);
    const state=payload?.state||payload;
    if(state==='active')setTimeout(consumeRecoveryCallback,120);
  };
  wrapped.__passwordRecoveryWrapped=true;
  window.AbuBassamNativeAppState=wrapped;
}
async function boot(){
  addUi();installAppStateHook();
  try{await cloud()?.ready?.()}catch(_){}
  installAuthListener();
  await consumeRecoveryCallback();
  [300,900,1800,3500].forEach(ms=>setTimeout(()=>{addUi();installAuthListener();consumeRecoveryCallback()},ms));
}

window.AbuBassamPasswordRecovery={email:accountEmail,request:requestPasswordReset,consume:consumeRecoveryCallback,save:saveNewPassword,close:()=>closeResetModal(false)};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
