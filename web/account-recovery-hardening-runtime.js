(()=>{
'use strict';
if(window.__ABU_ACCOUNT_RECOVERY_HARDENING_V1__)return;
window.__ABU_ACCOUNT_RECOVERY_HARDENING_V1__=true;
const CALLBACK='abu-bassam-library://auth/callback';
const CALLBACK_KEY='abu_bassam_auth_callback_v1';
const pending=new Map();
let seq=0,bridgeInstalled=false,googleBusy=false;
const $=id=>document.getElementById(id);
function setMsg(text,bad=false){const e=$('acctMsg');if(e){e.textContent=String(text||'');e.style.color=bad?'#a52e3b':'#087f72'}}
function installBridge(){
  if(bridgeInstalled)return;
  bridgeInstalled=true;
  const previous=window.AbuBassamNativeSecurityResult;
  window.AbuBassamNativeSecurityResult=function(message){
    const data=typeof message==='string'?(()=>{try{return JSON.parse(message)}catch(_){return{}}})():message||{};
    const slot=pending.get(data.requestId);
    if(slot){clearTimeout(slot.timer);pending.delete(data.requestId);data.ok===false?slot.reject(new Error(data.error||'تعذر الوصول إلى التخزين الآمن')):slot.resolve(data.value);return}
    if(typeof previous==='function')return previous(message)
  }
}
function native(action,payload={}){
  installBridge();
  if(!(window.Android&&typeof Android.security==='function')){
    const key='__dev_secure_'+String(payload.key||'');
    if(action==='secureGet')return Promise.resolve(localStorage.getItem(key)||'');
    if(action==='secureSet'){localStorage.setItem(key,String(payload.value||''));return Promise.resolve(true)}
    if(action==='secureDelete'){localStorage.removeItem(key);return Promise.resolve(true)}
    return Promise.resolve(null)
  }
  return new Promise((resolve,reject)=>{
    const requestId='acct-hard-'+Date.now()+'-'+(++seq);
    const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('انتهت مهلة التخزين الآمن'))},12000);
    pending.set(requestId,{resolve,reject,timer});
    Android.security(action,requestId,payload)
  })
}
async function verifyLocalArchiveEmpty(){
  const stats=window.DocumentVault?.stats;
  if(typeof stats!=='function')throw new Error('LOCAL_ARCHIVE_CHECK_UNAVAILABLE');
  const result=await stats();
  const count=Number(result?.count);
  if(!Number.isFinite(count)||count<0)throw new Error('LOCAL_ARCHIVE_CHECK_INVALID');
  return count===0
}
async function guardedRecovery(){
  const button=$('acctRecoverDo');
  if(button?.disabled)return;
  if(button)button.disabled=true;
  try{
    let empty;
    try{empty=await verifyLocalArchiveEmpty()}
    catch(_){setMsg('تعذر التحقق من الأرشيف المحلي، لذلك أوقفت الاستعادة لحماية الملفات من الاختلاط. أعد تشغيل التطبيق ثم حاول مجددًا.',true);return}
    if(!empty){setMsg('الأرشيف المحلي على هذا الهاتف غير فارغ. احفظ/صدّر ملفاته أولًا قبل استعادة هوية هاتف قديم حتى لا تختلط الفروع.',true);return}
    const fn=window.AbuBassamAccount?.recoverPhone;
    if(typeof fn!=='function'){setMsg('خدمة استعادة الهاتف غير جاهزة. أعد فتح الإعدادات وحاول مجددًا.',true);return}
    await fn()
  }finally{if(button)button.disabled=false}
}
function authClient(){const cloud=window.AbuBassamCloud;return cloud?.client||null}
async function safeGoogle(){
  if(googleBusy)return;
  googleBusy=true;setMsg('جاري فتح Google...');
  try{
    await window.AbuBassamCloud?.ready?.();
    const c=authClient();
    if(!c?.auth)throw new Error('خدمة الحساب غير جاهزة');
    const {data,error}=await c.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${CALLBACK}?flow=google`,skipBrowserRedirect:true}});
    if(error)throw error;
    const url=String(data?.url||'');
    const parsed=new URL(url);
    if(parsed.protocol!=='https:')throw new Error('رابط Google غير آمن');
    if(window.Android&&typeof Android.openExternal==='function')Android.openExternal(url);
    else window.location.assign(url)
  }catch(error){
    const msg=String(error?.message||error||'تعذر فتح Google');
    setMsg(/provider is not enabled|unsupported provider/i.test(msg)?'تسجيل Google غير مفعّل بعد في إعدادات Supabase.':msg,true)
  }finally{googleBusy=false}
}
async function cleanupStaleCallback(){
  try{
    const raw=String(await native('secureGet',{key:CALLBACK_KEY})||'');
    if(!raw)return;
    let u;try{u=new URL(raw)}catch(_){await native('secureDelete',{key:CALLBACK_KEY});return}
    const base=`${u.protocol}//${u.host}${u.pathname}`;
    const usable=base===CALLBACK&&!!(u.searchParams.get('code')||u.searchParams.get('error')||u.searchParams.get('error_description'));
    if(!usable)await native('secureDelete',{key:CALLBACK_KEY})
  }catch(_){}
}
function enforceBranchVault(){
  const cloud=window.AbuBassamCloud,branch=window.AbuBassamBranchVault;
  if(!cloud||!branch)return false;
  if(typeof branch.upload==='function')cloud.uploadVault=branch.upload;
  if(typeof branch.download==='function')cloud.downloadVault=branch.download;
  if(typeof branch.remove==='function')cloud.removeVault=branch.remove;
  if(!cloud.__abuBranchVaultPatched&&!cloud.__abuAccountVaultFallback){
    cloud.__abuAccountVaultFallback=true;
    const list=cloud.list?.bind(cloud),get=cloud.get?.bind(cloud),upsert=cloud.upsert?.bind(cloud);
    if(list)cloud.list=(kind,limit)=>String(kind)==='vault'?branch.list(limit):list(kind,limit);
    if(get)cloud.get=(kind,id)=>String(kind)==='vault'?branch.get(id):get(kind,id);
    if(upsert)cloud.upsert=(kind,id,data)=>String(kind)==='vault'?branch.upsert(id,data):upsert(kind,id,data)
  }
  return true
}
function patchPublicApis(){
  if(window.AbuBassamAccount)window.AbuBassamAccount.google=safeGoogle;
  if(window.AbuBassamSettings)window.AbuBassamSettings.google=safeGoogle;
  enforceBranchVault()
}
function onClick(event){
  const target=event.target?.closest?.('button');
  if(!target)return;
  if(target.id==='acctRecoverDo'){
    event.preventDefault();event.stopImmediatePropagation();guardedRecovery();return
  }
  if(['acctGoogle','acctLoginGoogle','acctCreateGoogle'].includes(target.id)){
    event.preventDefault();event.stopImmediatePropagation();safeGoogle()
  }
}
function boot(){
  installBridge();
  document.addEventListener('click',onClick,true);
  patchPublicApis();cleanupStaleCallback();
  [100,300,800,1600,3500].forEach(ms=>setTimeout(()=>{patchPublicApis();cleanupStaleCallback()},ms));
  setInterval(()=>{patchPublicApis();cleanupStaleCallback()},10000)
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
