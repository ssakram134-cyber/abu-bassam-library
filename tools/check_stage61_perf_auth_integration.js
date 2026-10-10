'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const pkg=JSON.parse(read('package.json'));
const checks=(pkg.scripts['check:web']||'').split(' && ');
assert.ok(checks.length>=53,'Retain root tests and new performance/auth verification');
assert.equal(new Set(checks).size,checks.length);
for(const name of [
 'check_recovery_owner_identity.js','check_library_reset_deeplink.js',
 'check_auth_storage_pkce_isolation.js','check_auth_recovery_callback_profile.js',
 'check_auth_session_switch_offline.js','check_operation_log_timer_hardening.js',
 'check_runtime_scheduler_safety.js','check_audit_vault_write_races.js'
]){assert.ok(checks.includes('node tools/'+name),'Missing test '+name);
 assert.ok(fs.existsSync(path.join(__dirname,name)),'Missing test file '+name);}
const files=[
 'web/secure-sync-runtime.js','web/app-security-runtime.js',
 'web/password-recovery-runtime.js','web/notification-center-runtime.js',
 'web/operation-log-corrections-runtime.js','web/account-center-runtime.js',
 'web/document-vault-runtime.js','web/security-hardening-runtime.js'];
for(const p of files)new vm.Script(read(p),{filename:p});
const secure=read(files[0]),app=read(files[1]),recovery=read(files[2]),
      notify=read(files[3]),ops=read(files[4]),account=read(files[5]);
assert.match(secure,/function authSecureKey\(requestedKey\)/);
assert.match(secure,/AUTH_STORAGE_KEY_NOT_ALLOWED/);
assert.match(secure,/authSecureKey\(key\)/);
assert.match(read('index.js'),/DeviceEventEmitter\.addListener\('abu-bassam-auth-callback-saved'/);
const deepLink=read('index-auth.js');
assert.match(deepLink,/DeviceEventEmitter\.emit\('abu-bassam-auth-callback-saved'\)/);
assert.doesNotMatch(deepLink,/DeviceEventEmitter\.emit\('abu-bassam-auth-callback-saved',/,'Never include secret link in event payload');
assert.match(app,/function onAuthAccountChanged\(/);
assert.match(app,/if\(navigator\.onLine\)return setError/);
assert.match(app,/OFFLINE_SIGNED_OUT_KEY/);
assert.match(account,/abu-bassam-auth-changed/);
assert.match(recovery,/exchangeCodeForSession\(code\)/);
assert.match(recovery,/updateUser\(\{password/);
assert.match(notify,/visibilityState==='hidden'/);
assert.match(ops,/60000/);
const edge=read('supabase/functions/backup-center/index.ts');
assert.match(edge,/function mayCleanup\(/);
assert.match(edge,/permissionEnabled\(base.device,'backupDelete'\)/);
assert.match(edge,/context\(req,'backupDelete'\)/);
assert.match(read('supabase/functions/customer-documents/index.ts'),/return p\[key\]===true;/);
assert.match(read('web/branch-vault-runtime.js'),/await rpc\('abu_bassam_vault_remove_all'/);
assert.match(read('.github/workflows/android.yml'),/if:\s*\$\{\{\s*false\s*\}\}/);
console.log('Stage61 integration gate passed: PKCE, deep links, session/offline locks, observer controls, and retained main archive security.');
