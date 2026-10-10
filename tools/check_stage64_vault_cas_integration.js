'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const scripts=JSON.parse(read('package.json')).scripts['check:web'].split(' && ');
assert.ok(scripts.length>=67,'Preserve all stage 61–63 tests and both CAS checks');
assert.equal(new Set(scripts).size,scripts.length,'Do not duplicate regression tests');
for(const command of scripts){
  assert.match(command,/^node tools\/check_[A-Za-z0-9_]+\.js$/,'Only expected source checks');
  assert.ok(fs.existsSync(path.join(__dirname,'..',command.slice(5))),'Missing test file '+command);
}
for(const required of [
 'check_stage61_auth_merge_regression.js',
 'check_stage62_archive_merge_regression.js',
 'check_stage63_vault_sync_integration.js',
 'check_vault_server_cas.js',
 'check_stage64_vault_cas_integration.js',
 'check_archive_edge_permissions.js',
 'check_backup_delete_permission.js',
 'check_vault_cross_device_delete_restore.js'
])assert.ok(scripts.includes('node tools/'+required),'Required test was unregistered: '+required);
const adapter=read('web/branch-vault-runtime.js');
const cloud=read('web/secure-sync-runtime.js');
const vault=read('web/document-vault-runtime.js');
const edge=read('supabase/functions/branch-vault/index.ts');
const migration=read('supabase/migrations/202610090001_vault_atomic_compare_and_swap.sql');
const baseline=read('supabase/migrations/202609240013_branch_private_document_vault.sql');
for(const [name,src] of [['branch',adapter],['secure',cloud],['vault',vault]])new vm.Script(src,{filename:name});
const part=(text,start,end)=>{
 const a=text.indexOf(start),b=text.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Missing code section '+start);
 return text.slice(a,b);
};
const upsert=part(adapter,'async function vaultUpsert(','async function edge(');
assert.match(upsert,/abu_bassam_vault_upsert_cas/,'Metadata writes must be CAS');
assert.doesNotMatch(upsert,/rpc\('abu_bassam_vault_upsert'/,'Legacy last-writer-wins RPC forbidden');
assert.match(upsert,/p_expected_updated_at:expectedRemoteUpdatedAt\|\|null/);
assert.match(cloud,/upsert\(clientId, data, expectedRemoteUpdatedAt\)/,'Forward exact remote version');
assert.match(vault,/const remoteChanged=!!row&&\(!knownVersion\|\|remoteVersion!==knownVersion\)/);
assert.match(vault,/service\.upsert\('vault',item\.id,data,remoteVersion\|\|null\)/);
assert.match(vault,/await service\.removeVault\(newPath,true\)/,'Discard staged blob after rejected metadata update');
assert.match(vault,/includes\('VAULT_VERSION_CONFLICT'\)/,'Conflict must schedule retry');
assert.match(vault,/deletionConflictsSaved/,'Deletion tombstones remain protected');
assert.match(migration,/create or replace function public\.abu_bassam_vault_upsert_cas/);
assert.match(migration,/p_expected_updated_at timestamptz/);
assert.match(migration,/for update;/);
assert.match(migration,/v_current_updated_at<>p_expected_updated_at/);
assert.match(migration,/on conflict \(user_id,branch_device_id,client_id\) do nothing/);
assert.match(migration,/revoke all on function public\.abu_bassam_vault_upsert\(text,text,text,jsonb\)\s+from PUBLIC, anon, authenticated/);
assert.match(migration,/grant execute on function public\.abu_bassam_vault_upsert_cas\(text,text,text,jsonb,timestamptz\)\s+to authenticated/);
assert.match(migration,/_abu_bassam_vault_authorized\(p_device_id,p_device_secret,'vaultSync'\)/);
for(const role of ['vaultAdd','vaultEdit','vaultDelete'])assert.match(migration,new RegExp("'"+role+"'"),'Check explicit '+role);
assert.doesNotMatch(migration,/on conflict[^;]*do update/i,'New CAS migration must never silently overwrite');
assert.match(baseline,/revoke all on table public\.abu_bassam_branch_vault from public, anon, authenticated/,'Direct table write denied');
assert.match(baseline,/abu_bassam_branch_vault_direct_deny/);
assert.match(edge,/discardUpload=action==='discard-upload'&&req.method==='DELETE'/);
assert.match(edge,/discardUpload\?await context\(req,'vaultSync'\):await context\(req,'vaultDelete'\)/);
assert.match(edge,/isItemRevision\(path,base.user.id,base.deviceId,itemId\)/,'Per-item path scope required');
assert.match(edge,/if\(discardUpload&&path===currentPath\)return json\(\{error:'VAULT_ACTIVE_REVISION'\},409\)/);
const reset=part(adapter,'async function removeAllVault(','\nfunction registerCloudAdapter(');
assert.ok(reset.indexOf("await rpc('abu_bassam_vault_remove_all'")<reset.indexOf('await removeVault(path)'),'Keep metadata-first delete');
assert.match(reset,/AbuBassamOps\?\.add\?/,'Keep deferred cleanup logging');
for(const perm of ['vaultImageEdit','vaultEnhance','vaultRestoreDeleted','vaultPermanentDelete'])assert.ok(adapter.includes(perm),'Keep explicit permission '+perm);
assert.match(read('supabase/functions/customer-documents/index.ts'),/return p\[key\]===true;/,'Existing hotfix permissions stay strict');
assert.match(read('supabase/functions/backup-center/index.ts'),/context\(req,'backupDelete'\)/,'Existing backup deletion gate stays');
assert.match(read('.github/workflows/android.yml'),/if:\s*\$\{\{\s*false\s*\}\}/,'Actions Android build stays disabled');
console.log('Stage64 CAS source-integration gate passed: '+scripts.length+' unique tests, expected revisions, revokes, device permissions, path checks and security preservation.');
