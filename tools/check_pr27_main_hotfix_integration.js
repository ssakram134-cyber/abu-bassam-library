'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const dir=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(dir,p),'utf8');
const pkg=JSON.parse(read('package.json')),checks=(pkg.scripts['check:web']||'').split(' && ');
assert.equal(checks.length,44,'PR27 integration must preserve all 33 baseline + 6 PR27 + 4 main hotfix + 1 gate');
assert.equal(new Set(checks).size,checks.length,'Duplicate registered checks');
for(const item of checks){
 assert.match(item,/^node tools\/check_[\w]+\.js$/);
 assert.ok(fs.existsSync(path.join(dir,item.slice(5))),'Missing registered test: '+item);
}
for(const name of [
 'check_startup_recovery.js','check_questions_compressor_lifecycle.js',
 'check_camera_qr_pdf_integrity.js','check_card_print_registration.js',
 'check_vault_offline_atomic_sync.js','check_vault_restore_dedup.js',
 'check_backup_delete_permission.js','check_archive_edge_permissions.js',
 'check_archive_server_release_gate.js','check_archive_reset_cleanup.js'
])assert.ok(checks.includes('node tools/'+name),'Missing PR27 or main hotfix test '+name);
const edge=read('supabase/functions/backup-center/index.ts');
assert.match(edge,/function mayCleanup\(/);
assert.match(edge,/permissionEnabled\(base.device,'backupDelete'\)/);
assert.match(edge,/mayCleanup\(base\)\?await cleanupPending\(base\):0/);
assert.match(edge,/context\(req,'backupDelete'\)/);
assert.match(edge,/context\(req,\['backupCreate','backupRestore'\]\)/);
assert.match(edge,/const requiredPermission=row.backup_kind==='pre_restore'\?'backupRestore':'backupCreate'/);
assert.match(edge,/!mayCleanup\(base\)\?0:await cleanupReady\(base,retention\)/);
const cust=read('supabase/functions/customer-documents/index.ts');
assert.match(cust,/return p\[key\]===true;/,'Branch customer permissions must deny by default');
const vault=read('supabase/functions/branch-vault/index.ts');
assert.match(vault,/function isItemRevision\(/);
assert.match(vault,/VAULT_ACTIVE_REVISION/);
const branch=read('web/branch-vault-runtime.js');
const f=branch.indexOf('async function removeAllVault('),end=branch.indexOf('\nfunction registerCloudAdapter(',f);
assert.ok(f>=0&&end>f,'Archive reset function unavailable');
const reset=branch.slice(f,end);
assert.ok(reset.indexOf("await rpc('abu_bassam_vault_remove_all'")>=0);
assert.ok(reset.indexOf("await rpc('abu_bassam_vault_remove_all'")<reset.indexOf('await removeVault(path)'),
 'Never delete active Storage before metadata');
for(const p of [
 'index.js','web/device-name-runtime.js','web/cards-studio-runtime.js',
 'web/document-vault-runtime.js','web/document-vault-hardening-runtime.js',
 'web/productivity-tools-runtime.js','web/backup-center-runtime.js'
])new vm.Script(read(p),{filename:p});
assert.match(read('web/index.html'),/<!doctype html/i);
const action=read('.github/workflows/android.yml');
assert.match(action,/if:\s*\$\{\{\s*false\s*\}\}/,'Android Actions build must stay disabled');
console.log('PR27-main integration safety passed: 44 unique checks, six feature checks, four merged hotfix gates, backupDelete, permission isolation, metadata-first reset and inert Android Actions.');
