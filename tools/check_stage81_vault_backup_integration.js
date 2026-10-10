'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const src=read('web/document-vault-runtime.js'),b=read('web/backup-center-runtime.js');
new vm.Script(src);new vm.Script(b);
const list=JSON.parse(read('package.json')).scripts['check:web'].split(' && ');
assert.ok(list.length>=101);assert.equal(new Set(list).size,list.length);
for(const cmd of list){assert.match(cmd,/^node tools\/check_[\w]+\.js$/);assert.ok(fs.existsSync(path.join(__dirname,'..',cmd.slice(5))))}
for(const f of ['check_vault_sync_concurrency.js','check_vault_offline_atomic_sync.js',
'check_vault_cross_device_delete_restore.js','check_vault_trash_backup_restore.js',
'check_stage80_trash_restore_races.js','check_stage81_sync_scope_queue.js','check_stage81_vault_backup_integration.js'])
 assert.ok(list.includes('node tools/'+f),'Missing '+f);
const i=src.indexOf('async function syncNow(manual=true){'),j=src.indexOf('\nfunction onShow()',i),fn=src.slice(i,j);
assert.ok(i>=0&&j>i);
assert.match(fn,/const expectedSyncScope=syncScope\(\)/);
assert.match(fn,/syncScope\(\)!==expectedSyncScope/);
assert.match(fn,/vaultScopeOk\(false\)/);
assert.match(fn,/vaultAllowed\('vaultSync'\)/);
assert.match(fn,/const row=await service.get\('vault',item.id\);\s*requireCurrentSyncScope\(\)/);
assert.match(fn,/const rows=await service.list\('vault',10000\);\s*requireCurrentSyncScope\(\)/);
assert.match(fn,/const stillPending=\(await dbAll\(\)\)\.some/);
assert.match(fn,/if\(stillPending\|\|autoSyncRerunRequested\)/);
assert.match(b,/if\(busy\)throw Error\('توجد عملية نسخ احتياطي قيد التنفيذ'\)/);
assert.match(b,/BACKUP_CHANGED_DURING_CAPTURE/);
assert.match(b,/PRE_RESTORE_BACKUP_NOT_COMMITTED/);
assert.match(read('supabase/functions/backup-center/index.ts'),/permissionEnabled\(base\.device,'backupDelete'\)/);
assert.match(read('supabase/functions/branch-vault/index.ts'),/VAULT_ACTIVE_REVISION/);
assert.match(read('.github/workflows/android.yml'),/if:\s*\$\{\{\s*false\s*\}\}/);
console.log('Stage81 archive/cloud source integration passed: 101 registered checks and retained backup/security safeguards.');
