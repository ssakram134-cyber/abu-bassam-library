'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const registered=JSON.parse(read('package.json')).scripts['check:web'].split(' && ');
assert.equal(registered.length,90,'Keep 88 previous commands and two new checks');
assert.equal(registered.length,new Set(registered).size,'No test command duplication');
for(const cmd of registered){assert.match(cmd,/^node tools\/check_[A-Za-z0-9_]+\.js$/);assert.ok(fs.existsSync(path.join(__dirname,'..',cmd.slice(5))),'Missing check '+cmd)}
for(const f of ['check_vault_trash_backup_restore.js','check_stage74_trash_backup_integration.js',
'check_vault_backup_content_integrity.js','check_vault_snapshot_tombstones.js',
'check_vault_restore_dedup.js','check_vault_backup_db_version.js','check_vault_trash_drag.js',
'check_stage73_print_preferences_integration.js','check_stage72_print_dispatch_integration.js',
'check_stage71_release_readiness_integration.js','check_stage70_question_compressor_integration.js',
'check_stage69_print_duplex_integration.js','check_stage68_cards_scannability_merge_regression.js',
'check_stage67_backup_merge_regression.js','check_stage66_offline_ocr_merge_regression.js',
'check_stage65_owner_download_integration.js','check_stage64_vault_cas_integration.js',
'check_stage63_vault_sync_integration.js','check_stage62_archive_merge_regression.js',
'check_stage61_auth_merge_regression.js','check_final_release_readiness.js'])
assert.ok(registered.includes('node tools/'+f),'Required prior check absent '+f);
const cloud=read('web/backup-center-runtime.js'),hard=read('web/document-vault-hardening-runtime.js'),
 vault=read('web/document-vault-runtime.js');
for(const [name,code] of [['cloud',cloud],['hardening',hard],['vault',vault]])new vm.Script(code,{filename:name});
assert.match(cloud,/async function trashItems\(\)/);
assert.match(cloud,/row\.scope===scope/,'Only account/device-scoped trash may leave phone');
assert.match(cloud,/Number\(row\.expiresAt\)>now/);
assert.match(cloud,/for\(const row of await trashItems\(\)\)/,'Trash metadata+bytes affect cloud checkpoint');
assert.match(cloud,/const bytes=new Uint8Array\(await row\.blob\.arrayBuffer\(\)\)/);
assert.match(cloud,/manifest\.trash\.push\(/,'Archive ZIP holds recycle bin');
assert.match(cloud,/sha256:await digest\(new Uint8Array\(await row\.blob\.arrayBuffer\(\)\)\)/);
assert.match(cloud,/trashCount:manifest\.trash\.length/);
assert.match(cloud,/BACKUP_CHANGED_DURING_CAPTURE/,'Do not upload changed source');
assert.match(hard,/async function backupTrash\(\)/,'Local encrypted and ZIP exports include trash');
assert.match(hard,/trashScope:trashScope\(\),trash:\[\]/);
assert.match(hard,/const sha256=await blobHash\(row\.blob\)/);
assert.match(hard,/if\(manifest\.trash!==undefined\)/,'Legacy snapshots may lack trash');
assert.match(hard,/manifest\.trashScope!==trashScope\(\)/);
assert.match(hard,/allowed\('vaultRestoreDeleted'\)/,'Restoring backup trash is granular permission controlled');
assert.match(hard,/expires>deleted\+30\*86400000/);
assert.match(hard,/VAULT_TRASH_HASH_REQUIRED/);
assert.match(hard,/VAULT_TRASH_HASH_MISMATCH/);
assert.match(hard,/if\(Number\(meta\.expiresAt\)<=now\)continue/,'Never revive expired records');
assert.match(hard,/function applyAtomicWithTrash\(items,trashRows/);
assert.match(hard,/db\.transaction\(\[STORE,'trash'\],'readwrite'\)/);
assert.match(hard,/VAULT_TRASH_RESTORE_CONFLICT/);
assert.match(hard,/VAULT_TRASH_SCOPE_COLLISION/);
assert.match(hard,/if\(hasTrash\)await applyAtomicWithTrash/);
assert.match(hard,/else await applyAtomic\(prepared/,'Legacy archive does not clear local trash');
assert.doesNotMatch(hard,/trash\.clear\(\)/,'Never wipe current trash on snapshot restore');
assert.match(vault,/TRASH_DAYS=30/);
assert.match(vault,/source\.scope!==scope/);
assert.match(vault,/const folder=String\(source\.folder\|\|''\)/);
assert.match(vault,/Number\(source\.expiresAt\)<=now/);
assert.match(read('web/cards-studio-runtime.js'),/PRINT_PREFS_KEY='abuBassamCardsPrintPreferencesV1'/);
assert.match(read('web/cards-studio-runtime.js'),/editor\.openPrint\(html,dispatched\)/);
assert.match(read('web/a4-card-sheet-editor-v2-runtime.js'),/doc\.documentElement\.cloneNode\(true\)/);
assert.match(read('web/document-vault-offline-ocr-runtime.js'),/createWorker\('ara\+eng'/);
assert.match(read('web/branch-vault-runtime.js'),/abu_bassam_vault_upsert_cas/);
assert.match(read('supabase/functions/branch-vault/index.ts'),/createSignedUrl\(path,60,\{download:false\}\)/);
assert.match(read('supabase/functions/backup-center/index.ts'),/context\(req,'backupDelete'\)/);
assert.match(read('.github/workflows/android.yml'),/if:\s*\$\{\{\s*false\s*\}\}/);
console.log('Stage74 trash-backup integration gate: 90 registered commands, scoped unexpired trash, SHA-256, atomic restore, legacy compatibility and prior security checks.');
