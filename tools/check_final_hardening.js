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

const productionFiles=[];
for(const name of fs.readdirSync(web)){
  if(!/\.(?:js|html)$/i.test(name))continue;
  const full=path.join(web,name);
  if(!fs.statSync(full).isFile())continue;
  productionFiles.push([name,fs.readFileSync(full,'utf8')]);
}
for(const [name,src] of productionFiles){
  if(src.includes('residence-card.html'))errors.push(`${name}: obsolete residence-card.html route/reference returned`);
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

if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write('Final hardening checks passed: obsolete residence route removed, backup permissions fail closed for secondary devices, owner path is explicit, SecureStore is required, and restore remains branch-bound with SHA-256 verification.\n');
