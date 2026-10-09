'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,'supabase','functions',name,'index.ts'),'utf8');
const backup=read('backup-center'),customer=read('customer-documents'),vault=read('branch-vault');
for(const [name,code] of [['backup-center',backup],['customer-documents',customer],['branch-vault',vault]]){
  assert.match(code,/@supabase\/supabase-js@2\.117\.2/,name+' must use the verified server client runtime');
  assert.match(code,/SUPABASE_SERVICE_ROLE_KEY/,name+' service-side authorization must stay server-side');
}
assert.match(backup,/function mayCleanup\(/);
assert.match(backup,/permissionEnabled\(base.device,'backupDelete'\)/);
assert.match(backup,/context\(req,'backupDelete'\)/);
assert.match(backup,/mayCleanup\(base\)\?await cleanupPending\(base\):0/);
assert.match(backup,/!mayCleanup\(base\)\?0:await cleanupReady\(base,retention\)/);
assert.match(customer,/return p\[key\]===true;/,'Branch permissions must require an explicit grant');
assert.doesNotMatch(customer,/DEFAULT_ALLOWED|legacyFallback\(/);
assert.match(vault,/function validItemId\(/);
assert.match(vault,/function isItemRevision\(/);
assert.match(vault,/if\(path&&!isItemRevision\(path,base\.user\.id,base\.deviceId,itemId\)\)/);
assert.match(vault,/VAULT_ACTIVE_REVISION/);
assert.equal((vault.match(/if\(!validItemId\(itemId\)\)/g)||[]).length,3,'All signed actions validate item identity');
console.log('Archive server security release gate passed: backup deletion, document grants, item-bound storage and pinned runtime');
