'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const checks=JSON.parse(read('package.json')).scripts['check:web'].split(' && ');
assert.ok(checks.length>=70,'Keep all Stage61–64 and signed-download checks');
assert.equal(checks.length,new Set(checks).size,'Unique check:web commands');
for(const item of checks){assert.match(item,/^node tools\/check_[\w]+\.js$/);assert.ok(fs.existsSync(path.join(__dirname,'..',item.slice(5))),'Missing '+item)}
for(const name of [
 'check_stage61_auth_merge_regression.js','check_stage62_archive_merge_regression.js',
 'check_stage63_vault_sync_integration.js','check_stage64_vault_cas_integration.js',
 'check_vault_server_cas.js','check_vault_owner_branch_browser.js',
 'check_vault_signed_download_security.js','check_archive_edge_permissions.js',
 'check_backup_delete_permission.js'
])assert.ok(checks.includes('node tools/'+name),'Missing required check '+name);
const sql=read('supabase/migrations/202610090002_vault_owner_readonly_branch_browser.sql');
const cas=read('supabase/migrations/202610090001_vault_atomic_compare_and_swap.sql');
const edge=read('supabase/functions/branch-vault/index.ts');
const branch=read('web/branch-vault-runtime.js');
const vault=read('web/document-vault-runtime.js');
const secure=read('web/secure-sync-runtime.js');
for(const [file,source] of [['branch',branch],['vault',vault],['secure',secure]])new vm.Script(source,{filename:file});
const section=(source,start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,'Missing '+start);return source.slice(a,b)};
assert.match(sql,/create or replace function public\.abu_bassam_vault_owner_list/);
assert.match(sql,/v_uid uuid:=auth\.uid\(\)/);
assert.match(sql,/_abu_bassam_vault_authorized\(p_device_id,p_device_secret,'vaultView'\)/);
assert.match(sql,/select \(d\.role='owner'\) into v_owner/,'Database owner role is mandatory');
assert.match(sql,/d\.user_id=v_uid and d\.device_id=p_device_id and d\.active=true/);
assert.match(sql,/if not coalesce\(v_owner,false\) then raise exception 'VAULT_OWNER_REQUIRED'/);
assert.match(sql,/where v\.user_id=v_uid/,'Never enumerate foreign-account archive');
assert.match(sql,/revoke all on function public\.abu_bassam_vault_owner_list[\s\S]*?from PUBLIC, anon, authenticated/);
assert.match(sql,/grant execute on function public\.abu_bassam_vault_owner_list[\s\S]*?to authenticated/);
assert.doesNotMatch(sql,/\b(?:delete from|insert into|update)\s+public\./i,'Owner listing must not mutate vault');
const normal=section(edge,"    if(action==='download-url'&&req.method==='GET')","    if(action==='owner-download-url'&&req.method==='GET')");
const owner=section(edge,"    if(action==='owner-download-url'&&req.method==='GET')","    const discardUpload=");
assert.match(normal,/context\(req,'vaultView'\)/);
assert.match(normal,/permissionEnabled\(base.device,'vaultSync'\)/);
assert.match(normal,/\.select\('data,updated_at'\)/);
assert.match(normal,/isItemRevision\(path,base.user.id,base.deviceId,itemId\)/);
assert.match(normal,/path!==expectedPath\|\|String\(row.updated_at\|\|''\)!==expectedVersion/);
assert.match(normal,/VAULT_VERSION_CONFLICT/);
assert.match(owner,/base\.device\.role!=='owner'/);
assert.match(owner,/\.eq\('user_id',base\.user\.id\)/);
assert.match(owner,/\.eq\('branch_device_id',targetDevice\)/);
assert.match(owner,/\.eq\('client_id',itemId\)/);
assert.match(owner,/String\(row.updated_at\|\|''\)!==expected/);
assert.match(owner,/isItemRevision\(path,base.user.id,targetDevice,itemId\)/);
for(const handler of [normal,owner]){assert.match(handler,/createSignedUrl\(path,60,\{download:false\}\)/);assert.doesNotMatch(handler,/\.remove\(|\.update\(|\.upload\(/,'Read-only signed download')}
const ownerList=section(branch,'async function ownerList(','async function ownerDownload(');
const ownerDownload=section(branch,'async function ownerDownload(','async function vaultUpsert(');
const download=section(branch,'async function downloadVault(','async function removeVault(');
assert.match(ownerList,/role\(\)!=='owner'/);
assert.match(ownerList,/VAULT_SCOPE_CHANGED/);
assert.match(ownerDownload,/VAULT_SCOPE_CHANGED/);
assert.match(download,/expected_updated_at/);
assert.match(download,/plan\.path!==path/);
assert.match(download,/VAULT_SCOPE_CHANGED/);
const reset=section(branch,'async function removeAllVault(','function registerCloudAdapter(');
assert.ok(reset.indexOf("await rpc('abu_bassam_vault_remove_all'")>=0);
assert.ok(reset.indexOf("await rpc('abu_bassam_vault_remove_all'")<reset.indexOf('await removeVault(path)'),'Retain metadata-first cleanup');
assert.match(reset,/AbuBassamOps\?\.add\?/,'Preserve main security audit hook');
for(const perm of ['vaultImageEdit','vaultEnhance','vaultRestoreDeleted','vaultPermanentDelete'])assert.ok(branch.includes(perm),'Preserve archive permission '+perm);
assert.match(branch,/abu_bassam_vault_upsert_cas/);
assert.match(cas,/p_expected_updated_at timestamptz/);
assert.match(cas,/revoke all on function public\.abu_bassam_vault_upsert/);
assert.match(vault,/id="vOtherBranchButton" style="display:none"/);
assert.match(vault,/DocumentVault\.openOtherBranches/);
assert.match(vault,/otherBranchScope!==syncScope\(\)/);
assert.match(vault,/esc\(row\.data\?\.name\|\|row\.client_id\)/,'Escape owner archive labels');
assert.match(vault,/URL\.revokeObjectURL/,'Preview Blob URLs must be freed');
assert.match(vault,/await service\.downloadVault\(remote\.storagePath,remoteVersion\)/);
assert.match(vault,/await service\.downloadVault\(data\.storagePath,remoteVersion\)/);
assert.doesNotMatch(vault,/service\.downloadVault\((remote|data)\.storagePath\)/,'Reject unversioned Cloud reads');
assert.match(read('supabase/functions/customer-documents/index.ts'),/return p\[key\]===true;/,'Deny customer permissions by default');
assert.match(read('supabase/functions/backup-center/index.ts'),/context\(req,'backupDelete'\)/);
assert.match(read('.github/workflows/android.yml'),/if:\s*\$\{\{\s*false\s*\}\}/,'Do not enable APK Actions');
console.log('Stage65 owner-only cross-branch archive and exact-version signed download guards passed: '+checks.length+' unique tests.');
