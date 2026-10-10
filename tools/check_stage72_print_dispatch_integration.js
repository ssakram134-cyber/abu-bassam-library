'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const checks=JSON.parse(read('package.json')).scripts['check:web'].split(' && ');
assert.ok(checks.length>=86,'All 84 Stage71 tests plus 2');
assert.equal(new Set(checks).size,checks.length,'No duplicate test registration');
for(const cmd of checks){assert.match(cmd,/^node tools\/check_[A-Za-z0-9_]+\.js$/);assert.ok(fs.existsSync(path.join(__dirname,'..',cmd.slice(5))),'Missing '+cmd)}
for(const f of [
'check_stage61_auth_merge_regression.js','check_stage62_archive_merge_regression.js',
'check_stage63_vault_sync_integration.js','check_stage64_vault_cas_integration.js',
'check_stage65_owner_download_integration.js','check_stage66_offline_ocr_merge_regression.js',
'check_stage67_backup_merge_regression.js','check_stage68_cards_scannability_merge_regression.js',
'check_stage69_print_duplex_integration.js','check_stage70_question_compressor_integration.js',
'check_stage71_release_readiness_integration.js','check_stage72_print_dispatch_integration.js',
'check_card_print_dispatch_audit.js','check_final_release_readiness.js',
'check_print_duplex_geometry_guards.js','check_card_print_registration.js',
'check_camera_qr_pdf_integrity.js','check_badge_qr_output_integrity.js',
'check_vault_backup_content_integrity.js','check_questions_draft_race_and_image_safety.js'
])assert.ok(checks.includes('node tools/'+f),'Regression registration absent: '+f);
const studio=read('web/cards-studio-runtime.js'),editor=read('web/a4-card-sheet-editor-v2-runtime.js');
new vm.Script(studio,{filename:'cards-studio-runtime.js'});
new vm.Script(editor,{filename:'a4-card-sheet-editor-v2-runtime.js'});
const cut=(text,a,b)=>{const i=text.indexOf(a),j=text.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,'Missing source section '+a);return text.slice(i,j)};
const clean=cut(editor,'function clean(doc){','function duplexCells(');
const run=cut(editor,'function markDispatched(j){','function boot(){');
const print=cut(studio,'function printNow(){','async function exportPng(){');
assert.match(clean,/doc\.documentElement\.cloneNode\(true\)/,'Print cleanup should copy the live editor');
assert.doesNotMatch(clean,/doc\.querySelectorAll\(/,'Never strip original document controls');
assert.match(clean,/root\.querySelectorAll/,'Only clean the clone');
assert.match(clean,/return '<!doctype html>'\+root\.outerHTML/);
assert.match(run,/function markDispatched\(j\)/);
assert.match(run,/j\.onDispatched\?\.\(\)/);
assert.match(run,/function run\(\)/);
assert.match(run,/if\(!canFinalize\(job\.kind\)\)/,'Recheck permissions before any send');
assert.match(run,/try\{checkDuplexAlignment\(doc\)\}/,'Still reject misaligned duplex');
assert.match(run,/if\(direct\('savePdfHtml',\{name:j\.name,html\}\)\)return markDispatched\(j\)/);
assert.match(run,/if\(direct\('printHtml',\{html\}\)\)return markDispatched\(j\)/);
assert.match(run,/catch\(error\)\{alert\('تعذر إرسال PDF:/);
assert.match(run,/catch\(error\)\{alert\('تعذر إرسال الطباعة:/);
assert.match(run,/function openPrint\(html,onDispatched\)/);
assert.match(run,/function openPdf\(name,html,onDispatched\)/);
const opened=cut(editor,'function close(){','function load(html){');
assert.match(opened,/onDispatched:typeof onDispatched==='function'\?onDispatched:null/,'Callback stored for accepted dispatch only');
assert.doesNotMatch(opened,/onDispatched\?\.\(\)/,'Opening/canceling editor must not emit history');
assert.match(print,/const dispatched=\(\)=>/);
assert.match(print,/editor\.openPrint\(html,dispatched\)/);
assert.match(print,/editor\.openPdf\(name,html,dispatched\)/);
assert.match(print,/recordHistory\('إرسال طلب طباعة'\)/);
assert.match(print,/recordHistory\('إرسال طلب PDF'\)/);
assert.doesNotMatch(print,/recordHistory\('تمت طباعة/,'Do not claim paper has actually printed');
assert.match(studio,/function printGeometry\(jobs\)/,'Preserve CR80 queued sizes');
assert.match(studio,/function assertModelBarcodes\(model\)/,'Preserve QR encoding');
assert.match(editor,/function checkDuplexAlignment\(doc\)/,'Preserve duplex validation');
const readiness=read('tools/check_final_release_readiness.js');
assert.match(readiness,/cloneNode\\\(true\\\)/,'Original readiness gate must include clone defense');
assert.match(readiness,/markDispatched/,'Original readiness gate must protect audit timing');
assert.match(read('web/backup-center-runtime.js'),/BACKUP_CHANGED_DURING_CAPTURE/);
assert.match(read('web/document-vault-offline-ocr-runtime.js'),/createWorker\('ara\+eng'/);
assert.match(read('web/branch-vault-runtime.js'),/abu_bassam_vault_upsert_cas/);
for(const t of ['web/questions-completion-runtime.js','web/questions-en-fixes-runtime.js'])assert.match(read(t),/const previousHtml=\$\('pages-container'\)\?\.innerHTML/,'Preserve draft rollback');
assert.match(read('supabase/functions/branch-vault/index.ts'),/createSignedUrl\(path,60,\{download:false\}\)/);
assert.match(read('supabase/functions/backup-center/index.ts'),/context\(req,'backupDelete'\)/);
assert.match(read('supabase/functions/customer-documents/index.ts'),/return p\[key\]===true;/);
const android=read('.github/workflows/android.yml');
assert.match(android,/if:\s*\$\{\{\s*false\s*\}\}/,'APK Actions remain disabled');
assert.doesNotMatch(android,/^\s+push:\s*$/m,'No push-to-build trigger');
assert.match(read('.github/workflows/import-source-zip.yml'),/workflow_dispatch:/);
console.log('Stage72 source integration guard passed: 86 unique registered tests; dispatch-only logs and non-destructive A4 editor cleanup preserved.');
