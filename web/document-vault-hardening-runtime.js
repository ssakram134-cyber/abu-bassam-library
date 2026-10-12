(()=>{
'use strict';
if(window.__ABU_DOCUMENT_VAULT_HARDENING_V1__)return;
window.__ABU_DOCUMENT_VAULT_HARDENING_V1__=true;
const DB='AbuBassamDocumentVaultV4',STORE='items',MAX_ITEMS=1000,MAX_BACKUP_RECORDS=2000,MAX_ZIP=120*1024*1024,MAX_TOTAL=500*1024*1024,MAX_FILE=100*1024*1024,ITER=300000;
const MAGIC=new TextEncoder().encode('ABUVLT1\n');let restoreFails=0,restoreLockedUntil=0;
const $=id=>document.getElementById(id);
function device(){const s=window.AbuBassamSecurity?.device?.()||{},d=window.AbuBassamDevices?.ensure?.()||{};return{id:String(s.device_id||s.id||d.device_id||d.id||'').trim(),name:String(s.device_name||s.name||d.device_name||d.name||'هذا الفرع').trim()||'هذا الفرع'}}
function role(){return window.AbuBassamSecurity?.role?.()||''}
function scopeOk(){return window.AbuBassamBranchVault?.localScopeOk?.(false)===true}
function restoreIdentity(){return String(window.AbuBassamCloud?.session?.()?.user?.id||'local')+':'+device().id}function allowed(key){if(!scopeOk())return false;if(role()==='owner')return true;return window.AbuBassamPermissions?.can?.(key)===true}
function nice(v){return String(v||'ملف').replace(/[\\/:*?"<>|\r\n]/g,'_').trim().slice(0,180)||'ملف'}
function openDb(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error||new Error('تعذر فتح الأرشيف'))})}
async function all(){const db=await openDb();return new Promise((res,rej)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
function newWriteRevision(){return globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)}
async function put(item){
 const db=await openDb();
 return new Promise((res,rej)=>{
  const tx=db.transaction(STORE,'readwrite');
  tx.objectStore(STORE).put({...item,_localWriteRev:newWriteRevision()});
  tx.oncomplete=()=>res(true);
  tx.onerror=()=>rej(tx.error||new Error('تعذر حفظ نسخة الأرشيف'));
  tx.onabort=()=>rej(tx.error||new Error('تم إلغاء الحفظ'))
 })
}
function archiveRevisionFingerprint(item){
 return JSON.stringify([
  String(item?._localWriteRev??''),String(item?.updatedAt||''),String(item?.remoteUpdatedAt||''),
  String(item?.name||''),String(item?.folder||''),String(item?.syncState||''),
  !!item?.deleted,String(item?.deletedAt||''),Number(item?.size||0),Number(item?.blob?.size||0)
 ])
}
async function applyAtomic(items,{replaceAll=false,isCurrent=()=>true,expectedBefore=null}={}){
 if(!Array.isArray(expectedBefore))throw new Error('يلزم فحص حالة الأرشيف قبل اعتماد النسخة الاحتياطية.');
 if(!Array.isArray(items)||items.length>MAX_BACKUP_RECORDS)throw new Error('عدد سجلات النسخة غير صالح.');
 if(!isCurrent())throw new Error('تغيّر الحساب أو الفرع قبل كتابة النسخة؛ أُلغيت الاستعادة.');
 const expected=new Map(expectedBefore.map(row=>[String(row.id),archiveRevisionFingerprint(row)]));
 if(expected.size!==expectedBefore.length)throw new Error('الأرشيف يحتوي معرفات مكررة؛ رُفضت الاستعادة.');
 const db=await openDb();
 return new Promise((res,rej)=>{
  const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
  let failure=null;
  function rejectTransaction(message){failure=new Error(message);tx.abort()}
  const scan=store.getAll();
  scan.onsuccess=()=>{
   if(!isCurrent())return rejectTransaction('تغيّر الحساب أو الفرع أثناء الاستعادة؛ بقي الأرشيف كما كان.');
   const current=scan.result||[];
   if(current.length!==expected.size||current.some(row=>expected.get(String(row.id))!==archiveRevisionFingerprint(row)))
    return rejectTransaction('تغيّرت ملفات الأرشيف أثناء تجهيز النسخة؛ لم يُستبدل أي تعديل أحدث. أعد الاستعادة بعد مراجعة الملفات.');
   const finalRows=new Map(replaceAll?[]:current.map(row=>[String(row.id),row]));
   for(const item of items){
    const id=String(item?.id||'');
    if(!id)return rejectTransaction('تحتوي النسخة على ملف بلا معرف.');
    if(replaceAll&&finalRows.has(id))return rejectTransaction('تحتوي النسخة على معرفات مكررة.');
    finalRows.set(id,item)
   }
   if(finalRows.size>MAX_BACKUP_RECORDS||[...finalRows.values()].filter(row=>!row.deleted).length>MAX_ITEMS)
    return rejectTransaction('دمج النسخة أو استعادتها يتجاوز 1000 ملف نشط أو 2000 سجل إجمالي؛ لم تُغيّر البيانات.');
   if(replaceAll)store.clear();
   for(const item of items)store.put({...item,_localWriteRev:newWriteRevision()})
  };
  scan.onerror=()=>tx.abort();
  tx.oncomplete=()=>res(true);
  tx.onerror=()=>rej(failure||tx.error||new Error('تعذرت معاملة الاستعادة'));
  tx.onabort=()=>rej(failure||tx.error||new Error('تم إلغاء معاملة الاستعادة'))
 })
}
async function blobHash(blob){const bytes=await blob.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',bytes);return[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function restoreSettings(snap,mode){if(!snap?.settings)return;if(mode==='snapshot'){const remove=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&safeSettingKey(k)&&!Object.prototype.hasOwnProperty.call(snap.settings,k))remove.push(k)}remove.forEach(k=>localStorage.removeItem(k))}Object.entries(snap.settings).forEach(([k,v])=>{if(safeSettingKey(k))localStorage.setItem(k,String(v))})}

function safeSettingKey(k){return /^(theme$|abuBassam(?:PrintSettings|Typography|CustomFonts|PrinterProfiles|DefaultPrinter|ActivePrinter|ProfessionalPrintPresets|QuestionLanguage|CardFreeLayout|Poster|VaultSort|VaultView|SyncPolicy|VaultAutoSync))/i.test(String(k||''))&&!/(auth|secret|password|token|device|security|operation|notification|customer|credential|session)/i.test(String(k||''))}
function settings(){const out={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!k||!safeSettingKey(k))continue;const v=localStorage.getItem(k);if(v!==null&&v.length<500000)out[k]=v}return out}
function bytesToB64(bytes){let out='';const step=0x8000;for(let i=0;i<bytes.length;i+=step)out+=String.fromCharCode(...bytes.subarray(i,i+step));return btoa(out)}
function b64ToBytes(s){const raw=atob(s),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
function blobDataUrl(blob){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result||''));r.onerror=()=>rej(r.error);r.readAsDataURL(blob)})}
async function saveBlob(name,mime,blob){const data=await blobDataUrl(blob);if(window.Android?.saveBase64)return Android.saveBase64(name,mime,data);const a=document.createElement('a');a.href=data;a.download=name;document.body.appendChild(a);a.click();a.remove()}
async function backupBytes(){if(!window.JSZip)throw new Error('أداة النسخ الاحتياطي غير جاهزة');const d=device(),items=await all();if(items.filter(x=>!x.deleted).length>MAX_ITEMS||items.length>MAX_BACKUP_RECORDS)throw new Error('عدد عناصر الأرشيف أو السلة أكبر من الحد الآمن للنسخ');if(items.some(x=>!x.deleted&&!x.blob))throw new Error('أرشيف يحتوي ملفًا نشطًا بلا محتوى؛ أوقف النسخ لتجنب فقدانه');let total=0,zip=new JSZip(),usedZipPaths=new Set(),manifest={format:'AbuBassamVault',version:6,createdAt:new Date().toISOString(),branchDeviceId:d.id,branchName:d.name,count:items.length,items:[]};for(const item of items){const size=Number(item.blob?.size||0);if(size>MAX_FILE)throw new Error('يوجد ملف أكبر من 100MB: '+nice(item.name));total+=size;if(total>MAX_TOTAL)throw new Error('إجمالي الأرشيف يتجاوز 500MB وهو أكبر من حد الاستعادة الآمن');const path=item.blob?`files/${String(item.id).replace(/[^A-Za-z0-9_.-]/g,'_')}/${nice(item.name)}`:'';manifest.items.push({id:item.id,name:item.name,category:item.category,mime:item.mime,size,createdAt:item.createdAt,updatedAt:item.updatedAt,folder:item.folder||'',favorite:!!item.favorite,lastOpenedAt:item.lastOpenedAt||'',deleted:!!item.deleted,deletedAt:item.deletedAt||'',path});if(item.blob){if(usedZipPaths.has(path))throw new Error('ملفان بالمسار نفسه داخل النسخة؛ لا يمكن إنشاء نسخة قد تفقد أحدهما.');usedZipPaths.add(path);zip.file(path,item.blob)}}zip.file('manifest.json',JSON.stringify(manifest,null,2));zip.file('app-settings.json',JSON.stringify({format:'AbuBassamSettings',version:6,createdAt:new Date().toISOString(),settings:settings()},null,2));return zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}})}
function strong(pass){return String(pass).length>=12&&/[A-Za-z\u0600-\u06ff]/.test(pass)&&/\d/.test(pass)&&/[^A-Za-z\u0600-\u06ff\d\s]/.test(pass)&&!/(123456|password|qwerty|akram|ابوبسام|أبوبسام)/i.test(pass)}
async function keyFor(pass,salt){const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITER,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function encryptBackup(bytes,pass){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await keyFor(pass,salt),cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,bytes)),out=new Uint8Array(MAGIC.length+16+12+cipher.length);out.set(MAGIC,0);out.set(salt,MAGIC.length);out.set(iv,MAGIC.length+16);out.set(cipher,MAGIC.length+28);return out}
function isEncrypted(bytes){return bytes.length>MAGIC.length+28&&MAGIC.every((v,i)=>bytes[i]===v)}
async function decryptBackup(bytes,pass){if(!isEncrypted(bytes))return bytes;const salt=bytes.slice(MAGIC.length,MAGIC.length+16),iv=bytes.slice(MAGIC.length+16,MAGIC.length+28),cipher=bytes.slice(MAGIC.length+28),key=await keyFor(pass,salt);return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv},key,cipher))}
async function plainBackup(mode='save'){if(!allowed('vaultBackup'))return alert('الأدمن عطّل النسخ الاحتياطي لهذا الفرع.');if(!confirm('النسخة ZIP العادية غير مشفرة. استخدم «نسخة مشفرة للفرع» للملفات الحساسة. هل تريد إنشاء ZIP عادي؟'))return;try{const bytes=await backupBytes(),name='Abu_Bassam_Branch_'+new Date().toISOString().slice(0,10)+'.zip',blob=new Blob([bytes],{type:'application/zip'});if(mode==='share'&&window.Android?.shareBase64){const data=await blobDataUrl(blob);Android.shareBase64(name,'application/zip',data)}else await saveBlob(name,'application/zip',blob);window.AbuBassamOps?.add?.({type:'backup',title:'نسخة احتياطية للفرع',details:'ZIP غير مشفر',section:'الحفظ والمستندات'})}catch(e){alert('تعذر إنشاء النسخة: '+String(e?.message||e))}}
async function encryptedBackup(){if(!allowed('vaultEncryptedBackup'))return alert('الأدمن عطّل النسخ الاحتياطي لهذا الفرع.');let pass=prompt('كلمة مرور النسخة المشفرة: 12 محرفًا على الأقل، حرف + رقم + رمز.');if(pass===null)return;if(!strong(pass))return alert('استخدم كلمة مرور قوية: 12 محرفًا على الأقل وتتضمن حرفًا ورقمًا ورمزًا.');if(prompt('أعد كلمة مرور النسخة المشفرة:')!==pass)return alert('كلمتا المرور غير متطابقتين.');try{const bytes=await backupBytes(),enc=await encryptBackup(bytes,pass);pass='';await saveBlob('Abu_Bassam_Branch_Encrypted_'+Date.now()+'.abuvault','application/octet-stream',new Blob([enc],{type:'application/octet-stream'}));window.AbuBassamOps?.add?.({type:'backup',title:'نسخة مشفرة للفرع',details:'AES-GCM / PBKDF2',section:'الحفظ والمستندات'});alert('تم إنشاء نسخة مشفرة لهذا الفرع ✓')}catch(e){pass='';alert('تعذر إنشاء النسخة المشفرة: '+String(e?.message||e))}}
const MAX_MANIFEST_BYTES=4*1024*1024,MAX_SETTINGS_BYTES=4*1024*1024;
function packedLength(entry){const n=Number(entry?._data?.uncompressedSize);return Number.isSafeInteger(n)&&n>=0?n:null}
function validateZipCatalog(zip){
 if(!zip?.files)return;
 const entries=Object.entries(zip.files).filter(([,entry])=>entry&&!entry.dir);
 if(entries.length>MAX_BACKUP_RECORDS+2)throw new Error('أرشيف ZIP يحتوي عدداً زائداً من الملفات، وأُلغيت الاستعادة.');
 let expected=0;
 for(const [path,entry] of entries){
  if(path!==entry.name&&entry.name)throw new Error('اسم ملف غير متطابق داخل ZIP.');
  if(entry.unsafeOriginalName&&entry.unsafeOriginalName!==path)throw new Error('مسار غير آمن داخل ZIP.');
  if(path!=='manifest.json'&&path!=='app-settings.json'&&!/^files\/[A-Za-z0-9_.-]+\/[^/]+$/.test(path))throw new Error('ملف إضافي أو مسار غير مسموح داخل ZIP: '+path.slice(0,120));
  const count=packedLength(entry);
  if(count===null)continue;
  const ceiling=path==='manifest.json'?MAX_MANIFEST_BYTES:path==='app-settings.json'?MAX_SETTINGS_BYTES:MAX_FILE;
  if(count>ceiling)throw new Error('حجم أحد مكونات ZIP يتجاوز الحد الآمن: '+path.slice(0,120));
  expected+=count;
  if(expected>MAX_TOTAL+MAX_MANIFEST_BYTES+MAX_SETTINGS_BYTES)throw new Error('إجمالي أحجام الملفات داخل ZIP أكبر من الحد المسموح.');
 }
}
const CRC32_TABLE=(()=>{const table=new Uint32Array(256);for(let i=0;i<256;i++){let x=i;for(let j=0;j<8;j++)x=(x&1)?(0xEDB88320^(x>>>1)):(x>>>1);table[i]=x>>>0}return table})();
async function verifyZipEntryCrc(blob,entry){
 const recorded=entry?._data?.crc32;
 if(!Number.isInteger(recorded))return;
 if(!blob||typeof blob.slice!=='function')throw new Error('تعذر فحص سلامة محتوى الملف داخل ZIP.');
 let crc=0xFFFFFFFF;
 for(let off=0;off<blob.size;off+=256*1024){
  const bytes=new Uint8Array(await blob.slice(off,Math.min(blob.size,off+256*1024)).arrayBuffer());
  for(const byte of bytes)crc=CRC32_TABLE[(crc^byte)&255]^(crc>>>8);
  if(off>0&&(off%(4*1024*1024))===0)await new Promise(resolve=>setTimeout(resolve,0))
 }
 if(((crc^0xFFFFFFFF)>>>0)!==(recorded>>>0))throw new Error('فشل فحص CRC32 لأحد ملفات ZIP؛ قد تكون النسخة تالفة.');
}
async function readValidatedBackupSettings(zip){
 const entry=zip.file('app-settings.json');
 if(!entry)return null;
 if(packedLength(entry)>MAX_SETTINGS_BYTES)throw new Error('إعدادات النسخة أكبر من الحد الآمن');
 const raw=await entry.async('string');
 if(raw.length>MAX_SETTINGS_BYTES)throw new Error('إعدادات النسخة تتجاوز الحد المسموح');
 const snapshot=JSON.parse(raw);
 if(!snapshot||snapshot.format!=='AbuBassamSettings')return null;
 if(!snapshot.settings||typeof snapshot.settings!=='object'||Array.isArray(snapshot.settings))throw new Error('صيغة إعدادات النسخة غير صالحة');
 return snapshot;
}
async function safeRestore(file,options={}){if(!file)return false;if(!allowed('vaultRestoreBackup')){alert('الأدمن عطّل استعادة النسخ لهذا الفرع.');return false}const mode=options.mode==='merge'?'merge':'snapshot',initialRestoreIdentity=restoreIdentity();if(file.size>MAX_ZIP+40*1024*1024){alert('حجم النسخة أكبر من الحد الآمن.');return false}if(Date.now()<restoreLockedUntil){alert('تم إيقاف محاولات فك النسخة مؤقتًا. حاول لاحقًا.');return false}try{let bytes=new Uint8Array(await file.arrayBuffer());if(/\.abuvault$/i.test(String(file.name||''))&&!isEncrypted(bytes))throw new Error('ملف النسخة المشفرة ناقص أو تالف أو لا يحمل ترويسة ABUVLT1 صحيحة.');if(isEncrypted(bytes)){let pass=prompt('أدخل كلمة مرور النسخة المشفرة:');if(pass===null)return false;try{bytes=await decryptBackup(bytes,pass);restoreFails=0;pass=''}catch(_){pass='';restoreFails++;if(restoreFails>=5){restoreLockedUntil=Date.now()+5*60*1000;restoreFails=0}throw new Error('كلمة مرور النسخة غير صحيحة')}}if(bytes.byteLength>MAX_ZIP)throw new Error('حجم ZIP بعد فك التشفير أكبر من الحد الآمن');if(!window.JSZip)throw new Error('أداة الاستعادة غير جاهزة');const zip=await JSZip.loadAsync(bytes);validateZipCatalog(zip);const entry=zip.file('manifest.json');if(packedLength(entry)>MAX_MANIFEST_BYTES)throw new Error('ملف فهرس النسخة أكبر من الحد الآمن');if(!entry)throw new Error('النسخة لا تحتوي manifest صالحًا');const manifestText=await entry.async('string');if(manifestText.length>MAX_MANIFEST_BYTES)throw new Error('فهرس النسخة يتجاوز الحد المسموح');const manifest=JSON.parse(manifestText);if(manifest.format!=='AbuBassamVault'||!Array.isArray(manifest.items))throw new Error('تنسيق النسخة غير معروف');if(manifest.items.length>MAX_BACKUP_RECORDS)throw new Error('النسخة تحتوي أكثر من 2000 سجل بما فيها السلة');const d=device();if(manifest.branchDeviceId&&manifest.branchDeviceId!==d.id)throw new Error('هذه النسخة تخص فرعًا آخر ولا يمكن فتحها في هذا الفرع');if(!manifest.branchDeviceId&&role()!=='owner')throw new Error('نسخة قديمة بلا هوية فرع؛ استعادتها متاحة للأدمن فقط');if(!manifest.branchDeviceId&&!options.silentConfirm&&!confirm('هذه نسخة قديمة قبل عزل الفروع. استعادتها ستصبح حالة فرع الأدمن الحالي. متابعة؟'))return false;let declared=0;const usedPaths=new Set();for(const m of manifest.items){const rawSize=m.size==null?null:Number(m.size);if(rawSize===null&&Number(manifest.version||0)>=6)throw new Error('النسخة لا تحتوي حجم الملف الضروري للتحقق من سلامته');if(rawSize!==null&&(!Number.isSafeInteger(rawSize)||rawSize<0))throw new Error('حجم أحد الملفات في فهرس النسخة غير صالح');const size=rawSize??0;if(size>MAX_FILE)throw new Error('ملف داخل النسخة يتجاوز 100MB');declared+=size;if(declared>MAX_TOTAL)throw new Error('إجمالي الملفات بعد الفك يتجاوز 500MB');const p=String(m.path||'');if(!p){if(!m.deleted)throw new Error('ملف نشط بلا محتوى داخل النسخة');if(size>0&&Number(manifest.version||0)>=6)throw new Error('سجل محذوف يعلن حجماً دون وجود الملف')}else{if(!/^files\/[A-Za-z0-9_.-]+\/[^/]+$/.test(p)||p.includes('..'))throw new Error('مسار غير آمن داخل النسخة');if(usedPaths.has(p))throw new Error('أكثر من سجل يشير إلى الملف نفسه داخل ZIP');usedPaths.add(p)}}if(!options.silentConfirm){const msg=mode==='snapshot'?'ستُستبدل حالة الأرشيف الحالية بالحالة الموجودة في هذه النسخة. سيتم إنشاء نسخة أمان للحالة الحالية أولًا. متابعة؟':'سيتم دمج النسخة مع ملفات هذا الفرع مع حفظ التعارضات كنسخ مستقلة. متابعة؟';if(!confirm(msg))return false}const existing=await all();if(!options.skipSafetyBackup&&existing.some(x=>x.blob)){const current=await backupBytes(),name='Abu_Bassam_Before_Restore_'+Date.now()+'.zip';await saveBlob(name,'application/zip',new Blob([current],{type:'application/zip'}))}const byId=new Map(existing.map(x=>[String(x.id),x])),prepared=[],usedIds=new Set(mode==='merge'?existing.map(x=>String(x.id)):[]);let total=0;for(const meta of manifest.items){const packed=meta.path?zip.file(meta.path):null;if(meta.path&&!packed)throw new Error('ملف مفقود داخل النسخة: '+nice(meta.name));if(!meta.path&&!meta.deleted)throw new Error('ملف نشط بلا محتوى في النسخة');const internal=Number(packed?._data?.uncompressedSize||0);if(internal>MAX_FILE)throw new Error('تم اكتشاف ملف مضغوط أكبر من الحد الآمن');const blob=packed?await packed.async('blob'):null;if(packed&&blob&&meta.size!=null&&blob.size!==Number(meta.size))throw new Error('حجم الملف الفعلي لا يطابق حجمه في فهرس النسخة: '+nice(meta.name));if(packed&&blob)await verifyZipEntryCrc(blob,packed);if(blob&&blob.size>MAX_FILE)throw new Error('ملف مفكوك أكبر من 100MB');total+=blob?.size||0;if(total>MAX_TOTAL)throw new Error('تجاوز إجمالي الفك 500MB');let id=String(meta.id||crypto.randomUUID?.()||('rest-'+Date.now()+'-'+prepared.length)),name=nice(meta.name),createdAt=meta.createdAt||new Date().toISOString();if(mode==='snapshot'&&usedIds.has(id))throw new Error('ملفان بالمعرّف نفسه داخل النسخة؛ رُفضت الاستعادة لحماية البيانات');if(mode==='merge'&&usedIds.has(id)){const old=byId.get(id);let same=false;if(blob&&old&&!old.deleted&&old.blob&&Number(old.size||old.blob.size)===blob.size){same=(await blobHash(old.blob))===(await blobHash(blob))}if(!same){id=crypto.randomUUID?.()||('rest-'+Date.now()+'-'+Math.random().toString(36).slice(2));name=nice(String(meta.name||'ملف').replace(/(\.[^.]+)?$/,' (نسخة مستعادة)$1'))}else{createdAt=old.createdAt||createdAt}}usedIds.add(id);prepared.push({id,name,category:meta.category==='image'?'image':'file',mime:meta.mime||blob?.type||'application/octet-stream',size:blob?.size||0,createdAt,updatedAt:meta.updatedAt||new Date().toISOString(),folder:meta.folder||'',favorite:!!meta.favorite,lastOpenedAt:meta.lastOpenedAt||'',blob,syncState:'pending',deleted:!!meta.deleted,deletedAt:meta.deleted?(meta.deletedAt||meta.updatedAt||new Date().toISOString()):''})}if(prepared.filter(x=>!x.deleted).length>MAX_ITEMS)throw new Error('عدد الملفات النشطة في النسخة يتجاوز 1000');if(mode==='merge'){const currentCount=existing.filter(x=>!x.deleted).length,newCount=prepared.filter(x=>!x.deleted&&!byId.has(String(x.id))).length;if(currentCount+newCount>MAX_ITEMS)throw new Error('الدمج سيتجاوز حد 1000 عنصر')}const preparedSettings=await readValidatedBackupSettings(zip);if(restoreIdentity()!==initialRestoreIdentity||!allowed('vaultRestoreBackup'))throw new Error('تغيّر الحساب أو الفرع أثناء تجهيز النسخة؛ أُلغيت الاستعادة حفاظًا على البيانات.');await applyAtomic(prepared,{replaceAll:mode==='snapshot',expectedBefore:existing,isCurrent:()=>restoreIdentity()===initialRestoreIdentity&&allowed('vaultRestoreBackup')});if(restoreIdentity()!==initialRestoreIdentity||!allowed('vaultRestoreBackup'))throw new Error('تغيّر الحساب بعد الاستعادة؛ لم تُطبّق إعدادات تخص حساباً مختلفاً.');let settingsWarning='';if(preparedSettings){try{if(restoreIdentity()!==initialRestoreIdentity||!allowed('vaultRestoreBackup'))throw new Error('تغيّر الحساب أثناء تطبيق الإعدادات');restoreSettings(preparedSettings,mode)}catch(settingsError){settingsWarning='تمت استعادة الملفات، لكن تعذرت استعادة بعض الإعدادات: '+String(settingsError?.message||settingsError);alert(settingsWarning)}}try{window.AbuBassamOps?.add?.({type:'restore',title:'استعادة نسخة فرع',details:`${prepared.length} عنصر • ${mode==='snapshot'?'Snapshot':'دمج'}`,section:'الحفظ والمستندات'})}catch(_){}await window.DocumentVault?.onShow?.();if(!options.silentSuccess)alert(`تمت استعادة ${prepared.length} عنصر داخل هذا الفرع ✓`);return true}catch(error){if(!options.silentError)alert('تعذرت الاستعادة: '+String(error?.message||error));return false}finally{if($('vBackupInput'))$('vBackupInput').value=''}}
window.AbuDocumentVaultHardening=Object.freeze({backup:plainBackup,encryptedBackup,restore:safeRestore,safeSettingKey});
})();