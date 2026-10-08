const fs=require('fs');
function read(p){if(!fs.existsSync(p))throw new Error(`missing ${p}`);return fs.readFileSync(p,'utf8')}
function need(src,token,label){if(!src.includes(token))throw new Error(`notification check failed: ${label}`)}
function forbid(src,token,label){if(src.includes(token))throw new Error(`notification check failed: ${label}`)}
const runtime=read('web/notification-center-runtime.js');
const corrections=read('web/notification-center-corrections-runtime.js');
const bridge=read('web/notification-ops-bridge-runtime.js');
const privacy=read('web/operation-log-privacy-runtime.js');
const operationCorrections=read('web/operation-log-corrections-runtime.js');
const secondaryPrivacy=read('web/secondary-notification-privacy-runtime.js');
const excel=read('web/notification-excel-runtime.js');
const loader=read('web/productivity-tools-runtime.js');
const startupLoader=read('web/device-name-runtime.js');
const migration=read('supabase/migrations/202609240002_notification_audit_center.sql');
const privacyMigration=read('supabase/migrations/202609240003_operation_log_privacy_boundary.sql');
const redactionMigration=read('supabase/migrations/20261005211736_abu_bassam_strict_customer_audit_redaction.sql');
for(const src of [runtime,corrections,bridge,privacy,operationCorrections,secondaryPrivacy,excel,startupLoader])new Function(src);
need(loader,'operation-log-privacy-runtime.js','operation privacy runtime is not loaded');
need(loader,'notification-center-runtime.js','notification runtime is not loaded');
need(loader,'notification-ops-bridge-runtime.js','stable operations bridge is not loaded');
need(startupLoader,'notification-center-corrections-runtime.js','notification corrections must load during app startup');
need(startupLoader,'loadNotificationCorrections()','startup must invoke notification corrections');
need(startupLoader,'notification-excel-runtime.js','Excel report runtime must load during app startup');
need(startupLoader,'loadNotificationExcel()','startup must invoke Excel report runtime');
need(bridge,'secondary-notification-privacy-runtime.js','secondary notification privacy runtime is not loaded by the bridge');
need(bridge,'notification-center-corrections-runtime.js','notification corrections runtime is not loaded by the bridge');
need(bridge,'script.async=false','notification privacy/corrections must preserve load order');
need(bridge,'rootOriginal','bridge must unwrap temporary notification wrappers');
need(bridge,'__abuOriginal','bridge must retain the raw operation writer');
need(bridge,'ops.list?.()?.[0]','bridge must read the persisted operation id');
need(bridge,'abuBassamOperationDeviceScopeV1','operation ownership map');
need(bridge,'bindOperationToDevice','new operations must be bound to their originating device');
need(bridge,'function refreshBridge(){install();loadSecondaryPrivacy();loadCorrections()}','bridge must use deterministic lifecycle refresh');
need(bridge,"document.addEventListener('abu-bassam-auth-changed',refreshBridge)",'bridge must refresh on auth changes');
forbid(bridge,'setInterval(','bridge must not poll for startup races');
forbid(bridge,'7000','bridge must not use delayed startup retry');
need(privacy,"!=='operation'",'legacy operation cloud traffic must be intercepted');
need(privacy,"role()!=='secondary'",'secondary local log isolation');
need(privacy,'ownerId===id','secondary logs must be filtered by exact device id');
need(privacy,'abuBassamOperationDeviceScopeV1','secondary logs must use the ownership map');
need(privacy,'function refreshPrivacy(){const installed=installClientBoundary();forceClean();','operation privacy must use deterministic lifecycle refresh');
need(privacy,"document.addEventListener('abu-bassam-auth-changed',refreshPrivacy)",'operation privacy must refresh on auth changes');
need(privacy,"document.addEventListener('abu-bassam-security-state',refreshPrivacy)",'operation privacy must refresh on security state');
forbid(privacy,'setInterval(','operation privacy must not poll');
forbid(privacy,'[250,800,1800,3500,7000]','operation privacy must not use retry timer ladder');
forbid(privacy,'deviceName()','secondary isolation must not fall back to device name');
need(secondaryPrivacy,"role()!=='secondary'",'secondary notification inbox must be isolated');
need(secondaryPrivacy,'ownerId===id','operation notifications must match exact device id');
need(secondaryPrivacy,'return !!nDevice&&nDevice===id','non-operation notifications must require exact device id');
need(secondaryPrivacy,"notification.source==='branch-audit'",'branch audit rows must never appear in a secondary inbox');
need(secondaryPrivacy,'abuBassamOperationDeviceScopeV1','notification privacy must use the ownership map');
need(secondaryPrivacy,'abuBassamAuditQueueV1','secondary audit queue must be privacy filtered');
need(secondaryPrivacy,'ownQueue','foreign queued audit events must be purged before upload');
need(runtime,'abuNotificationBell','bell button');need(runtime,'abuNotificationBadge','unread badge');need(runtime,'markAll','mark all read');need(runtime,'clearRead','clear read notifications');
need(runtime,"function markAll(){if(!requirePermission('notificationsManage')||!requirePermission('notificationsMarkRead'))",'bulk mark-read must require notificationsManage and notificationsMarkRead');
need(runtime,"function clearRead(){if(!requirePermission('notificationsManage')||!requirePermission('notificationsDelete'))",'bulk clear-read must require notificationsManage and notificationsDelete');
need(runtime,"setInterval(()=>{if(document.visibilityState==='hidden')return;syncOperationBridge(true)},120000)",'periodic notification sync must pause while the app is hidden');
need(runtime,'function syncOperationBridge(notifyOwner=false)','notification operation bridge must be event driven');
forbid(runtime,'},250)','notification center must not restore startup polling');
for(const marker of [
  "function canViewNotification(n)",
  "notificationsMaintenance",
  "notificationsBackup",
  "notificationsDeviceAlerts",
  "notificationsSecurity",
  "requirePermission('notificationsMarkRead')",
  "requirePermission('notificationsDelete')",
  "visibleNotifications().filter(x=>!x.read).length",
  "list:visibleNotifications"
])need(runtime,marker,'notification permission '+marker);need(runtime,'[هاتف محجوب]','base notification phone redaction');need(runtime,'[بريد محجوب]','base notification email redaction');need(runtime,"out.title='عملية مستمسكات';out.section='مستمسكات الزبائن'",'base notification customer-context redaction');need(runtime,"canDeleteCritical(){return isOwner()||window.AbuBassamPermissions?.can?.('notificationsDeleteCritical')===true}",'critical notification deletion permission');need(runtime,'const saveFiltered=removeCritical=>','bulk read-clear must preserve critical notifications unless explicitly authorized');need(runtime,'criticalIds.has(String(x.id))','bulk read-clear must retain critical notification IDs when deletion is not authorized');need(runtime,'هذا إشعار حرج. سيُحذف من هذا الجهاز فقط','critical notification deletion confirmation');
for(const token of ["['all','الكل']","['unread','غير المقروء']","['print','الطباعة']","['files','الملفات']","['security','الأمان']","['sync','المزامنة']","['settings','الإعدادات']","['cards','الكروت']","['system','النظام']"])need(runtime,token,`category ${token}`);
need(runtime,'abu_bassam_owner_activity_report','owner-only report RPC');need(runtime,'abu_bassam_record_device_activity','verified activity RPC');need(runtime,"exportAdmin('csv')",'CSV report export');need(runtime,"exportAdmin('txt')",'TXT report export');need(runtime,"exportAdmin('pdf')",'PDF report export');
need(runtime,"if(/^[\\t\\r\\n ]*[=+\\-@]/.test(s)||/^[\\t\\r\\n]/.test(s))s=\"'\"+s",'CSV report must neutralize spreadsheet formulas');
need(runtime,"const header=format==='csv'?'\\ufeffالتاريخ,الجهاز,التصنيف",'CSV report must include a UTF-8 BOM for Arabic Excel compatibility');
for(const token of ['__ABU_NOTIFICATION_EXCEL_V2__','jszip.min.js','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.xlsx','sheet1.xml','workbook.xml','Android.saveBase64',"role?.()==='owner'",'abuReportExcel'])need(excel,token,`XLSX export ${token}`);
for(const token of ['__ABU_NOTIFICATION_CENTER_CORRECTIONS_V2__','validOps.has(opId)','sameOperation(a,b)','isPhantomOperation','seen.has(n.id)','[هاتف محجوب]','[بريد محجوب]','[تفاصيل زبون محجوبة]','تقارير الأجهزة الفرعية','String(scope[id]||\'\').trim()!==d.id'])need(corrections,token,`notification corrections ${token}`);
forbid(corrections,"},5000)",'notification corrections must not keep a permanent five-second timer');
need(corrections,"document.addEventListener('abu-runtime-loaded'",'notification corrections runtime-load event');
need(corrections,"document.addEventListener('abu-bassam-auth-changed'",'notification corrections auth-change event');
forbid(secondaryPrivacy,"},1500)",'secondary notification privacy must not keep a permanent timer');
need(secondaryPrivacy,"document.addEventListener('abu-runtime-loaded'",'secondary notification runtime-load event');
need(secondaryPrivacy,"document.addEventListener('abu-bassam-auth-changed'",'secondary notification auth-change event');
need(migration,'revoke all on public.abu_bassam_device_activity from anon,authenticated','direct table access revoked');need(migration,'from PUBLIC,anon','security-definer PUBLIC/anon execution revoked');need(migration,"v_actor.role<>'owner'",'server owner verification');need(migration,'DEVICE_NOT_AUTHORIZED','device secret verification');need(migration,'abu_bassam_owner_activity_devices','owner device report RPC');
need(privacyMigration,"kind <> 'operation'",'legacy operation rows excluded by RLS');for(const token of ["coalesce(v_device.secret_hash,'')=''",'v_device.secret_hash<>v_hash','[تفاصيل زبون محجوبة]','[هاتف محجوب]','[بريد محجوب]','[رقم محجوب]',"v_title:='عملية مستمسكات'","v_section:='مستمسكات الزبائن'",'revoke all on function public.abu_bassam_record_device_activity'])need(redactionMigration,token,`server audit redaction ${token}`);
need(corrections,"out.title='عملية مستمسكات';out.section='مستمسكات الزبائن'",'client notification customer labels must be fully redacted');
need(operationCorrections,"out.title=scrubText(labels[src.type]||'عملية مستمسكات');out.section='مستمسكات الزبائن'",'operation log customer labels must not preserve customer names');
console.log('notification center checks passed: exact device privacy, redaction, owner reports, CSV/TXT/PDF, and real XLSX export');
