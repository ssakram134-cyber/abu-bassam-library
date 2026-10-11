(()=>{
'use strict';
if(window.__ABU_QUESTION_CUSTOM_LIBRARY_V1__)return;
window.__ABU_QUESTION_CUSTOM_LIBRARY_V1__=true;
const DB='AbuBassamQuestionTemplatesV2',STORE='templates',LEGACY='abuQuestionCustomTemplatesV1';
const scope=()=>window.AbuQuestionScope?.identity()||null;
const scopedId=id=>{const owner=window.AbuQuestionScope?.required();return owner+'|'+String(id)};
const authorizedId=id=>{const owner=scope();return !!owner&&String(id).startsWith(owner+'|')};
const $=id=>document.getElementById(id);
let cache=[];
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function openDb(){return new Promise((resolve,reject)=>{try{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE)){const s=r.result.createObjectStore(STORE,{keyPath:'id'});s.createIndex('subject','subject')}};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)}catch(e){reject(e)}})}
async function all(){
 const owner=scope();if(!owner)return [];
 const db=await openDb();
 try{
  const rows=await new Promise((resolve,reject)=>{
   const req=db.transaction(STORE,'readonly').objectStore(STORE).getAll();
   req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error)
  });
  if(owner!==scope())return [];
  return rows.filter(row=>row.scope===owner&&authorizedId(row.id))
   .sort((a,b)=>(a.createdAt||0)-(b.createdAt||0))
 }finally{db.close?.()}
}
async function put(row){
 const owner=scope();if(!owner||row.scope!==owner||!authorizedId(row.id))throw Error('ACCOUNT_SCOPE_REQUIRED');
 const db=await openDb();
 try{
  if(owner!==scope())throw Error('ACCOUNT_CHANGED');
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(row);
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)
  });
  if(owner!==scope())throw Error('ACCOUNT_CHANGED');
  return true
 }finally{db.close?.()}
}
async function remove(id){
 const owner=scope();if(!authorizedId(id))throw Error('ACCOUNT_SCOPE_REQUIRED');
 const db=await openDb();
 try{
  if(owner!==scope())throw Error('ACCOUNT_CHANGED');
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)
  });
  cache=cache.filter(x=>x.id!==id);return true
 }finally{db.close?.()}
}
async function clearAll(){
 const owner=scope();if(!owner)throw Error('ACCOUNT_SCOPE_REQUIRED');
 const records=await all(),db=await openDb();
 try{
  if(owner!==scope())throw Error('ACCOUNT_CHANGED');
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
   for(const row of records)if(row.scope===owner&&authorizedId(row.id))store.delete(row.id);
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)
  });
  cache=[];return true
 }finally{db.close?.()}
}
function legacyRows(){try{const value=JSON.parse(localStorage.getItem(LEGACY)||'[]');return Array.isArray(value)?value:[]}catch(_){return[]}}
async function migrate(){
 // Unattributed records cannot safely be assigned to whichever user logs in next.
 // Keep all legacy records intact until an administrator explicitly claims them.
 cache=await all();return cache
}
async function importLegacy(){
 const owner=scope();
 if(!owner||window.parent?.AbuBassamSecurity?.role?.()!=='owner')throw Error('OWNER_ACCOUNT_REQUIRED');
 if(!confirm('استيراد النماذج القديمة غير المنسوبة إلى هذا الحساب؟ استخدم هذا فقط إذا كنت المسؤول عن بياناتها. لن تُحذف النسخة القديمة.'))return false;
 const legacy=legacyRows(),already=new Set((await all()).map(row=>row.id));
 for(const old of legacy){
  if(!old?.id)continue;
  const id=scopedId('legacy-'+String(old.id));
  if(already.has(id))continue;
  const row={id,scope:owner,name:String(old.name||'نموذج قديم'),subject:String(old.subject||'general'),html:String(old.html||''),createdAt:Date.now(),updatedAt:Date.now()};
  await put(row);already.add(id)
 }
 cache=await all();await inject();return true
}
function subjectKey(){const text=String($('abuSubjects')?.querySelector('button.on')?.textContent||'');if(text.includes('الثالث'))return'science3';if(text.includes('الرابع'))return'science4';if(text.includes('الإسلامية'))return'islamic';if(text.includes('الرياضيات'))return'math1';try{return window.AbuQuestionTypes?.subject?.()||'math1'}catch(e){return'math1'}}
function card(t){return `<div class="abu-tcard abu-idb-custom" data-idb-template="${esc(t.id)}"><div class="abu-tpreview"><b>${esc(t.name)}</b><span>${t.subject==='general'?'نموذج مخصص عام':'نموذج مخصص محفوظ'}</span></div><b>${esc(t.name)}</b><button type="button" data-idb-action="apply" data-idb-id="${esc(t.id)}">استخدام النموذج</button></div>`}
function hasId(box,id){return [...box.querySelectorAll('[data-idb-template]')].some(el=>el.dataset.idbTemplate===String(id))}
function bindManagerButton(){document.querySelectorAll('#abuQTemplateModal .abu-actions-row button').forEach(b=>{if((b.textContent||'').includes('إدارة نماذجي'))b.onclick=openManage})}
async function inject(){try{cache=await all()}catch(e){}const spec=$('abuSubjectTemplates'),gen=$('abuGeneralTemplates');if(!spec||!gen)return;const subject=subjectKey();cache.filter(t=>t.subject===subject).forEach(t=>{if(!hasId(spec,t.id))spec.insertAdjacentHTML('beforeend',card(t))});cache.filter(t=>t.subject==='general').forEach(t=>{if(!hasId(gen,t.id))gen.insertAdjacentHTML('beforeend',card(t))});bindManagerButton()}
async function saveCurrent(){const name=prompt('اسم النموذج الجديد:','نموذجي الجديد');if(!name)return;const subject=confirm('هل تحفظه كنموذج عام يظهر مع كل المواد؟')?'general':subjectKey(),html=$('pages-container')?.innerHTML||'';if(!html)return alert('لا توجد ورقة لحفظها.');const row={id:scopedId('custom-v2-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)),scope:scope(),name:name.trim()||'نموذجي الجديد',subject,html,createdAt:Date.now(),updatedAt:Date.now()};try{await put(row);cache.push(row);await inject();alert('تم حفظ النموذج في مكتبة نماذجي ✓')}catch(e){alert('تعذر حفظ النموذج المخصص: '+(e?.message||e))}}
async function apply(id){let t=cache.find(x=>x.id===id);if(!t){try{cache=await all();t=cache.find(x=>x.id===id)}catch(e){}}if(!t)return alert('تعذر العثور على النموذج.');const c=$('pages-container');if(!c)return;try{window.saveState?.()}catch(e){}c.innerHTML=t.html;window.AbuQuestionCompletion?.normalizeHeaders?.();window.AbuQuestionCompletion?.ensureAnswers?.();window.rebindAllDraggables?.();window.AbuQuestionTypes?.enhance?.();window.fitToScreen?.();window.checkAutoFlow?.();window.scheduleQuestionDraft?.();$('abuQTemplateModal')?.classList.remove('show')}
function managerHtml(){return `<div class="abu-manage-list">${cache.length?cache.map(t=>`<div class="abu-manage-item"><b>${esc(t.name)}</b><div style="font-size:8px;color:#64748b">${t.subject==='general'?'عام':esc(t.subject)}</div><div class="abu-manage-actions"><button data-idb-action="rename" data-idb-id="${esc(t.id)}">إعادة تسمية</button><button data-idb-action="duplicate" data-idb-id="${esc(t.id)}">نسخ</button><button class="danger" data-idb-action="remove" data-idb-id="${esc(t.id)}">حذف</button></div></div>`).join(''):'<div style="font-size:9px;color:#64748b">لا توجد نماذج مخصصة.</div>'}</div>`}
function onTemplateAction(event){const button=event.target?.closest?.('[data-idb-action]');if(!button)return;if(!button.closest('#abuQTemplateModal,#abuQManageModal'))return;const id=button.dataset.idbId,action=button.dataset.idbAction;if(!id)return;const actions={apply,rename,duplicate,remove:removeOne};if(Object.prototype.hasOwnProperty.call(actions,action)){event.preventDefault();actions[action](id)}}
async function openManage(){try{cache=await all()}catch(e){}$('abuQManageModal')?.remove();document.body.insertAdjacentHTML('beforeend',`<div id="abuQManageModal" class="abu-qmodal show"><div class="abu-qsheet"><div class="abu-qhead"><div><b>إدارة نماذجي</b><div style="font-size:8px;color:#64748b">محفوظة في قاعدة محلية مخصصة داخل التطبيق</div></div><button onclick="document.getElementById('abuQManageModal')?.remove()">×</button></div>${managerHtml()}</div></div>`)}
async function rename(id){const t=cache.find(x=>x.id===id);if(!t)return;const n=prompt('الاسم الجديد:',t.name);if(!n)return;const next={...t,name:n.trim()||t.name,updatedAt:Date.now()};try{await put(next);cache=cache.map(x=>x.id===id?next:x);await openManage()}catch(e){alert('تعذر إعادة التسمية.')}}
async function duplicate(id){const t=cache.find(x=>x.id===id);if(!t)return;const now=Date.now(),next={...t,id:scopedId('custom-v2-'+now+'-'+Math.random().toString(36).slice(2,7)),scope:scope(),name:(t.name||'نموذج')+' — نسخة',createdAt:now,updatedAt:now};try{await put(next);cache.push(next);await openManage()}catch(e){alert('تعذر نسخ النموذج.')}}
async function removeOne(id){if(!confirm('حذف هذا النموذج المخصص؟'))return;try{await remove(id);await openManage()}catch(e){alert('تعذر حذف النموذج.')}}
async function clearCustom(){if(!cache.length)cache=await all();if(!cache.length)return alert('لا توجد نماذج مخصصة.');if(!confirm('حذف جميع النماذج التي أنشأتها؟ القوالب الأصلية لن تُحذف.'))return;try{await clearAll();const saved=await Promise.resolve(window.AbuQuestionCompletion?.save?.(false));if(saved!==true){alert('حُذفت النماذج المحددة، لكن تعذر تأكيد حفظ ورقة الأسئلة الحالية؛ لن تُغلق الصفحة تلقائيًا.');return}location.reload()}catch(e){alert('تعذر حذف النماذج المخصصة.')}}
function patch(){const api=window.AbuQuestionTemplates;if(!api||api.__abuIdbCustomPatched)return false;const open=api.openTemplates?.bind(api);if(open)api.openTemplates=function(...args){const r=open(...args);setTimeout(()=>{inject();bindManagerButton()},20);return r};api.saveCustom=saveCurrent;api.clearCustom=clearCustom;api.__abuIdbCustomPatched=true;if(window.AbuQTemplateTools){AbuQTemplateTools.openManage=openManage;AbuQTemplateTools.rename=id=>rename(id);AbuQTemplateTools.duplicate=id=>duplicate(id);AbuQTemplateTools.remove=id=>removeOne(id)}bindManagerButton();return true}
async function init(){document.addEventListener('click',onTemplateAction);await migrate();let tries=0,t=setInterval(()=>{tries++;if(patch()||tries>50)clearInterval(t)},80);setTimeout(()=>{inject();bindManagerButton()},500)}
window.AbuQuestionCustomLibrary={importLegacy,list:async()=>{cache=await all();return cache.map(x=>({...x}))},saveCurrent,apply,inject,openManage,rename,duplicate,remove:removeOne,clear:clearCustom,migrate};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
