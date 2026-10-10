'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

const pkg=JSON.parse(read('package.json'));
assert.ok(pkg.scripts['check:web'],'Expected a canonical web verification entry');
const registered=[...pkg.scripts['check:web'].matchAll(/node (tools\/check_[A-Za-z0-9_]+\.js)/g)].map(m=>m[1]);
assert.ok(registered.length>=70,'Do not drop registered regression tests');
assert.equal(new Set(registered).size,registered.length,'Duplicate test registrations can mask omissions');
for(const test of registered)assert.ok(fs.existsSync(path.join(root,test)),'Registered check is missing: '+test);
const requiredChecks=[
 'check_vault_server_cas.js','check_vault_signed_download_security.js',
 'check_vault_offline_ocr_runtime.js','check_vault_backup_content_integrity.js',
 'check_badge_qr_output_integrity.js','check_card_gallery_native_scan.js',
 'check_print_duplex_geometry_guards.js','check_questions_draft_race_and_image_safety.js',
 'check_compressor_bridge_payload_safety.js',
];
for(const file of requiredChecks)assert.ok(registered.includes('tools/'+file),'Critical staged test not registered: '+file);

const sourcePaths=[
 'web/device-name-runtime.js','web/document-vault-runtime.js',
 'web/document-vault-offline-ocr-runtime.js','web/document-vault-hardening-runtime.js',
 'web/backup-center-runtime.js','web/cards-studio-runtime.js',
 'web/a4-card-sheet-editor-v2-runtime.js','web/branch-vault-runtime.js',
 'web/questions-completion-runtime.js','web/questions-en-fixes-runtime.js',
 'web/productivity-tools-runtime.js','scripts/prepare-android-assets.mjs',
];
const sources={};
for(const p of sourcePaths){
 assert.ok(fs.existsSync(path.join(root,p)),'Missing required runtime '+p);
 sources[p]=read(p);
 // Android asset preparation is an ESM module; all normal web files are classic scripts.
 if(p.startsWith('web/'))new vm.Script(sources[p],{filename:p});
}
const has=(p,re,label)=>assert.match(sources[p],re,label);
const absent=(p,re,label)=>assert.doesNotMatch(sources[p],re,label);

has('web/device-name-runtime.js',/await loadDocumentVaultHardening\(\);\s*await loadDocumentVaultOfflineOcr\(\)/,'OCR must be loaded after vault hardening');
has('web/document-vault-offline-ocr-runtime.js',/vendor\/tesseract\/tesseract\.min\.js/);
has('web/document-vault-offline-ocr-runtime.js',/Tesseract\.createWorker\('ara\+eng'/);
absent('web/document-vault-runtime.js',/cdn\.jsdelivr\.net\/npm\/tesseract/i,'OCR must not silently demand a CDN');
has('web/document-vault-runtime.js',/return engine\.recognize\(dataUrl\)/);
has('web/document-vault-runtime.js',/if\(id==='vOcrModal'\)window\.AbuDocumentVaultOfflineOcr\?\.cancel/);

has('web/backup-center-runtime.js',/manualOrder:Number\.isInteger\(item\.manualOrder\)/);
has('web/backup-center-runtime.js',/await item\.blob\.arrayBuffer\(\)/);
has('web/backup-center-runtime.js',/BACKUP_CHANGED_DURING_CAPTURE/);
has('web/backup-center-runtime.js',/const ordinal=String\(index\+1\)/);
has('web/document-vault-hardening-runtime.js',/const entryId=String\(index\+1\)/);

has('web/cards-studio-runtime.js',/function printGeometry\(jobs\)/);
has('web/cards-studio-runtime.js',/validatePrintBarcodes\(jobs\)/);
has('web/cards-studio-runtime.js',/async function decodeBarcodeImage\(file\)/);
has('web/a4-card-sheet-editor-v2-runtime.js',/checkDuplexAlignment\(doc\)/);
has('web/a4-card-sheet-editor-v2-runtime.js',/canFinalize\(job\.kind\)/);

for(const p of ['web/questions-completion-runtime.js','web/questions-en-fixes-runtime.js']){
 has(p,/draftQueue=Promise\.resolve\(\)/);
 has(p,/await draftQueue\.catch\(\(\)=>\{\}\)/);
 has(p,/maintenanceTimer=setTimeout\(/);
 has(p,/visibilitychange/);
 has(p,/previousHtml=\$\('pages-container'\)\?\.innerHTML/);
}
has('web/questions-completion-runtime.js',/const restored=previousHtml\?await idbPut\(previousHtml,Date\.now\(\)\):false/);
has('web/questions-en-fixes-runtime.js',/const restored=previousHtml\?await dbPut\(previousHtml\):false/);
const compressor=read('web/image-compressor.html');
const inline=[...compressor.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
assert.equal(inline.length,1,'Compressor should own one clear controller');
new vm.Script(inline[0],{filename:'web/image-compressor.html#inline'});
assert.match(compressor,/MAX_BRIDGE_PAYLOAD=12\*1024\*1024/);
has('web/productivity-tools-runtime.js',/pages\.reduce\(\(total,item\)=>total\+item\.length,0\)>12\*1024\*1024/);

for(const migration of [
 'supabase/migrations/202610090001_vault_atomic_compare_and_swap.sql',
 'supabase/migrations/202610090002_vault_owner_readonly_branch_browser.sql'
])assert.ok(fs.existsSync(path.join(root,migration)),'Expected pending SQL migration '+migration);
for(const fn of ['supabase/functions/branch-vault/index.ts','supabase/functions/backup-center/index.ts'])
 assert.ok(fs.existsSync(path.join(root,fn)),'Missing server implementation '+fn);
const androidWorkflow=read('.github/workflows/android.yml');
const importWorkflow=read('.github/workflows/import-source-zip.yml');
assert.match(androidWorkflow,/if:\s*\$\{\{\s*false\s*\}\}/,'Android build job must remain explicitly disabled');
assert.match(androidWorkflow,/workflow_dispatch:/,'Existing Android workflow is opt-in');
assert.doesNotMatch(androidWorkflow,/^\s+push:\s*$/m,'Source changes must not automatically trigger Android builds');
assert.match(importWorkflow,/workflow_dispatch:/,'Source ZIP import must require manual dispatch');
assert.doesNotMatch(importWorkflow,/^\s+push:\s*$/m,'ZIP importer must not auto-execute on source updates');
assert.ok(fs.existsSync(path.join(root,'index.js')),'Missing native Android entrypoint');
assert.match(read('index.js'),/Camera\.scanFromURLAsync\(/);
assert.match(read('index.js'),/FileSystem\.deleteAsync\(temporaryUri/);
assert.match(sources['scripts/prepare-android-assets.mjs'],/ara\.traineddata\.gz/);
assert.match(sources['scripts/prepare-android-assets.mjs'],/eng\.traineddata\.gz/);

console.log('Stage 57 release source gates passed: '+registered.length+
 ' registered checks exist uniquely; staged OCR, archive, backup, card geometry, scanner, questions, image bridge and server migration dependencies are present. This is NOT an APK, production deploy, or device test.');
