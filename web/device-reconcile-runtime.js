(()=>{
'use strict';
if(window.__ABU_DEVICE_RECONCILE_V2__)return;
window.__ABU_DEVICE_RECONCILE_V2__=true;
window.__ABU_DEVICE_RECONCILE_V1__=true;
const $=id=>document.getElementById(id);
const SECRET_KEY='abu_bassam_device_secret_v1';
const LIMIT_KEY='abuBassamDeviceLimitV1';
const CURRENT_ID=()=>window.AbuBassamDevices?.ensure?.().id||localStorage.getItem('abuBassamLockedDeviceIdV3')||'';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const owner=()=>window.AbuBassamSecurity?.role?.()==='owner'&&window.AbuBassamSecurity?.isOnlineUnlocked?.()===true;
const client=()=>window.AbuBassamCloud?.client||null;
const connected=()=>!!window.AbuBassamCloud?.isConnected?.();
let ownerAuthEpoch=0;
function invalidateOwnerSession(){ownerAuthEpoch++}
function time(v){let n=Date.parse(v||0);return Number.isFinite(n)?n:0}
function displayName(row){let name=String(row?.device_name||'').trim(),model=String(row?.model||'').trim();if(!name||name==='جهاز المكتبة'||/^android$/i.test(name))return model||name||'جهاز';return name}
function dedupe(rows){
  const current=CURRENT_ID(),byId=new Map();
  (rows||[]).forEach(row=>{
    if(!row?.device_id)return;
    const old=byId.get(row.device_id);
    if(!old||time(row.last_seen)>time(old.last_seen))byId.set(row.device_id,row)
  });
  return [...byId.values()].sort((a,b)=>{
    if(a.device_id===current)return-1;
    if(b.device_id===current)return 1;
    if(a.role==='owner'&&b.role!=='owner')return-1;
    if(b.role==='owner'&&a.role!=='owner')return 1;
    return time(b.last_seen)-time(a.last_seen)
  })
}
function nativeRequest(action,payload={}){const api=window.AbuBassamNativeSecurity;if(!api?.request)return Promise.reject(new Error('SECURE_STORAGE_REQUIRED'));return api.request(action,payload)}
async function secret(){return String(await nativeRequest('secureGet',{key:SECRET_KEY})||'')}
function ownerScope(){const uid=String(window.AbuBassamCloud?.session?.()?.user?.id||''),id=CURRENT_ID();return owner()&&connected()&&uid&&id?uid+':'+id+':'+ownerAuthEpoch:''}
function requireOwnerScope(scope){if(!scope||ownerScope()!==scope)throw new Error('OWNER_SESSION_CHANGED')}
async function ownerArgs(){const scope=ownerScope();requireOwnerScope(scope);const p_actor_device_id=CURRENT_ID(),p_actor_secret=await secret();requireOwnerScope(scope);if(!p_actor_device_id||!p_actor_secret)throw new Error('OWNER_REQUIRED');return{p_actor_device_id,p_actor_secret,scope}}
async function rows(){const scope=ownerScope();requireOwnerScope(scope);const {scope:_scope,...args}=await ownerArgs();const r=await client().rpc('abu_bassam_owner_devices',args);requireOwnerScope(scope);if(r.error)throw r.error;return dedupe(r.data||[])}
async function count(){const scope=ownerScope();requireOwnerScope(scope);const {scope:_scope,...args}=await ownerArgs();const r=await client().rpc('abu_bassam_owner_device_count',args);requireOwnerScope(scope);if(r.error)throw r.error;return Math.max(0,Number(r.data)||0)}
async function readLimit(){const cached=Math.max(1,Math.min(50,Number(localStorage.getItem(LIMIT_KEY)||5)||5)),scope=ownerScope();if(!scope||!client())return cached;try{const r=await client().rpc('abu_bassam_get_device_limit');if(scope!==ownerScope())return cached;if(r.error)throw r.error;const n=Math.max(1,Math.min(50,Number(r.data)||5));localStorage.setItem(LIMIT_KEY,String(n));return n}catch(_){return cached}}
function rowHtml(row){
  const current=row.device_id===CURRENT_ID(),isOwner=row.role==='owner';
  const when=row.last_seen||row.first_seen,name=displayName(row);
  const shown=isOwner?'نسختي الأولى باسم (أكرم)':name;
  // Dynamic values must be inert HTML attributes, never JavaScript in onclick.
  const idAttr=`data-abu-device-id="${esc(row.device_id)}"`;
  const rename=`<button data-abu-device-action="rename" ${idAttr} data-abu-device-name="${esc(row.device_name||name)}">تسمية${isOwner?' الجهاز':''}</button>`;
  const actions=isOwner
    ?`<div class="abu-device-row-actions">${rename}</div>`
    :`<div class="abu-device-row-actions">${rename}<button class="alt" data-abu-device-action="toggle" ${idAttr} data-abu-target-active="${row.active===false?'1':'0'}">${row.active===false?'تفعيل':'إيقاف'}</button><button data-abu-device-action="permissions" ${idAttr}>الصلاحيات</button><button class="danger" data-abu-device-action="remove" ${idAttr}>حذف</button></div>`;
  return `<div class="abu-device-row ${isOwner?'owner':''} ${row.active===false?'off':''}"><b>${isOwner?'👑':'📱'} ${esc(shown)}${current?' • هذا الجهاز':''}</b> <span class="abu-security-badge ${isOwner?'owner':''}">${isOwner?'رئيسي':'فرعي'}</span><small>${esc(row.model||row.platform||'Android')} • التطبيق ${esc(row.app_version||'—')}<br>آخر اتصال: ${when?new Date(when).toLocaleString('ar-IQ'):'—'} • ${row.active===false?'موقوف':'نشط'}</small>${isOwner?'<div style="font-size:8px;margin-top:6px;color:#7d5614">الجهاز الرئيسي لا يمكن تعطيله أو حذفه.</div>':''}${actions}</div>`
}
function syncSecurityCardLabel(){let sec=$('abuSecuritySettings'),device=window.AbuBassamSecurity?.device?.();if(!sec||!device)return;let line=[...sec.querySelectorAll('.abu-security-line')].find(x=>x.firstElementChild?.textContent?.trim()==='هذا الهاتف');if(line&&line.children[1])line.children[1].textContent=displayName(device)}
function patchLabels(limit){const n=Math.max(1,Math.min(50,Number(limit)||5));const sec=window.AbuBassamSecurity;if(sec)sec.maxDevices=n;document.querySelectorAll('#abuSecuritySettings button').forEach(b=>{if(/إدارة الأجهزة/.test(b.textContent||''))b.textContent=`📱 إدارة الأجهزة (${n})`});document.querySelectorAll('#abuDeviceModal .abu-device-head div div').forEach(el=>{if(/الحد الأقصى/.test(el.textContent||''))el.textContent=`الحد الأقصى ${n} أجهزة • الرئيسي يتحكم بالفرعية`});const err=$('abuLoginError');if(err&&/الحد الأقصى:\s*[٥5]/.test(err.textContent||''))err.textContent='وصل الحساب إلى الحد الأقصى المسموح من الأجهزة. غيّر الحد من الجهاز الرئيسي أو احذف جهازًا فرعيًا.'}
async function render(){let box=$('abuDeviceList');if(!box){syncSecurityCardLabel();return}if(!owner()){box.textContent='إدارة الأجهزة متاحة للحساب الرئيسي فقط.';return}const scope=ownerScope();if(!scope)return;box.innerHTML='<div style="padding:20px;text-align:center">جاري تدقيق الأجهزة الحقيقية...</div>';try{let [list,limit]=await Promise.all([rows(),readLimit()]);requireOwnerScope(scope);patchLabels(limit);box.innerHTML=list.map(rowHtml).join('')||'<div style="padding:20px;text-align:center">لا توجد أجهزة أخرى. هذا الجهاز هو الجهاز الحالي.</div>';let current=list.find(r=>r.device_id===CURRENT_ID());if(current&&$('abuLoginDevice'))$('abuLoginDevice').textContent=`هذا الجهاز: ${displayName(current)} • ${current.role==='owner'?'رئيسي':'فرعي'}`;const available=Math.max(0,limit-list.length);box.insertAdjacentHTML('beforeend',`<div style="padding:8px;text-align:center;font-size:8px;color:#087f72">الأجهزة المسجلة: ${list.length} • الحد: ${limit} • المتاح: ${available}</div>`);syncSecurityCardLabel()}catch(e){if(ownerScope()===scope)box.textContent=String(e.message||e)}}
async function manageDevice(target,patch){const scope=ownerScope();requireOwnerScope(scope);const {scope:_scope,...args}=await ownerArgs();requireOwnerScope(scope);Object.assign(args,{p_target_device_id:target,p_device_name:patch.name===undefined?null:patch.name,p_active:patch.active===undefined?null:patch.active,p_permissions:patch.permissions===undefined?null:patch.permissions});const r=await client().rpc('abu_bassam_manage_device',args);requireOwnerScope(scope);if(r.error)throw r.error;return Array.isArray(r.data)?r.data[0]:r.data}
async function renameDevice(id,old){if(!owner())return alert('هذه العملية للحساب الرئيسي فقط.');const name=String(prompt('اسم الهاتف:',old)||'').trim();if(!name)return;try{await manageDevice(id,{name});await render()}catch(e){alert(String(e.message||e))}}
async function toggleDevice(id,active){if(!owner())return alert('هذه العملية للحساب الرئيسي فقط.');if(!confirm(active?'إعادة تفعيل هذا الجهاز؟':'إيقاف هذا الجهاز؟ لن يتمكن من الدخول بعد التحقق التالي.'))return;try{await manageDevice(id,{active});await render()}catch(e){alert(String(e.message||e))}}
async function removeDevice(id){if(!owner())return alert('هذه العملية للحساب الرئيسي فقط.');if(id===CURRENT_ID())return alert('لا يمكن حذف الجهاز الرئيسي الحالي.');if(!confirm('حذف هذا الجهاز الفرعي من الأجهزة الموثوقة؟'))return;try{const scope=ownerScope();requireOwnerScope(scope);const {scope:_scope,...args}=await ownerArgs();requireOwnerScope(scope);args.p_target_device_id=id;const r=await client().rpc('abu_bassam_remove_device',args);requireOwnerScope(scope);if(r.error)throw r.error;await render();await refreshLimitUi()}catch(e){alert(String(e.message||e))}}
function adjustLimit(delta){const input=$('abuDeviceLimitInput');if(!input)return;const min=Math.max(1,Number(input.min)||1),next=Math.max(min,Math.min(50,(Number(input.value)||5)+Number(delta||0)));input.value=String(next);updateLimitHint()}
function updateLimitHint(current){const input=$('abuDeviceLimitInput'),info=$('abuDeviceLimitInfo');if(!input||!info)return;const c=Number.isFinite(current)?current:Math.max(0,Number(input.dataset.deviceCount)||0),n=Math.max(1,Math.min(50,Number(input.value)||5));info.textContent=`المسجل حاليًا: ${c} • الحد المختار: ${n} • المسموح من ${Math.max(1,c)} إلى 50 جهازًا.`}
async function saveLimit(){if(!owner())return alert('تغيير عدد الأجهزة متاح للحساب الرئيسي فقط.');if(!client()||!connected())return alert('اربط الحساب بالإنترنت أولًا.');try{const scope=ownerScope();requireOwnerScope(scope);const input=$('abuDeviceLimitInput'),c=await count();requireOwnerScope(scope);const value=Math.max(Math.max(1,c),Math.min(50,Number(input?.value)||5)),{scope:_scope,...args}=await ownerArgs();requireOwnerScope(scope);args.p_device_limit=value;const r=await client().rpc('abu_bassam_set_device_limit',args);requireOwnerScope(scope);if(r.error)throw r.error;const saved=Math.max(1,Math.min(50,Number(r.data)||value));localStorage.setItem(LIMIT_KEY,String(saved));if(input){input.value=String(saved);input.min=String(Math.max(1,c));input.dataset.deviceCount=String(c)}patchLabels(saved);updateLimitHint(c);alert(`تم اعتماد عدد الأجهزة: ${saved}`)}catch(e){alert('تعذر حفظ عدد الأجهزة: '+String(e.message||e))}}
async function refreshLimitUi(){if(!owner())return;const scope=ownerScope();if(!scope)return;const input=$('abuDeviceLimitInput');if(!input)return;try{const [limit,c]=await Promise.all([readLimit(),count()]);requireOwnerScope(scope);input.disabled=false;input.min=String(Math.max(1,c));input.max='50';input.value=String(Math.max(limit,c));input.dataset.deviceCount=String(c);const buttons=[...document.querySelectorAll('#abuDeviceLimitSettings .abu-device-stepper button')];if(buttons[0])buttons[0].onclick=()=>adjustLimit(-1);if(buttons[1])buttons[1].onclick=()=>adjustLimit(1);input.onchange=()=>{const min=Math.max(1,c);input.value=String(Math.max(min,Math.min(50,Number(input.value)||limit)));updateLimitHint(c)};const save=$('abuDeviceLimitSave');if(save){save.disabled=false;save.style.opacity='1';save.onclick=saveLimit}patchLabels(limit);updateLimitHint(c)}catch(e){if(ownerScope()===scope){const info=$('abuDeviceLimitInfo');if(info)info.textContent='تعذر جلب عدد الأجهزة من الخادم: '+String(e.message||e)}}}
function patch(){let sec=window.AbuBassamSecurity;if(!sec||sec.__abuDeviceReconcilePatchedV2)return false;sec.openDevices=async function(){if(!owner())return alert('إدارة الأجهزة متاحة للحساب الرئيسي فقط.');$('abuDeviceModal')?.classList.add('show');await render()};sec.renderDevices=render;sec.renameDevice=renameDevice;sec.toggleDevice=toggleDevice;sec.permissionsDevice=()=>alert('محرر الصلاحيات المتقدمة غير جاهز. أعد فتح التطبيق.');sec.removeDevice=removeDevice;sec.__abuDeviceReconcilePatched=true;sec.__abuDeviceReconcilePatchedV2=true;syncSecurityCardLabel();refreshLimitUi();const scope=ownerScope();if(scope)readLimit().then(limit=>{if(ownerScope()===scope)patchLabels(limit)}).catch(()=>{});return true}
function onDeviceActionClick(event){
  const button=event.target?.closest?.('button[data-abu-device-action]');
  const container=$('abuDeviceList');
  if(!button||!container?.contains(button))return;
  event.preventDefault();
  if(!owner())return;
  const id=button.dataset.abuDeviceId||'';
  const action=button.dataset.abuDeviceAction;
  if(!id)return;
  const api=window.AbuBassamSecurity;
  if(action==='rename')void api?.renameDevice?.(id,button.dataset.abuDeviceName||'');
  else if(action==='toggle')void api?.toggleDevice?.(id,button.dataset.abuTargetActive==='1');
  else if(action==='permissions')void api?.permissionsDevice?.(id);
  else if(action==='remove')void api?.removeDevice?.(id)
}
function clearOwnerRegistryUi(){
  const box=$('abuDeviceList');
  if(box)box.textContent='إدارة الأجهزة متاحة للحساب الرئيسي فقط.';
  $('abuDeviceModal')?.classList.remove('show');
  const input=$('abuDeviceLimitInput'),save=$('abuDeviceLimitSave');
  if(input)input.disabled=true;
  if(save)save.disabled=true
}
function onOwnerSecurityState(){
  invalidateOwnerSession();
  if(!owner())clearOwnerRegistryUi();
  else{
    if($('abuDeviceModal')?.classList.contains('show'))void render();
    void refreshLimitUi()
  }
}
function init(){document.addEventListener('click',onDeviceActionClick);document.addEventListener('abu-bassam-security-state',onOwnerSecurityState);if(!patch())throw new Error('AbuBassamSecurity غير جاهز لإدارة الأجهزة');document.addEventListener('abu-bassam-auth-changed',()=>{invalidateOwnerSession();clearOwnerRegistryUi();setTimeout(()=>{if(owner()){render();refreshLimitUi();syncSecurityCardLabel()}},100)});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&owner())setTimeout(()=>{refreshLimitUi();syncSecurityCardLabel()},100)})}
window.AbuBassamDeviceRegistry={rows,count,readLimit,render,refreshLimitUi};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();