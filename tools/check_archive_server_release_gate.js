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
// Each action must reject malformed IDs; download routes additionally bind the
// signed URL to current item metadata and the expected revision to prevent stale links.
const route=(start,end)=>{const a=vault.indexOf(start),b=vault.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,'Expected route: '+start);return vault.slice(a,b)};
const upload=route("if(action==='upload-url'","if(action==='download-url'");
const download=route("if(action==='download-url'","if(action==='owner-download-url'");
const ownerDownload=route("if(action==='owner-download-url'","const discardUpload=");
const removal=route("const discardUpload=","return json({error:'UNSUPPORTED_ACTION'}");
assert.match(upload,/if\(!validItemId\(itemId\)\)/,'Upload rejects malformed item identifiers');
assert.match(download,/!validItemId\(itemId\)\|\|!expectedPath\|\|!expectedVersion/,'Signed download requires item, exact path and revision');
assert.match(download,/path!==expectedPath\|\|String\(row.updated_at\|\|''\)!==expectedVersion/,'Signed download refuses stale metadata');
assert.match(ownerDownload,/!validItemId\(itemId\)\|\|!validItemId\(targetDevice\)\|\|!expected/,'Owner download validates item and branch identity');
assert.match(ownerDownload,/base.device.role!=='owner'/,'Cross-branch download must stay owner-only');
assert.match(ownerDownload,/String\(row.updated_at\|\|''\)!==expected/,'Owner download refuses stale metadata');
assert.match(removal,/if\(!validItemId\(itemId\)\)/,'Deletion rejects malformed item identifiers');
assert.match(removal,/VAULT_ACTIVE_REVISION/,'Deletion must protect live storage revision');
console.log('Archive server security release gate passed: backup deletion, document grants, item-bound storage and pinned runtime');
