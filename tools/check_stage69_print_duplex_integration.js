'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const commands=JSON.parse(read('package.json')).scripts['check:web'].split(' && ');
assert.ok(commands.length>=79,'Keep 77 earlier check:web scripts plus 2');
assert.equal(new Set(commands).size,commands.length,'Each check registered once');
for(const c of commands){assert.match(c,/^node tools\/check_[A-Za-z0-9_]+\.js$/);assert.ok(fs.existsSync(path.join(__dirname,'..',c.slice(5))),'Registered missing test: '+c)}
for(const name of [
 'check_stage61_auth_merge_regression.js','check_stage62_archive_merge_regression.js',
 'check_stage63_vault_sync_integration.js','check_stage64_vault_cas_integration.js',
 'check_stage65_owner_download_integration.js','check_stage66_offline_ocr_merge_regression.js',
 'check_stage67_backup_merge_regression.js','check_stage68_cards_scannability_merge_regression.js',
 'check_camera_qr_pdf_integrity.js','check_badge_qr_output_integrity.js',
 'check_card_gallery_native_scan.js','check_card_print_registration.js',
 'check_print_duplex_geometry_guards.js','check_stage69_print_duplex_integration.js'
])assert.ok(commands.includes('node tools/'+name),'Missing retained check '+name);
const studio=read('web/cards-studio-runtime.js'),editor=read('web/a4-card-sheet-editor-v2-runtime.js'),expo=read('index.js');
for(const [file,src]of [['studio',studio],['editor',editor]])new vm.Script(src,{filename:file});
const cut=(src,start,end)=>{const i=src.indexOf(start),j=src.indexOf(end,i+start.length);assert.ok(i>=0&&j>i,'Missing '+start);return src.slice(i,j)};
const layout=cut(studio,'function printGeometry(','\nfunction queueCount(');
const printing=cut(studio,'function printDocument(){','\nfunction recordHistory(');
const aligned=cut(editor,'function duplexCells(page){','function run(){');
const finalize=cut(editor,'function run(){','function openPrint(');
assert.match(layout,/function printGeometry\(jobs\)/);
assert.match(layout,/first\.width\?\?state\.width/);
assert.match(layout,/first\.height\?\?state\.height/);
assert.match(layout,/Math\.abs\(width-w\)>0\.01\|\|Math\.abs\(height-h\)>0\.01/);
assert.match(layout,/مقاسات مختلفة/);
assert.match(printing,/validatePrintBarcodes\(jobs\)/,'Preserve QR validation before printing');
assert.match(printing,/const \{w,h\}=printGeometry\(jobs\)/);
assert.match(printing,/@page\{size:\$\{w\}mm \$\{h\}mm;margin:0\}/);
assert.match(printing,/data-duplex-side="front" data-duplex-flip="\$\{state\.flip\}"/);
assert.match(printing,/data-duplex-side="back" data-duplex-flip="\$\{state\.flip\}"/);
assert.match(printing,/const slots=duplexSheetSlots/,'Retain mirrored slots including empties');
assert.match(aligned,/function checkDuplexAlignment\(doc\)/);
assert.match(aligned,/duplex-empty/);
assert.match(aligned,/duplexFlip/);
assert.match(aligned,/Math\.abs\(h\.x-x\)>epsilon/);
assert.match(aligned,/Math\.abs\(h\.y-y\)>epsilon/);
assert.match(aligned,/Math\.min\(angle,360-angle\)>1/);
assert.match(aligned,/function canFinalize\(kind\)/);
for(const k of ['cardsA4Layout','printA4','cardsExportPdf','pdfCreate','pdfSave','cardsPrint','printCards','printGeneral'])
 assert.ok(aligned.includes("'"+k+"'"),'Missing print permission '+k);
assert.match(finalize,/if\(!canFinalize\(job\.kind\)\)/,'Check rights at submission, not only opening');
assert.match(finalize,/try\{checkDuplexAlignment\(doc\)\}/,'Block misaligned PDF/print');
assert.match(studio,/function assertModelBarcodes\(model\)/,'Preserve badge QR checks');
assert.match(studio,/function onBarcode\(result\)\{if\(!canCard\('cardsBarcode'\)\)return false;/);
assert.match(expo,/const barcodeScanGuard = useRef\(false\)/);
assert.match(expo,/scanFromURLAsync/,'Preserve native gallery scanning');
assert.match(read('web/document-vault-offline-ocr-runtime.js'),/createWorker\('ara\+eng'/);
assert.match(read('web/backup-center-runtime.js'),/BACKUP_CHANGED_DURING_CAPTURE/);
assert.match(read('web/branch-vault-runtime.js'),/abu_bassam_vault_upsert_cas/);
assert.match(read('supabase/functions/branch-vault/index.ts'),/createSignedUrl\(path,60,\{download:false\}\)/);
assert.match(read('supabase/functions/backup-center/index.ts'),/context\(req,'backupDelete'\)/);
assert.match(read('supabase/functions/customer-documents/index.ts'),/return p\[key\]===true;/);
assert.match(read('.github/workflows/android.yml'),/if:\s*\$\{\{\s*false\s*\}\}/,'Do not enable Android build Actions');
console.log('Stage69 print/duplex integration: 79 registered checks, CR80 source geometry, A4 duplex mirror, delayed permission guards and previous security protections.');
