'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const commands=JSON.parse(read('package.json')).scripts['check:web'].split(' && ');
assert.equal(commands.length,92,'Keep 90 earlier checks plus owner recovery + stage integration');
assert.equal(new Set(commands).size,92,'No duplicate test commands');
for(const command of commands){assert.match(command,/^node tools\/check_[A-Za-z0-9_]+\.js$/);assert.ok(fs.existsSync(path.join(__dirname,'..',command.slice(5))),'Missing '+command)}
for(const name of [
'check_vault_device_recovery.js','check_stage75_device_recovery_integration.js',
'check_vault_trash_backup_restore.js','check_stage74_trash_backup_integration.js',
'check_vault_backup_content_integrity.js','check_vault_backup_db_version.js',
'check_vault_restore_dedup.js','check_vault_snapshot_tombstones.js',
'check_stage73_print_preferences_integration.js','check_stage72_print_dispatch_integration.js',
'check_stage71_release_readiness_integration.js','check_stage70_question_compressor_integration.js',
'check_stage69_print_duplex_integration.js','check_stage68_cards_scannability_merge_regression.js',
'check_stage67_backup_merge_regression.js','check_stage66_offline_ocr_merge_regression.js',
'check_stage65_owner_download_integration.js','check_stage64_vault_cas_integration.js',
'check_stage63_vault_sync_integration.js','check_stage62_archive_merge_regression.js',
'check_stage61_auth_merge_regression.js','check_final_release_readiness.js'
])assert.ok(commands.includes('node tools/'+name),'Missing retained check '+name);
const cloud=read('web/backup-center-runtime.js'),hard=read('web/document-vault-hardening-runtime.js');
for(const [name,text] of [['cloud-backup',cloud],['hardening',hard],
['vault',read('web/document-vault-runtime.js')]])new vm.Script(text,{filename:name});
assert.match(hard,/const settingsEntry=zip\.file\('app-settings\.json'\);if\(settingsEntry&&!recovery\)/,'Replacement recovery must not overwrite phone settings');
assert.match(cloud,/data-owner-recovery/,'Owner device recovery button');
assert.match(cloud,/role\(\)==='owner'/,'Only owner may transfer from old branch');
assert.match(cloud,/const identity=stateScope\(\)/,'Snapshot initial account/device');
assert.match(cloud,/BACKUP_OWNER_RECOVERY_REQUIRED/);
assert.match(cloud,/if\(identity!==stateScope\(\)\|\|!can\('backupRestore'\)\)/);
assert.match(cloud,/PRE_RESTORE_BACKUP_NOT_COMMITTED/,'Must preserve a safe snapshot');
assert.match(cloud,/recoveryApproved:confirmed/,'No implicit transfer');
assert.match(cloud,/recoverySourceDeviceId:transferring\?source:''/);
assert.match(cloud,/recoveryUserId:userId/);
assert.match(hard,/function authorizeOwnerDeviceRecovery\(manifest,options=\{\}\)/);
assert.match(hard,/options\.ownerDeviceRecovery!==true\|\|role\(\)!=='owner'/);
assert.match(hard,/String\(options\.recoveryUserId\|\|''\)!==uid/);
assert.match(hard,/String\(options\.recoverySourceDeviceId\|\|''\)!==source/);
assert.match(hard,/options\.recoveryApproved!==true/);
assert.match(hard,/manifest\.trashScope!==recovery\.sourceScope/);
assert.match(hard,/if\(recovery&&\(existing\.length>0\|\|\(await backupTrash\(\)\)\.length>0\)\)/);
assert.match(hard,/if\(oldItems\.length>0\|\|oldTrash\.some\(row=>row\.scope===scope\)\)/,'Atomic fail-closed nonempty target');
assert.match(hard,/VAULT_RECOVERY_ACCESS_CHANGED/,'Check authorizations again at commit');
assert.match(hard,/recoveryUserId:recovery\.uid,recoverySourceDeviceId:recovery\.source/);
assert.match(hard,/scope:restoreScope,blob,deleted:false,syncState:'local-trash'/,'Recovered trash bound to new device');
assert.match(hard,/Number\(meta\.expiresAt\)<=now\)continue/,'Do not revive expired trash');
assert.match(hard,/if\(hasTrash\)await applyAtomicWithTrash/,'Keep same-device trash restore');
assert.match(hard,/else await applyAtomic\(prepared/,'Keep old manifest restore');
assert.match(hard,/VAULT_RESTORE_CONFLICT/,'Active-store conflict detection');
assert.match(hard,/VAULT_TRASH_RESTORE_CONFLICT/,'Trash-store conflict detection');
assert.match(read('web/backup-center-runtime.js'),/BACKUP_CHANGED_DURING_CAPTURE/);
assert.match(read('web/cards-studio-runtime.js'),/PRINT_PREFS_KEY='abuBassamCardsPrintPreferencesV1'/);
assert.match(read('web/a4-card-sheet-editor-v2-runtime.js'),/doc\.documentElement\.cloneNode\(true\)/);
assert.match(read('web/document-vault-offline-ocr-runtime.js'),/createWorker\('ara\+eng'/);
assert.match(read('web/branch-vault-runtime.js'),/abu_bassam_vault_upsert_cas/);
assert.match(read('supabase/functions/backup-center/index.ts'),/scopeAllowed\(base\.device,base\.deviceId,row\)/);
assert.match(read('supabase/functions/backup-center/index.ts'),/base\.device\.role==='owner'/);
assert.match(read('supabase/functions/branch-vault/index.ts'),/createSignedUrl\(path,60,\{download:false\}\)/);
assert.match(read('.github/workflows/android.yml'),/if:\s*\$\{\{\s*false\s*\}\}/);
console.log('Stage75 replacement-device recovery source gate passed: 92 registered scripts; only authorized owner transfer to empty destination, original account/branch scope and rollback-aware atomic restore.');
