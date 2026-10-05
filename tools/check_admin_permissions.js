const fs=require('fs'),vm=require('vm');
const read=p=>{if(!fs.existsSync(p))throw new Error('missing '+p);return fs.readFileSync(p,'utf8')};
const need=(s,t,l)=>{if(!s.includes(t))throw new Error(`admin permissions check failed: ${l}`)};
const forbid=(s,t,l)=>{if(s.includes(t))throw new Error(`admin permissions check failed: ${l}`)};
const runtime=read('web/admin-permissions-runtime.js');
const devices=read('web/device-reconcile-runtime.js');
const guards=read('web/permission-section-guards-runtime.js');
const loader=read('web/device-name-runtime.js');
const migration=read('supabase/migrations/202609250001_advanced_admin_permissions.sql');
const capacity=read('supabase/migrations/202609250003_advanced_permissions_capacity.sql');
const helper=read('supabase/migrations/202609250002_customer_permission_helper.sql');
const edge=read('supabase/functions/customer-documents/index.ts');
forbid(devices,'function signature(row)','device list must not collapse distinct registered devices by matching metadata');
need(devices,'const current=CURRENT_ID(),byId=new Map();','device list must deduplicate only exact device ids');
new vm.Script(runtime,{filename:'admin-permissions-runtime.js'});
need(guards,'function setGuardDisabled(el,denied)','permission UI guards must preserve existing disabled state');
need(guards,'const customerPhoneHtml=new WeakMap();','customer phone masking must be reversible without storing clear text in DOM attributes');
need(guards,"[['imageInput','edit'],['paperSize','settingsPrinting'],['photoSize','settingsPrinting']]","photo import must follow edit permission, not export permission");
forbid(guards,"[['imageInput','imageExport']",'photo import must not depend on export permission');
new vm.Script(guards,{filename:'permission-section-guards-runtime.js'});
new vm.Script(loader,{filename:'device-name-runtime.js'});
const items=[...runtime.matchAll(/\['([A-Za-z][A-Za-z0-9]+)','[^'\n]*',(true|false)\]/g)].map(m=>m[1]);
const unique=[...new Set(items)];
if(unique.length!==items.length)throw new Error('admin permissions check failed: duplicate detailed permission keys');
if(!items.length)throw new Error('admin permissions check failed: detailed permission catalog is empty');
const legacyKeys=['edit','print','export','appearance','sync','security','devices','reset'];
const allowedBlock=(migration.match(/_abu_bassam_permission_key_allowed[\s\S]*?any\(array\[([\s\S]*?)\]::text\[\]\)/)||[])[1]||'';
const serverAllowed=[...allowedBlock.matchAll(/'([A-Za-z][A-Za-z0-9]+)'/g)].map(m=>m[1]);
if(!serverAllowed.length)throw new Error('admin permissions check failed: server permission catalog could not be parsed');
const detailedServer=serverAllowed.filter(key=>!legacyKeys.includes(key));
const missingOnServer=unique.filter(key=>!detailedServer.includes(key));
const missingInUi=detailedServer.filter(key=>!unique.includes(key));
if(missingOnServer.length||missingInUi.length)throw new Error('admin permissions check failed: UI/server catalog mismatch; missingOnServer='+missingOnServer.join(',')+' missingInUi='+missingInUi.join(','));
for(const key of legacyKeys)if(!serverAllowed.includes(key))throw new Error('admin permissions check failed: legacy compatibility missing '+key);
for(const marker of [
  '__ABU_ADMIN_PERMISSIONS_V1__','صلاحيات متقدمة','السماح للكل','منع الكل','قراءة فقط','موظف طباعة','موظف مستمسكات','موظف تصميم','مخصص / الحالي',
  'vaultView','customerDocumentsView','cardsEdit','questionsEdit','compressSave','printGeneral','pdfSave','syncAutomatic','logsViewOwn','notificationsView','securityView','settingsView','adminViewAllBranches',
  'ADMIN_ONLY','saveDevicePermissions','abu_bassam_manage_device','AbuBassamPermissions','guardCustomerApi','guardQuestionDocument','guardCompressorDocument','guardMessage','SECURE_STORAGE_REQUIRED',"native('secureGet',{key:SECRET_KEY})"
])need(runtime,marker,marker);
forbid(runtime,'__dev_secure_','admin device secret must never fall back to localStorage');
for(const marker of ['PERMISSION_KEY_NOT_ALLOWED','PERMISSION_VALUE_INVALID','ADMIN_ONLY_PERMISSION','OWNER_PERMISSIONS_IMMUTABLE','_abu_bassam_permission_key_allowed','_abu_bassam_permission_admin_only'])need(migration,marker,'server validation '+marker);
need(capacity,'select count(*) into v_permission_count from jsonb_object_keys(p_permissions);','portable permission-key count');
forbid(capacity,'jsonb_object_length(','unsupported PostgreSQL jsonb_object_length must not return');
need(capacity,"if v_permission_count>260 then raise exception 'PERMISSIONS_TOO_LARGE'; end if;",'bounded permission payload capacity');
for(const marker of ['_abu_bassam_device_permission','secret_hash','p_permission'])need(helper,marker,'server permission helper '+marker);
for(const marker of ['admin-permissions-runtime.js','permission-section-guards-runtime.js','loadAdminPermissions()','loadPermissionSectionGuards()'])need(loader,marker,'startup loader '+marker);
for(const marker of ['customerDocumentsAdd','customerDocumentsEdit','customerDocumentsView','customerOriginalDocumentView','customerDocumentsDelete','sha256Hex','secret_hash'])need(edge,marker,'customer edge permission '+marker);
for(const marker of ['__ABU_PERMISSION_SECTION_GUARDS_V1__','logsViewOwn','notificationsView','securityBiometric','securityAutoLock','securityPrivacyMode','syncAutomatic','printGeneral','pdfSave','imageExport','cardsPrint','customerPhoneView','questionsView','compressUse'])need(guards,marker,'section guard '+marker);
for(const marker of [
  "wrap(s,'theme','settingsThemes')",
  "wrap(s,'fonts','settingsFonts')",
  "wrap(s,'archiveAutoSync','syncAutomatic')",
  "wrap(s,'backup','backupCreate')",
  "wrap(s,'sync','syncManual')",
  "wrap(s,'cloudLogin','cloudSettings')",
  "wrap(s,'saveWhatsApp','settingsWhatsApp')",
  "wrap(s,'shareWhatsApp','whatsappBackup')",
  "wrap(s,'printSettings','settingsPrinting')",
  "wrap(s,'systemSettings','settingsPermissions')",
  "wrap(s,'cleanCache','settingsStorage')"
])need(guards,marker,'direct settings permission '+marker);
const adminBlock=(runtime.match(/const ADMIN_ONLY=new Set\(\[([\s\S]*?)\]\);/)||[])[1]||'';
const adminKeys=[...adminBlock.matchAll(/'([A-Za-z][A-Za-z0-9]+)'/g)].map(m=>m[1]);
if(!adminKeys.length||new Set(adminKeys).size!==adminKeys.length)throw new Error('admin permissions check failed: invalid or duplicate UI admin-only keys');
const serverAdminBlock=(migration.match(/_abu_bassam_permission_admin_only[\s\S]*?any\(array\[([\s\S]*?)\]::text\[\]\)/)||[])[1]||'';
const serverAdminKeys=[...serverAdminBlock.matchAll(/'([A-Za-z][A-Za-z0-9]+)'/g)].map(m=>m[1]);
const adminMissingOnServer=adminKeys.filter(key=>!serverAdminKeys.includes(key));
const adminMissingInUi=serverAdminKeys.filter(key=>!adminKeys.includes(key));
if(adminMissingOnServer.length||adminMissingInUi.length)throw new Error('admin permissions check failed: admin-only UI/server mismatch; missingOnServer='+adminMissingOnServer.join(',')+' missingInUi='+adminMissingInUi.join(','));
console.log(`advanced admin permissions checks passed: ${items.length} detailed permissions synchronized exactly with the server catalog + ${legacyKeys.length} legacy compatibility flags, ${adminKeys.length} synchronized admin-only protections, native SecureStore-only owner secrets, presets, server validation, customer document edge enforcement, and cross-section runtime guards`);
