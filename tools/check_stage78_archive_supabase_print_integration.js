'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const commands=JSON.parse(read('package.json')).scripts['check:web'].split(' && ');
assert.ok(commands.length>=95,'Preserve 93 Stage77 commands plus two Stage78 checks');
assert.equal(new Set(commands).size,commands.length,'No duplicate tests');
for(const item of commands){
 assert.match(item,/^node tools\/check_[A-Za-z0-9_]+\.js$/);
 assert.ok(fs.existsSync(path.join(root,item.slice(5))),'Missing '+item);
}
for(const name of ['check_stage77_root_ancestry_security.js','check_stage75_device_recovery_integration.js',
 'check_vault_trash_backup_restore.js','check_print_preferences_persistence.js','check_vault_device_recovery.js',
 'check_backup_delete_permission.js','check_archive_edge_permissions.js',
 'check_stage78_print_backup_roundtrip.js','check_stage78_archive_supabase_print_integration.js'])
 assert.ok(commands.includes('node tools/'+name),'Lost security/integration gate '+name);
const hard=read('web/document-vault-hardening-runtime.js');
const cloud=read('web/backup-center-runtime.js');
const cards=read('web/cards-studio-runtime.js'),photo=read('web/index.html');
for(const source of [hard,cloud,cards])new vm.Script(source);
assert.match(hard,/CardsPrintPreferencesV1\$/,'Card paper and DPI now allowlisted for backup');
assert.match(hard,/DpiEnabledV1\$/,'Photo DPI on/off now allowlisted for backup');
assert.match(hard,/MODERN_PRINT_BACKUP_KEYS\.has\(k\)/,'Older ZIP must not clear new print settings');
assert.match(hard,/settings:settings\(\)/);
assert.match(cloud,/settings:safeSettings\(\)/);
assert.match(cloud,/settings:safeSettings\(\)\}/,'Fingerprint must incorporate changes to print settings');
assert.match(hard,/if\(settingsEntry&&!recovery\)/);
assert.match(cloud,/ownerDeviceRecovery/);
assert.match(cards,/const PRINT_PREFS_KEY='abuBassamCardsPrintPreferencesV1'/);
assert.match(cards,/function persistPrintPrefs\(\)/);
assert.match(photo,/abuBassamPrintSettingsV1/);
assert.match(photo,/abuBassamDpiEnabledV1/);
const backup=read('supabase/functions/backup-center/index.ts');
for(const pattern of [/function mayCleanup\(/,/permissionEnabled\(base\.device,'backupDelete'\)/,
 /context\(req,\['backupCreate','backupRestore'\]\)/,/scopeAllowed\(base\.device,base\.deviceId,row\)/])
 assert.match(backup,pattern,'Retain Supabase backup server permissions');
assert.match(read('supabase/functions/customer-documents/index.ts'),/return p\[key\]===true/);
assert.match(read('supabase/functions/branch-vault/index.ts'),/VAULT_ACTIVE_REVISION/);
assert.match(hard,/VAULT_TRASH_RESTORE_CONFLICT/);
assert.match(cards,/editor\.openPrint\(html,dispatched\)/);
assert.match(cards,/editor\.openPdf\(name,html,dispatched\)/);
assert.match(read('web/a4-card-sheet-editor-v2-runtime.js'),/doc\.documentElement\.cloneNode\(true\)/);
assert.match(read('.github/workflows/android.yml'),/if:\s*\$\{\{\s*false\s*\}\}/);
console.log('Stage78 archive+Supabase+print source integration passed: safe setting backups, continued print pipeline and server permissions.');
