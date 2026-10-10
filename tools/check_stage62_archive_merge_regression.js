'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const registered=JSON.parse(read('package.json')).scripts['check:web'].split(' && ');
assert.ok(registered.length>=60,'Preserve the Stage61 and archive checks');
assert.equal(new Set(registered).size,registered.length,'Duplicate check:web commands');
const must=[
 'check_stage61_auth_merge_regression.js','check_pr27_main_hotfix_integration.js',
 'check_backup_delete_permission.js','check_archive_edge_permissions.js',
 'check_archive_reset_cleanup.js','check_archive_server_release_gate.js',
 'check_vault_file_management.js','check_vault_folder_operations.js',
 'check_vault_trash_drag.js','check_vault_numbering_selection.js',
 'check_vault_recovery_points.js','check_vault_backup_db_version.js'
];
for(const name of must){
 assert.ok(registered.includes('node tools/'+name),'Missing registered regression '+name);
 assert.ok(fs.existsSync(path.join(__dirname,name)),'Missing regression source '+name);
}
for(const file of ['web/document-vault-runtime.js','web/document-vault-hardening-runtime.js','web/document-vault-advanced-runtime.js','web/branch-vault-runtime.js']){
 new vm.Script(read(file),{filename:file});
}
const vault=read('web/document-vault-runtime.js');
assert.match(vault,/const TRASH_STORE='trash'/);
assert.match(vault,/const CHECKPOINT_STORE='checkpoints'/);
assert.match(vault,/TRASH_DAYS=30/);
assert.match(vault,/indexedDB\.open\(DB_NAME,3\)/);
assert.match(vault,/async function commitEditedFile\(/);
assert.match(vault,/async function organizeItem\(/);
assert.match(vault,/async function restoreTrash\(/);
assert.match(vault,/async function commitFolderNumbering\(/);
assert.match(vault,/async function restoreFolderNumberingPoint\(/);
assert.match(vault,/selectedIds:new Set\(\)/);
assert.match(vault,/requireVault\('vaultRestoreDeleted'\)/);
assert.match(vault,/requireVault\('vaultPermanentDelete'\)/);
const backup=read('web/document-vault-hardening-runtime.js'),advanced=read('web/document-vault-advanced-runtime.js');
assert.match(backup,/indexedDB\.open\(DB,3\)/);
assert.match(advanced,/indexedDB\.open\(DB_NAME,3\)/);
const center=read('web/backup-center-runtime.js');
assert.ok(center.includes('indexedDB.open(DB)'),'Backup Center must open the current DB version');
assert.ok(!center.includes('indexedDB.open(DB,1)'),'No stale DB version');
assert.ok(center.includes('onversionchange'),'Future upgrades must close backup DB connections');
assert.ok(center.includes('ARCHIVE_STORE_UNAVAILABLE'),'Missing archive item store must fail closed');
const branch=read('web/branch-vault-runtime.js');
for(const permission of ['vaultImageEdit','vaultEnhance','vaultRestoreDeleted','vaultPermanentDelete'])assert.ok(branch.includes(permission),'Missing branch permission '+permission);
const reset=branch.slice(branch.indexOf('async function removeAllVault('),branch.indexOf('\nfunction registerCloudAdapter('));
assert.ok(reset.includes("await rpc('abu_bassam_vault_remove_all'"));
assert.ok(reset.indexOf("await rpc('abu_bassam_vault_remove_all'")<reset.indexOf('await removeVault(path)'),'Do not delete Cloud Storage ahead of metadata');
assert.match(reset,/AbuBassamOps\?\.add\?/,'Preserve archive cleanup audit logs');
assert.match(read('supabase/functions/customer-documents/index.ts'),/return p\[key\]===true;/,'Deny customer document permissions by default');
assert.match(read('supabase/functions/backup-center/index.ts'),/context\(req,'backupDelete'\)/,'Destructive backup cleanup requires explicit permission');
assert.match(read('.github/workflows/android.yml'),/if:\s*\$\{\{\s*false\s*\}\}/,'Do not enable Actions builds');
console.log('Stage62 archive integration source gate passed: '+registered.length+' unique checks and preserved main security guards.');
