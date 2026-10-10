'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const commands=JSON.parse(read('package.json')).scripts['check:web'].split(' && ');
assert.ok(commands.length>=82,'Preserve 79 previous and add 3 regression checks');
assert.equal(new Set(commands).size,82,'No duplicate checks');
for(const c of commands){assert.match(c,/^node tools\/check_[A-Za-z0-9_]+\.js$/);assert.ok(fs.existsSync(path.join(root,c.slice(5))),'Missing '+c)}
for(const name of [
 'check_stage61_auth_merge_regression.js','check_stage62_archive_merge_regression.js',
 'check_stage63_vault_sync_integration.js','check_stage64_vault_cas_integration.js',
 'check_stage65_owner_download_integration.js','check_stage66_offline_ocr_merge_regression.js',
 'check_stage67_backup_merge_regression.js','check_stage68_cards_scannability_merge_regression.js',
 'check_stage69_print_duplex_integration.js','check_stage70_question_compressor_integration.js',
 'check_questions_draft_race_and_image_safety.js','check_compressor_bridge_payload_safety.js',
 'check_questions_compressor_lifecycle.js','check_runtime_scheduler_safety.js',
 'check_print_duplex_geometry_guards.js','check_badge_qr_output_integrity.js'
])assert.ok(commands.includes('node tools/'+name),'Previous or required check absent: '+name);
const ar=read('web/questions-completion-runtime.js');
const en=read('web/questions-en-fixes-runtime.js');
const host=read('web/productivity-tools-runtime.js');
const html=read('web/image-compressor.html');
const compressed=html.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)||[];
assert.equal(compressed.length,1,'Keep compressor inside one JS runtime');
for(const [f,s] of [['ar',ar],['en',en],['host',host],['compressor',compressed[0].replace(/<script(?:\s[^>]*)?>|<\/script>/g,'')]])new vm.Script(s,{filename:f});
const section=(s,a,b)=>{const start=s.indexOf(a),end=s.indexOf(b,start+a.length);assert.ok(start>=0&&end>start,'Missing source section '+a);return s.slice(start,end)};
for(const [name,src] of [['Arabic',ar],['English',en]]){
 assert.match(src,/function queueDraftWrite\(work\)\{const job=draftQueue\.catch\(\(\)=>\{\}\)\.then\(work\)/,'Serialize '+name+' writes');
 assert.match(src,/await draftQueue\.catch\(\(\)=>\{\}\)/,'Reset waits for '+name+' writes');
 assert.match(src,/if\(!deleted\)|if\(!await dbDelete\(\)\)/,'Never reload on failed delete: '+name);
 assert.match(src,/finally\{db\?\.close\?\.\(\)\}/,'Close IndexedDB after exceptions: '+name);
 assert.match(src,/maintenanceTimer=setTimeout\(/,'Throttle DOM observer: '+name);
 assert.match(src,/},75\)\}\)\.observe/,'75ms coalescing: '+name);
 assert.match(src,/visibilitychange/,'Best-effort save on visibility changes: '+name);
 assert.match(src,/draftResetting/);
 assert.match(src,/image\/jpeg','image\/png','image\/webp/);
 assert.match(src,/40\*1024\*1024/,'Image upper bound preserved: '+name);
}
const arSave=section(ar,'async function saveDurableDraft(show=false){','\nfunction queueDraft(){');
assert.match(arSave,/if\(ok\)\{try\{localStorage\.setItem/,'Arabic checkpoint only after commit');
assert.match(arSave,/removeItem\('abuBassamQuestionDraftArabicV1'\)/);
const enSave=section(en,'async function durableSave(show=false){','\nfunction schedule(){');
assert.match(enSave,/const idbOk=await dbPut\(html\)/);
assert.match(enSave,/localOk\|\|idbOk/,'Retain localStorage fallback');
const arReset=section(ar,'async function resetDurableDraft(){','\nfunction fileToDataUrl(');
const enReset=section(en,'async function reset(){','\nfunction addCss(){');
for(const [name,src] of [['Arabic',arReset],['English',enReset]]){
 assert.match(src,/await draftQueue\.catch\(\(\)=>\{\}\)/);
 assert.match(src,/location\.reload\(\);return true/);
 assert.match(src,/finally\{draftResetting=false\}/);
}
assert.match(html,/const MAX_BRIDGE_PAYLOAD=12\*1024\*1024/);
assert.match(html,/const totalEncoded=good\.reduce\(\(sum,r\)=>sum\+String\(r\.dataUrl\|\|''\)\.length,0\)/);
assert.match(html,/if\(totalEncoded>MAX_BRIDGE_PAYLOAD\)return alert/);
assert.match(html,/الأصول لم تتغير/,'No misleading success on overflow');
assert.match(host,/pages\.reduce\(\(total,item\)=>total\+item\.length,0\)>12\*1024\*1024/);
assert.match(host,/الدفعة كبيرة جداً للإرسال الآمن إلى Android/);
assert.match(read('web/cards-studio-runtime.js'),/function printGeometry\(jobs\)/,'Keep queued print geometry');
assert.match(read('web/a4-card-sheet-editor-v2-runtime.js'),/function checkDuplexAlignment\(doc\)/,'Keep duplex guard');
assert.match(read('web/cards-studio-runtime.js'),/function assertModelBarcodes\(model\)/,'Keep QR output check');
assert.match(read('web/document-vault-offline-ocr-runtime.js'),/createWorker\('ara\+eng'/,'Keep offline OCR');
assert.match(read('web/backup-center-runtime.js'),/BACKUP_CHANGED_DURING_CAPTURE/,'Keep backup hash checkpoint');
assert.match(read('web/branch-vault-runtime.js'),/abu_bassam_vault_upsert_cas/,'Keep vault CAS');
assert.match(read('supabase/functions/branch-vault/index.ts'),/createSignedUrl\(path,60,\{download:false\}\)/,'Keep cloud download scope');
assert.match(read('supabase/functions/backup-center/index.ts'),/context\(req,'backupDelete'\)/,'Keep backup permissions');
assert.match(read('supabase/functions/customer-documents/index.ts'),/return p\[key\]===true;/,'Keep document permissions');
assert.match(read('.github/workflows/android.yml'),/if:\s*\$\{\{\s*false\s*\}\}/,'Never turn on build');
console.log('Stage70 draft/image/compressor integration passed: 82 unique registered tests and prior QR/print/archive/security safeguards.');
