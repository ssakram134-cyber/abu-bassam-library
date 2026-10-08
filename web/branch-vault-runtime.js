(()=>{
'use strict';
if(window.__ABU_BRANCH_VAULT_V1__)return;
window.__ABU_BRANCH_VAULT_V1__=true;
const SECRET_KEY='abu_bassam_device_secret_v1',BUCKET='abu-bassam-private',SCOPE_KEY='abuBassamVaultLocalScopeV1';
const LABELS={vaultView:'عرض ملفات الحفظ',vaultAdd:'إضافة ملفات للحفظ',vaultEdit:'تعديل الملفات',vaultRename:'إعادة تسمية الملفات',vaultMove:'نقل الملفات',vaultFolders:'إدارة المجلدات',vaultFavorite:'إدارة المفضلة',vaultDelete:'حذف الملفات',vaultExport:'تصدير الملفات',vaultShare:'مشاركة الملفات',vaultPrint:'طباعة الملفات',vaultSaveGallery:'حفظ في المعرض',vaultSavePdf:'حفظ PDF',vaultSync:'مزامنة ملفات الفرع',vaultBackup:'إنشاء نسخة احتياطية',vaultRestoreBackup:'استعادة نسخة احتياطية'};
const pathToId=new Map();let adapterRegistered=false;
function role(){return window.AbuBassamSecurity?.role?.()||''}
function device(){const s=window.AbuBassamSecurity?.device?.()||{},d=window.AbuBassamDevices?.ensure?.()||{};return{id:String(s.device_id||s.id||d.device_id||d.id||localStorage.getItem('abuBassamLockedDeviceIdV3')||'').trim(),name:String(s.device_name||s.name||d.device_name||d.name||localStorage.getItem('abuBassamLockedDeviceNameV3')||'هذا الفرع').trim()||'هذا الفرع',permissions:s.permissions||{}}}
function native(action,payload={}){const api=window.AbuBassamNativeSecurity;if(!api?.request)return Promise.reject(new Error('SECURE_STORAGE_REQUIRED'));return api.request(action,payload)}
async function secret(){return String(await native('secureGet',{key:SECRET_KEY})||'')}
function allowed(key){if(role()==='owner')return true;if(!Object.prototype.hasOwnProperty.call(LABELS,key))return false;const api=window.AbuBassamPermissions;if(api&&typeof api.can==='function')return api.can(key)===true;return device().permissions?.[key]===true}
function deny(key){alert('هذه الصلاحية معطلة لهذا الفرع من قبل الأدمن: '+(LABELS[key]||key));return false}
function requirePerm(key){return allowed(key)||deny(key)}
async function credentials(){const d=device(),s=await secret();if(!d.id||!s)throw new Error('تعذر التحقق من هوية هذا الفرع');return{deviceId:d.id,secret:s}}
function client(){return window.AbuBassamCloud?.client||null}
function connected(){return !!window.AbuBassamCloud?.isConnected?.()}
function recordPaths(rows){(rows||[]).forEach(row=>{const path=String(row?.data?.storagePath||'');if(path)pathToId.set(path,String(row.client_id||row.data?.id||''))});return rows}
async function rpc(name,args){const c=client();if(!c||!connected())throw new Error('اربط حساب المزامنة أولًا');const {data,error}=await c.rpc(name,args);if(error)throw error;return data}
async function vaultList(limit=10000){if(!allowed('vaultView'))throw new Error('VAULT_VIEW_NOT_ALLOWED');const cr=await credentials(),max=Math.max(1,Math.min(20000,Number(limit)||10000)),out=[];let offset=0;while(out.length<max){const take=Math.min(500,max-out.length),data=await rpc('abu_bassam_vault_list',{p_device_id:cr.deviceId,p_device_secret:cr.secret,p_limit:take,p_offset:offset}),rows=Array.isArray(data)?data:[];out.push(...rows);if(rows.length<take)break;offset+=rows.length}return recordPaths(out)}
async function vaultGet(id){if(!allowed('vaultView'))throw new Error('VAULT_VIEW_NOT_ALLOWED');const c=await credentials(),data=await rpc('abu_bassam_vault_get',{p_device_id:c.deviceId,p_device_secret:c.secret,p_client_id:String(id)}),row=Array.isArray(data)?data[0]:data;if(row)recordPaths([row]);return row||null}
async function vaultUpsert(id,data){if(!allowed('vaultSync'))throw new Error('VAULT_SYNC_NOT_ALLOWED');const c=await credentials(),rows=await rpc('abu_bassam_vault_upsert',{p_device_id:c.deviceId,p_device_secret:c.secret,p_client_id:String(id),p_data:data&&typeof data==='object'?data:{}}),row=Array.isArray(rows)?rows[0]:rows;if(row)recordPaths([row]);return row||null}
async function edge(action,{method='GET',body=null,query=''}={}){const c=client();if(!c||!connected())throw new Error('اربط حساب المزامنة أولًا');const cr=await credentials(),{data:{session}}=await c.auth.getSession();if(!session?.access_token)throw new Error('الجلسة غير متاحة');const url=`https://dlbxcqkbmvnrcrbhuttv.supabase.co/functions/v1/branch-vault?action=${encodeURIComponent(action)}${query}`;const res=await fetch(url,{method,headers:{Authorization:`Bearer ${session.access_token}`,apikey:'sb_publishable_Umb40YIAVf6YSYsncrBcjw_FhBGogw1','Content-Type':'application/json','x-device-id':cr.deviceId,'x-device-secret':cr.secret},body:body===null?undefined:JSON.stringify(body),cache:'no-store'});const out=await res.json().catch(()=>({}));if(!res.ok||out?.error)throw new Error(out?.error||`HTTP_${res.status}`);return out}
async function uploadVault(id,blob,mime){if(!allowed('vaultSync'))throw new Error('VAULT_SYNC_NOT_ALLOWED');const c=client(),plan=await edge('upload-url',{method:'POST',body:{item_id:String(id),mime:mime||blob?.type||'application/octet-stream'}});const {data,error}=await c.storage.from(BUCKET).uploadToSignedUrl(plan.path,plan.token,blob,{contentType:mime||blob?.type||'application/octet-stream',upsert:true});if(error)throw error;pathToId.set(plan.path,String(id));return data?.path||plan.path}
async function downloadVault(path){if(!allowed('vaultView')||!allowed('vaultSync'))throw new Error('VAULT_VIEW_NOT_ALLOWED');let id=pathToId.get(String(path))||String(path||'').split('/').pop()||'';const plan=await edge('download-url',{query:'&item_id='+encodeURIComponent(id)});if(String(plan?.path||'')!==String(path||''))throw new Error('VAULT_REMOTE_VERSION_CHANGED');const res=await fetch(plan.url,{cache:'no-store'});if(!res.ok)throw new Error('تعذر تنزيل ملف الفرع');return res.blob()}
async function removeVault(path){if(!allowed('vaultDelete')||!allowed('vaultSync'))throw new Error('VAULT_DELETE_NOT_ALLOWED');const id=pathToId.get(String(path))||String(path||'').split('/').pop()||'';await edge('delete',{method:'DELETE',body:{item_id:id,path:String(path||'')}});pathToId.delete(String(path||''))}
async function removeAllVault(){if(!allowed('vaultDelete')||!allowed('vaultSync'))throw new Error('VAULT_DELETE_NOT_ALLOWED');const rows=await vaultList(20000);for(const row of rows){const path=String(row?.data?.storagePath||'');if(path)await removeVault(path)}const c=await credentials();return rpc('abu_bassam_vault_remove_all',{p_device_id:c.deviceId,p_device_secret:c.secret})}
function registerCloudAdapter(){
  if(adapterRegistered)return true;
  const c=window.AbuBassamCloud;
  if(!c?.registerVaultAdapter)return false;
  c.registerVaultAdapter({
    list:vaultList,
    get:vaultGet,
    upsert:vaultUpsert,
    removeKind:removeAllVault,
    upload:uploadVault,
    download:downloadVault,
    remove:removeVault
  });
  adapterRegistered=true;
  return true
}
function localScopeOk(show=true){const d=device();if(!d.id)return false;const uid=String(window.AbuBassamCloud?.session?.()?.user?.id||''),target=(uid||'local')+':'+d.id,old=String(localStorage.getItem(SCOPE_KEY)||'');if(!old){localStorage.setItem(SCOPE_KEY,target);return true}if(old===d.id){localStorage.setItem(SCOPE_KEY,target);return true}if(old==='local:'+d.id&&uid){localStorage.setItem(SCOPE_KEY,target);return true}if(old===target)return true;if(show)alert('هذا الأرشيف المحلي مرتبط بحساب أو فرع آخر على هذا الجهاز. لن تُعرض ملفاته أو تُنقل تلقائيًا حفاظًا على الخصوصية.');return false}
function lockUi(){const center=document.getElementById('vaultCenter');if(!center)return;center.classList.add('abu-vault-branch-locked');let box=document.getElementById('abuVaultBranchLock');if(!box){box=document.createElement('div');box.id='abuVaultBranchLock';box.style.cssText='margin:12px;padding:18px;border-radius:14px;background:#fff1d7;color:#6d4a12;font-weight:900;text-align:center';box.textContent='🔒 هذا الأرشيف المحلي يعود إلى فرع آخر على هذا الجهاز، لذلك تم حجبه.';center.prepend(box)}}
function updateUi(){const center=document.getElementById('vaultCenter');if(!center)return;if(!localScopeOk(false)){lockUi();return}center.classList.remove('abu-vault-branch-locked');document.getElementById('abuVaultBranchLock')?.remove();let badge=document.getElementById('abuVaultBranchBadge');if(!badge){badge=document.createElement('div');badge.id='abuVaultBranchBadge';badge.style.cssText='margin-top:8px;padding:7px 9px;border-radius:10px;background:#ffffff22;color:#fff;font-size:8px;font-weight:900';const hero=center.querySelector('.v-hero');hero?.appendChild(badge)}const d=device();if(badge)badge.textContent=`🔒 ملفات خاصة بهذا الفرع فقط • ${d.name} • الفروع الأخرى لا تستطيع رؤيتها`;const map=[['.v-upload-grid','vaultAdd'],['#vAutoSync','vaultSync']];map.forEach(([sel,p])=>center.querySelectorAll(sel).forEach(el=>{el.style.opacity=allowed(p)?'1':'.45';el.style.pointerEvents=allowed(p)?'':'none'}))}
function boot(){if(!registerCloudAdapter())throw new Error('VAULT_GATEWAY_NOT_READY');updateUi();document.addEventListener('abu-bassam-auth-changed',()=>{updateUi()});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')updateUi()})}
window.AbuBassamBranchVault={allowed,credentials,list:vaultList,get:vaultGet,upsert:vaultUpsert,upload:uploadVault,download:downloadVault,remove:removeVault,localScopeOk,defaults:{}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();