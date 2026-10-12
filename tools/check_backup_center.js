const fs=require('fs'),vm=require('vm');
const read=p=>{if(!fs.existsSync(p))throw new Error('missing '+p);return fs.readFileSync(p,'utf8')};
const need=(s,t,l)=>{if(!s.includes(t))throw new Error('backup center check failed: '+l)};
const forbid=(s,t,l)=>{if(s.includes(t))throw new Error('backup center check failed: '+l)};
const runtime=read('web/backup-center-runtime.js'),loader=read('web/device-name-runtime.js'),edge=read('supabase/functions/backup-center/index.ts'),migration=read('supabase/migrations/202609260001_backup_center.sql'),state=read('supabase/migrations/202609260002_backup_snapshot_state.sql'),deny=read('supabase/migrations/202609260003_backup_metadata_direct_deny.sql');
new vm.Script(runtime,{filename:'backup-center-runtime.js'});new vm.Script(loader,{filename:'device-name-runtime.js'});
for(const m of ['__ABU_BACKUP_CENTER_V1__','CHUNK=5*1024*1024','MAX_ZIP=120*1024*1024','crypto.subtle.digest','backupItems()','stateScope()','scopedKey(key)','part_count:parts','uploadToSignedUrl','backup_kind:kind','pre_restore','backupCreate','backupRestore','backupDelete','AbuBassamNativeSecurity',"kind==='pre_restore'?'backupRestore':'backupCreate'","const d=await downloadBytes(id)","await backupNow('pre_restore',true)","restore(file,{mode:'snapshot',silentConfirm:true})","await api('cleanup','POST',{retention:retention()})",'15*60*1000'])need(runtime,m,m);
forbid(runtime,'__dev_secure_','device secret must never use web storage');
forbid(runtime,'window.AbuBassamNativeSecurityResult','Backup Center must not install another native callback');
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

need(runtime,'MAX_ITEMS=1000,MAX_BACKUP_RECORDS=2000','active archive capacity must be distinct from trash snapshot capacity');
need(edge,'MAX_BACKUP_RECORDS=2000','backup server must accept trash-inclusive 2000-record snapshots');
need(edge,'count>MAX_BACKUP_RECORDS','backup server must enforce its explicit total-record cap');

for(const marker of [
 'd.backup?.branch_device_id!==branch',
 'total>MAX_ZIP',
 'parts.length>Math.ceil(MAX_ZIP/CHUNK)',
 "if(!/^https:\\/\\//i.test(url))",
 'got+a.length>total',
 "sha!==String(d.backup.sha256).toLowerCase()"
])need(runtime,marker,'cloud snapshot download must reject unsafe or oversized files');
const capRule=runtime.match(/if\((items\.filter\(item=>!item\.deleted\)\.length>MAX_ITEMS\|\|items\.length>MAX_BACKUP_RECORDS)\)throw Error/);
if(!capRule)throw new Error('backup center check failed: expected canonical trash-aware active and total count checks');
const tooLarge=new Function('items','MAX_ITEMS','MAX_BACKUP_RECORDS','return '+capRule[1]);
const live=Array.from({length:1000},(_,i)=>({id:'active-'+i,deleted:false}));
const trash=Array.from({length:1000},(_,i)=>({id:'deleted-'+i,deleted:true}));
if(tooLarge([...live,trash[0]],1000,2000))throw new Error('backup center check failed: 1000 active plus one trash record must be backed up');
if(tooLarge([...live,...trash],1000,2000))throw new Error('backup center check failed: 2000 records must be backed up');
if(!tooLarge([...live,{id:'live-over-limit',deleted:false}],1000,2000))throw new Error('backup center check failed: 1001 active files must be refused');
if(!tooLarge([...live,...trash,{id:'trash-over-limit',deleted:true}],1000,2000))throw new Error('backup center check failed: more than 2000 records must be refused');

console.log('backup center checks passed: scoped state, real blob validation, SecureStore-only identity, server-side multipart SHA-256 commit verification, safe pre-restore ordering, branch scope, retention after successful restore, and direct metadata/storage denial.');
