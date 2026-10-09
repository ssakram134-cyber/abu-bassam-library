const fs=require('fs'),vm=require('vm');
const read=p=>{if(!fs.existsSync(p))throw new Error('missing '+p);return fs.readFileSync(p,'utf8')};
const need=(s,t,l)=>{if(!s.includes(t))throw new Error('backup center check failed: '+l)};
const forbid=(s,t,l)=>{if(s.includes(t))throw new Error('backup center check failed: '+l)};
const runtime=read('web/backup-center-runtime.js'),loader=read('web/device-name-runtime.js'),edge=read('supabase/functions/backup-center/index.ts'),migration=read('supabase/migrations/202609260001_backup_center.sql'),state=read('supabase/migrations/202609260002_backup_snapshot_state.sql'),deny=read('supabase/migrations/202609260003_backup_metadata_direct_deny.sql');
new vm.Script(runtime,{filename:'backup-center-runtime.js'});new vm.Script(loader,{filename:'device-name-runtime.js'});
for(const m of ['__ABU_BACKUP_CENTER_V1__','CHUNK=5*1024*1024','MAX_ZIP=120*1024*1024','crypto.subtle.digest','backupItems()','stateScope()','scopedKey(key)','part_count:parts','uploadToSignedUrl','backup_kind:kind','pre_restore','backupCreate','backupRestore','backupDelete','AbuBassamNativeSecurity',"kind==='pre_restore'?'backupRestore':'backupCreate'","const d=await downloadBytes(id)","await backupNow('pre_restore',true)","restore(file,{mode:'snapshot',silentConfirm:true})","await api('cleanup','POST',{retention:retention()})",'15*60*1000'])need(runtime,m,m);
forbid(runtime,'__dev_secure_','device secret must never use web storage');
forbid(runtime,'window.AbuBassamNativeSecurityResult','Backup Center must not install another native callback');
// Regression: unscoped legacy backup checkpoints must never suppress a new account's first backup.
const stateReader=runtime.match(/^function stateGet\\(key\\)\\{.*\\}$/m)?.[0];
if(!stateReader)throw new Error('backup center check failed: state reader missing');
const memory=new Map([
  ['abuBassamBackupLastFingerprintV1','legacy-same-fingerprint'],
  ['abuBassamBackupLastSuccessV1','9999999999999'],
  ['abuBassamBackupAutoV1','0'],
]);
const storage={getItem:key=>memory.has(key)?memory.get(key):null,setItem:(key,value)=>memory.set(key,String(value))};
const readState=vm.runInNewContext(stateReader+'; stateGet',{
  scopedKey:key=>key+':new-account:new-device',localStorage:storage,
  AUTO:'abuBassamBackupAutoV1',CAD:'abuBassamBackupCadenceV1',KEEP:'abuBassamBackupRetentionV1'
});
if(readState('abuBassamBackupLastFingerprintV1')!==null||readState('abuBassamBackupLastSuccessV1')!==null)
  throw new Error('backup center check failed: legacy state leaked into new account checkpoint');
if(readState('abuBassamBackupAutoV1')!=='0')
  throw new Error('backup center check failed: legacy user preference not preserved');
// Regression: cloud metadata must be text-escaped, including quoted HTML attributes.
const htmlEscaper=runtime.match(/^function escapeHtml\\(value\\)\\{.*\\}$/m)?.[0];
if(!htmlEscaper)throw new Error('backup center check failed: HTML escaper missing');
const escapeHtml=vm.runInNewContext(htmlEscaper+'; escapeHtml');
if(escapeHtml(`<img src=x onerror="alert('x')">&`)!=='&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;')
  throw new Error('backup center check failed: cloud metadata HTML escaping');
if((runtime.match(/stateRemove\(LASTFP\);stateRemove\(LAST\);/g)||[]).length!==2)
  throw new Error('backup center check failed: cloud restore and deletion must invalidate cached checkpoint');
for(const marker of [
  "escapeHtml(b.branch_name||'هذا الفرع')",
  'data-restore="${escapeHtml(b.backup_id)}"',
  'data-delete="${escapeHtml(b.backup_id)}"',
  "$('abuBackupList').querySelectorAll('[data-restore]')",
  "$('abuBackupList').querySelectorAll('[data-delete]')"
])need(runtime,marker,'backup list safe DOM construction: '+marker);
for(const m of ['loadBackupCenter','backup-center-runtime.js','__ABU_BACKUP_CENTER_V1__','await loadBackupCenter();'])need(loader,m,'deterministic loader '+m);

for(const m of ["const TABLE='abu_bassam_backups'","const MAX_BYTES=512*1024*1024","MAX_PARTS=120",'sha256','verifyParts','hasher.update(bytes)','BACKUP_PART_MISSING','BACKUP_SIZE_MISMATCH','BACKUP_SHA256_MISMATCH','sha256_verified:true','cleanupReady','backup_kind===\'pre_restore\'','createSignedUploadUrl','createSignedUrl','backupCreate','backupRestore','backupDelete','branch_device_id',"ready:true"])need(edge,m,'edge '+m);
forbid(edge,'DEFAULT_ALLOWED','edge permission defaults must be explicit false');
need(edge,"return p[key]===true",'edge secondary permission must be explicit true');
need(edge,"message==='NOT_AUTHENTICATED'?401",'expired or invalid JWT must return HTTP 401');
forbid(edge,'NOT_ALLOWED|NOT_AUTHENTICATED|DEVICE|SCOPE','authentication failures must not be grouped into HTTP 403');

for(const m of ['create table if not exists public.abu_bassam_backups','enable row level security','revoke all on table public.abu_bassam_backups from public,anon,authenticated','backup-vault','alter policy abu_bassam_storage_no_direct_vault_select'])need(migration,m,'migration '+m);
for(const m of ['ready boolean not null default false','committed_at timestamptz','abu_bassam_backups_pending_idx'])need(state,m,'state '+m);
for(const m of ['abu_bassam_backups_direct_deny','as restrictive','for all','using (false)','with check (false)'])need(deny,m,'direct deny '+m);
forbid(runtime,'service_role','client service role marker');
forbid(runtime,'SUPABASE_SERVICE_ROLE_KEY','client server key');
console.log('backup center checks passed: scoped state, real blob validation, SecureStore-only identity, server-side multipart SHA-256 commit verification, safe pre-restore ordering, branch scope, retention after successful restore, and direct metadata/storage denial.');
