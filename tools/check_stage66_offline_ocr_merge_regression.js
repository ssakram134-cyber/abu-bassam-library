'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const commands=JSON.parse(read('package.json')).scripts['check:web'].split(' && ');
assert.ok(commands.length>=72,'Keep earlier 70 checks plus OCR and integration tests');
assert.equal(commands.length,new Set(commands).size,'Check registry must be unique');
for(const command of commands){
 assert.match(command,/^node tools\/check_[\w]+\.js$/);
 assert.ok(fs.existsSync(path.join(root,command.slice(5))),'Missing check source: '+command);
}
for(const required of [
 'check_stage61_auth_merge_regression.js','check_stage62_archive_merge_regression.js',
 'check_stage63_vault_sync_integration.js','check_stage64_vault_cas_integration.js',
 'check_stage65_owner_download_integration.js','check_stage66_offline_ocr_merge_regression.js',
 'check_vault_signed_download_security.js','check_vault_owner_branch_browser.js',
 'check_vault_offline_ocr_runtime.js','check_vault_server_cas.js'
])assert.ok(commands.includes('node tools/'+required),'Missing existing repair test '+required);
const runtime=read('web/document-vault-runtime.js'),
      ocr=read('web/document-vault-offline-ocr-runtime.js'),
      boot=read('web/device-name-runtime.js'),
      access=read('web/branch-vault-runtime.js'),
      assets=read('scripts/prepare-android-assets.mjs');
for(const [filename,src] of [
 ['web/document-vault-runtime.js',runtime],['web/document-vault-offline-ocr-runtime.js',ocr],
 ['web/device-name-runtime.js',boot],['web/branch-vault-runtime.js',access]
])new vm.Script(src,{filename});
assert.match(boot,/await loadDocumentVaultHardening\(\);\s*await loadDocumentVaultOfflineOcr\(\)/,'Deterministic runtime initialization');
assert.match(boot,/document-vault-offline-ocr-runtime\.js/);
assert.match(access,/vaultOcr:'قراءة النص من الصور'/,'OCR needs explicit branch permission');
assert.match(ocr,/localScopeOk\?\.\(false\)!==true/,'Deny OCR outside active device scope');
assert.match(ocr,/allowed\?\.\('vaultOcr'\)!==true/,'Respect OCR permission');
assert.match(ocr,/queue=run\.catch\(\(\)=>\{\}\)/,'Serialize recognition jobs');
assert.match(ocr,/version!==requestVersion/,'Cancel stale OCR results');
assert.match(ocr,/abu-bassam-auth-changed/,'Account switch invalidates OCR');
assert.match(ocr,/void terminate\(\)/,'Old account OCR worker terminated');
assert.match(ocr,/workerPath:'vendor\/tesseract\/worker\.min\.js'/);
assert.match(ocr,/langPath:'vendor\/tesseract\/lang'/);
assert.match(ocr,/corePath:'vendor\/tesseract\/core'/);
assert.match(ocr,/createWorker\('ara\+eng'/,'Arabic+English OCR bundled');
assert.doesNotMatch(ocr,/https?:\/\/|MutationObserver|setInterval\(/,'No OCR CDN or mutation polling');
assert.match(runtime,/return engine\.recognize\(dataUrl\)/,'Central OCR delegate');
assert.match(runtime,/if\(!dataUrl\|\|!requireVault\('vaultOcr'\)\)return false/,'Deny restricted recognition');
assert.match(runtime,/if\(!requireVault\('vaultAdd'\)\)return false/,'Do not save without add permissions');
assert.doesNotMatch(runtime,/https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract/,'No network OCR fallback');
assert.match(runtime,/state\.selectedIds\.clear\(\);clearOcr\(\);closeModal\('vOcrModal'\)/,'Clear account-sensitive preview');
assert.match(runtime,/if\(id==='vOcrModal'\)window\.AbuDocumentVaultOfflineOcr\?\.cancel\?\.\(\)/,'Modal close cancels OCR');
for(const asset of ['tesseract.min.js','worker.min.js','lang/ara.traineddata.gz','lang/eng.traineddata.gz'])
 assert.ok(assets.includes("'"+asset+"'"),'Android assets must include '+asset);
assert.match(assets,/for\(const \[relative,urls,minBytes\] of OCR_ASSETS\)/);
const cas=read('supabase/migrations/202610090001_vault_atomic_compare_and_swap.sql');
const ownerSql=read('supabase/migrations/202610090002_vault_owner_readonly_branch_browser.sql');
assert.match(cas,/VAULT_VERSION_CONFLICT/);
assert.match(ownerSql,/if not coalesce\(v_owner,false\) then raise exception 'VAULT_OWNER_REQUIRED'/);
assert.match(read('supabase/functions/branch-vault/index.ts'),/createSignedUrl\(path,60,\{download:false\}\)/);
assert.match(access,/async function removeAllVault\(\)/);
assert.match(access,/abu_bassam_vault_upsert_cas/);
for(const perm of ['vaultImageEdit','vaultEnhance','vaultRestoreDeleted','vaultPermanentDelete'])
 assert.ok(access.includes(perm),'Existing branch permission preserved '+perm);
const reset=access.slice(access.indexOf('async function removeAllVault('),access.indexOf('function registerCloudAdapter('));
assert.ok(reset.includes("await rpc('abu_bassam_vault_remove_all'"));
assert.ok(reset.indexOf("await rpc('abu_bassam_vault_remove_all'")<reset.indexOf('await removeVault(path)'),'Metadata-first cloud deletion maintained');
assert.match(reset,/AbuBassamOps\?\.add\?/,'Audit of failed cleanup retained');
assert.match(read('supabase/functions/customer-documents/index.ts'),/return p\[key\]===true;/);
assert.match(read('supabase/functions/backup-center/index.ts'),/context\(req,'backupDelete'\)/);
assert.match(read('.github/workflows/android.yml'),/if:\s*\$\{\{\s*false\s*\}\}/,'Android Actions kept disabled');
console.log('Stage66 offline OCR source integration gate passed: '+commands.length+' unique registered checks and previous security preserved.');
