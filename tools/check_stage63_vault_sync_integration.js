'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const checks=JSON.parse(read('package.json')).scripts['check:web'].split(' && ');
assert.ok(checks.length>=65,'Keep all prior repair-stage checks');
assert.equal(new Set(checks).size,checks.length,'Never register duplicate test commands');
for(const script of checks){
 assert.match(script,/^node tools\/check_[\w]+\.js$/);
 assert.ok(fs.existsSync(path.join(root,script.slice(5))),'Missing check source '+script);
}
for(const required of [
 'check_stage61_auth_merge_regression.js','check_stage62_archive_merge_regression.js',
 'check_backup_delete_permission.js','check_archive_edge_permissions.js',
 'check_vault_backup_db_version.js','check_vault_trash_drag.js',
 'check_vault_sync_concurrency.js','check_vault_snapshot_tombstones.js',
 'check_vault_atomic_capacity.js','check_vault_cross_device_delete_restore.js'
])assert.ok(checks.includes('node tools/'+required),'Missing integration safeguard '+required);
const vault=read('web/document-vault-runtime.js'),hardening=read('web/document-vault-hardening-runtime.js');
const branch=read('web/branch-vault-runtime.js'),backup=read('web/backup-center-runtime.js');
for(const source of ['web/document-vault-runtime.js','web/document-vault-hardening-runtime.js','web/branch-vault-runtime.js','web/backup-center-runtime.js'])new vm.Script(read(source),{filename:source});
function segment(source,start,end){
 const first=source.indexOf(start),last=source.indexOf(end,first+start.length);
 assert.ok(first>=0&&last>first,'Cannot find '+start+'...'+end);
 return source.slice(first,last);
}
const apply=segment(vault,'async function dbApplySyncIfUnchanged(','async function dbReconcileRemoteDeletionToTrashIfUnchanged(');
assert.match(apply,/db\.transaction\(STORE,'readwrite'\)/,'Atomic incoming sync');
assert.match(apply,/syncSnapshot\(current\)===syncSnapshot\(expected\)/,'Reject stale local edits');
assert.match(apply,/VAULT_LIMIT_1000/,'Incoming cloud files obey capacity');
assert.match(apply,/store\.add\(localCopy\)/,'Preserve concurrent modifications');
const crossTrash=segment(vault,'async function dbReconcileRemoteDeletionToTrashIfUnchanged(','\nfunction addCss()');
assert.match(crossTrash,/db\.transaction\(\[STORE,TRASH_STORE\],'readwrite'\)/,'Trash and active item updates are atomic');
assert.match(crossTrash,/scope!==syncScope\(\)/,'Never transfer a branch deletion across accounts');
assert.match(crossTrash,/TRASH_MS/,'Preserve 30-day deletion recovery');
const batch=segment(vault,'async function dbPutBatch(','async function dbDelete(');
assert.match(batch,/rows\.filter\(row=>!row\.deleted\)\.length\+items\.length>MAX_ITEMS/,'Atomic 1000 item quota');
assert.match(vault,/async function addBlob\([^\n]*await dbPutBatch\(\[item\]\)/,'OCR imports respect quota');
const edited=segment(vault,'async function commitEditedFile(','async function saveEditedBlob(');
assert.match(edited,/VAULT_LIMIT_1000/,'Preserved-original copies cannot bypass limit');
assert.match(edited,/VAULT_STALE_ITEM/,'Concurrent edit must not overwrite newer version');
const restore=segment(hardening,'async function applyAtomic(','async function '); // refined below if a following function is present
assert.match(hardening,/VAULT_RESTORE_CONFLICT/,'Reject delayed restore replacing newer edits');
assert.match(hardening,/VAULT_RESTORE_DUPLICATE/,'Reject duplicate restored item ids');
assert.ok(!restore.includes('store.clear()'),'ZIP snapshots must retain cloud deletion tombstones');
assert.match(vault,/deletionConflictsSaved/,'Cloud deletion conflicts require a second sync pass');
assert.match(backup,/indexedDB\.open\(DB\)/,'Keep Backup Center database version compatibility');
assert.doesNotMatch(backup,/indexedDB\.open\(DB,1\)/);
const reset=segment(branch,'async function removeAllVault(','\nfunction registerCloudAdapter(');
assert.ok(reset.indexOf("await rpc('abu_bassam_vault_remove_all'")>=0);
assert.ok(reset.indexOf("await rpc('abu_bassam_vault_remove_all'")<reset.indexOf('await removeVault(path)'),'Cloud metadata deletion precedes object cleanup');
assert.match(reset,/AbuBassamOps\?\.add\?/,'Retain cleanup audit log');
for(const permission of ['vaultRestoreDeleted','vaultPermanentDelete','vaultImageEdit','vaultEnhance'])assert.ok(branch.includes(permission),'Maintain explicit branch archive permission '+permission);
assert.match(read('supabase/functions/customer-documents/index.ts'),/return p\[key\]===true;/,'No legacy permission fallback');
assert.match(read('supabase/functions/backup-center/index.ts'),/context\(req,'backupDelete'\)/,'Cloud destructive cleanup is role gated');
assert.match(read('.github/workflows/android.yml'),/if:\s*\$\{\{\s*false\s*\}\}/,'Do not enable Android Actions');
console.log('Stage63 archive sync static integration passed: '+checks.length+' registered unique checks, protected trash, restore and cloud permissions.');
