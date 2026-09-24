const fs=require('fs');
function read(p){if(!fs.existsSync(p))throw new Error(`missing ${p}`);return fs.readFileSync(p,'utf8')}
function need(src,token,label){if(!src.includes(token))throw new Error(`notification check failed: ${label}`)}
const runtime=read('web/notification-center-runtime.js');
const loader=read('web/productivity-tools-runtime.js');
const migration=read('supabase/migrations/202609240002_notification_audit_center.sql');
new Function(runtime);
need(loader,'notification-center-runtime.js','notification runtime is not loaded');
need(runtime,'abuNotificationBell','bell button');
need(runtime,'abuNotificationBadge','unread badge');
need(runtime,'markAll','mark all read');
need(runtime,'clearRead','clear read notifications');
need(runtime,"['all','unread','print','files','security','sync','settings','cards','system']".slice(1,-1),'category tabs marker');
need(runtime,'تقارير الفرعين','owner branch report tab');
need(runtime,"role()==='owner'",'owner role gate');
need(runtime,'abu_bassam_owner_activity_report','owner-only report RPC');
need(runtime,'abu_bassam_record_device_activity','verified activity RPC');
need(runtime,"exportAdmin('csv')",'CSV report export');
need(runtime,"exportAdmin('txt')",'TXT report export');
need(runtime,"exportAdmin('pdf')",'PDF report export');
need(runtime,'[محجوب]','sensitive-value redaction');
need(migration,'revoke all on public.abu_bassam_device_activity from anon,authenticated','direct table access revoked');
need(migration,"v_actor.role<>'owner'",'server owner verification');
need(migration,'DEVICE_NOT_AUTHORIZED','device secret verification');
need(migration,'abu_bassam_owner_activity_devices','owner device report RPC');
console.log('notification center checks passed');
