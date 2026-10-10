'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const cmds=JSON.parse(read('package.json')).scripts['check:web'].split(' && ');
assert.ok(cmds.length>=74,'Preserve prior seventy-two registered tests');
assert.equal(cmds.length,new Set(cmds).size,'No duplicate checks');
for(const cmd of cmds){
 assert.match(cmd,/^node tools\/check_[A-Za-z0-9_]+\.js$/);
 assert.ok(fs.existsSync(path.join(root,cmd.slice(5))),'Missing test source '+cmd);
}
for(const expected of [
 'check_vault_backup_content_integrity.js','check_stage67_backup_merge_regression.js',
 'check_stage66_offline_ocr_merge_regression.js','check_stage65_owner_download_integration.js',
 'check_stage64_vault_cas_integration.js','check_stage63_vault_sync_integration.js',
 'check_stage62_archive_merge_regression.js','check_stage61_auth_merge_regression.js',
 'check_vault_backup_db_version.js','check_vault_restore_dedup.js',
 'check_vault_snapshot_tombstones.js','check_backup_delete_permission.js'
])assert.ok(cmds.includes('node tools/'+expected),'Missing regression '+expected);
const backup=read('web/backup-center-runtime.js'),hardening=read('web/document-vault-hardening-runtime.js');
const vault=read('web/document-vault-runtime.js'),ocr=read('web/document-vault-offline-ocr-runtime.js'),
      branch=read('web/branch-vault-runtime.js');
for(const [file,code] of [
 ['web/backup-center-runtime.js',backup],['web/document-vault-hardening-runtime.js',hardening],
 ['web/document-vault-runtime.js',vault],['web/document-vault-offline-ocr-runtime.js',ocr],
 ['web/branch-vault-runtime.js',branch]
])new vm.Script(code,{filename:file});
const between=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,'Missing section '+a);return s.slice(i,j)};
const fingerprint=between(backup,'async function fingerprint(){','\nasync function packageBytes(){');
assert.match(fingerprint,/await item\.blob\.arrayBuffer\(\)/,'Hash full content, not file metadata only');
assert.match(fingerprint,/await digest\(bytes\)/);
assert.match(fingerprint,/Number\.isInteger\(item\.manualOrder\)\?item\.manualOrder:null/,'Order must influence backup fingerprint');
assert.match(fingerprint,/settings:safeSettings\(\)/,'Settings must influence backup fingerprint');
assert.match(backup,/crypto\.subtle\.digest\('SHA-256'/,'Production uses SHA-256');
const cloud=between(backup,'async function packageBytes(){','\nasync function secret(){');
const local=between(hardening,'async function backupBytes(){','\nfunction strong(');
for(const [label,s] of [['cloud',cloud],['local',local]]){
 assert.match(s,/String\(index\+1\)\.padStart\(6,'0'\)/,'Unique ordinal ZIP entries in '+label);
 assert.match(s,/manualOrder:Number\.isInteger\(item\.manualOrder\)\?item\.manualOrder:null/,'Preserve manual order in '+label);
 assert.match(s,/item\.blob\.size/,'Enforce actual blob-size quota in '+label);
 assert.doesNotMatch(s,/replace\(\/\[\^a-zA-Z0-9\]/,'Avoid colliding sanitized IDs');
}
const run=between(backup,"async function backupNow(kind='manual',force=false){",'\nasync function downloadBytes(');
assert.match(run,/if\(await fingerprint\(\)!==fp\)throw Error\('BACKUP_CHANGED_DURING_CAPTURE'\)/);
assert.ok(run.indexOf("throw Error('BACKUP_CHANGED_DURING_CAPTURE')")<run.indexOf("api('plan','POST'"),'Reject changed local capture before cloud upload plan');
assert.match(backup,/indexedDB\.open\(DB\)/,'Preserve v3 IndexedDB open compatibility');
assert.doesNotMatch(backup,/indexedDB\.open\(DB,1\)/,'Never downgrade local vault database');
assert.match(hardening,/VAULT_RESTORE_CONFLICT/,'Do not overwrite concurrent local edits during restore');
assert.match(hardening,/VAULT_RESTORE_DUPLICATE/,'Reject duplicate restore IDs');
assert.match(hardening,/Number\.isInteger\(meta\.manualOrder\)\?meta\.manualOrder:null/,'Restore manual ordering');
assert.match(ocr,/createWorker\('ara\+eng'/,'Retain offline OCR');
assert.doesNotMatch(vault,/https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract/i);
assert.match(branch,/abu_bassam_vault_upsert_cas/,'Preserve server CAS');
assert.match(branch,/async function ownerList\(/,'Preserve owner-only archive browser');
assert.match(branch,/async function downloadVault\(path,expectedUpdatedAt\)/,'Preserve revision-bound downloads');
assert.match(branch,/vaultOcr:'قراءة النص من الصور'/);
for(const perm of ['vaultImageEdit','vaultEnhance','vaultRestoreDeleted','vaultPermanentDelete'])assert.ok(branch.includes(perm),'Keep permission '+perm);
const reset=between(branch,'async function removeAllVault(','function registerCloudAdapter(');
assert.ok(reset.indexOf("await rpc('abu_bassam_vault_remove_all'")<reset.indexOf('await removeVault(path)'),'Do not remove cloud blobs before metadata');
assert.match(reset,/AbuBassamOps\?\.add\?/,'Keep cleanup audit');
assert.match(read('supabase/functions/customer-documents/index.ts'),/return p\[key\]===true;/);
assert.match(read('supabase/functions/backup-center/index.ts'),/context\(req,'backupDelete'\)/);
assert.match(read('.github/workflows/android.yml'),/if:\s*\$\{\{\s*false\s*\}\}/,'Keep Android actions disabled');
console.log('Stage67 backup integrity integration gate passed: '+cmds.length+' unique registered tests, SHA-256 content, ordering, safe ZIP paths and preceding security invariants.');
