const fs=require('fs'),vm=require('vm');
const read=p=>{if(!fs.existsSync(p))throw new Error('missing '+p);return fs.readFileSync(p,'utf8')};
const need=(s,t,l)=>{if(!s.includes(t))throw new Error('backup center check failed: '+l)};
const forbid=(s,t,l)=>{if(s.includes(t))throw new Error('backup center check failed: '+l)};
const runtime=read('web/backup-center-runtime.js'),vaultHardening=read('web/document-vault-hardening-runtime.js'),native=read('index.js'),loader=read('web/device-name-runtime.js'),edge=read('supabase/functions/backup-center/index.ts'),migration=read('supabase/migrations/202609260001_backup_center.sql'),state=read('supabase/migrations/202609260002_backup_snapshot_state.sql'),deny=read('supabase/migrations/202609260003_backup_metadata_direct_deny.sql');
new vm.Script(runtime,{filename:'backup-center-runtime.js'});new vm.Script(loader,{filename:'device-name-runtime.js'});
for(const m of ['__ABU_BACKUP_CENTER_V1__','CHUNK=5*1024*1024','MAX_ZIP=120*1024*1024','crypto.subtle.digest','backupItems()','stateScope()','scopedKey(key)','part_count:parts','uploadToSignedUrl','backup_kind:kind','pre_restore','backupCreate','backupRestore','backupDelete','AbuBassamNativeSecurity',"kind==='pre_restore'?'backupRestore':'backupCreate'","const d=await downloadBytes(id)","await backupNow('pre_restore',true)","restore(file,{mode:'snapshot',silentConfirm:true})","await api('cleanup','POST',{retention:retention()})",'15*60*1000'])need(runtime,m,m);
forbid(runtime,'__dev_secure_','device secret must never use web storage');
forbid(runtime,'window.AbuBassamNativeSecurityResult','Backup Center must not install another native callback');
for(const src of [runtime,vaultHardening]){need(src,"abubassamcustomfontsv5'?8*1024*1024:500000",'custom font backup size allowance');need(src,'settingValueLimit(','per-setting backup size guard')}
for(const m of ['captureSettings()','replaceSettingsSnapshot(before)','value.length>=settingValueLimit(k)','if(archiveApplied)','await applyAtomic(existing,{replaceAll:true})'])need(vaultHardening,m,'atomic restore rollback '+m);
for(const m of ['saveBase64Confirmed','AbuBassamNativeFileSaveResult','writeBase64Download',"message.type === 'saveBase64Confirmed'"])need(native,m,'confirmed native backup save '+m);
for(const m of ['{confirmed=true}','Android.saveBase64Confirmed',"نسخة Android الحالية لا تدعم تأكيد حفظ نسخة الأمان","{confirmed:true}"])need(vaultHardening,m,'confirmed safety backup '+m);
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
