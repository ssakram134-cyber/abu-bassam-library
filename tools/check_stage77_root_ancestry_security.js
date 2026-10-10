'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const commands=JSON.parse(read('package.json')).scripts['check:web'].split(' && ');
assert.ok(commands.length>=93,'Preserve stage75 checks and add stage77');
assert.equal(new Set(commands).size,commands.length,'Duplicate registered checks');
for(const cmd of commands){
  assert.match(cmd,/^node tools\/check_[A-Za-z0-9_]+\.js$/);
  assert.ok(fs.existsSync(path.join(root,cmd.slice(5))),'Missing check: '+cmd);
}
for(const name of [
'check_startup_recovery.js','check_questions_compressor_lifecycle.js',
'check_camera_qr_pdf_integrity.js','check_card_print_registration.js',
'check_vault_offline_atomic_sync.js','check_vault_restore_dedup.js',
'check_backup_delete_permission.js','check_archive_edge_permissions.js',
'check_archive_server_release_gate.js','check_archive_reset_cleanup.js',
'check_stage75_device_recovery_integration.js','check_vault_device_recovery.js',
'check_vault_trash_backup_restore.js','check_stage74_trash_backup_integration.js',
'check_print_preferences_persistence.js','check_stage73_print_preferences_integration.js',
'check_stage77_root_ancestry_security.js'
])assert.ok(commands.includes('node tools/'+name),'Lost root/stage75 security check '+name);
const backup=read('supabase/functions/backup-center/index.ts');
for(const rx of [/function mayCleanup\(/,/permissionEnabled\(base\.device,'backupDelete'\)/,/context\(req,\['backupCreate','backupRestore'\]\)/,/row\.backup_kind==='pre_restore'\?'backupRestore':'backupCreate'/,/context\(req,'backupDelete'\)/,/scopeAllowed\(base\.device,base\.deviceId,row\)/])
  assert.match(backup,rx,'Server backup permission regression');
const customers=read('supabase/functions/customer-documents/index.ts');
assert.match(customers,/return p\[key\]===true/);
assert.doesNotMatch(customers,/DEFAULT_ALLOWED|legacyFallback\(/);
const vault=read('supabase/functions/branch-vault/index.ts');
for(const rx of [/function validItemId\(/,/function isItemRevision\(/,/VAULT_ACTIVE_REVISION/,/owner-download-url/,/base\.device\.role!=='owner'/])
  assert.match(vault,rx,'Vault authorization regression');
const branch=read('web/branch-vault-runtime.js');
const i=branch.indexOf('async function removeAllVault('),j=branch.indexOf('\nfunction registerCloudAdapter(',i);
assert.ok(i>=0&&j>i);
const reset=branch.slice(i,j);
assert.ok(reset.includes("await rpc('abu_bassam_vault_remove_all'"));
assert.ok(reset.indexOf("await rpc('abu_bassam_vault_remove_all'")<reset.indexOf('await removeVault(path)'),'Metadata removal must precede Storage deletion');
const hard=read('web/document-vault-hardening-runtime.js');
assert.match(hard,/authorizeOwnerDeviceRecovery/);
assert.match(hard,/VAULT_RESTORE_CONFLICT/);
assert.match(hard,/VAULT_TRASH_RESTORE_CONFLICT/);
assert.match(read('web/backup-center-runtime.js'),/ownerDeviceRecovery/);
assert.match(read('index.js'),/barcodeScanGuard/);
assert.match(read('web/cards-studio-runtime.js'),/abuBassamCardsPrintPreferencesV1/);
assert.match(read('tools/check_stage75_device_recovery_integration.js'),/assert\.ok\(commands\.length>=92/);
assert.ok(read('.github/workflows/android.yml').includes('if: $'+'{{ false }}'),'APK workflow must stay disabled');
for(const file of ['web/backup-center-runtime.js','web/branch-vault-runtime.js','web/document-vault-hardening-runtime.js','web/cards-studio-runtime.js'])
  new vm.Script(read(file),{filename:file});
console.log('Stage77 source security checks passed, registered scripts: '+commands.length);
