(()=>{
'use strict';
if(window.AbuBassamPaperDraft)return;
const DATABASE='AbuBassamPaperPhotoDraftV1',STORE='drafts',MAX_ITEMS=25,MAX_BYTES=24000000,
      MAX_AGE=30*24*60*60*1000,SECRET_KEY='abu_bassam_device_secret_v1';
let epoch=0,scope='',timer=null,tail=Promise.resolve(),restoring=false,warned=false;
const workspace=()=>window.AbuBassamPaperWorkspace;
function authorizedScope(){
  const security=window.AbuBassamSecurity,device=security?.device?.();
  const id=String(device?.device_id||''),role=security?.role?.()||'';
  if(!id||!['owner','secondary'].includes(role))return '';
  if(role!=='owner'&&security?.can?.('printGeneral')!==true)return '';
  const offline=security?.isOfflineSession?.()===true;
  const uid=String(offline?device?.userId||'':window.AbuBassamCloud?.session?.()?.user?.id||'');
  return uid&&uid.length<160&&id.length<160?uid+':'+id+':'+role:''
}
function openDb(){
  if(!window.indexedDB)throw Error('PAPER_DRAFT_DATABASE_UNAVAILABLE');
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DATABASE,1);
    req.onupgradeneeded=()=>{
      if(!req.result.objectStoreNames.contains(STORE))
        req.result.createObjectStore(STORE,{keyPath:'scope'})
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||Error('PAPER_DRAFT_OPEN_FAILED'))
  })
}
async function secretKey(forScope){
  const native=window.AbuBassamNativeSecurity;
  if(!native?.available?.()||!crypto?.subtle)
    throw Error('PAPER_DRAFT_NATIVE_SECURITY_REQUIRED');
  const secret=String(await native.request('secureGet',{key:SECRET_KEY})||'');
  if(!secret||authorizedScope()!==forScope)throw Error('PAPER_DRAFT_SESSION_CHANGED');
  const material=await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(secret+':paper-photos:'+forScope));
  if(authorizedScope()!==forScope)throw Error('PAPER_DRAFT_SESSION_CHANGED');
  return crypto.subtle.importKey('raw',material,{name:'AES-GCM'},false,['encrypt','decrypt'])
}
const validImage=s=>typeof s==='string'&&s.length<MAX_BYTES&&
  /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(s);
function normalized(items){
  if(!Array.isArray(items)||items.length>MAX_ITEMS)return null;
  const safe=[];
  for(const item of items){
    if(!validImage(item?.src))return null;
    const transform=item?.transform||{};
    const num=(value,min,max,defaultValue)=>Number.isFinite(Number(value))?
      Math.max(min,Math.min(max,Number(value))):defaultValue;
    safe.push({src:item.src,transform:{
      zoom:num(transform.zoom,1,3.5,1),x:num(transform.x,-70,70,0),
      y:num(transform.y,-70,70,0),rot:num(transform.rot,-180,180,0)}
    })
  }
  return safe
}
function changed(){
  const current=authorizedScope();
  if(!current||current!==scope||restoring){
    if(!current&&workspace()?.snapshot?.()?.length)warn(Error('PAPER_DRAFT_LOGIN_REQUIRED'));
    return
  }
  const snapshot=normalized(workspace()?.snapshot?.());
  if(!snapshot)return warn(Error('PAPER_DRAFT_ITEM_LIMIT'));
  const revision=++epoch;
  clearTimeout(timer);
  timer=setTimeout(()=>{
    timer=null;
    tail=tail.catch(()=>{}).then(()=>write(current,snapshot,revision))
      .catch(warn)
  },snapshot.length?300:0)
}
function warn(error){
  console.warn('Paper photo encrypted draft unavailable',error);
  if(!warned){warned=true;window.alert?.('تعذر حفظ مسودة صور ورق التصوير تلقائيًا. احفظ النسخة قبل إغلاق التطبيق.')}
}
async function write(target,items,revision){
  if(scope!==target||epoch!==revision||authorizedScope()!==target)return false;
  const key=items.length?await secretKey(target):null;
  let encrypted=null;
  if(key){
    const text=JSON.stringify(items);
    if(text.length>MAX_BYTES)throw Error('PAPER_DRAFT_TOO_LARGE');
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,
      new TextEncoder().encode(text));
    encrypted={scope:target,version:1,updatedAt:Date.now(),iv,cipher}
  }
  if(scope!==target||epoch!==revision||authorizedScope()!==target)return false;
  const db=await openDb();
  try{
    if(scope!==target||epoch!==revision||authorizedScope()!==target)return false;
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      if(scope!==target||epoch!==revision||authorizedScope()!==target){
        tx.abort();resolve(false);return
      }
      if(encrypted)tx.objectStore(STORE).put(encrypted);
      else tx.objectStore(STORE).delete(target);
      tx.oncomplete=()=>resolve(true);
      tx.onabort=()=>reject(tx.error||Error('PAPER_DRAFT_ABORT'));
      tx.onerror=()=>reject(tx.error||Error('PAPER_DRAFT_WRITE'))
    })
  }finally{db.close()}
}
async function restore(target,revision){
  let db=null;
  try{
    const key=await secretKey(target);
    if(target!==scope||revision!==epoch||authorizedScope()!==target)return false;
    db=await openDb();
    const record=await new Promise((resolve,reject)=>{
      const req=db.transaction(STORE,'readonly').objectStore(STORE).get(target);
      req.onsuccess=()=>resolve(req.result||null);
      req.onerror=()=>reject(req.error)
    });
    if(!record||record.version!==1||Date.now()-record.updatedAt>MAX_AGE)return false;
    if(target!==scope||revision!==epoch||authorizedScope()!==target)return false;
    const decoded=await crypto.subtle.decrypt({name:'AES-GCM',iv:record.iv},key,record.cipher);
    const items=normalized(JSON.parse(new TextDecoder().decode(decoded)));
    if(!items||!items.length||target!==scope||revision!==epoch||authorizedScope()!==target)
      return false;
    const loaded=await Promise.all(items.map(item=>new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>resolve({...item,img});
      img.onerror=()=>reject(Error('PAPER_DRAFT_IMAGE_DECODE'));
      img.src=item.src
    })));
    if(target!==scope||revision!==epoch||authorizedScope()!==target)return false;
    restoring=true;
    try{workspace()?.apply?.(loaded)}finally{restoring=false}
    return true
  }catch(e){console.warn('Paper photo draft restore failed',e);return false}
  finally{db?.close()}
}
function authChanged(){
  const next=authorizedScope();
  if(next===scope)return;
  scope=next;
  epoch++;
  clearTimeout(timer);
  timer=null;
  // Revalidate before presenting any image previously loaded by another account.
  workspace()?.clear?.();
  const revision=epoch;
  if(next)void restore(next,revision)
}
function init(){
  document.addEventListener('abu-bassam-security-state',authChanged);
  document.addEventListener('abu-bassam-auth-changed',authChanged);
  document.addEventListener('abu-runtime-loaded',authChanged);
  authChanged();
}
window.AbuBassamPaperDraft={changed,authChanged,restore,scope:()=>scope};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();