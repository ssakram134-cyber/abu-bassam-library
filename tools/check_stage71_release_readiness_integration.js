'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const checks=JSON.parse(read('package.json')).scripts['check:web'].split(' && ');
assert.ok(checks.length>=84,'Stage70 82 checks + source release audit + cross-stage gate');
assert.equal(new Set(checks).size,checks.length,'Unique registered checks');
for(const cmd of checks){assert.match(cmd,/^node tools\/check_[A-Za-z0-9_]+\.js$/);assert.ok(fs.existsSync(path.join(__dirname,'..',cmd.slice(5))),'Check file not in tree '+cmd)}
for(const filename of [
'check_stage61_auth_merge_regression.js','check_stage62_archive_merge_regression.js',
'check_stage63_vault_sync_integration.js','check_stage64_vault_cas_integration.js',
'check_stage65_owner_download_integration.js','check_stage66_offline_ocr_merge_regression.js',
'check_stage67_backup_merge_regression.js','check_stage68_cards_scannability_merge_regression.js',
'check_stage69_print_duplex_integration.js','check_stage70_question_compressor_integration.js',
'check_final_release_readiness.js','check_stage71_release_readiness_integration.js',
'check_questions_draft_race_and_image_safety.js','check_questions_compressor_lifecycle.js',
'check_compressor_bridge_payload_safety.js','check_vault_backup_content_integrity.js',
'check_vault_owner_branch_browser.js','check_vault_signed_download_security.js',
'check_vault_server_cas.js','check_print_duplex_geometry_guards.js'
])assert.ok(checks.includes('node tools/'+filename),'Missing necessary earlier regression '+filename);
const ar=read('web/questions-completion-runtime.js'),en=read('web/questions-en-fixes-runtime.js'),
 print=read('web/cards-studio-runtime.js'),editor=read('web/a4-card-sheet-editor-v2-runtime.js'),
 ocr=read('web/document-vault-offline-ocr-runtime.js'),branch=read('web/branch-vault-runtime.js'),
 backup=read('web/backup-center-runtime.js'),compressor=read('web/image-compressor.html'),host=read('web/productivity-tools-runtime.js');
for(const [p,s] of [['ar',ar],['en',en],['print',print],['editor',editor],['ocr',ocr],['branch',branch],['backup',backup],['host',host]])new vm.Script(s,{filename:p});
for(const [lang,src,resetName,idbPut] of [
['Arabic',ar,'resetDurableDraft','idbPut'],
['English',en,'reset','dbPut']]){
 assert.match(src,/draftQueue=Promise\.resolve\(\)/,'Serialize '+lang+' writes');
 assert.match(src,/await draftQueue\.catch\(\(\)=>\{\}\)/,'Wait for '+lang+' writes');
 assert.match(src,/previousHtml=\$\('pages-container'\)\?\.innerHTML\|\|''/,'Keep content before delete: '+lang);
 assert.match(src,new RegExp('const restored=previousHtml\\?await '+idbPut+'\\('),'Restore partial reset: '+lang);
 assert.match(src,/if\(draftResetting\|\|!confirm\(/);
 assert.match(src,/finally\{draftResetting=false\}/,'Clear reset lock: '+lang);
 assert.match(src,/maintenanceTimer=setTimeout\(/);
 assert.match(src,/visibilitychange/);
 const start=src.indexOf('async function '+resetName+'(){'),end=src.indexOf(lang==='Arabic'?'\nfunction fileToDataUrl(':'\nfunction addCss(){',start);
 assert.ok(start>=0&&end>start,'Find reset: '+lang);
 const reset=src.slice(start,end);
 assert.ok(reset.indexOf('const previousHtml=')<reset.indexOf(lang==='Arabic'?'await idbDelete()':'await dbDelete()'),'Save before delete '+lang);
 assert.ok(reset.indexOf('await draftQueue.catch')<reset.indexOf('const previousHtml='),'Complete queued draft writes before rollback capture '+lang);
 assert.ok(reset.indexOf('const restored=')<reset.indexOf('location.reload()'),'Rollback before reload '+lang);
}
assert.match(ar,/const restored=previousHtml\?await idbPut\(previousHtml,Date\.now\(\)\):false/);
assert.match(en,/const restored=previousHtml\?await dbPut\(previousHtml\):false/);
assert.match(read('tools/check_questions_draft_race_and_image_safety.js'),/setRemoveFailure\(true\)/,'Partial reset failure actually tested');
assert.match(read('tools/check_questions_draft_race_and_image_safety.js'),/important-current-form/);
assert.match(read('tools/check_questions_draft_race_and_image_safety.js'),/unsaved-current-form/);
assert.match(print,/function printGeometry\(jobs\)/);
assert.match(print,/function assertModelBarcodes\(model\)/);
assert.match(editor,/function checkDuplexAlignment\(doc\)/);
assert.match(editor,/if\(!canFinalize\(job\.kind\)\)/);
assert.match(ocr,/createWorker\('ara\+eng'/);
assert.match(read('web/device-name-runtime.js'),/await loadDocumentVaultOfflineOcr\(\)/);
assert.doesNotMatch(read('web/document-vault-runtime.js'),/https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract/);
assert.match(backup,/BACKUP_CHANGED_DURING_CAPTURE/);
assert.match(backup,/await item\.blob\.arrayBuffer\(\)/);
assert.match(branch,/abu_bassam_vault_upsert_cas/);
assert.match(branch,/async function ownerList\(/);
assert.match(branch,/async function downloadVault\(path,expectedUpdatedAt\)/);
assert.match(compressor,/MAX_BRIDGE_PAYLOAD=12\*1024\*1024/);
assert.match(host,/pages\.reduce\(\(total,item\)=>total\+item\.length,0\)>12\*1024\*1024/);
for(const p of ['supabase/migrations/202610090001_vault_atomic_compare_and_swap.sql','supabase/migrations/202610090002_vault_owner_readonly_branch_browser.sql','supabase/functions/branch-vault/index.ts','supabase/functions/backup-center/index.ts','.github/workflows/android.yml','.github/workflows/import-source-zip.yml'])assert.ok(fs.existsSync(path.join(__dirname,'..',p)),'Release dependency missing: '+p);
assert.match(read('supabase/functions/branch-vault/index.ts'),/createSignedUrl\(path,60,\{download:false\}\)/);
assert.match(read('supabase/functions/backup-center/index.ts'),/context\(req,'backupDelete'\)/);
assert.match(read('supabase/functions/customer-documents/index.ts'),/return p\[key\]===true;/);
const android=read('.github/workflows/android.yml'),importer=read('.github/workflows/import-source-zip.yml');
assert.match(android,/if:\s*\$\{\{\s*false\s*\}\}/,'Android job must remain disabled');
assert.doesNotMatch(android,/^\s+push:\s*$/m,'Build should not run on push');
assert.match(importer,/workflow_dispatch:/,'ZIP import must remain manual');
assert.doesNotMatch(importer,/^\s+push:\s*$/m,'ZIP import should not trigger automatically');
console.log('Stage71 cross-stage audit succeeded: 84 unique tests, draft reset rollback and cross-module release safety checks. SOURCE LEVEL ONLY.');
