'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const checks=JSON.parse(read('package.json')).scripts['check:web'].split(' && ');
assert.ok(checks.length>=53,'Preserve all root and stage 61 checks');
assert.equal(new Set(checks).size,checks.length,'Do not register duplicate tests');
const required=[
 'check_recovery_owner_identity.js','check_library_reset_deeplink.js',
 'check_auth_storage_pkce_isolation.js','check_auth_recovery_callback_profile.js',
 'check_auth_session_switch_offline.js','check_operation_log_timer_hardening.js',
 'check_runtime_scheduler_safety.js','check_audit_vault_write_races.js',
 'check_backup_delete_permission.js','check_archive_edge_permissions.js',
 'check_archive_server_release_gate.js','check_archive_reset_cleanup.js',
 'check_pr27_main_hotfix_integration.js'
];
for(const name of required){
 assert.ok(checks.includes('node tools/'+name),'Missing source/security gate: '+name);
 assert.ok(fs.existsSync(path.join(__dirname,name)),'Missing test file: '+name);
}
const web=[
 'web/secure-sync-runtime.js','web/password-recovery-runtime.js','web/app-security-runtime.js',
 'web/security-hardening-runtime.js','web/operation-log-corrections-runtime.js',
 'web/notification-center-runtime.js','web/document-vault-runtime.js'
];
for(const p of web)new vm.Script(read(p),{filename:p});
const sync=read('web/secure-sync-runtime.js');
assert.match(sync,/function authSecureKey\(/,'Tokens and PKCE verifier keys must be isolated');
assert.match(sync,/secureGet/);
assert.match(sync,/secureSet/);
const pass=read('web/password-recovery-runtime.js');
assert.match(pass,/verifyOwnerSession\(/,'Reset must verify account owner');
assert.match(pass,/consumeRecoveryCallback\(/,'Reset callback must be handled');
const native=read('index-auth.js');
assert.match(native,/expo-secure-store/,'Native callback must use private credential store');
assert.match(native,/SecureStore\.setItemAsync/);
const account=read('web/app-security-runtime.js');
assert.match(account,/OFFLINE_SIGNED_OUT_KEY/,'Explicit logout must close offline access');
assert.match(account,/sessionUserId\(/,'Session switching must identify account');
const hardening=read('web/security-hardening-runtime.js');
assert.match(hardening,/SECURE_TRUST_KEY/);
assert.match(hardening,/OFFLINE_SIGNED_OUT_KEY/);
const backup=read('supabase/functions/backup-center/index.ts');
assert.match(backup,/function mayCleanup\(/);
assert.match(backup,/permissionEnabled\(base.device,'backupDelete'\)/);
assert.match(backup,/context\(req,'backupDelete'\)/);
const customer=read('supabase/functions/customer-documents/index.ts');
assert.match(customer,/return p\[key\]===true;/,'Branch permissions must deny by default');
const archive=read('web/branch-vault-runtime.js');
const start=archive.indexOf('async function removeAllVault('),end=archive.indexOf('\nfunction registerCloudAdapter(',start);
assert.ok(start>=0&&end>start,'Vault reset must be present');
const reset=archive.slice(start,end);
assert.ok(reset.indexOf("await rpc('abu_bassam_vault_remove_all'")<reset.indexOf("await removeVault(path)"),'Never delete live Storage before metadata');
assert.match(reset,/AbuBassamOps\?\.add\?/,'Deferred cleanup failures must remain auditable');
const action=read('.github/workflows/android.yml');
assert.match(action,/if:\s*\$\{\{\s*false\s*\}\}/,'Android Actions build remains disabled');
console.log('Stage 61 guards passed: auth session/PKCE, native SecureStore recovery, offline signout, security-safe backup deletion and archived main hotfix tests.');
