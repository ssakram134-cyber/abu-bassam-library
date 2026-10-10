'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const p=JSON.parse(read('package.json')),cmds=p.scripts['check:web'].split(' && ');
assert.ok(cmds.length>=97,'Keep 95 earlier tests and register two stage79 checks');
assert.equal(new Set(cmds).size,cmds.length,'No duplicate tests');
for(const cmd of cmds){assert.match(cmd,/^node tools\/check_[A-Za-z0-9_]+\.js$/);assert.ok(fs.existsSync(path.join(root,cmd.slice(5))),'Missing '+cmd)}
for(const name of [
 'check_stage78_print_backup_roundtrip.js','check_stage78_archive_supabase_print_integration.js',
 'check_stage77_root_ancestry_security.js','check_vault_device_recovery.js','check_vault_trash_backup_restore.js',
 'check_vault_snapshot_tombstones.js','check_vault_backup_db_version.js','check_backup_delete_permission.js',
 'check_print_preferences_persistence.js','check_stage79_restore_commit_boundaries.js','check_stage79_archive_powerloss_integration.js'
])assert.ok(cmds.includes('node tools/'+name),'Lost regression gate '+name);
const h=read('web/document-vault-hardening-runtime.js'),b=read('web/backup-center-runtime.js');
new vm.Script(h);new vm.Script(b);
for(const rx of [/VAULT_RESTORE_CONFLICT/,/VAULT_TRASH_RESTORE_CONFLICT/,/VAULT_RECOVERY_ACCESS_CHANGED/,
 /VAULT_SETTINGS_INVALID/,/VAULT_SETTINGS_SAVE_FAILED/,/committed=true;/,
 /if\(committed\)\{/,/return await finishRestoredArchive/,/const settingsEntry=zip\.file\('app-settings\.json'\);if\(settingsEntry&&!recovery\)/])
 assert.match(h,rx,'Archive atomic/restore regression');
const first=h.indexOf("const settingsEntry=zip.file('app-settings.json')"),tx=h.indexOf('await applyAtomicWithTrash(prepared,preparedTrash,{');
assert.ok(first>=0&&tx>first,'Settings corrupt ZIP must be rejected before data commit');
assert.match(b,/PRE_RESTORE_BACKUP_NOT_COMMITTED/);
assert.match(b,/BACKUP_CHANGED_DURING_CAPTURE/);
assert.match(b,/BACKUP_IDENTITY_CHANGED/);
assert.match(b,/try\{await refreshList\(\)\}catch\(_\)\{/);
assert.match(b,/status\('حُفظ الأرشيف في الحساب السابق/);
assert.match(read('supabase/functions/backup-center/index.ts'),/permissionEnabled\(base\.device,'backupDelete'\)/);
assert.match(read('supabase/functions/customer-documents/index.ts'),/return p\[key\]===true/);
assert.match(read('supabase/functions/branch-vault/index.ts'),/VAULT_ACTIVE_REVISION/);
assert.match(read('web/cards-studio-runtime.js'),/abuBassamCardsPrintPreferencesV1/);
assert.match(read('web/index.html'),/abuBassamDpiEnabledV1/);
assert.match(read('.github/workflows/android.yml'),/if:\s*\$\{\{\s*false\s*\}\}/);
console.log('Stage79 archive/Supabase/print interruption security gate passed: staged metadata, atomic IndexedDB boundary, committed results, tests retained.');
