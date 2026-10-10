(()=>{
'use strict';

const DB_NAME='AbuBassamDocumentVaultV4';
const STORE='items';
const TRASH_STORE='trash';
const CHECKPOINT_STORE='checkpoints';
const CHECKPOINT_MS=30*86400000;
const TRASH_DAYS=30;
const TRASH_MS=TRASH_DAYS*86400000;
const MAX_ITEMS=1000;
const LAST_SYNC_KEY='abuBassamVaultLastSyncV4';
const AUTO_SYNC_KEY='abuBassamVaultAutoSyncV4';
const SORT_KEY='abuBassamVaultSortV4';
const SYNC_POLICY_KEY='abuBassamSyncPolicyV5';
const $=id=>document.getElementById(id);
const VIEW_KEY='abuBassamVaultViewV5';
const SYSTEM_FOLDERS=['المستمسكات','المعاملات','الباجات'];
function syncScope(){const uid=String(window.AbuBassamCloud?.session?.()?.user?.id||'local'),d=window.AbuBassamSecurity?.device?.()||window.AbuBassamDevices?.ensure?.()||{},id=String(d.device_id||d.id||'device');return uid+':'+id}
function syncKey(key){return key+':'+syncScope()}
function syncGet(key){const scoped=syncKey(key);let value=localStorage.getItem(scoped);if(value===null&&key!==LAST_SYNC_KEY){const legacy=localStorage.getItem(key);if(legacy!==null){localStorage.setItem(scoped,legacy);value=legacy}}return value}
function syncSet(key,value){localStorage.setItem(syncKey(key),String(value))}
const state={items:[],trashItems:[],selectedIds:new Set(),clipboard:null,filter:'all',sort:localStorage.getItem(SORT_KEY)||'date-desc',view:localStorage.getItem(VIEW_KEY)||'grid',query:'',urls:[],previewUrl:'',editor:null,ocrTarget:'clipboard',ocrImage:'',syncing:false,busy:false,uploading:false,uploadFolder:''};
let autoSyncTimer=null,autoSyncRerunRequested=false;

function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function uuid(){return globalThis.crypto&&crypto.randomUUID?crypto.randomUUID():'vault-'+Date.now()+'-'+Math.random().toString(36).slice(2)}
function niceName(value){return String(value||'ملف').replace(/[\\/:*?"<>|]/g,'_').trim()||'ملف'}
function ext(name){let m=String(name||'').toLowerCase().match(/\.([a-z0-9\u0600-\u06ff]+)$/);return m?m[1]:''}
function isImage(item){return item.category==='image'||String(item.mime||'').startsWith('image/')}
function fileMime(name,fallback=''){
  const types={pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',odt:'application/vnd.oasis.opendocument.text',ods:'application/vnd.oasis.opendocument.spreadsheet',odp:'application/vnd.oasis.opendocument.presentation',txt:'text/plain',csv:'text/csv',rtf:'application/rtf',json:'application/json',xml:'application/xml',html:'text/html',zip:'application/zip',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',bmp:'image/bmp',tiff:'image/tiff'};
  const observed=String(fallback||'').trim();return observed&&observed!=='application/octet-stream'?observed:types[ext(name)]||observed||'application/octet-stream'
}
function formatBytes(size){let n=Number(size)||0;if(n<1024)return n+' B';if(n<1048576)return(n/1024).toFixed(1)+' KB';return(n/1048576).toFixed(1)+' MB'}
function formatTime(value){try{return new Date(value).toLocaleString('ar-IQ')}catch(e){return value||''}}
function sessionOk(){return !!(window.AbuBassamCloud&&AbuBassamCloud.isConnected())}
function autoSync(){return syncGet(AUTO_SYNC_KEY)!=='0'}
function syncPolicy(){try{const current=localStorage.getItem(SYNC_POLICY_KEY);return Object.assign({mode:'daily',wifiOnly:false},JSON.parse(current??syncGet(SYNC_POLICY_KEY)??'{}'))}catch(e){return{mode:'daily',wifiOnly:false}}}
function wifiVerified(){let connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection,type=String(connection&&connection.type||'').toLowerCase();return type==='wifi'}
function automaticDue(){if(!autoSync()||!navigator.onLine)return false;let policy=syncPolicy();if(policy.mode==='manual')return false;if(policy.wifiOnly&&!wifiVerified())return false;if(hasPending())return true;let elapsed=Date.now()-Number(syncGet(LAST_SYNC_KEY)||0);if(policy.mode==='weekly')return elapsed>=604800000;if(policy.mode==='daily')return elapsed>=86400000;return elapsed>=900000}

function scheduleAutoSync(delay=700){
  if(autoSyncTimer!==null){clearTimeout(autoSyncTimer);autoSyncTimer=null}
  if(!autoSync()||!navigator.onLine||syncPolicy().mode==='manual')return;
  autoSyncTimer=setTimeout(()=>{
    autoSyncTimer=null;
    if(automaticDue())void syncNow(false);
  },delay)
}

function vaultOwner(){return window.AbuBassamSecurity?.role?.()==='owner'}
function vaultScopeOk(show=true){const branch=window.AbuBassamBranchVault;if(!branch?.localScopeOk){if(show)alert('بوابة حماية الأرشيف غير جاهزة. أعد فتح التطبيق.');return false}return branch.localScopeOk(show)!==false}
function vaultAllowed(key){if(vaultOwner())return true;const branch=window.AbuBassamBranchVault;if(branch?.allowed)return branch.allowed(key)===true;return window.AbuBassamPermissions?.can?.(key)===true}
function requireVault(key){if(!vaultScopeOk(true))return false;if(vaultAllowed(key))return true;alert('هذه الصلاحية معطلة لهذا الفرع من قبل الأدمن: '+key);return false}
function updateVaultAccessUi(){
  const center=$('vaultCenter');if(!center)return;
  const shell=center.querySelector('.v-shell');let denied=$('abuVaultViewDenied');
  const scope=vaultScopeOk(false),view=scope&&vaultAllowed('vaultView');
  if(!view){if(shell)shell.style.display='none';if(!denied){denied=document.createElement('div');denied.id='abuVaultViewDenied';denied.style.cssText='margin:18px;padding:24px;border-radius:16px;background:#fff1d7;color:#6d4a12;text-align:center;font-weight:900;line-height:1.9';center.appendChild(denied)}denied.textContent=!scope?'🔒 هذا الأرشيف المحلي مرتبط بحساب أو فرع آخر، لذلك تم حجبه بالكامل.':'🔒 الأدمن عطّل صلاحية عرض ملفات الحفظ لهذا الفرع.';return false}
  if(shell)shell.style.display='';denied?.remove();
  const sharedButton=$('vOtherBranchButton');if(sharedButton)sharedButton.style.display=vaultOwner()?'':'none';
  const controls=[['.v-upload-grid','vaultAdd'],['#vAutoSync','vaultSync']];
  controls.forEach(([sel,key])=>center.querySelectorAll(sel).forEach(el=>{const ok=vaultAllowed(key);el.style.opacity=ok?'1':'.45';el.style.pointerEvents=ok?'':'none'}));
  return true
}

let dbPromise;
function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    let request=indexedDB.open(DB_NAME,3);
    request.onupgradeneeded=()=>{let db=request.result;if(!db.objectStoreNames.contains(STORE)){let store=db.createObjectStore(STORE,{keyPath:'id'});store.createIndex('category','category');store.createIndex('updatedAt','updatedAt')}if(!db.objectStoreNames.contains('trash')){let trash=db.createObjectStore('trash',{keyPath:'id'});trash.createIndex('expiresAt','expiresAt')};if(!db.objectStoreNames.contains('checkpoints')){const checkpoints=db.createObjectStore('checkpoints',{keyPath:'id'});checkpoints.createIndex('expiresAt','expiresAt')}};
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();dbPromise=null};resolve(db)};
    request.onerror=()=>{dbPromise=null;reject(request.error||new Error('تعذر فتح قاعدة الحفظ'))};
    request.onblocked=()=>{dbPromise=null;reject(new Error('قاعدة الحفظ مستخدمة من جلسة أخرى'))};
  });
  return dbPromise
}
async function dbAll(){let db=await openDb();return new Promise((resolve,reject)=>{let request=db.transaction(STORE,'readonly').objectStore(STORE).getAll();request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>reject(request.error)})}
async function dbPut(item){if(item?.syncState==='pending')item.syncRevision=uuid();let db=await openDb();return new Promise((resolve,reject)=>{let tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(item);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
async function dbPutBatch(items){
  if(!items.length)return 0;
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    let tx,reason=null;
    try{
      tx=db.transaction(STORE,'readwrite');
      const store=tx.objectStore(STORE),request=store.getAll();
      request.onsuccess=()=>{
        try{
          const rows=request.result||[],existingIds=new Set(rows.map(row=>String(row.id))),
            incomingIds=new Set(items.map(row=>String(row.id)));
          if(incomingIds.size!==items.length||items.some(row=>!row.id||row.deleted||existingIds.has(String(row.id))))
            throw new Error('VAULT_DUPLICATE_ITEM');
          if(rows.filter(row=>!row.deleted).length+items.length>MAX_ITEMS)
            throw new Error('VAULT_LIMIT_1000');
          for(const row of items)store.add(row);
        }catch(error){reason=error;try{tx.abort()}catch(_){reject(error)}}
      };
      request.onerror=()=>{reason=request.error;try{tx.abort()}catch(_){reject(reason)}};
      tx.oncomplete=()=>resolve(items.length);
      tx.onerror=()=>reject(reason||tx.error||new Error('تعذر حفظ دفعة الأرشيف'));
      tx.onabort=()=>reject(reason||tx.error||new Error('أُلغيت معاملة حفظ الدفعة'))
    }catch(error){try{tx?.abort()}catch(_){}reject(error)}
  })
}
async function dbDelete(id){let db=await openDb();return new Promise((resolve,reject)=>{let tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
async function dbTrashAll(){const db=await openDb();return new Promise((resolve,reject)=>{const request=db.transaction(TRASH_STORE,'readonly').objectStore(TRASH_STORE).getAll();request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>reject(request.error||new Error('TRASH_READ_FAILED'))})}
function trashScopeOk(item){return !!item&&String(item.scope||'')===syncScope()&&vaultScopeOk(false)}
async function purgeExpiredTrash(){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(TRASH_STORE,'readwrite'),store=tx.objectStore(TRASH_STORE),request=store.getAll(),now=Date.now();let count=0;
    request.onsuccess=()=>{for(const row of request.result||[]){if(Number(row.expiresAt)<=now){store.delete(row.id);count++}}};
    request.onerror=()=>{try{tx.abort()}catch(_){}};
    tx.oncomplete=()=>resolve(count);
    tx.onerror=()=>reject(tx.error||new Error('TRASH_PURGE_FAILED'));
    tx.onabort=()=>reject(tx.error||new Error('TRASH_PURGE_ABORTED'))
  })
}
async function trashFile(original){
  if(!original?.id)throw new Error('VAULT_ITEM_NOT_FOUND');
  const db=await openDb(),scope=syncScope(),now=Date.now(),trashId=uuid(),revision=String(original.syncRevision||'');
  return new Promise((resolve,reject)=>{
    const tx=db.transaction([STORE,TRASH_STORE],'readwrite'),active=tx.objectStore(STORE),trash=tx.objectStore(TRASH_STORE),request=active.get(original.id);
    let reason=null;
    request.onsuccess=()=>{
      try{
        const latest=request.result;
        if(!latest||latest.deleted||String(latest.syncRevision||'')!==revision||!latest.blob)throw new Error('VAULT_STALE_ITEM');
        trash.add({...latest,id:trashId,sourceId:latest.id,scope,deletedAtMs:now,expiresAt:now+TRASH_MS,deleted:false,syncState:'local-trash'});
        active.put({...latest,deleted:true,blob:null,size:0,syncState:'pending',syncRevision:uuid(),updatedAt:new Date(now).toISOString()})
      }catch(e){reason=e;try{tx.abort()}catch(_){reject(e)}}
    };
    request.onerror=()=>{reason=request.error;try{tx.abort()}catch(_){reject(reason)}};
    tx.oncomplete=()=>resolve(trashId);
    tx.onerror=()=>reject(reason||tx.error||new Error('VAULT_TRASH_FAILED'));
    tx.onabort=()=>reject(reason||tx.error||new Error('VAULT_TRASH_ABORTED'))
  })
}
async function restoreTrashRecord(trashId){
  const db=await openDb(),scope=syncScope(),now=Date.now(),newId=uuid();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction([STORE,TRASH_STORE],'readwrite'),items=tx.objectStore(STORE),trash=tx.objectStore(TRASH_STORE);
    const request=trash.get(trashId),count=items.getAll();
    let source=null,rows=null,reason=null,completed=false;
    const ready=()=>{
      if(completed||source===null||rows===null)return;completed=true;
      try{
        if(!source||source.scope!==scope||!vaultScopeOk(false))throw new Error('VAULT_TRASH_SCOPE');
        if(Number(source.expiresAt)<=now)throw new Error('VAULT_TRASH_EXPIRED');
        if(!source.blob)throw new Error('VAULT_TRASH_EMPTY');
        if(rows.filter(x=>!x.deleted).length>=MAX_ITEMS)throw new Error('VAULT_LIMIT_1000');
        const folder=String(source.folder||''),newOrder=folderEntries(rows,folder).length+1;
        const restored={...source,id:newId,restoredFrom:source.sourceId||source.id,createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),manualOrder:newOrder,syncRevision:uuid(),syncState:'pending',remoteUpdatedAt:'',deleted:false,lastOpenedAt:''};
        delete restored.scope;delete restored.deletedAtMs;delete restored.expiresAt;delete restored.sourceId;
        items.add(restored);trash.delete(trashId)
      }catch(e){reason=e;try{tx.abort()}catch(_){reject(e)}}
    };
    request.onsuccess=()=>{source=request.result||false;ready()};
    count.onsuccess=()=>{rows=count.result||[];ready()};
    request.onerror=()=>{reason=request.error;try{tx.abort()}catch(_){reject(reason)}};
    count.onerror=()=>{reason=count.error;try{tx.abort()}catch(_){reject(reason)}};
    tx.oncomplete=()=>resolve(newId);
    tx.onerror=()=>reject(reason||tx.error||new Error('VAULT_RESTORE_FAILED'));
    tx.onabort=()=>reject(reason||tx.error||new Error('VAULT_RESTORE_ABORTED'))
  })
}
async function permanentlyDeleteTrash(trashId){
  const db=await openDb(),scope=syncScope();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(TRASH_STORE,'readwrite'),store=tx.objectStore(TRASH_STORE),request=store.get(trashId);
    let reason=null;
    request.onsuccess=()=>{if(!request.result||request.result.scope!==scope){reason=new Error('VAULT_TRASH_SCOPE');tx.abort();return}store.delete(trashId)};
    request.onerror=()=>{reason=request.error;tx.abort()};
    tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(reason||tx.error);tx.onabort=()=>reject(reason||tx.error||new Error('VAULT_TRASH_ABORTED'))
  })
}
async function restoreTrash(id){
  if(!requireVault('vaultRestoreDeleted'))return false;
  try{await restoreTrashRecord(id);state.filter='all';await refresh();if(autoSync()&&navigator.onLine)scheduleAutoSync(500);logOperation('restore','استعادة ملف من سلة المحذوفات');return true}
  catch(e){alert('تعذرت الاستعادة: '+String(e.message||e));return false}
}
async function eraseTrash(id){
  if(!requireVault('vaultPermanentDelete'))return false;
  if(!confirm('حذف نهائي؟ لن يمكن استعادة هذه النسخة بعد الآن.'))return false;
  try{await permanentlyDeleteTrash(id);await refresh();logOperation('delete','حذف نهائي من سلة المحذوفات');return true}
  catch(e){alert('تعذر الحذف النهائي: '+String(e.message||e));return false}
}
function renderTrash(){
  const grid=$('vGrid');if(!grid)return;
  const now=Date.now(),current=state.trashItems.filter(row=>trashScopeOk(row)&&Number(row.expiresAt)>now);
  document.querySelectorAll('.v-tab[data-filter]').forEach(button=>button.classList.toggle('active',button.dataset.filter==='trash'));
  const folderBar=$('vFolderTabs');if(folderBar)folderBar.style.display='none';
  $('vCount').textContent='سلة المحذوفات • '+current.length+' ملف • حذف تلقائي بعد '+TRASH_DAYS+' يومًا';
  grid.classList.remove('list','details','large');
  grid.innerHTML=current.length?current.map(item=>{
    const days=Math.max(1,Math.ceil((Number(item.expiresAt)-now)/86400000)),name=esc(item.name),id=esc(item.id);
    const thumb=isImage(item)?`<img src="${objectUrl(item.blob)}" alt="">`:`<div class="v-file-icon">${fileIcon(item)}</div>`;
    return `<article class="v-item"><div class="v-thumb">${thumb}</div><div class="v-name">${name}</div><div class="v-meta">من: ${esc(item.folder||'الملفات العامة')} • يتبقى ${days} يوم</div><div class="v-item-actions"><button onclick="DocumentVault.restoreTrash('${id}')">↩ استعادة</button><button class="danger" onclick="DocumentVault.eraseTrash('${id}')">حذف نهائي</button></div></article>`
  }).join(''):'<div class="v-empty">سلة المحذوفات فارغة. الملفات المحذوفة تُحفظ 30 يومًا قبل حذفها تلقائيًا.</div>'
}


function syncSnapshot(item){
  return JSON.stringify([
    String(item.id||''),String(item.syncRevision||''),String(item.updatedAt||''),
    String(item.name||''),String(item.category||''),String(item.mime||''),
    Number(item.size)||0,String(item.folder||''),!!item.favorite,!!item.deleted,
    String(item.lastOpenedAt||''),Number.isInteger(item.manualOrder)?item.manualOrder:null,Number(item.blob?.size)||0,String(item.blob?.type||'')
  ])
}
async function dbMarkSyncedIfUnchanged(uploaded,remoteUpdatedAt){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    let marked=false,tx;
    try{
      tx=db.transaction(STORE,'readwrite');
      const store=tx.objectStore(STORE),request=store.get(uploaded.id);
      request.onsuccess=()=>{
        const current=request.result;
        if(!current||current.syncState!=='pending'||syncSnapshot(current)!==syncSnapshot(uploaded))return;
        store.put({...current,remoteUpdatedAt:String(remoteUpdatedAt||''),syncState:'synced'});
        marked=true
      };
      request.onerror=()=>{try{tx.abort()}catch(_){}};
      tx.oncomplete=()=>resolve(marked);
      tx.onerror=()=>reject(tx.error||new Error('تعذر تحديث حالة مزامنة الملف'));
      tx.onabort=()=>reject(tx.error||new Error('أُلغيت معاملة تحديث حالة المزامنة'))
    }catch(error){reject(error)}
  })
}

async function dbApplySyncIfUnchanged(id,expected,replacement,localCopy=null){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    let applied=false,tx,reason=null;
    try{
      tx=db.transaction(STORE,'readwrite');
      const store=tx.objectStore(STORE),request=store.get(id);
      const fail=error=>{reason=error;try{tx.abort()}catch(_){}};
      request.onsuccess=()=>{
        try{
          const current=request.result;
          const unchanged=expected===null?!current:!!current&&
            current.syncState===expected.syncState&&
            String(current.remoteUpdatedAt||'')===String(expected.remoteUpdatedAt||'')&&
            syncSnapshot(current)===syncSnapshot(expected);
          if(!unchanged)return;
          // All checks and writes must share this transaction with other local uploads.
          const activeBefore=!!current&&!current.deleted;
          const activeAfter=!!replacement&&!replacement.deleted;
          const activeCopy=!!localCopy&&!localCopy.deleted;
          const growth=Number(activeAfter)+Number(activeCopy)-Number(activeBefore);
          const commit=()=>{
            try{
              if(localCopy)store.add(localCopy);
              if(replacement)store.put(replacement);
              else store.delete(id);
              applied=true
            }catch(error){fail(error)}
          };
          if(growth<=0){commit();return}
          // A cursor counts live records without materializing up to 1000 large Blobs.
          // It also sees the transaction's current snapshot, so two concurrent
          // downloads/conflict copies cannot each consume the last free slot.
          let count=0;
          const cursor=store.openCursor();
          cursor.onsuccess=()=>{
            try{
              const entry=cursor.result;
              if(entry){
                if(!entry.value.deleted)count++;
                entry.continue();
                return
              }
              if(count+growth>MAX_ITEMS)throw new Error('VAULT_LIMIT_1000');
              commit()
            }catch(error){fail(error)}
          };
          cursor.onerror=()=>fail(cursor.error||new Error('VAULT_CAPACITY_READ_FAILED'))
        }catch(error){fail(error)}
      };
      request.onerror=()=>fail(request.error||new Error('VAULT_SYNC_READ_FAILED'));
      tx.oncomplete=()=>resolve(applied);
      tx.onerror=()=>reject(reason||tx.error||new Error('تعذرت معاملة مزامنة الملف'));
      tx.onabort=()=>reject(reason||tx.error||new Error('أُلغيت معاملة مزامنة الملف'))
    }catch(error){try{tx?.abort()}catch(_){}reject(error)}
  })
}


async function dbReconcileRemoteDeletionToTrashIfUnchanged(expected,{remoteEdited=null,remoteBlob=null,remoteVersion=''}={}){
 const db=await openDb(),scope=syncScope(),now=Date.now(),trashId=uuid();
 return new Promise((resolve,reject)=>{
  let changed=false,reason=null,tx;
  try{
   tx=db.transaction([STORE,TRASH_STORE],'readwrite');
   const store=tx.objectStore(STORE),trash=tx.objectStore(TRASH_STORE),request=store.get(expected.id);
   const fail=e=>{reason=e;try{tx.abort()}catch(_){}};
   request.onsuccess=()=>{
    try{
     const current=request.result;
     if(!current||current.syncState!==expected.syncState||
        String(current.remoteUpdatedAt||'')!==String(expected.remoteUpdatedAt||'')||
        syncSnapshot(current)!==syncSnapshot(expected))return;
     if(scope!==syncScope()||!vaultScopeOk(false))throw new Error('VAULT_TRASH_SCOPE');
     let archived;
     if(remoteEdited){
      if(!current.deleted||remoteEdited.deleted||!remoteBlob||!remoteVersion)throw new Error('VAULT_DELETE_CONFLICT_INVALID');
      const incoming=remoteItem({...remoteEdited,id:expected.id},remoteBlob,remoteVersion);
      archived={...incoming,name:niceName(incoming.name+' (تعديل جهاز آخر قبل الحذف)')};
     }else{
      if(current.deleted||!current.blob)throw new Error('VAULT_TRASH_EMPTY');
      archived=current
     }
     trash.add({...archived,id:trashId,sourceId:expected.id,scope,
       deletedAtMs:now,expiresAt:now+TRASH_MS,deleted:false,syncState:'local-trash'});
     if(remoteEdited){
      // Record preserved remote revision: the existing deletion is uploaded on the next sync pass.
      store.put({...current,remoteUpdatedAt:String(remoteVersion),syncRevision:uuid(),syncState:'pending'})
     }else store.delete(expected.id);
     changed=true
    }catch(e){fail(e)}
   };
   request.onerror=()=>fail(request.error||new Error('VAULT_TRASH_READ_FAILED'));
   tx.oncomplete=()=>resolve(changed);
   tx.onerror=()=>reject(reason||tx.error||new Error('VAULT_TRASH_SYNC_FAILED'));
   tx.onabort=()=>reject(reason||tx.error||new Error('VAULT_TRASH_SYNC_ABORTED'))
  }catch(e){try{tx?.abort()}catch(_){}reject(e)}
 })
}

function addCss(){
  let style=document.createElement('style');style.id='vaultStyle';style.textContent=`
#vaultCenter{display:none;padding:12px;background:var(--bg,#f5efe8);min-height:82vh}.vault-show{display:block!important}.v-shell{max-width:920px;margin:auto;color:var(--text,#2b211d);font-family:Tahoma,Arial,sans-serif}.v-hero{border-radius:21px;padding:15px;color:#fff;background:radial-gradient(circle at 8% 12%,#55d6b655,transparent 28%),linear-gradient(135deg,#102d47,#075f65 58%,#a77932);box-shadow:0 12px 30px #102d4730}.v-hero h2{margin:0;font-size:18px}.v-hero p{font-size:9px;opacity:.88;margin:5px 0 10px}.v-search{display:flex;align-items:center;gap:7px;background:#fff;border-radius:13px;padding:3px 9px;color:#18303b}.v-search input{width:100%;border:0;outline:0;background:transparent;padding:10px 4px;font:700 12px Tahoma;color:#222}.v-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}.v-actions button{border:1px solid #ffffff3b;border-radius:10px;background:#ffffff18;color:#fff;min-height:42px;font-size:8px;font-weight:900;padding:4px}.v-syncline{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;font-size:8px}.v-auto{display:flex;align-items:center;gap:5px}
.v-tabs{display:flex;gap:7px;margin:11px 0;overflow:auto;padding-bottom:3px}.v-tab{border:1px solid #b8957655;border-radius:12px;background:var(--surface2,#fff);color:var(--text,#222);padding:10px 9px;font-size:9px;font-weight:900;white-space:nowrap}.v-tab.active{background:#087f72;color:#fff;border-color:#087f72}.v-upload-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.v-upload{border:1px dashed #087f7288;border-radius:15px;background:linear-gradient(145deg,#fff,#eef8f5);padding:14px 7px;text-align:center;color:#075b51;font-size:9px;font-weight:900}.v-upload span{display:block;font-size:28px;margin-bottom:5px}.v-counter{padding:9px 2px 5px;font-size:9px;color:#786b62;display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap}.v-sort{display:flex;align-items:center;gap:5px;font-size:8px;font-weight:900}.v-sort select{max-width:150px;border:1px solid #b8957655;border-radius:9px;background:var(--surface2,#fff);color:var(--text,#222);padding:7px 5px;font-size:8px;font-weight:900}.v-view-switch{display:flex;gap:4px}.v-view-switch button{border:1px solid #b8957655;border-radius:8px;background:#fff;padding:7px}.v-view-switch button.active{background:#087f72;color:#fff}.v-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.v-grid.list{grid-template-columns:1fr}.v-grid.list .v-item{display:grid;grid-template-columns:86px 1fr;gap:8px}.v-grid.list .v-thumb{grid-row:1/5;height:92px}.v-grid.list .v-item-actions{grid-column:2}.v-item{background:#fff;border:1px solid #00000012;border-radius:14px;padding:7px;box-shadow:0 5px 14px #0000000c;min-width:0;color:#241f1b}.v-thumb{height:116px;border:0;width:100%;border-radius:10px;background:linear-gradient(145deg,#edf1f4,#dce6ea);display:grid;place-items:center;overflow:hidden;position:relative}.v-thumb img{width:100%;height:100%;object-fit:cover}.v-file-icon{font-size:42px}.v-pending{position:absolute;top:5px;left:5px;background:#d88418;color:#fff;border-radius:10px;padding:3px 6px;font-size:7px}.v-favorite{position:absolute;top:5px;right:5px;background:#fff;color:#bd841f;border-radius:50%;width:25px;height:25px;display:grid;place-items:center;font-size:14px}.v-name{font-size:10px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:7px 2px 3px}.v-folder{font-size:7px;color:#087f72}.v-meta{font-size:7px;color:#7a7069;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.v-item-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:6px}.v-item-actions button{border:0;border-radius:7px;min-height:30px;background:#e8f2ef;color:#075e53;font-size:7px;font-weight:900;padding:2px}.v-item-actions .favorite-on{background:#fff2ca;color:#8a5c00}.v-item-actions .danger{background:#ffe8e8;color:#a42d39}.v-empty{grid-column:1/-1;padding:40px 12px;text-align:center;color:#84776f;background:#fff;border-radius:15px;font-size:11px}
.v-modal{position:fixed;z-index:23000;inset:0;background:#000c;display:none;align-items:center;justify-content:center;padding:9px}.v-modal.show{display:flex}.v-dialog{width:min(760px,100%);max-height:94vh;overflow:auto;background:#f7f4ed;border-radius:18px;color:#211c18}.v-head{position:sticky;top:0;z-index:4;display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#075e53;color:#fff}.v-head b{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.v-close{width:34px;height:34px;border:0;border-radius:50%;background:#fff2;color:#fff;font-size:20px}.v-body{padding:10px}.v-view{min-height:300px;display:grid;place-items:center;background:#202326;border-radius:12px;overflow:hidden;color:#fff}.v-view img{max-width:100%;max-height:70vh}.v-view iframe{width:100%;height:70vh;border:0;background:#fff}.v-view pre{white-space:pre-wrap;direction:auto;padding:12px;align-self:start;width:100%}.v-modal-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:9px}.v-modal-actions button{border:0;border-radius:10px;min-height:41px;background:#087f72;color:#fff;font-size:8px;font-weight:900}.v-modal-actions .alt{background:#6a5548}.v-modal-actions .danger{background:#a62d3a}
.v-edit-canvas{width:100%;max-height:54vh;object-fit:contain;background:#151515;border-radius:12px}.v-controls{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}.v-controls label{font-size:8px;font-weight:900;color:#685c54}.v-controls input{width:100%}.v-ocr-source{max-width:100%;max-height:240px;display:block;margin:0 auto 9px;border-radius:10px}.v-ocr-text{width:100%;min-height:190px;border:1px solid #b9a99d;border-radius:12px;padding:10px;direction:auto;font:700 12px/1.8 Tahoma;background:#fff}.v-progress{font-size:9px;color:#087f72;padding:8px;text-align:center;font-weight:900}.v-busy{position:fixed;z-index:25000;inset:0;background:#000b;display:none;align-items:center;justify-content:center}.v-busy.show{display:flex}.v-busy-card{background:#fff;border-radius:16px;padding:20px;min-width:240px;text-align:center;color:#222;font-size:11px;font-weight:900}.v-spinner{width:36px;height:36px;border:4px solid #ddd;border-top-color:#087f72;border-radius:50%;margin:0 auto 10px;animation:vspin .9s linear infinite}@keyframes vspin{to{transform:rotate(360deg)}}@media(min-width:700px){.v-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:390px){.v-actions{grid-template-columns:1fr 1fr}.v-grid{grid-template-columns:1fr 1fr}.v-item-actions{grid-template-columns:1fr 1fr}}
`;style.textContent+=`
.v-grid.large{grid-template-columns:repeat(auto-fill,minmax(225px,1fr));gap:13px}.v-grid.large .v-thumb{height:255px}.v-grid.large .v-thumb img{object-fit:contain}
.v-grid.details{grid-template-columns:1fr}.v-grid.details .v-item{display:grid;grid-template-columns:105px 1fr;gap:8px}.v-grid.details .v-thumb{grid-row:1/6;height:115px}.v-grid.details .v-item-actions,.v-grid.details .v-details{grid-column:2}.v-details{font-size:9px;color:#76675d;line-height:1.7}.v-grid.details .v-name{white-space:normal}.v-drag-handle{touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;background:#d9eaff!important;font-size:14px!important;min-height:36px!important}.v-item.drag-source{opacity:.65;border:2px dashed #087f72}.v-item.drag-drop-target{outline:3px solid #087f72;outline-offset:-3px}
@media(max-width:420px){.v-grid.large{grid-template-columns:1fr}.v-grid.details .v-item{grid-template-columns:85px 1fr}.v-grid.details .v-thumb{height:100px}}
`;document.head.appendChild(style)
}

function mainHtml(){return `<div class="v-shell">
  <div class="v-hero">
    <h2>🗄️ الحفظ والمستندات</h2><p>أرشيف فرعك المحلي • بحث وOCR • نسخ احتياطي • مزامنة ملفات هذا الفرع</p>
    <label class="v-search">🔎<input id="vSearch" placeholder="ابحث باسم أي كتاب أو صورة أو ملف..." autocomplete="off"></label>
    <div class="v-actions"><button onclick="DocumentVault.openOcr()">📷 تحويل صورة إلى نص</button><button onclick="DocumentVault.backup('save')">⬇ نسخة على الجهاز</button><button onclick="DocumentVault.backup('share')">✉ Google / Gmail</button><button onclick="DocumentVault.encryptedBackup()">🔐 نسخة مشفرة</button><button onclick="DocumentVault.syncNow()">↻ مزامنة الآن</button><button id="vOtherBranchButton" style="display:none" onclick="DocumentVault.openOtherBranches()">📱 أرشيف الفروع (قراءة فقط)</button></div>
    <div class="v-syncline"><span id="vSyncStatus">المزامنة: جاهزة</span><label class="v-auto"><input id="vAutoSync" type="checkbox" onchange="DocumentVault.setAutoSync(this.checked)"> تلقائي يومياً وعند توفر الإنترنت</label></div>
  </div>
  <div class="v-tabs"><button class="v-tab active" data-filter="all" onclick="DocumentVault.setFilter('all')">الكل</button><button class="v-tab" data-filter="image" onclick="DocumentVault.setFilter('image')">الصور</button><button class="v-tab" data-filter="pdf" onclick="DocumentVault.setFilter('pdf')">PDF</button><button class="v-tab" data-filter="word" onclick="DocumentVault.setFilter('word')">Word</button><button class="v-tab" data-filter="excel" onclick="DocumentVault.setFilter('excel')">Excel</button><button class="v-tab" data-filter="powerpoint" onclick="DocumentVault.setFilter('powerpoint')">العروض</button><button class="v-tab" data-filter="text" onclick="DocumentVault.setFilter('text')">النصوص</button><button class="v-tab" data-filter="file" onclick="DocumentVault.setFilter('file')">الملفات</button><button class="v-tab" data-filter="folder:المستمسكات" onclick="DocumentVault.setFilter('folder:المستمسكات')">المستمسكات</button><button class="v-tab" data-filter="folder:المعاملات" onclick="DocumentVault.setFilter('folder:المعاملات')">المعاملات</button><button class="v-tab" data-filter="folder:الباجات" onclick="DocumentVault.setFilter('folder:الباجات')">الباجات</button><button class="v-tab" data-filter="favorite" onclick="DocumentVault.setFilter('favorite')">★ المفضلة</button><button class="v-tab" data-filter="recent" onclick="DocumentVault.setFilter('recent')">🕘 الأخيرة</button><button class="v-tab" data-filter="trash" onclick="DocumentVault.setFilter('trash')">🗑️ سلة المحذوفات (30 يومًا)</button></div>
  <div class="v-tabs" id="vFolderTabs" aria-label="حافظات الملفات"></div>
  <div class="v-upload-grid"><button class="v-upload" onclick="DocumentVault.pickImages()"><span>🖼️</span>رفع صور أو كتب صورية<br>مع القص والتدوير والتحسين</button><button class="v-upload" onclick="DocumentVault.pickFiles()"><span>📚</span>رفع Word / Excel / PDF<br>وجميع أنواع الملفات</button></div>
  <div class="v-tabs"><button class="v-tab" onclick="DocumentVault.pickCollection('المستمسكات')">＋ رفع مستمسك</button><button class="v-tab" onclick="DocumentVault.pickCollection('المعاملات')">＋ رفع معاملة</button><button class="v-tab" onclick="DocumentVault.pickCollection('الباجات')">＋ رفع باج</button></div>
  <div class="v-counter"><span id="vCount">0 من 1000</span><label class="v-sort">ترتيب حسب <select id="vSort" onchange="DocumentVault.setSort(this.value)"><option value="date-desc">التاريخ — الأحدث</option><option value="date-asc">التاريخ — الأقدم</option><option value="alpha-asc">الأبجدية — أ إلى ي</option><option value="alpha-desc">الأبجدية — ي إلى أ</option><option value="size-desc">الحجم — الأكبر</option><option value="size-asc">الحجم — الأصغر</option><option value="type-asc">النوع</option><option value="manual">ترتيب يدوي داخل الحافظة</option><option value="modified-desc">آخر تعديل — الأحدث</option><option value="modified-asc">آخر تعديل — الأقدم</option><option value="opened-desc">آخر فتح</option></select></label><div class="v-view-switch"><button id="vGridBtn" title="مصغرات" onclick="DocumentVault.setView('grid')">▦</button><button id="vLargeBtn" title="صور كبيرة" onclick="DocumentVault.setView('large')">▣</button><button id="vDetailsBtn" title="عرض التفاصيل" onclick="DocumentVault.setView('details')">≡</button><button id="vListBtn" title="قائمة" onclick="DocumentVault.setView('list')">☷</button></div><button class="v-tab" style="padding:5px 9px" onclick="DocumentVault.createFolder()">＋ حافظة</button><button class="v-tab" style="padding:5px 9px" onclick="DocumentVault.pasteToFolder()">📋 لصق هنا</button><button class="v-tab" onclick="DocumentVault.pickIntoFolder('image')">🖼️ إضافة صورة هنا</button><button class="v-tab" onclick="DocumentVault.pickIntoFolder('file')">📄 إضافة ملف هنا</button><span id="vClipboardStatus" class="v-meta" aria-live="polite"></span><button class="v-tab" style="padding:5px 9px" onclick="DocumentVault.pickBackup()">استعادة نسخة</button></div>
  <div id="vBulkToolbar" class="v-tabs" role="toolbar" aria-label="إدارة الملفات المحددة"><button class="v-tab" onclick="DocumentVault.selectVisibleFiles()">☑ تحديد المعروض</button><button class="v-tab" onclick="DocumentVault.clearFileSelection()">إلغاء التحديد</button><span id="vSelectedCount" class="v-meta" aria-live="polite">0 محددة</span><button class="v-tab" onclick="DocumentVault.renumberFolder()">123 ترقيم الحافظة</button><button class="v-tab" onclick="DocumentVault.restoreLastFolderNumbering()">↩ استعادة آخر ترقيم</button></div>
  <div id="vGrid" class="v-grid"></div>
  <input id="vImageInput" type="file" accept="image/*" multiple hidden>
  <input id="vFileInput" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf,.csv,.zip,.rar,.7z,.odt,.ods,.epub,.mobi,.html,.xml,.json,*/*" multiple hidden><input id="vReplaceInput" type="file" accept="*/*" hidden>
  <input id="vBackupInput" type="file" accept=".zip,.abuvault,application/zip" hidden>
  <input id="vOcrInput" type="file" accept="image/*" hidden>
</div>`}

function modalHtml(){return `
<div id="vViewModal" class="v-modal"><div class="v-dialog"><div class="v-head"><b id="vViewTitle">المستند</b><button class="v-close" onclick="DocumentVault.closeModal('vViewModal')">×</button></div><div class="v-body"><div id="vView" class="v-view"></div><div class="v-modal-actions"><button id="vGalleryButton" onclick="DocumentVault.saveGalleryActive()">حفظ في المعرض</button><button onclick="DocumentVault.savePdfActive()">حفظ PDF</button><button onclick="DocumentVault.printActive()">🖨 طباعة</button><button onclick="DocumentVault.saveActive()">حفظ الملف</button><button onclick="DocumentVault.editActive()">✎ تحرير / نسخة معدّلة</button><button onclick="DocumentVault.shareActive()">مشاركة / Google</button><button class="alt" onclick="DocumentVault.closeModal('vViewModal')">عودة</button></div></div></div></div>
<div id="vTextEditModal" class="v-modal"><div class="v-dialog"><div class="v-head"><b id="vTextEditTitle">تحرير ملف نصي</b><button class="v-close" onclick="DocumentVault.closeModal('vTextEditModal')">×</button></div><div class="v-body"><p style="font-size:10px">يمكن تحرير TXT وCSV وJSON وXML وHTML هنا. تحفظ النتيجة محلياً أولاً ويمكنك الاحتفاظ بالأصل أو استبداله.</p><textarea id="vTextEdit" class="v-ocr-text" dir="auto" spellcheck="false"></textarea><div class="v-modal-actions"><button onclick="DocumentVault.saveTextEdit()">حفظ التعديل</button><button class="alt" onclick="DocumentVault.closeModal('vTextEditModal')">إلغاء</button></div></div></div></div><div id="vEditModal" class="v-modal"><div class="v-dialog"><div class="v-head"><b>تحرير وتوضيح الصورة</b><button class="v-close" onclick="DocumentVault.closeModal('vEditModal')">×</button></div><div class="v-body"><canvas id="vEditCanvas" class="v-edit-canvas"></canvas><div class="v-controls"><label>قص من اليسار<input id="vCropL" type="range" min="0" max="45" value="0" oninput="DocumentVault.editorChanged()"></label><label>قص من اليمين<input id="vCropR" type="range" min="55" max="100" value="100" oninput="DocumentVault.editorChanged()"></label><label>قص من الأعلى<input id="vCropT" type="range" min="0" max="45" value="0" oninput="DocumentVault.editorChanged()"></label><label>قص من الأسفل<input id="vCropB" type="range" min="55" max="100" value="100" oninput="DocumentVault.editorChanged()"></label><label>الدوران<input id="vRotate" type="range" min="-180" max="180" step="90" value="0" oninput="DocumentVault.editorChanged()"></label><label>الإضاءة<input id="vBrightness" type="range" min="60" max="160" value="100" oninput="DocumentVault.editorChanged()"></label><label>التباين / التوضيح<input id="vContrast" type="range" min="60" max="180" value="100" oninput="DocumentVault.editorChanged()"></label></div><div class="v-modal-actions"><button onclick="DocumentVault.saveEditor()">اعتماد وحفظ</button><button onclick="DocumentVault.clarify()">✨ توضيح تلقائي</button><button class="alt" onclick="DocumentVault.resetEditor()">إعادة الأصل</button><button onclick="DocumentVault.saveEditorGallery()">حفظ في المعرض</button><button onclick="DocumentVault.saveEditorPdf()">حفظ PDF</button><button onclick="DocumentVault.printEditor()">🖨 طباعة</button></div></div></div></div>
<div id="vOcrModal" class="v-modal"><div class="v-dialog"><div class="v-head"><b>تحويل الصورة إلى نص قابل للنسخ</b><button class="v-close" onclick="DocumentVault.closeModal('vOcrModal')">×</button></div><div class="v-body"><div class="v-modal-actions"><button onclick="DocumentVault.ocrCamera()">📷 فتح الكاميرا</button><button onclick="DocumentVault.ocrGallery()">🖼 اختيار من الاستديو</button><button onclick="DocumentVault.ocrFilePicker()">📂 ملف صورة</button><button class="alt" onclick="DocumentVault.clearOcr()">مسح النص</button></div><img id="vOcrImage" class="v-ocr-source" style="display:none"><div id="vOcrProgress" class="v-progress">اختر صورة واضحة لبدء قراءة النص العربي أو الإنجليزي.</div><textarea id="vOcrText" class="v-ocr-text" placeholder="سيظهر النص هنا ويمكن تعديله ونسخه..."></textarea><div class="v-modal-actions"><button onclick="DocumentVault.copyOcr()">نسخ النص</button><button onclick="DocumentVault.selectOcr()">تحديد الكل</button><button onclick="DocumentVault.shareOcr()">مشاركة النص</button><button onclick="DocumentVault.saveOcrText()">حفظ TXT</button><button onclick="DocumentVault.saveOcrPdf()">حفظ PDF</button><button onclick="DocumentVault.saveOcrWithImage()">PDF مع الصورة</button><button onclick="DocumentVault.reOcr()">إعادة OCR</button><button onclick="DocumentVault.printOcr()">🖨 طباعة النص</button><button id="vOcrLoginBtn" onclick="DocumentVault.useOcrLogin()">إرسال إلى كارت الدخول</button></div></div></div></div>
<div id="vOtherBranchModal" class="v-modal"><div class="v-dialog"><div class="v-head"><b>📱 أرشيف الفروع — للمدير فقط (قراءة دون تعديل)</b><button class="v-close" onclick="DocumentVault.closeOtherBranches()">×</button></div><div class="v-body"><div id="vOtherBranchFiles" class="v-tabs" style="flex-direction:column;align-items:stretch">جاري قراءة قائمة الفروع...</div><div id="vOtherBranchPreview" class="v-view" style="min-height:120px;margin-top:10px">اختر ملفاً لمعاينته.</div><div class="v-modal-actions"><button id="vOtherBranchSave" style="display:none" onclick="DocumentVault.saveOtherBranchFile()">⬇ تنزيل نسخة من الملف</button><button class="alt" onclick="DocumentVault.closeOtherBranches()">إغلاق</button></div></div></div></div>
<div id="vBusy" class="v-busy"><div class="v-busy-card"><div class="v-spinner"></div><div id="vBusyText">جاري العمل...</div></div></div>
`}

async function build(){
  if($('vaultCenter'))return;
  addCss();let app=document.querySelector('.app'),preview=document.querySelector('.app .preview');if(!app)return;
  let section=document.createElement('section');section.id='vaultCenter';section.innerHTML=mainHtml();app.insertBefore(section,preview||null);document.body.insertAdjacentHTML('beforeend',modalHtml());
  $('vSearch').oninput=event=>{state.query=event.target.value;render()};
  $('vSort').value=state.sort;
  $('vAutoSync').checked=autoSync();
  $('vImageInput').onchange=event=>addFiles(event.target.files,'image',event.target);
  $('vFileInput').onchange=event=>addFiles(event.target.files,'file',event.target);
  $('vReplaceInput').onchange=async event=>{const file=event.target.files?.[0];event.target.value='';if(file)await replaceFromDevice(file)};
  $('vBackupInput').onchange=event=>restoreBackup(event.target.files&&event.target.files[0]);
  $('vOcrInput').onchange=event=>ocrFile(event.target.files&&event.target.files[0]);
  await refresh();
  bindTouchReorder();
  setInterval(()=>{if(document.visibilityState!=='hidden')void purgeExpiredTrash().then(n=>{if(n&&state.filter==='trash')return refresh()}).catch(()=>{})},3600000);
  window.addEventListener('online',()=>{setSyncStatus('عاد الإنترنت • فحص جدول المزامنة');scheduleAutoSync(50)});
  window.addEventListener('offline',()=>setSyncStatus('لا يوجد إنترنت • الحفظ المحلي يعمل'));
  scheduleAutoSync(5000);
  setInterval(()=>{if(document.visibilityState!=='hidden'&&automaticDue())void syncNow(false)},900000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){scheduleAutoSync(100);void purgeExpiredTrash().then(n=>{if(n&&state.filter==='trash')return refresh()}).catch(()=>{})}});document.addEventListener('abu-bassam-auth-changed',()=>{state.clipboard=null;state.selectedIds.clear();closeOtherBranches();updateVaultAccessUi()});document.addEventListener('abu-runtime-loaded',e=>{if(e.detail?.src==='branch-vault-runtime.js'||e.detail?.src==='admin-permissions-runtime.js')updateVaultAccessUi()})
}

function setBusy(on,text='جاري العمل...'){state.busy=!!on;if($('vBusy'))$('vBusy').classList.toggle('show',!!on);if($('vBusyText'))$('vBusyText').textContent=text}
function showModal(id){$(id).classList.add('show')}
function closeModal(id){$(id).classList.remove('show');if(id==='vViewModal'&&state.previewUrl){try{URL.revokeObjectURL(state.previewUrl)}catch(_){}state.previewUrl=''}}
function setSyncStatus(text){if($('vSyncStatus'))$('vSyncStatus').textContent='المزامنة: '+text}
function setAutoSync(value){syncSet(AUTO_SYNC_KEY,value?'1':'0');setSyncStatus(value?'تلقائية مفعّلة':'تلقائية متوقفة');scheduleAutoSync(100)}
function hasPending(){return state.items.some(item=>item.syncState==='pending')}
function logOperation(type,title,details='',fileName=''){if(window.AbuBassamOps&&AbuBassamOps.add)AbuBassamOps.add({type,title,details,fileName,section:'الحفظ والمستندات'})}

async function refresh(){
  await purgeExpiredTrash();
  await purgeExpiredCheckpoints();
  state.items=(await dbAll()).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
  state.trashItems=(await dbTrashAll()).filter(item=>trashScopeOk(item)&&Number(item.expiresAt)>Date.now()).sort((a,b)=>Number(b.deletedAtMs)-Number(a.deletedAtMs));
  render()
}
function cleanupUrls(){state.urls.forEach(url=>{try{URL.revokeObjectURL(url)}catch(e){}});state.urls=[]}
function objectUrl(blob){let url=URL.createObjectURL(blob);state.urls.push(url);return url}
function viewObjectUrl(blob){if(state.previewUrl){try{URL.revokeObjectURL(state.previewUrl)}catch(_){}}state.previewUrl=URL.createObjectURL(blob);return state.previewUrl}
function fileIcon(item){let e=ext(item.name);if(e==='pdf')return'📕';if(['doc','docx','odt','rtf'].includes(e))return'🟦';if(['xls','xlsx','ods','csv'].includes(e))return'🟩';if(['ppt','pptx'].includes(e))return'🟧';if(['zip','rar','7z'].includes(e))return'🗜️';if(['epub','mobi'].includes(e))return'📚';return'📄'}
function typeOf(item){let e=ext(item.name);if(isImage(item))return'image';if(e==='pdf')return'pdf';if(['doc','docx','odt','rtf'].includes(e))return'word';if(['xls','xlsx','ods'].includes(e))return'excel';if(['ppt','pptx','odp'].includes(e))return'powerpoint';if(['txt','csv','json','xml','html'].includes(e))return'text';return'file'}
function typeLabel(item){return ({image:'صورة',pdf:'PDF',word:'Word',excel:'Excel',powerpoint:'عرض',text:'نص',file:'ملف'})[typeOf(item)]||'ملف'}
function textEditable(item){return ['txt','csv','json','xml','html'].includes(ext(item.name))}
function visibleItems(){let q=state.query.trim().toLocaleLowerCase('ar'),active=state.items.filter(item=>!item.deleted),match=item=>state.filter==='all'||state.filter==='favorite'&&item.favorite||state.filter==='recent'&&item.lastOpenedAt||state.filter.startsWith('folder:')&&item.folder===state.filter.slice(7)||typeOf(item)===state.filter,items=active.filter(item=>match(item)&&(!q||[item.name,item.mime,ext(item.name),item.folder,formatTime(item.createdAt),formatTime(item.updatedAt)].join(' ').toLocaleLowerCase('ar').includes(q))),sort=state.sort||'date-desc';if(state.filter==='recent')sort='opened-desc';items.sort((a,b)=>{if(sort==='manual'){let group=String(a.folder||'').localeCompare(String(b.folder||''),'ar',{numeric:true});return group||((Number.isInteger(a.manualOrder)?a.manualOrder:999999)-(Number.isInteger(b.manualOrder)?b.manualOrder:999999))||((Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0))||String(a.id).localeCompare(String(b.id))}if(sort==='alpha-asc'||sort==='alpha-desc'){let n=String(a.name||'').localeCompare(String(b.name||''),'ar',{numeric:true,sensitivity:'base'});return sort==='alpha-desc'?-n:n}if(sort==='size-asc'||sort==='size-desc'){let n=(Number(a.size)||0)-(Number(b.size)||0);return sort==='size-desc'?-n:n}if(sort==='type-asc')return typeOf(a).localeCompare(typeOf(b),'ar')||String(a.name).localeCompare(String(b.name),'ar');if(sort==='opened-desc')return (Date.parse(b.lastOpenedAt)||0)-(Date.parse(a.lastOpenedAt)||0);if(sort==='modified-asc'||sort==='modified-desc'){let n=(Date.parse(a.updatedAt)||0)-(Date.parse(b.updatedAt)||0);return sort==='modified-asc'?n:-n}let n=(Date.parse(a.createdAt||a.updatedAt)||0)-(Date.parse(b.createdAt||b.updatedAt)||0);return sort==='date-asc'?n:-n});return items}
function render(){
  let grid=$('vGrid');if(!grid)return;cleanupUrls();if(state.filter==='trash'){renderTrash();return}let active=state.items.filter(item=>!item.deleted),items=visibleItems();
  for(const id of [...state.selectedIds])if(!active.some(item=>item.id===id))state.selectedIds.delete(id);
  $('vCount').textContent=`${active.length} من ${MAX_ITEMS} • الظاهر ${items.length}`;
  if($('vSelectedCount'))$('vSelectedCount').textContent=state.selectedIds.size+' محددة';
  document.querySelectorAll('.v-tab[data-filter]').forEach(button=>button.classList.toggle('active',button.dataset.filter===state.filter));
  grid.classList.remove('list','details','large');
  const folderHost=$('vFolderTabs');if(folderHost){folderHost.style.display='';folderHost.textContent='';const allFolders=[...new Set([...readFolders(),...active.map(x=>x.folder).filter(Boolean)])].sort((a,b)=>a.localeCompare(b,'ar'));for(const folder of allFolders){const btn=document.createElement('button');btn.className='v-tab'+(state.filter==='folder:'+folder?' active':'');btn.textContent='📁 '+folder;btn.onclick=()=>setFilter('folder:'+folder);folderHost.appendChild(btn)}}
  const clip=$('vClipboardStatus');if(clip)clip.textContent=state.clipboard?'الحافظة: '+(state.clipboard.mode==='cut'?'قص':'نسخ')+' • '+state.clipboard.name:'';
  if(['list','details','large'].includes(state.view))grid.classList.add(state.view);
  [['vGridBtn','grid'],['vLargeBtn','large'],['vDetailsBtn','details'],['vListBtn','list']].forEach(([id,mode])=>$(id)?.classList.toggle('active',state.view===mode));
  grid.innerHTML=items.length?items.map(item=>{let thumb=isImage(item)?`<img src="${objectUrl(item.blob)}" alt="">`:`<div class="v-file-icon">${fileIcon(item)}</div>`,action=isImage(item)?'editItem':textEditable(item)?'editTextItem':'pickRevisedFile',caption=isImage(item)?'قص وتدوير':textEditable(item)?'تحرير':'نسخة معدلة';return `<article class="v-item" data-vault-item="${esc(item.id)}"><label class="v-meta" style="display:flex;gap:5px;align-items:center;margin:5px"><input type="checkbox" aria-label="تحديد ${esc(item.name)}" ${state.selectedIds.has(item.id)?'checked':''} onchange="DocumentVault.toggleFileSelection(\'${item.id}\',this.checked)"> تحديد</label><button class="v-thumb" onclick="DocumentVault.openItem('${item.id}')">${thumb}${item.syncState==='pending'?'<span class="v-pending">بانتظار المزامنة</span>':''}${item.favorite?'<span class="v-favorite">★</span>':''}</button><div class="v-name" title="${esc(item.name)}">${esc(item.name)}</div>${item.folder?`<div class="v-folder">📁 ${esc(item.folder)}</div>`:''}<div class="v-meta">${state.sort==='manual'&&Number.isInteger(item.manualOrder)?'#'+item.manualOrder+' • ':''}${typeLabel(item)} • ${formatBytes(item.size)} • ${formatTime(item.updatedAt)}</div>${state.view==='details'?`<div class="v-details">تاريخ الإضافة: ${formatTime(item.createdAt)}<br>آخر تعديل: ${formatTime(item.updatedAt)}<br>آخر فتح: ${item.lastOpenedAt?formatTime(item.lastOpenedAt):'لم يُفتح بعد'}</div>`:''}<div class="v-item-actions">${state.sort==='manual'&&state.filter.startsWith('folder:')?`<button class="v-drag-handle" data-vault-drag="${esc(item.id)}" title="اسحب لتغيير ترتيب الصور والملفات" aria-label="اسحب لترتيب ${esc(item.name)}">⠿ سحب</button>`:'' }<button onclick="DocumentVault.${action}('${item.id}')">${caption}</button><button onclick="DocumentVault.printItem('${item.id}')">طباعة</button><button onclick="DocumentVault.saveItem('${item.id}')">حفظ</button><button class="${item.favorite?'favorite-on':''}" onclick="DocumentVault.toggleFavorite('${item.id}')">${item.favorite?'★':'☆'}</button><button onclick="DocumentVault.moveItem('${item.id}')">نقل</button><button onclick="DocumentVault.copyItem('${item.id}')">نسخ</button><button onclick="DocumentVault.cutItem('${item.id}')">قص</button><button onclick="DocumentVault.reorderItem('${item.id}')">ترتيب</button><button onclick="DocumentVault.renameItem('${item.id}')">تسمية</button><button onclick="DocumentVault.shareItem('${item.id}')">مشاركة</button><button class="danger" onclick="DocumentVault.deleteItem('${item.id}')">حذف</button></div></article>`}).join(''):'<div class="v-empty">لا توجد نتائج. ارفع صوراً أو كتباً أو ملفات من الأيقونات في الأعلى.</div>'
}
function toggleFileSelection(id,selected){const item=findItem(id);if(!item||item.deleted)return;if(selected)state.selectedIds.add(id);else state.selectedIds.delete(id);if($('vSelectedCount'))$('vSelectedCount').textContent=state.selectedIds.size+' محددة'}
function selectVisibleFiles(){if(!requireVault('vaultView')||state.filter==='trash')return;for(const item of visibleItems())state.selectedIds.add(item.id);render()}
function clearFileSelection(){state.selectedIds.clear();render()}
function setFilter(filter){state.filter=filter;if(filter==='trash'){void refresh().catch(()=>{});return}if(filter.startsWith('folder:')){state.sort='manual';localStorage.setItem(SORT_KEY,'manual');if($('vSort'))$('vSort').value='manual'}render()}
function setSort(sort){state.sort=sort;localStorage.setItem(SORT_KEY,sort);render()}
function setView(view){state.view=['grid','list','large','details'].includes(view)?view:'grid';localStorage.setItem(VIEW_KEY,state.view);render()}
function createFolder(){if(!requireVault('vaultFolders'))return;let name=prompt('اسم المجلد الجديد:');if(!name||!name.trim())return;let folders=readFolders();name=niceName(name);if(!folders.includes(name))folders.push(name);localStorage.setItem('abuBassamVaultFoldersV5',JSON.stringify(folders));state.filter='folder:'+name;render();alert('تم إنشاء الحافظة «'+name+'» ✓')}
function readFolders(){try{return [...new Set([...SYSTEM_FOLDERS,...JSON.parse(localStorage.getItem('abuBassamVaultFoldersV5')||'[]')])]}catch(e){return SYSTEM_FOLDERS.slice()}}
function numberedName(name,position){
  const cleaned=niceName(name).replace(/^\d{3,}\s*[-_]\s*/,'');
  return String(position).padStart(3,'0')+'_'+cleaned
}
function planFolderNumbering(rows,folder,revisions){
  const list=folderEntries(rows,folder);
  if(list.length!==revisions.size)throw new Error('VAULT_STALE_FOLDER');
  if(list.some(row=>String(row.syncRevision||'')!==revisions.get(row.id)))throw new Error('VAULT_STALE_FOLDER');
  const now=new Date().toISOString();
  return list.map((item,index)=>({
    ...item,name:numberedName(item.name,index+1),manualOrder:index+1,updatedAt:now,
    syncRevision:uuid(),syncState:'pending'
  })).filter((item,index)=>item.name!==list[index].name||item.manualOrder!==list[index].manualOrder)
}
async function commitFolderNumbering(folder,revisions){
  const db=await openDb(),scope=syncScope(),id=uuid(),createdAt=Date.now();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction([STORE,CHECKPOINT_STORE],'readwrite'),store=tx.objectStore(STORE),checkpoints=tx.objectStore(CHECKPOINT_STORE),req=store.getAll();
    let reason=null,changed=0;
    req.onsuccess=()=>{
      try{
        const rows=req.result||[],patches=planFolderNumbering(rows,folder,revisions);
        changed=patches.length;
        if(patches.length){
          const byId=new Map(rows.map(item=>[item.id,item]));
          const snapshot=patches.map(next=>{const original=byId.get(next.id);return{id:next.id,name:original.name,manualOrder:original.manualOrder,expectedRevision:next.syncRevision}});
          // The metadata recovery point and renamed rows commit together, or neither does.
          checkpoints.add({id,scope,kind:'folder-numbering',folder,createdAt,expiresAt:createdAt+CHECKPOINT_MS,items:snapshot});
          for(const item of patches)store.put(item)
        }
      }catch(e){reason=e;tx.abort()}
    };
    req.onerror=()=>{reason=req.error;tx.abort()};
    tx.oncomplete=()=>resolve(changed);
    tx.onerror=()=>reject(reason||tx.error||new Error('VAULT_RENUMBER_FAILED'));
    tx.onabort=()=>reject(reason||tx.error||new Error('VAULT_RENUMBER_ABORTED'))
  })
}
async function checkpointList(){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const req=db.transaction(CHECKPOINT_STORE,'readonly').objectStore(CHECKPOINT_STORE).getAll();
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=()=>reject(req.error||new Error('VAULT_CHECKPOINT_READ_FAILED'))
  })
}
async function purgeExpiredCheckpoints(){
  const db=await openDb(),now=Date.now();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(CHECKPOINT_STORE,'readwrite'),store=tx.objectStore(CHECKPOINT_STORE),req=store.getAll();
    req.onsuccess=()=>{for(const entry of req.result||[])if(Number(entry.expiresAt)<=now)store.delete(entry.id)};
    req.onerror=()=>tx.abort();
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error||new Error('VAULT_CHECKPOINT_PURGE_FAILED'));
    tx.onabort=()=>reject(tx.error||new Error('VAULT_CHECKPOINT_PURGE_ABORTED'))
  })
}
async function restoreFolderNumberingPoint(checkpointId){
  const db=await openDb(),scope=syncScope(),now=Date.now();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction([STORE,CHECKPOINT_STORE],'readwrite'),store=tx.objectStore(STORE),checkpoints=tx.objectStore(CHECKPOINT_STORE);
    const pointReq=checkpoints.get(checkpointId),rowsReq=store.getAll();
    let point=null,rows=null,processed=false,reason=null;
    const ready=()=>{
      if(processed||point===null||rows===null)return;
      processed=true;
      try{
        if(!point||point.scope!==scope||point.kind!=='folder-numbering'||Number(point.expiresAt)<=now)throw new Error('VAULT_CHECKPOINT_UNAVAILABLE');
        if(!Array.isArray(point.items)||!point.items.length)throw new Error('VAULT_CHECKPOINT_EMPTY');
        const byId=new Map(rows.map(x=>[x.id,x])),nowIso=new Date(now).toISOString();
        // Refuse all restoration when any file has changed or was removed since the checkpoint.
        for(const saved of point.items){
          const current=byId.get(saved.id);
          if(!current||current.deleted||String(current.syncRevision||'')!==String(saved.expectedRevision||''))throw new Error('VAULT_CHECKPOINT_CONFLICT')
        }
        for(const saved of point.items){
          const current=byId.get(saved.id);
          store.put({...current,name:saved.name,manualOrder:saved.manualOrder,updatedAt:nowIso,syncRevision:uuid(),syncState:'pending'})
        }
        checkpoints.delete(checkpointId)
      }catch(e){reason=e;tx.abort()}
    };
    pointReq.onsuccess=()=>{point=pointReq.result||false;ready()};
    rowsReq.onsuccess=()=>{rows=rowsReq.result||[];ready()};
    pointReq.onerror=()=>{reason=pointReq.error;tx.abort()};
    rowsReq.onerror=()=>{reason=rowsReq.error;tx.abort()};
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(reason||tx.error||new Error('VAULT_CHECKPOINT_RESTORE_FAILED'));
    tx.onabort=()=>reject(reason||tx.error||new Error('VAULT_CHECKPOINT_RESTORE_ABORTED'))
  })
}
async function restoreLastFolderNumbering(){
  if(!requireVault('vaultEdit')||!requireVault('vaultRename'))return false;
  if(!state.filter.startsWith('folder:'))return alert('افتح الحافظة المطلوب استعادة ترتيبها أولاً.'),false;
  const folder=state.filter.slice(7);
  try{
    await purgeExpiredCheckpoints();
    const points=(await checkpointList()).filter(x=>x.scope===syncScope()&&x.kind==='folder-numbering'&&x.folder===folder&&Number(x.expiresAt)>Date.now()).sort((a,b)=>b.createdAt-a.createdAt);
    if(!points.length)return alert('لا توجد نقطة استعادة محفوظة لترقيم هذه الحافظة.'),false;
    if(!confirm('استعادة أسماء وترتيب الملفات قبل آخر ترقيم في حافظة «'+folder+'»؟ لن يتم تغيير الصور أو المحتويات.'))return false;
    await restoreFolderNumberingPoint(points[0].id);
    await refresh();
    if(autoSync()&&navigator.onLine)scheduleAutoSync(500);
    logOperation('restore','استعادة آخر ترقيم لحافظة '+folder);
    return true
  }catch(e){alert('تعذرت الاستعادة بسبب تعارض أو انتهاء نقطة الاستعادة: '+String(e?.message||e));return false}
}
async function renumberFolder(){
  if(!requireVault('vaultRename')||!requireVault('vaultEdit'))return false;
  if(!state.filter.startsWith('folder:')){alert('افتح الحافظة التي تريد ترقيم صورها أو ملفاتها أولاً.');return false}
  const folder=state.filter.slice(7),items=folderEntries(state.items,folder);
  if(!items.length)return false;
  if(!confirm('ترقيم '+items.length+' ملف في حافظة «'+folder+'» حسب ترتيبها اليدوي الحالي؟ ستبقى أسماء الملفات الأصلية بعد رقم كل ملف.'))return false;
  const revisions=new Map(items.map(item=>[item.id,String(item.syncRevision||'')]));
  try{
    const changed=await commitFolderNumbering(folder,revisions);
    state.sort='manual';localStorage.setItem(SORT_KEY,'manual');if($('vSort'))$('vSort').value='manual';
    await refresh();logOperation('rename','ترقيم تلقائي لحافظة '+folder,changed+' ملف');
    if(changed&&autoSync()&&navigator.onLine)scheduleAutoSync(500);
    return true
  }catch(e){alert('تعذر الترقيم دون تغيير جزئي للملفات: '+String(e?.message||e));return false}
}
function folderEntries(rows,folder){
  return rows.filter(item=>!item.deleted&&String(item.folder||'')===String(folder||'')).sort((a,b)=>
    (Number.isInteger(a.manualOrder)?a.manualOrder:999999)-(Number.isInteger(b.manualOrder)?b.manualOrder:999999)||
    (Date.parse(b.createdAt||b.updatedAt)||0)-(Date.parse(a.createdAt||a.updatedAt)||0)||
    String(a.id).localeCompare(String(b.id)))
}
function planFolderTransfer(rows,id,destination,kind,position,expectedRevision){
  if(!['copy','move','reorder'].includes(kind))throw new Error('VAULT_ACTION_INVALID');
  const source=rows.find(item=>item.id===id&&!item.deleted);
  if(!source||String(source.syncRevision||'')!==String(expectedRevision||''))throw new Error('VAULT_STALE_ITEM');
  const folder=String(destination||''),oldFolder=String(source.folder||'');
  if(kind==='reorder'&&folder!==oldFolder)throw new Error('VAULT_FOLDER_MISMATCH');
  if(kind==='copy'&&rows.filter(item=>!item.deleted).length>=MAX_ITEMS)throw new Error('VAULT_LIMIT_1000');
  const from=folderEntries(rows,oldFolder),to=folder===oldFolder?from:folderEntries(rows,folder);
  let entry;
  if(kind==='copy'){
    entry={...source,id:uuid(),copyOf:source.id,folder,createdAt:new Date().toISOString(),lastOpenedAt:'',remoteUpdatedAt:'',syncRevision:uuid(),syncState:'pending'};
  }else{
    const index=from.findIndex(item=>item.id===id);
    if(index<0)throw new Error('VAULT_ITEM_NOT_FOUND');
    entry=from.splice(index,1)[0];
  }
  if(!Number.isSafeInteger(position)||position<1||position>to.length+1)throw new Error('VAULT_POSITION_INVALID');
  to.splice(position-1,0,entry);
  const changed=new Map(),now=new Date().toISOString();
  for(const [items,targetFolder] of (from===to?[[to,folder]]:kind==='copy'?[[to,folder]]:[[from,oldFolder],[to,folder]])){
    items.forEach((item,index)=>{
      const order=index+1,requires=item.id===entry.id||item.manualOrder!==order||String(item.folder||'')!==targetFolder;
      if(requires)changed.set(item.id,{...item,folder:targetFolder,manualOrder:order,syncRevision:uuid(),syncState:'pending',updatedAt:now})
    })
  }
  return [...changed.values()]
}
async function commitFolderTransfer(id,destination,kind,position,expectedRevision){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    let tx,reason=null;
    try{
      tx=db.transaction(STORE,'readwrite');
      const store=tx.objectStore(STORE),request=store.getAll();
      request.onsuccess=()=>{
        try{
          const revisions=planFolderTransfer(request.result||[],id,destination,kind,position,expectedRevision);
          for(const row of revisions)store.put(row)
        }catch(error){reason=error;try{tx.abort()}catch(_){reject(error)}}
      };
      request.onerror=()=>{reason=request.error;try{tx.abort()}catch(_){reject(reason)}};
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(reason||tx.error||new Error('VAULT_TRANSFER_FAILED'));
      tx.onabort=()=>reject(reason||tx.error||new Error('VAULT_TRANSFER_ABORTED'))
    }catch(error){try{tx?.abort()}catch(_){}reject(error)}
  })
}
function folderOption(current){
  const labels=[...new Set([...readFolders(),...state.items.map(item=>String(item.folder||'')).filter(Boolean)])];
  const answer=prompt('إلى أي حافظة؟ اكتب اسم الحافظة (يمكن إنشاء اسم جديد).\\nالحافظات: '+labels.join('، ')+'\\nاتركه فارغًا للملفات العامة.',String(current||''));
  if(answer===null)return null;
  return answer.trim()?niceName(answer.trim()).slice(0,120):''
}
async function organizeItem(id,kind,destination,positionOverride=null){
  const permission=kind==='copy'?'vaultAdd':'vaultMove';
  if(!requireVault(permission)||!requireVault('vaultEdit'))return false;
  const item=findItem(id);
  if(!item||item.deleted)return false;
  const folder=destination===undefined?(kind==='reorder'?String(item.folder||''):folderOption(item.folder)):String(destination||'');
  if(folder===null)return false;
  const total=folderEntries(state.items,folder).length;
  const maximum=kind==='reorder'?total:kind==='copy'?total+1:total+(folder===String(item.folder||'')?0:1);
  let position=positionOverride;
  if(position===null){
    const answer=prompt('ترتيب الملف داخل حافظة «'+(folder||'العامة')+'»: اكتب رقم الموضع من 1 إلى '+maximum+'.',String(maximum));
    if(answer===null)return false;
    if(!/^\d+$/.test(answer.trim())){alert('أدخل رقم ترتيب صحيحًا.');return false}
    position=Number(answer.trim())
  }
  if(!Number.isSafeInteger(position)||position<1||position>maximum){alert('رقم الترتيب خارج حدود الحافظة.');return false}
  try{
    await commitFolderTransfer(id,folder,kind,position,item.syncRevision);
    if(folder){const names=readFolders();if(!names.includes(folder))localStorage.setItem('abuBassamVaultFoldersV5',JSON.stringify([...names,folder]))}
    state.filter=folder?'folder:'+folder:'all';
    state.sort='manual';
    localStorage.setItem(SORT_KEY,'manual');
    if($('vSort'))$('vSort').value='manual';
    await refresh();
    logOperation(kind==='copy'?'copy':'move',kind==='copy'?'نسخ ملف بين الحافظات':kind==='reorder'?'إعادة ترتيب ملف داخل الحافظة':'نقل ملف بين الحافظات',item.name+' ← '+(folder||'العامة')+' #'+position);
    if(autoSync()&&navigator.onLine)scheduleAutoSync(500);
    return true
  }catch(error){alert('تعذرت العملية ولم تُطبّق جزئيًا: '+String(error?.message||error));return false}
}
async function moveItem(id){return organizeItem(id,'move')}
async function reorderItem(id){return organizeItem(id,'reorder')}
async function reorderByDrop(sourceId,targetId){
  if(!state.filter.startsWith('folder:')||state.sort!=='manual'||sourceId===targetId)return false;
  const folder=state.filter.slice(7),items=folderEntries(state.items,folder);
  const source=items.findIndex(item=>item.id===sourceId),target=items.findIndex(item=>item.id===targetId);
  if(source<0||target<0)return false;
  return organizeItem(sourceId,'reorder',folder,target+1)
}
function bindTouchReorder(){
  const grid=$('vGrid');if(!grid||grid.dataset.dragReady)return;
  grid.dataset.dragReady='true';
  let gesture=null;
  const clear=()=>{
    grid.querySelectorAll('.drag-source,.drag-drop-target').forEach(el=>el.classList.remove('drag-source','drag-drop-target'));
    if(gesture){try{grid.releasePointerCapture(gesture.pointerId)}catch(_){}}
    gesture=null
  };
  grid.addEventListener('pointerdown',event=>{
    const handle=event.target?.closest?.('[data-vault-drag]');
    if(!handle||!state.filter.startsWith('folder:')||state.sort!=='manual')return;
    event.preventDefault();
    gesture={pointerId:event.pointerId,sourceId:handle.dataset.vaultDrag,targetId:'',x:event.clientX,y:event.clientY,moved:false};
    try{grid.setPointerCapture(event.pointerId)}catch(_){}
    handle.closest('.v-item')?.classList.add('drag-source')
  });
  grid.addEventListener('pointermove',event=>{
    if(!gesture||gesture.pointerId!==event.pointerId)return;
    event.preventDefault();
    if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>6)gesture.moved=true;
    if(!gesture.moved)return;
    const hit=document.elementFromPoint(event.clientX,event.clientY)?.closest?.('[data-vault-item]');
    const targetId=hit?.dataset.vaultItem||'';
    gesture.targetId=targetId&&targetId!==gesture.sourceId?targetId:'';
    grid.querySelectorAll('.drag-drop-target').forEach(el=>el.classList.remove('drag-drop-target'));
    if(gesture.targetId)hit.classList.add('drag-drop-target')
  });
  grid.addEventListener('pointerup',event=>{
    if(!gesture||gesture.pointerId!==event.pointerId)return;
    const {sourceId,targetId,moved}=gesture;clear();
    if(moved&&targetId)void reorderByDrop(sourceId,targetId)
  });
  grid.addEventListener('pointercancel',clear);
  grid.addEventListener('lostpointercapture',clear)
}
function copyItem(id){
  if(!requireVault('vaultView')||!requireVault('vaultAdd')||!requireVault('vaultEdit'))return;
  const item=findItem(id);if(!item||item.deleted)return;
  state.clipboard={id,revision:String(item.syncRevision||''),scope:syncScope(),mode:'copy',name:item.name};
  render()
}
function cutItem(id){
  if(!requireVault('vaultView')||!requireVault('vaultMove')||!requireVault('vaultEdit'))return;
  const item=findItem(id);if(!item||item.deleted)return;
  state.clipboard={id,revision:String(item.syncRevision||''),scope:syncScope(),mode:'cut',name:item.name};
  render()
}
async function pasteToFolder(){
  const clip=state.clipboard;
  if(!clip){alert('اختر «نسخ» أو «قص» من الملف أولًا.');return false}
  if(clip.scope!==syncScope()){state.clipboard=null;alert('لا يمكن اللصق بعد تبديل حساب المكتبة أو الجهاز.');return false}
  const item=findItem(clip.id);
  if(!item||item.deleted||String(item.syncRevision||'')!==clip.revision){state.clipboard=null;alert('تغيّر الملف بعد نسخه أو قصه. أعد تحديده.');return false}
  const destination=state.filter.startsWith('folder:')?state.filter.slice(7):folderOption(item.folder);
  if(destination===null)return false;
  const pasted=await organizeItem(item.id,clip.mode==='cut'?'move':'copy',destination);
  if(pasted&&clip.mode==='cut')state.clipboard=null;
  if(pasted)render();
  return pasted
}
async function toggleFavorite(id){if(!requireVault('vaultFavorite'))return;let item=findItem(id);if(!item)return;item.favorite=!item.favorite;item.updatedAt=new Date().toISOString();item.syncState='pending';await dbPut(item);await refresh()}
function pickImages(){if(!requireVault('vaultAdd'))return;state.uploadFolder='';$('vImageInput').value='';$('vImageInput').click()}
function pickFiles(){if(!requireVault('vaultAdd'))return;state.uploadFolder='';$('vFileInput').value='';$('vFileInput').click()}
function pickCollection(folder){if(!requireVault('vaultAdd'))return;state.uploadFolder=SYSTEM_FOLDERS.includes(folder)?folder:'';$('vFileInput').value='';$('vFileInput').click()}
function pickIntoFolder(kind){if(!requireVault('vaultAdd'))return;if(!state.filter.startsWith('folder:'))return alert('افتح الحافظة المطلوبة أولًا من شريط الحافظات.');state.uploadFolder=state.filter.slice(7);const input=$(kind==='image'?'vImageInput':'vFileInput');if(!input)return;input.value='';input.click()}
function pickBackup(){if(!requireVault('vaultRestoreBackup'))return;$('vBackupInput').value='';$('vBackupInput').click()}

function newVaultItem(name,blob,category,id,folder=''){let now=new Date().toISOString();return{id:id||uuid(),name:niceName(name),category,mime:fileMime(name,blob.type),size:blob.size,createdAt:now,updatedAt:now,folder:folder||'',favorite:false,lastOpenedAt:'',blob,syncRevision:uuid(),syncState:'pending',deleted:false}}
async function addBlob(name,blob,category,id,folder=''){const item=newVaultItem(name,blob,category,id,folder);await dbPutBatch([item]);return item}
function previousVersionName(name){
  const text=niceName(name),match=text.match(/^(.*?)(\.[^.]*)?$/),tag=new Date().toISOString().replace(/[:.]/g,'-');
  return (match?.[1]||text)+' (الأصل قبل التعديل '+tag+')'+(match?.[2]||'')
}
async function commitEditedFile(previous,blob,meta,keepOriginal){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    let tx,reason=null;
    try{
      tx=db.transaction(STORE,'readwrite');
      const store=tx.objectStore(STORE),request=store.get(previous.id),all=keepOriginal?store.getAll():null;
      let current=null,rows=null,handled=false;
      const commit=()=>{
        if(handled||current===null||(keepOriginal&&rows===null))return;
        handled=true;
        try{
          if(!current||current.deleted||String(current.syncRevision||'')!==String(previous.syncRevision||''))
            throw new Error('VAULT_STALE_ITEM');
          if(keepOriginal&&rows.filter(item=>!item.deleted).length>=MAX_ITEMS)
            throw new Error('VAULT_LIMIT_1000');
          if(keepOriginal){
            const original=newVaultItem(previousVersionName(current.name),current.blob,current.category,undefined,current.folder);
            original.originalOf=current.id;
            original.favorite=current.favorite;
            original.mime=current.mime;
            original.size=current.size;
            store.add(original)
          }
          store.put({...current,name:niceName(meta.name||current.name),mime:String(meta.mime||blob.type||current.mime),
            category:meta.category||current.category,blob,size:blob.size,updatedAt:new Date().toISOString(),
            syncState:'pending',syncRevision:uuid()})
        }catch(error){reason=error;try{tx.abort()}catch(_){reject(error)}}
      };
      request.onsuccess=()=>{current=request.result||false;commit()};
      request.onerror=()=>{reason=request.error;try{tx.abort()}catch(_){reject(reason)}};
      if(all){
        all.onsuccess=()=>{rows=all.result||[];commit()};
        all.onerror=()=>{reason=all.error;try{tx.abort()}catch(_){reject(reason)}}
      }
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(reason||tx.error||new Error('تعذر حفظ التعديل'));
      tx.onabort=()=>reject(reason||tx.error||new Error('أُلغي الحفظ: الملف تغيّر أو تجاوز الأرشيف حد السعة'))
    }catch(error){try{tx?.abort()}catch(_){}reject(error)}
  })
}
async function saveEditedBlob(id,blob,meta={}){
  const required=meta.image?'vaultImageEdit':'vaultEdit';
  if(!requireVault(required))return false;
  const currentItem=findItem(id);
  if(!currentItem||currentItem.deleted||!currentItem.blob||!blob)return false;
  const previous={...currentItem}; // Stable revision while prompts and async DB reads run.
  if(blob.size<1||blob.size>100*1024*1024)return alert('يجب ألا يتجاوز حجم الملف المعدل 100 ميغابايت.'),false;
  const mode=prompt('طريقة حفظ التعديل:\\n1 - الاحتفاظ بالنسخة الأصلية كملف مستقل\\n2 - استبدال الملف الحالي فقط\\nإلغاء: عدم حفظ أي تغيير','1');
  if(mode===null)return false;
  if(mode.trim()!=='1'&&mode.trim()!=='2')return alert('اختر 1 أو 2 فقط.'),false;
  const keepOriginal=mode.trim()==='1';
  if(keepOriginal&&(await dbAll()).filter(x=>!x.deleted).length>=MAX_ITEMS)return alert('وصل الأرشيف إلى حد 1000 ملف؛ لا توجد مساحة لنسخة أصلية جديدة.'),false;
  try{
    await commitEditedFile(previous,blob,meta,keepOriginal);
    try{await refresh()}catch(_){setSyncStatus('التعديل محفوظ • أعد فتح القسم لتحديث العرض')}
    logOperation('edit','تحرير ملف محفوظ',keepOriginal?'تم الاحتفاظ بالأصل كملف مستقل':'تم استبدال الملف الحالي',previous.name);
    if(autoSync()&&navigator.onLine)scheduleAutoSync(500);
    return true
  }catch(e){alert('لم تُحفظ التعديلات: '+(e?.message||e));return false}
}
function pickRevisedFile(id){
  if(!requireVault('vaultEdit'))return;
  const item=findItem(id);if(!item||item.deleted)return;
  state.replaceId=id;
  const picker=$('vReplaceInput');if(!picker)return alert('اختيار الملف المعدل غير جاهز.');
  picker.value='';
  picker.click()
}
async function replaceFromDevice(file){
  const id=state.replaceId;state.replaceId='';
  if(!id||!file)return false;
  const old=findItem(id);if(!old)return false;
  const category=String(file.type||'').startsWith('image/')?'image':'file';
  return saveEditedBlob(id,file,{name:file.name||old.name,mime:fileMime(file.name,file.type),category,image:false})
}
function editActive(){if(!activeId)return;const item=findItem(activeId);if(!item)return;if(isImage(item))editItem(activeId);else if(textEditable(item))editTextItem(activeId);else{alert('لملفات Word وExcel وPDF: افتح الملف في التطبيق المناسب عن طريق الحفظ أو المشاركة، ثم اختر النسخة المعدلة لإعادتها إلى الأرشيف.');pickRevisedFile(activeId)}}
async function editTextItem(id){
  if(!requireVault('vaultEdit'))return;
  const item=findItem(id);if(!item||!textEditable(item))return;
  if(item.blob.size>5*1024*1024)return alert('التحرير النصي الداخلي متاح حتى 5 ميغابايت. استخدم تطبيقاً خارجياً للملفات الأكبر.');
  state.editTextId=id;
  $('vTextEditTitle').textContent='تحرير: '+item.name;
  $('vTextEdit').value=await item.blob.text();
  showModal('vTextEditModal')
}
async function saveTextEdit(){
  const id=state.editTextId,item=findItem(id);
  if(!item||!textEditable(item))return;
  const blob=new Blob([$('vTextEdit').value],{type:item.mime||'text/plain'});
  if(await saveEditedBlob(id,blob,{name:item.name,mime:item.mime||'text/plain'})){state.editTextId='';closeModal('vTextEditModal')}
}

async function addFiles(fileList,category,input){
  const files=[...(fileList||[])];if(!files.length)return false;
  if(state.uploading){alert('جاري حفظ دفعة أخرى. انتظر اكتمالها قبل إضافة ملفات جديدة.');if(input)input.value='';return false}
  state.uploading=true;setBusy(true,'جاري حفظ الملفات بأسمائها الأصلية...');
  let committed=false;
  try{
    const saved=await dbAll(),count=saved.filter(item=>!item.deleted).length,room=MAX_ITEMS-count;
    if(files.length>room)throw new Error(room<=0?'وصل الأرشيف إلى الحد الأقصى: 1000 عنصر':`المتاح ${room} فقط من أصل ${files.length}. لم يُحفظ أي ملف.`);
    const folder=state.uploadFolder;
    const records=files.map(file=>newVaultItem(file.name,file,category,undefined,folder));
    await dbPutBatch(records); // IndexedDB transaction is all-or-nothing on quota, abort or duplicate ID.
    committed=true;
    state.filter=folder?'folder:'+folder:category==='image'?'image':'all';
    await refresh();
    logOperation('upload',folder?'رفع إلى '+folder:category==='image'?'رفع صور إلى الأرشيف':'رفع ملفات إلى الأرشيف',records.length+' عنصر');
    setSyncStatus('تم الحفظ محلياً • بانتظار المزامنة');
    if(autoSync()&&navigator.onLine)scheduleAutoSync(700);
    return true
  }catch(e){
    if(committed){setSyncStatus('الملفات محفوظة محلياً • تعذر تحديث العرض');alert('حُفظت الدفعة داخل الأرشيف، لكن تعذر تحديث عرضها. أعد فتح القسم. '+(e?.message||e));return true}
    alert('لم تُحفظ الدفعة: '+(e?.message||e));
    return false
  }finally{state.uploading=false;setBusy(false);state.uploadFolder='';if(input)input.value=''}
}
function findItem(id){return state.items.find(item=>item.id===id)}
async function blobDataUrl(blob){return new Promise((resolve,reject)=>{let reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)})}
function saveData(name,mime,data){if(window.Android&&Android.saveBase64)return Android.saveBase64(name,mime,data);let a=document.createElement('a');a.href=data;a.download=name;a.click()}
function shareData(name,mime,data){if(window.Android&&Android.shareBase64)return Android.shareBase64(name,mime,data);saveData(name,mime,data)}
async function saveItem(id){if(!requireVault('vaultExport'))return;let item=findItem(id);if(!item||!item.blob)return;setBusy(true,'تجهيز الملف للحفظ...');try{saveData(item.name,item.mime,await blobDataUrl(item.blob));logOperation('save','حفظ ملف من الأرشيف: '+item.name,formatBytes(item.size))}finally{setBusy(false)}}
async function shareItem(id){if(!requireVault('vaultShare'))return;let item=findItem(id);if(!item||!item.blob)return;setBusy(true,'تجهيز الملف للمشاركة...');try{shareData(item.name,item.mime,await blobDataUrl(item.blob));logOperation('share','مشاركة ملف','',item.name)}finally{setBusy(false)}}
let activeId='';
async function openItem(id){if(!requireVault('vaultView'))return;
  let item=findItem(id);if(!item)return;activeId=id;item.lastOpenedAt=new Date().toISOString();await dbPut(item);$('vViewTitle').textContent=item.name;let view=$('vView');view.innerHTML='';$('vGalleryButton').textContent=isImage(item)?'حفظ في المعرض':'حفظ في الجهاز';
  let url=viewObjectUrl(item.blob),e=ext(item.name);
  if(isImage(item))view.innerHTML=`<img src="${url}" alt="${esc(item.name)}">`;
  else if(e==='pdf')view.innerHTML=`<iframe src="${url}"></iframe>`;
  else if(['txt','csv','json','xml','html'].includes(e)){let pre=document.createElement('pre');pre.textContent=await item.blob.text();view.appendChild(pre)}
  else view.innerHTML=`<div style="text-align:center;padding:25px"><div style="font-size:64px">${fileIcon(item)}</div><b>${esc(item.name)}</b><p style="font-size:10px;color:#ccc">الملف محفوظ بأمان. استخدم «حفظ نسخة» لفتحه بتطبيق Word أو Excel أو التطبيق المناسب.</p></div>`;
  showModal('vViewModal');logOperation('open','فتح: '+item.name,isImage(item)?'صورة':'ملف')
}
function saveActive(){if(activeId)saveItem(activeId)}
function shareActive(){if(activeId)shareItem(activeId)}
async function imagePdfData(item,data){if(!window.jspdf)throw new Error('محرك PDF غير جاهز');let image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=data});let doc=new jspdf.jsPDF({unit:'mm',format:'a4'}),iw=190,ih=iw*image.naturalHeight/image.naturalWidth;if(ih>277){ih=277;iw=ih*image.naturalWidth/image.naturalHeight}doc.addImage(data,item.mime==='image/png'?'PNG':'JPEG',(210-iw)/2,(297-ih)/2,iw,ih);return doc.output('datauristring')}
async function saveGalleryItem(id){if(!requireVault('vaultSaveGallery'))return;let item=findItem(id);if(!item||!item.blob)return;if(!isImage(item))return saveItem(id);setBusy(true,'تجهيز الصورة للمعرض...');try{let data=await blobDataUrl(item.blob);if(window.Android&&Android.saveToGallery)Android.saveToGallery(item.name,item.mime,data);else saveData(item.name,item.mime,data);logOperation('gallery','حفظ في المعرض: '+item.name,formatBytes(item.size))}finally{setBusy(false)}}
async function savePdfItem(id){if(!requireVault('vaultSavePdf'))return;let item=findItem(id);if(!item||!item.blob)return;setBusy(true,'تجهيز PDF...');try{let data=await blobDataUrl(item.blob),e=ext(item.name),name=item.name.replace(/\.[^.]+$/,'')+'.pdf';if(e==='pdf')saveData(name,'application/pdf',data);else if(isImage(item))saveData(name,'application/pdf',await imagePdfData(item,data));else if(['txt','csv','json','xml','html'].includes(e)){let text=await item.blob.text(),html=`<!doctype html><html dir="auto"><head><meta charset="utf-8"><style>@page{size:A4;margin:15mm}body{font-family:Tahoma,Arial;white-space:pre-wrap;line-height:1.8}</style></head><body>${esc(text)}</body></html>`;if(window.Android&&Android.savePdfHtml)Android.savePdfHtml(name,html);else throw new Error('تحويل النص إلى PDF متاح داخل Android')}else{alert('هذا النوع يُحفظ بصيغته الأصلية. افتحه في Word أو Excel ثم اختر طباعة إلى PDF.');return}logOperation('pdf','حفظ PDF: '+item.name,formatBytes(item.size))}catch(e){alert(e.message||'تعذر إنشاء PDF')}finally{setBusy(false)}}
async function printItem(id){if(!requireVault('vaultPrint'))return;let item=findItem(id);if(!item||!item.blob)return;setBusy(true,'تجهيز الطباعة...');try{let data=await blobDataUrl(item.blob),e=ext(item.name);if(isImage(item)){if(window.Android&&Android.printPages)Android.printPages(JSON.stringify([data]),'A4',0);else throw new Error('الطباعة متاحة داخل Android')}else if(e==='pdf'){if(window.Android&&Android.printBase64)Android.printBase64(item.name,item.mime,data);else throw new Error('الطباعة متاحة داخل Android')}else if(['txt','csv','json','xml','html'].includes(e)){let text=await item.blob.text(),html=`<!doctype html><html dir="auto"><head><meta charset="utf-8"><style>@page{size:A4;margin:15mm}body{font-family:Tahoma,Arial;white-space:pre-wrap;line-height:1.8}</style></head><body>${esc(text)}</body></html>`;if(window.Android&&Android.printHtml)Android.printHtml(html);else throw new Error('الطباعة متاحة داخل Android')}else{alert('سيُفتح خيار مشاركة الملف؛ افتحه في التطبيق المناسب ثم اختر «طباعة».');await shareItem(id);return}logOperation('print','طباعة: '+item.name,formatBytes(item.size))}catch(e){alert(e.message||'تعذرت الطباعة')}finally{setBusy(false)}}
function saveGalleryActive(){if(activeId)saveGalleryItem(activeId)}
function savePdfActive(){if(activeId)savePdfItem(activeId)}
function printActive(){if(activeId)printItem(activeId)}
async function renameItem(id){if(!requireVault('vaultRename'))return;
  let item=findItem(id);if(!item)return;let old=item.name,name=prompt('اكتب الاسم الجديد مع الامتداد:',item.name);if(!name||!name.trim())return;item.name=niceName(name);item.updatedAt=new Date().toISOString();item.syncState='pending';await dbPut(item);await refresh();logOperation('rename','إعادة تسمية ملف',old+' ← '+item.name);if(autoSync()&&navigator.onLine)scheduleAutoSync(500)
}
async function deleteItem(id){if(!requireVault('vaultDelete'))return false;
  const item=findItem(id);
  if(!item||item.deleted||!confirm('نقل «'+item.name+'» إلى سلة المحذوفات لمدة 30 يومًا؟'))return false;
  try{
    await trashFile(item);
    await refresh();
    logOperation('delete','نقل إلى سلة المحذوفات: '+item.name,'استعادة ممكنة خلال 30 يومًا');
    if(autoSync()&&navigator.onLine)scheduleAutoSync(500);
    return true
  }catch(e){alert('تعذر نقل الملف إلى سلة المحذوفات، وبقي الملف دون حذف: '+String(e?.message||e));return false}
}

async function editItem(id){if(!requireVault('vaultImageEdit'))return;
  let item=findItem(id);if(!item||!isImage(item))return;
  let src=objectUrl(item.blob),image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=src});
  state.editor={id,image,l:0,r:100,t:0,b:100,rotate:0,brightness:100,contrast:100};
  resetEditor(false);showModal('vEditModal');drawEditor(false)
}
function readEditorControls(){let e=state.editor;if(!e)return;e.l=+$('vCropL').value;e.r=+$('vCropR').value;e.t=+$('vCropT').value;e.b=+$('vCropB').value;e.rotate=+$('vRotate').value;e.brightness=+$('vBrightness').value;e.contrast=+$('vContrast').value}
function drawEditor(full){
  let e=state.editor;if(!e)return null;readEditorControls();let im=e.image,nw=im.naturalWidth,nh=im.naturalHeight,sx=nw*e.l/100,sy=nh*e.t/100,sw=nw*(e.r-e.l)/100,sh=nh*(e.b-e.t)/100;if(sw<10||sh<10)return null;
  let angle=e.rotate*Math.PI/180,ow=Math.abs(sw*Math.cos(angle))+Math.abs(sh*Math.sin(angle)),oh=Math.abs(sw*Math.sin(angle))+Math.abs(sh*Math.cos(angle)),scale=full?Math.min(1,6000/Math.max(ow,oh)):Math.min(1,1000/Math.max(ow,oh)),canvas=full?document.createElement('canvas'):$('vEditCanvas');
  canvas.width=Math.max(1,Math.round(ow*scale));canvas.height=Math.max(1,Math.round(oh*scale));let ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.filter=`brightness(${e.brightness}%) contrast(${e.contrast}%)`;ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(angle);ctx.drawImage(im,sx,sy,sw,sh,-sw*scale/2,-sh*scale/2,sw*scale,sh*scale);return canvas
}
function editorChanged(){drawEditor(false)}
function resetEditor(draw=true){if(!state.editor)return;Object.assign(state.editor,{l:0,r:100,t:0,b:100,rotate:0,brightness:100,contrast:100});[['vCropL',0],['vCropR',100],['vCropT',0],['vCropB',100],['vRotate',0],['vBrightness',100],['vContrast',100]].forEach(([id,value])=>$(id).value=value);if(draw)drawEditor(false)}
function clarify(){if(!requireVault('vaultEnhance'))return;if(!state.editor)return;$('vBrightness').value=106;$('vContrast').value=128;editorChanged()}
async function saveEditor(){if(!requireVault('vaultImageEdit'))return;
  let canvas=drawEditor(true);if(!canvas)return alert('حدود القص صغيرة جداً');setBusy(true,'حفظ الصورة المعدّلة بدون ضغط ضياعي...');
  try{let blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),item=findItem(state.editor.id);if(!blob||!item)throw new Error('تعذر إنشاء الصورة');const name=item.name.replace(/\.[^.]+$/,'')+'.png';if(await saveEditedBlob(item.id,blob,{name,mime:'image/png',category:'image',image:true}))closeModal('vEditModal')}
  catch(e){alert(e.message||'تعذر حفظ التعديل')}
  finally{setBusy(false)}
}
function editorCanvas(){let canvas=drawEditor(true);if(!canvas)alert('حدود القص صغيرة جداً');return canvas}
function saveEditorGallery(){if(!requireVault('vaultSaveGallery'))return;let canvas=editorCanvas();if(!canvas)return;let data=canvas.toDataURL('image/png'),name='Abu_Bassam_Edited_'+Date.now()+'.png';if(window.Android&&Android.saveToGallery)Android.saveToGallery(name,'image/png',data);else saveData(name,'image/png',data);logOperation('gallery','حفظ الصورة المعدّلة في المعرض')}
async function saveEditorPdf(){if(!requireVault('vaultSavePdf'))return;let canvas=editorCanvas();if(!canvas)return;try{let item={mime:'image/png'},data=canvas.toDataURL('image/png');saveData('Abu_Bassam_Edited_'+Date.now()+'.pdf','application/pdf',await imagePdfData(item,data));logOperation('pdf','حفظ الصورة المعدّلة PDF')}catch(e){alert(e.message||'تعذر إنشاء PDF')}}
function printEditor(){if(!requireVault('vaultPrint'))return;let canvas=editorCanvas();if(!canvas)return;let data=canvas.toDataURL('image/png');if(window.Android&&Android.printPages)Android.printPages(JSON.stringify([data]),'A4',0);else alert('الطباعة متاحة داخل تطبيق Android');logOperation('print','طباعة الصورة المعدّلة')}

function requestNative(mode){try{if(window.ReactNativeWebView&&typeof window.ReactNativeWebView.postMessage==='function'){window.ReactNativeWebView.postMessage(JSON.stringify({type:'openCamera',mode}));return true}}catch(e){}return false}
function openOcr(target='clipboard'){if(!requireVault('vaultOcr'))return;state.ocrTarget=target;$('vOcrLoginBtn').style.display=target==='login'?'block':'none';showModal('vOcrModal')}
function ocrCamera(){if(!requireVault('vaultOcr'))return;if(!requestNative('ocr')){$('vOcrInput').value='';$('vOcrInput').setAttribute('capture','environment');$('vOcrInput').click()}}
function ocrGallery(){if(!requireVault('vaultOcr'))return;$('vOcrInput').removeAttribute('capture');$('vOcrInput').value='';$('vOcrInput').click()}
function ocrFilePicker(){if(!requireVault('vaultOcr'))return;$('vOcrInput').removeAttribute('capture');$('vOcrInput').value='';$('vOcrInput').click()}
async function ocrFile(file){if(!file)return;try{await recognizeText(await blobDataUrl(file))}finally{$('vOcrInput').value=''}}
async function recognizeText(dataUrl){
  if(!dataUrl||!requireVault('vaultOcr'))return false;
  const engine=window.AbuDocumentVaultOfflineOcr;
  if(!engine?.recognize){$('vOcrProgress').textContent='محرك OCR المحلي غير جاهز؛ تحقق من ملفات التطبيق.';return false}
  state.ocrImage=dataUrl;
  showModal('vOcrModal');
  return engine.recognize(dataUrl)
}
function onOcrPhoto(dataUrl){if(dataUrl)recognizeText(dataUrl)}
function clearOcr(){window.AbuDocumentVaultOfflineOcr?.cancel?.();state.ocrImage='';$('vOcrText').value='';$('vOcrImage').removeAttribute('src');$('vOcrImage').style.display='none';$('vOcrProgress').textContent='اختر صورة واضحة لبدء قراءة النص.'}
function copyOcr(){let text=$('vOcrText').value;if(!text)return alert('لا يوجد نص للنسخ');if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(()=>alert('تم نسخ النص ✓')).catch(()=>fallbackCopy());else fallbackCopy()}
function selectOcr(){let area=$('vOcrText');area.focus();area.select()}
function fallbackCopy(){let area=$('vOcrText');area.focus();area.select();document.execCommand('copy');alert('تم نسخ النص ✓')}
function textData(text){return'data:text/plain;charset=utf-8;base64,'+btoa(unescape(encodeURIComponent(text)))}
function shareOcr(){if(!requireVault('vaultShare'))return;let text=$('vOcrText').value.trim();if(!text)return alert('لا يوجد نص للمشاركة');shareData('Abu_Bassam_OCR_'+Date.now()+'.txt','text/plain;charset=utf-8',textData(text));logOperation('share','مشاركة نص OCR')}
async function saveOcrText(){if(!requireVault('vaultExport'))return;let text=$('vOcrText').value.trim();if(!text)return alert('لا يوجد نص للحفظ');await addBlob('نص مستخرج '+new Date().toLocaleDateString('ar-IQ')+'.txt',new Blob([text],{type:'text/plain;charset=utf-8'}),'file');await refresh();logOperation('save','حفظ نص OCR داخل الأرشيف');alert('تم حفظ النص داخل قسم الملفات')}
function useOcrLogin(){let text=$('vOcrText').value;if(window.CardsStudio&&CardsStudio.importOcrText){CardsStudio.importOcrText(text);closeModal('vOcrModal');$('tabCards')&&$('tabCards').click()}else alert('تعذر إرسال النص إلى الكارت')}
function ocrPrintHtml(){let text=$('vOcrText').value.trim();if(!text){alert('لا يوجد نص للطباعة');return''}return `<!doctype html><html dir="auto"><head><meta charset="utf-8"><style>@page{size:A4;margin:15mm}body{font-family:Tahoma,Arial;white-space:pre-wrap;line-height:1.9;font-size:13pt}</style></head><body>${esc(text)}</body></html>`}
function saveOcrPdf(){if(!requireVault('vaultSavePdf'))return;let html=ocrPrintHtml();if(!html)return;let name='Abu_Bassam_OCR_'+Date.now()+'.pdf';if(window.Android&&Android.savePdfHtml)Android.savePdfHtml(name,html);else alert('حفظ PDF متاح داخل تطبيق Android');logOperation('pdf','حفظ نص OCR بصيغة PDF')}
function saveOcrWithImage(){if(!requireVault('vaultSavePdf'))return;let text=$('vOcrText').value.trim();if(!text||!state.ocrImage)return alert('أضف صورة واستخرج النص أولاً');let html=`<!doctype html><html dir="auto"><head><meta charset="utf-8"><style>@page{size:A4;margin:12mm}body{font-family:Cairo,Tahoma,Arial;line-height:1.8}img{display:block;max-width:100%;max-height:125mm;object-fit:contain;margin:0 auto 8mm}pre{white-space:pre-wrap;direction:auto;border-top:1px solid #bbb;padding-top:5mm}</style></head><body><img src="${state.ocrImage}"><pre>${esc(text)}</pre></body></html>`;if(window.Android&&Android.savePdfHtml)Android.savePdfHtml('Abu_Bassam_OCR_Image_Text_'+Date.now()+'.pdf',html);else alert('الحفظ متاح داخل تطبيق Android');logOperation('pdf','حفظ نص OCR مع الصورة')}
function reOcr(){if(!requireVault('vaultOcr'))return;if(!state.ocrImage)return alert('اختر صورة أولاً');recognizeText(state.ocrImage)}
function printOcr(){if(!requireVault('vaultPrint'))return;let html=ocrPrintHtml();if(!html)return;if(window.Android&&Android.printHtml)Android.printHtml(html);else alert('الطباعة متاحة داخل تطبيق Android');logOperation('print','طباعة النص المستخرج OCR')}

function backupService(){const service=window.AbuDocumentVaultHardening;if(!service?.backup||!service?.restore)throw new Error('خدمة النسخ والاستعادة الآمنة غير جاهزة. أعد فتح التطبيق.');return service}
async function backup(mode='save'){if(!requireVault('vaultBackup'))return false;try{return await backupService().backup(mode)}catch(e){alert(String(e?.message||e));return false}}
async function encryptedBackup(){if(!requireVault('vaultEncryptedBackup'))return false;try{return await backupService().encryptedBackup()}catch(e){alert(String(e?.message||e));return false}}
async function restoreBackup(file,options={}){if(!file||!requireVault('vaultRestoreBackup'))return false;try{return await backupService().restore(file,options)}catch(e){alert(String(e?.message||e));return false}}


let otherBranchRows=[],otherBranchActive=null,otherBranchUrl='',otherBranchScope='',otherBranchRequest=0;
function closeOtherBranches(){
  otherBranchRequest++;
  if(otherBranchUrl){try{URL.revokeObjectURL(otherBranchUrl)}catch(_){}otherBranchUrl=''}
  otherBranchRows=[];otherBranchActive=null;otherBranchScope='';
  const modal=$('vOtherBranchModal');if(modal)modal.classList.remove('show');
  const save=$('vOtherBranchSave');if(save)save.style.display='none'
}
async function openOtherBranches(){
  if(!requireVault('vaultView')||!vaultOwner()||!vaultAllowed('vaultViewOtherBranches'))return false;
  if(!sessionOk()||!navigator.onLine){alert('تحتاج هذه القائمة إلى اتصال سحابي موثّق. ملفات هذا الجهاز المحلية محفوظة دون إنترنت.');return false}
  const gateway=window.AbuBassamBranchVault;
  if(!gateway?.ownerList){alert('عارض أرشيف الفروع غير متاح في هذه النسخة.');return false}
  closeOtherBranches();
  otherBranchScope=syncScope();
  const request=++otherBranchRequest;
  showModal('vOtherBranchModal');
  $('vOtherBranchFiles').textContent='جاري جلب قائمة ملفات الفروع...';
  $('vOtherBranchPreview').textContent='اختر ملفاً لمعاينته.';
  try{
    const rows=await gateway.ownerList(5000);
    if(request!==otherBranchRequest||syncScope()!==otherBranchScope||!vaultOwner()||!vaultScopeOk(false))throw new Error('VAULT_SCOPE_CHANGED');
    otherBranchRows=rows;
    $('vOtherBranchFiles').innerHTML=rows.length?rows.map((row,index)=>
      '<button type="button" class="v-tab" style="white-space:normal;text-align:right" onclick="DocumentVault.openOtherBranchFile('+index+')">'+
      '📁 '+esc(row.branch_name||row.branch_device_id)+' — '+esc(row.data?.name||row.client_id)+
      ' <small>('+esc(formatBytes(row.data?.size||0))+' • '+esc(formatTime(row.updated_at))+')</small></button>'
    ).join(''):'لا توجد ملفات سحابية ظاهرة في فروع هذا الحساب.';
    return true
  }catch(e){
    if(request===otherBranchRequest&&$('vOtherBranchModal')?.classList.contains('show'))$('vOtherBranchFiles').textContent='تعذر تحميل الأرشيف: '+String(e?.message||e);
    return false
  }
}
async function openOtherBranchFile(index){
  if(!vaultOwner()||!vaultScopeOk(false)||!vaultAllowed('vaultViewOtherBranches')||otherBranchScope!==syncScope())return false;
  const row=otherBranchRows[index],gateway=window.AbuBassamBranchVault,request=++otherBranchRequest;
  if(!row||!gateway?.ownerDownload)return false;
  const preview=$('vOtherBranchPreview');
  if(otherBranchUrl){try{URL.revokeObjectURL(otherBranchUrl)}catch(_){}otherBranchUrl=''}
  otherBranchActive=null;
  $('vOtherBranchSave').style.display='none';
  preview.textContent='جاري تنزيل نسخة للمعاينة فقط...';
  try{
    const result=await gateway.ownerDownload(row);
    if(request!==otherBranchRequest||!vaultOwner()||otherBranchScope!==syncScope()||!vaultScopeOk(false)||!$('vOtherBranchModal')?.classList.contains('show'))return false;
    otherBranchActive=result;
    const mime=String(result.mime||'').split(';')[0].toLowerCase();
    if(['image/jpeg','image/png','image/webp','image/gif','image/bmp','application/pdf'].includes(mime)){
      const safeBlob=new Blob([result.blob],{type:mime});
      otherBranchUrl=URL.createObjectURL(safeBlob);
      preview.innerHTML=mime==='application/pdf'?
        '<iframe title="معاينة PDF" style="width:100%;height:65vh;border:0" src="'+esc(otherBranchUrl)+'"></iframe>':
        '<img alt="معاينة مستند" style="max-width:100%;max-height:65vh;object-fit:contain" src="'+esc(otherBranchUrl)+'">';
    }else{
      preview.textContent='الملف '+result.name+' جاهز للتنزيل. هذه الصيغة لا تدعم المعاينة المباشرة.'
    }
    $('vOtherBranchSave').style.display='';
    return true
  }catch(e){if(request===otherBranchRequest)preview.textContent='تعذرت معاينة الملف: '+String(e?.message||e);return false}
}
function saveOtherBranchFile(){
  if(!vaultOwner()||!vaultScopeOk(false)||!vaultAllowed('vaultViewOtherBranches')||!vaultAllowed('vaultExport')||otherBranchScope!==syncScope()||!otherBranchActive)return false;
  const file=otherBranchActive,url=URL.createObjectURL(file.blob),anchor=document.createElement('a');
  anchor.href=url;anchor.download=niceName(file.name);document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  return true
}

function cloud(){return window.AbuBassamCloud}
function remoteItem(data,blob,serverUpdatedAt=''){return{id:data.id,name:niceName(data.name),category:data.category==='image'?'image':'file',mime:data.mime||blob.type||'application/octet-stream',size:blob.size,createdAt:data.createdAt||data.updatedAt,updatedAt:data.updatedAt,remoteUpdatedAt:String(serverUpdatedAt||''),folder:data.folder||'',favorite:!!data.favorite,lastOpenedAt:data.lastOpenedAt||'',manualOrder:Number.isInteger(data.manualOrder)?data.manualOrder:null,blob,syncState:'synced',deleted:false}}
async function syncNow(manual=true){if(!requireVault('vaultSync'))return false;
  if(state.syncing){if(!manual)autoSyncRerunRequested=true;return false}
  if(!manual&&!automaticDue())return false;
  const policy=syncPolicy();
  if(policy.wifiOnly&&!wifiVerified()){
    setSyncStatus('بانتظار شبكة Wi‑Fi حسب الإعداد');
    if(manual)alert('المزامنة مضبوطة على Wi‑Fi فقط. اتصل بشبكة Wi‑Fi أو غيّر الإعداد.');
    return false
  }
  if(!navigator.onLine){setSyncStatus('لا يوجد إنترنت • التغييرات محفوظة محلياً');if(manual)alert('لا يوجد اتصال بالإنترنت الآن');return false}
  if(!sessionOk()){setSyncStatus('اربط حسابك لتفعيل المزامنة الآمنة');if(manual&&cloud())cloud().openLogin();return false}
  if(!window.AbuBassamSecurity?.device?.()?.device_id){setSyncStatus('يلزم اعتماد الجهاز قبل المزامنة');return false}
  state.syncing=true;setSyncStatus('جاري رفع التغييرات إلى الحاوية الخاصة...');
  try{
    let deletionConflictsSaved=0;
    const service=cloud(),pending=(await dbAll()).filter(item=>item.syncState==='pending');
    for(const item of pending){
      const row=await service.get('vault',item.id),remote=row?.data||null,remoteVersion=String(row?.updated_at||''),knownVersion=String(item.remoteUpdatedAt||'');
      // A file without a known server baseline must not overwrite an existing remote row.
      const remoteChanged=!!row&&(!knownVersion||remoteVersion!==knownVersion);
      if(remoteChanged){
        if(item.deleted){
          if(remote?.deleted){if(!await dbApplySyncIfUnchanged(item.id,item,null))autoSyncRerunRequested=true;continue}
          if(!remote?.storagePath)throw new Error('بيانات سحابية ناقصة لمسار الملف: '+String(remote?.name||item.name));
          const remoteBlob=await service.downloadVault(remote.storagePath,remoteVersion);
          if(!await dbReconcileRemoteDeletionToTrashIfUnchanged(item,{remoteEdited:remote,remoteBlob,remoteVersion})){
            autoSyncRerunRequested=true
          }else{
            deletionConflictsSaved++;
            autoSyncRerunRequested=true;
            logOperation('sync','حفظ تعديل الجهاز الآخر في سلة المحذوفات قبل الحذف',String(remote.name||item.name))
          }
          continue
        }
        if(remote?.deleted){
          const copy=Object.assign({},item,{id:uuid(),name:niceName(String(item.name||'ملف').replace(/(\.[^.]+)?$/,' (نسخة محلية بعد حذف جهاز آخر)$1')),remoteUpdatedAt:'',updatedAt:new Date().toISOString(),syncState:'pending'});
          if(!await dbApplySyncIfUnchanged(item.id,item,null,copy))autoSyncRerunRequested=true;continue
        }
        if(!remote?.storagePath)throw new Error('بيانات سحابية ناقصة لمسار الملف: '+String(remote?.name||item.name));
        const remoteBlob=await service.downloadVault(remote.storagePath,remoteVersion);
        const localCopy=Object.assign({},item,{id:uuid(),name:niceName(String(item.name||'ملف').replace(/(\.[^.]+)?$/,' (نسخة محلية)$1')),remoteUpdatedAt:'',updatedAt:new Date().toISOString(),syncState:'pending'});
        if(!await dbApplySyncIfUnchanged(item.id,item,remoteItem(remote,remoteBlob,remoteVersion),localCopy))autoSyncRerunRequested=true;
        continue
      }

      if(item.deleted){
        // Persist a new tombstone too: a simultaneous remote create must be rejected, not resurrected.
        // A never-synced local file still gets a server deletion marker for this ID.
        const oldPath=String(remote?.storagePath||'');
        const data={id:item.id,name:item.name,category:item.category,mime:item.mime,size:0,createdAt:item.createdAt,updatedAt:item.updatedAt,folder:item.folder||'',favorite:!!item.favorite,lastOpenedAt:item.lastOpenedAt||'',manualOrder:Number.isInteger(item.manualOrder)?item.manualOrder:null,deleted:true,storagePath:''};
        await service.upsert('vault',item.id,data,remoteVersion||null);
        if(!await dbApplySyncIfUnchanged(item.id,item,null))autoSyncRerunRequested=true;
        if(oldPath)await service.removeVault(oldPath).catch(error=>{try{window.AbuBassamOps?.add?.({type:'failure',title:'تنظيف ملف سحابي مؤجل',details:String(error?.message||error),section:'الحفظ والمستندات'})}catch(_){}});
        continue
      }

      if(!item.blob)throw new Error('ملف محلي بلا محتوى فعلي: '+String(item.name||item.id));
      const oldPath=String(remote?.storagePath||''),newPath=await service.uploadVault(item.id,item.blob,item.mime);
      const data={id:item.id,name:item.name,category:item.category,mime:item.mime,size:item.size,createdAt:item.createdAt,updatedAt:item.updatedAt,folder:item.folder||'',favorite:!!item.favorite,lastOpenedAt:item.lastOpenedAt||'',manualOrder:Number.isInteger(item.manualOrder)?item.manualOrder:null,deleted:false,storagePath:newPath};
      let saved;
      try{saved=await service.upsert('vault',item.id,data,remoteVersion||null)}
      catch(error){await service.removeVault(newPath,true).catch(()=>{});throw error}
      const confirmed=await dbMarkSyncedIfUnchanged(item,saved?.updated_at);
      if(!confirmed)autoSyncRerunRequested=true;
      if(oldPath&&oldPath!==newPath)await service.removeVault(oldPath,true).catch(()=>{})
    }

    setSyncStatus('جاري استقبال تغييرات الأجهزة...');
    const rows=await service.list('vault',10000),local=new Map((await dbAll()).map(item=>[String(item.id),item]));
    for(const row of rows){
      const data=row?.data;if(!data?.id)continue;
      const id=String(data.id),here=local.get(id),remoteVersion=String(row.updated_at||'');
      if(here?.syncState==='pending')continue;
      if(data.deleted){if(here&&!await dbReconcileRemoteDeletionToTrashIfUnchanged(here))autoSyncRerunRequested=true;continue}
      if(here&&String(here.remoteUpdatedAt||'')===remoteVersion)continue;
      if(!data.storagePath)throw new Error('السجل السحابي موجود لكن ملف Storage مفقود: '+String(data.name||id));
      const blob=await service.downloadVault(data.storagePath,remoteVersion);
      if(!await dbApplySyncIfUnchanged(id,here||null,remoteItem(data,blob,remoteVersion)))autoSyncRerunRequested=true
    }
    if(deletionConflictsSaved){
      await refresh();
      setSyncStatus('حُفظت نسخ التعارض في سلة المحذوفات • الحذف بانتظار الرفع');
      return false
    }
    syncSet(LAST_SYNC_KEY,String(Date.now()));
    await refresh();setSyncStatus('المزامنة الآمنة مكتملة بين الأجهزة ✓');
    if(manual)logOperation('sync','مزامنة الأرشيف الآمنة بين الأجهزة',state.items.filter(item=>!item.deleted).length+' عنصر');
    return true
  }catch(error){if(String(error?.message||error).includes('VAULT_VERSION_CONFLICT'))autoSyncRerunRequested=true;setSyncStatus('تعذرت الآن • التغييرات المحلية محفوظة');if(manual)alert('تعذرت المزامنة: '+(error?.message||error));return false}
  finally{state.syncing=false;if(autoSyncRerunRequested){autoSyncRerunRequested=false;scheduleAutoSync(100)}}
}
function onShow(){if(!updateVaultAccessUi())return false;refresh();let last=Number(syncGet(LAST_SYNC_KEY)||0);if(last)setSyncStatus('آخر مرة '+formatTime(last));return true}
async function stats(){let items=state.items.length?state.items:await dbAll(),active=items.filter(item=>!item.deleted);return{count:active.length,bytes:active.reduce((sum,item)=>sum+(Number(item.size)||0),0),images:active.filter(isImage).length,pdf:active.filter(item=>ext(item.name)==='pdf').length}}

const previousNativeResult=window.AbuBassamNativeCameraResult;
window.AbuBassamNativeCameraResult=function(result){if(result&&result.mode==='ocr')return onOcrPhoto(result.dataUrl);if(typeof previousNativeResult==='function')return previousNativeResult(result)};
window.DocumentVault={openOtherBranches,openOtherBranchFile,saveOtherBranchFile,closeOtherBranches,setFilter,setSort,setView,toggleFileSelection,selectVisibleFiles,clearFileSelection,renumberFolder,restoreLastFolderNumbering,restoreTrash,eraseTrash,reorderByDrop,pickIntoFolder,copyItem,cutItem,pasteToFolder,moveItem,reorderItem,saveEditedBlob,editActive,editTextItem,saveTextEdit,pickRevisedFile,createFolder,moveItem,toggleFavorite,pickImages,pickFiles,pickCollection,pickBackup,openItem,editItem,renameItem,deleteItem,saveItem,shareItem,printItem,saveGalleryItem,savePdfItem,saveActive,shareActive,saveGalleryActive,savePdfActive,printActive,closeModal,editorChanged,resetEditor,clarify,saveEditor,saveEditorGallery,saveEditorPdf,printEditor,openOcr,ocrCamera,ocrGallery,ocrFilePicker,clearOcr,copyOcr,selectOcr,shareOcr,saveOcrText,saveOcrPdf,saveOcrWithImage,reOcr,printOcr,useOcrLogin,backup,encryptedBackup,syncNow,setAutoSync,onShow,stats};
window.addEventListener('DOMContentLoaded',build);
})();
