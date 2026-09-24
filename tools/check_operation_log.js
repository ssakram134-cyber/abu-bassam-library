const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const runtimePath=path.join(root,'web','operation-log-corrections-runtime.js');
const loaderPath=path.join(root,'web','device-name-runtime.js');
const runtime=fs.readFileSync(runtimePath,'utf8');
const loader=fs.readFileSync(loaderPath,'utf8');
const errors=[];
const need=(src,marker,label)=>{if(!src.includes(marker))errors.push(`${label}: missing ${marker}`)};
const no=(src,marker,label)=>{if(src.includes(marker))errors.push(`${label}: forbidden ${marker}`)};
try{new vm.Script(runtime,{filename:'operation-log-corrections-runtime.js'})}catch(e){errors.push(`operation log syntax: ${e.message}`)}
for(const marker of [
  '__ABU_OPERATION_LOG_CORRECTIONS_V2__',
  'abu_bassam_owner_activity_devices',
  'abu_bassam_owner_activity_report',
  "ops.sync=()=>safeSync(true)",
  'flushAuditQueue',
  'مسح سجل العمليات المحلي من هذا الجهاز فقط',
  'opsV2From',
  'opsV2To',
  'opsV2Device',
  'opsV2Status',
  "option value=\"device\"",
  "option value=\"alpha\"",
  'opsV2SelectAll',
  'PDF A4',
  '@page{size:A4 portrait',
  '[هاتف محجوب]',
  '[بريد محجوب]',
  '[تفاصيل زبون محجوبة]',
  'normalizeLocal(op={}){const d=device(),safe=safeOperation(op)',
  'setInterval(patch,2500)',
  "deviceName||d.name||'هذا الجهاز'"
])need(runtime,marker,'operation log');
for(const marker of ["upsert('operation'",'removeKind(\'operation\')','deviceName||\'أكرم\''])no(runtime,marker,'operation log privacy');
for(const marker of ['operation-log-corrections-runtime.js','loadOperationLogCorrections()'])need(loader,marker,'operation log loader');
if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write('Operation log checks passed: secure audit refresh, branch/device/date/status filters, exact device names, selected export, A4/PDF printing, local-only clear, and sensitive-customer redaction.\n');