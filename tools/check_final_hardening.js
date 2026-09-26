const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const web=path.join(root,'web');
const errors=[];
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const need=(src,marker,label)=>{if(!src.includes(marker))errors.push(`${label}: missing ${marker}`)};
const forbid=(src,marker,label)=>{if(src.includes(marker))errors.push(`${label}: forbidden ${marker}`)};

const obsolete=path.join(web,'residence-card.html');
if(fs.existsSync(obsolete))errors.push('obsolete standalone residence-card.html must stay removed; residence fields belong to the national-ID flow');
const obsoleteA4=path.join(web,'a4-card-sheet-editor-runtime.js');
if(fs.existsSync(obsoleteA4))errors.push('obsolete A4 card editor V1 must stay removed; only the V2 editor is authoritative');

const productionFiles=[];
for(const name of fs.readdirSync(web)){
  if(!/\.(?:js|html)$/i.test(name))continue;
  const full=path.join(web,name);
  if(!fs.statSync(full).isFile())continue;
  productionFiles.push([name,fs.readFileSync(full,'utf8')]);
}
for(const [name,src] of productionFiles){
  if(src.includes('residence-card.html'))errors.push(`${name}: obsolete residence-card.html route/reference returned`);
  if(src.includes('a4-card-sheet-editor-runtime.js'))errors.push(`${name}: obsolete A4 editor V1 route/reference returned`);
  if(src.includes('__ABU_A4_CARD_SHEET_EDITOR_V1__'))errors.push(`${name}: obsolete A4 editor V1 guard returned`);
}

const backup=read('web/backup-center-runtime.js');
try{new vm.Script(backup,{filename:'backup-center-runtime.js'})}catch(e){errors.push(`backup-center-runtime.js syntax: ${e.message}`)}
need(backup,"sec?.role?.()==='owner'",'backup owner permission');
need(backup,"typeof sec?.can==='function'&&sec.can(k)===true",'backup secondary permission must be explicit true');
forbid(backup,"can?.(k)!==false",'backup permission must not fail open');
forbid(backup,"AbuBassamSecurity?.can?.(k)!==false",'backup permission must not fail open');
need(backup,"if(!can('backupCreate'))",'backup create guard');
need(backup,"if(!can('backupRestore'))",'backup restore guard');
need(backup,"if(!can('backupDelete'))",'backup delete guard');
need(backup,"if(sha!==String(d.backup.sha256||''))",'backup restore SHA-256 verification');
need(backup,"if(d.backup.branch_device_id!==cur)",'backup restore branch binding');
need(backup,"SECURE_STORAGE_REQUIRED",'backup SecureStore fail-closed requirement');

const cardsLoader=read('web/cards-section-upgrades-runtime.js');
const adminPermissions=read('web/admin-permissions-runtime.js');
try{new vm.Script(cardsLoader,{filename:'cards-section-upgrades-runtime.js'})}catch(e){errors.push(`cards-section-upgrades-runtime.js syntax: ${e.message}`)}
try{new vm.Script(adminPermissions,{filename:'admin-permissions-runtime.js'})}catch(e){errors.push(`admin-permissions-runtime.js syntax: ${e.message}`)}
need(cardsLoader,'function ensurePermissionFacade()','cards permission bootstrap facade');
need(cardsLoader,"can(){try{return window.AbuBassamSecurity?.role?.()==='owner'}catch(e){return false}}",'cards bootstrap must default to owner-only');
const facadeAt=cardsLoader.indexOf('ensurePermissionFacade();');
const baseHardeningAt=cardsLoader.indexOf("loadOne('abuCardsHardeningRuntime'");
if(facadeAt<0||baseHardeningAt<0||facadeAt>baseHardeningAt)errors.push('cards permission bootstrap must run before base cards hardening loads');
need(adminPermissions,"function can(key){if(role()==='owner')return true",'advanced permissions owner path');
need(adminPermissions,"return false}\nfunction requirePermission",'advanced permissions must deny unknown keys explicitly');
forbid(cardsLoader,'can(){return true}','cards bootstrap must never fail open');
need(cardsLoader,"'a4-card-sheet-editor-v2-runtime.js'",'cards must load A4 editor V2');
need(cardsLoader,'__ABU_A4_CARD_SHEET_EDITOR_V2__','cards must gate A4 preparation on V2');
forbid(cardsLoader,"'a4-card-sheet-editor-runtime.js'",'cards must not reload obsolete A4 editor V1');

if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write('Final hardening checks passed: obsolete residence and A4 V1 routes removed; backup permissions fail closed for secondary devices; restore remains SecureStore-protected, branch-bound and SHA-256 verified; cards install an owner-only permission facade before legacy hardening, advanced permissions deny unknown keys explicitly, and only the V2 A4 editor may load.\n');
