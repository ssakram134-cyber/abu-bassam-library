const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),web=path.join(root,'web'),errors=[];
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const need=(src,m,l)=>{if(!src.includes(m))errors.push(`${l}: missing ${m}`)};
const forbid=(src,m,l)=>{if(src.includes(m))errors.push(`${l}: forbidden ${m}`)};

for(const rel of ['web/residence-card.html','web/a4-card-sheet-editor-runtime.js','web/cards-section-upgrades-runtime.js','web/cards-hardening-runtime.js','web/cards-hardening-fixes-runtime.js','web/cards-final-audit-runtime.js','web/touch-stability-runtime.js']){
  if(fs.existsSync(path.join(root,rel)))errors.push('obsolete file must stay removed: '+rel)
}
const productionFiles=[];for(const name of fs.readdirSync(web)){if(!/\.(?:js|html)$/i.test(name))continue;const full=path.join(web,name);if(fs.statSync(full).isFile())productionFiles.push([name,fs.readFileSync(full,'utf8')])}
for(const [name,src] of productionFiles){for(const marker of ['a4-card-sheet-editor-runtime.js','cards-hardening-runtime.js','cards-hardening-fixes-runtime.js','cards-final-audit-runtime.js','cards-section-upgrades-runtime.js'])if(src.includes(marker))errors.push(`${name}: obsolete reference returned: ${marker}`)}

const backup=read('web/backup-center-runtime.js');try{new vm.Script(backup,{filename:'backup-center-runtime.js'})}catch(e){errors.push('backup syntax: '+e.message)}
need(backup,"sec?.role?.()==='owner'",'backup owner permission');
need(backup,"typeof sec?.can==='function'&&sec.can(k)===true",'backup secondary permission');
forbid(backup,"can?.(k)!==false",'backup permission must fail closed');
need(backup,"const required=kind==='pre_restore'?'backupRestore':'backupCreate'",'pre-restore permission split');
need(backup,"if(!can('backupRestore'))",'restore guard');
need(backup,"if(!can('backupDelete'))",'delete guard');
need(backup,"if(sha!==String(d.backup.sha256||''))",'download SHA-256 verification');
need(backup,"if(d.backup.branch_device_id!==cur)",'backup branch binding');
need(backup,'AbuBassamNativeSecurity','central SecureStore dispatcher');

const studio=read('web/cards-studio-runtime.js'),design=read('web/design-studio-runtime.js'),standalone=read('web/standalone-card-layouts-plus-runtime.js'),productivity=read('web/productivity-tools-runtime.js'),admin=read('web/admin-permissions-runtime.js');
for(const [name,src] of [['studio',studio],['design',design],['standalone',standalone],['productivity',productivity],['admin',admin]])try{new vm.Script(src,{filename:name})}catch(e){errors.push(name+' syntax: '+e.message)}
need(admin,"return typeof raw[key]==='boolean'?raw[key]:false",'advanced permissions must fail closed');
need(studio,"cardsA4Layout','printA4",'A4 permission set');
need(studio,'printCardDirect','CR80 permission');
need(studio,"cardsExportPdf','pdfCreate','pdfSave",'PDF permission');
need(design,"Array.from({length:10},(_,i)=>envelopeTemplate(i))",'env-10 must be a system template');
need(design,'cardsManageCustomTemplates','Design Studio custom-template permission');
need(standalone,'safeTextTarget','standalone safe text editing');
need(standalone,'abu-recovery-frame-load','standalone event lifecycle');
need(productivity,'async function loadAdvancedRuntime()','sequential productivity loader');
forbid(productivity,'cards-section-upgrades-runtime.js','deleted card patch loader');

const preload=read('web/envelope-preload-runtime.js');
need(preload,"item.id==='env-10'",'legacy custom env-10 cleanup');
forbid(preload,"state.templateId==='env-10')state.templateId='env-1'",'canonical env-10 must not be downgraded');

const deviceLimit=read('supabase/migrations/202609270004_strict_device_limit_owner_secret.sql');
for(const m of ["coalesce(trim(p_actor_device_id),'') = ''","coalesce(p_actor_secret,'') = ''","coalesce(v_actor.secret_hash,'') = ''","v_actor.secret_hash <> v_hash","p_device_limit > 50",'DEVICE_LIMIT_BELOW_CURRENT_COUNT','revoke all on function public.abu_bassam_set_device_limit(text,text,integer) from public, anon'])need(deviceLimit,m,'device limit security');

if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write('Final hardening checks passed: no patch runtimes, backup/restore fail closed, canonical cards enforce CR80/A4/export permissions, env-10 is system-owned, and device-limit changes require a verified owner secret.\n');
