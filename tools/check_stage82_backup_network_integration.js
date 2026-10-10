'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const list=JSON.parse(read('package.json')).scripts['check:web'].split(' && ');
assert.ok(list.length>=103);assert.equal(new Set(list).size,list.length);
for(const cmd of list){assert.match(cmd,/^node tools\/check_[A-Za-z0-9_]+\.js$/);assert.ok(fs.existsSync(path.join(__dirname,'..',cmd.slice(5))))}
for(const f of ['check_vault_backup_content_integrity.js','check_stage81_sync_scope_queue.js',
 'check_vault_trash_backup_restore.js','check_stage82_backup_scope_commit.js','check_stage82_backup_network_integration.js'])
 assert.ok(list.includes('node tools/'+f));
const backup=read('web/backup-center-runtime.js');new vm.Script(backup);
assert.match(backup,/const originalScope=stateScope\(\)/);
assert.match(backup,/if\(stateScope\(\)!==originalScope\|\|!can\(required\)\)/);
assert.match(backup,/BACKUP_SCOPE_CHANGED/);
assert.match(backup,/backupId=String\(plan\.backup_id\|\|''\)/);
assert.match(backup,/const receipt=await retry\(async\(\)=>\{/);
assert.match(backup,/const reply=await api\('commit','POST',\{backup_id:backupId,retention:retention\(\)\}\)/);
assert.match(backup,/committed=receipt\.ok===true/);
assert.match(backup,/if\(committed\)\{/);
assert.match(backup,/if\(stateScope\(\)===originalScope\)/);
assert.match(backup,/uploadPart\(plan\.uploads\[i\]\.path,plan\.uploads\[i\]\.token,blob,verifyScope\)/);
assert.match(read('supabase/functions/backup-center/index.ts'),/if\(row\.ready\)return json\(\{ok:true,already_ready:true\}\)/);
assert.match(read('supabase/functions/backup-center/index.ts'),/permissionEnabled\(base\.device,'backupDelete'\)/);
assert.match(read('web/document-vault-runtime.js'),/VAULT_SYNC_SCOPE_CHANGED/);
assert.match(read('web/document-vault-hardening-runtime.js'),/restoreInFlight=true/);
assert.match(read('.github/workflows/android.yml'),/if:\s*\$\{\{\s*false\s*\}\}/);
console.log('Stage82 backup/server integrity passed: 103 registered checks, idempotent server commit and scope-locked multipart uploads.');
