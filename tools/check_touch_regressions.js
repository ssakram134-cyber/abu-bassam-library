const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const web=path.join(root,'web');
const errors=[];
const readRoot=p=>fs.readFileSync(path.join(root,p),'utf8');
const readWeb=p=>fs.readFileSync(path.join(web,p),'utf8');
const forbid=(src,token,label)=>{if(src.includes(token))errors.push(`${label}: forbidden ${token}`)};
const need=(src,token,label)=>{if(!src.includes(token))errors.push(`${label}: missing ${token}`)};
const syntax=(src,name)=>{try{new vm.Script(src,{filename:name})}catch(e){errors.push(`${name} syntax: ${e.message}`)}};

const legacyPath=path.join(web,'touch-stability-runtime.js');
if(fs.existsSync(legacyPath))errors.push('Legacy global touch stability runtime must stay deleted');

const recovery=readWeb('feature-recovery-runtime.js');
syntax(recovery,'feature-recovery-runtime.js');
need(recovery,'__ABU_FEATURE_RECOVERY_V1__','feature recovery');
for(const token of ['.style.touchAction','touch-action:auto','touch-action:manipulation','pointer-events:none','.style.pointerEvents','.inert','MutationObserver','restoreNativeTouch','abuNativeTouchResetStyle'])forbid(recovery,token,'feature recovery global interaction guard');

const gestures=readWeb('questions-gesture-runtime.js');
syntax(gestures,'questions-gesture-runtime.js');
need(gestures,'__ABU_QUESTION_GESTURES_DISABLED__','question gesture shim');
need(gestures,'disabled:true','question gesture shim');
for(const token of ['touchAction','touchstart','touchmove','pointerdown','pointermove','preventDefault(','setPointerCapture'])forbid(gestures,token,'question gesture shim');

const permissionGuard=readWeb('permission-guard-runtime.js');
syntax(permissionGuard,'permission-guard-runtime.js');
need(permissionGuard,'__ABU_PERMISSION_GUARD_V1__','permission guard');
need(permissionGuard,'stopImmediatePropagation','permission guard enforcement');
forbid(permissionGuard,'MutationObserver','permission guard whole-DOM observer');

const securityHardening=readWeb('security-hardening-runtime.js');
syntax(securityHardening,'security-hardening-runtime.js');
need(securityHardening,'__ABU_SECURITY_HARDENING_V2__','security hardening');
need(securityHardening,'setInterval(enforceOfflineSession,60000)','security hardening periodic revalidation');
forbid(securityHardening,'MutationObserver','security hardening whole-DOM observer');

const sectionGuards=readWeb('permission-section-guards-runtime.js');
syntax(sectionGuards,'permission-section-guards-runtime.js');
need(sectionGuards,'__ABU_PERMISSION_SECTION_GUARDS_V1__','section permission guards');
forbid(sectionGuards,'MutationObserver','section permission whole-DOM observer');
forbid(sectionGuards,"setInterval(()=>{tick();if(++n>300)clearInterval(t)},100)",'section permission high-frequency polling');

const adminPermissions=readWeb('admin-permissions-runtime.js');
syntax(adminPermissions,'admin-permissions-runtime.js');
need(adminPermissions,'__ABU_ADMIN_PERMISSIONS_V1__','admin permissions');
forbid(adminPermissions,'MutationObserver','admin permissions whole-DOM observer');
forbid(adminPermissions,"setInterval(()=>{tick();if(++n>300)clearInterval(t)},100)",'admin permissions high-frequency polling');

const assets=readRoot('scripts/prepare-android-assets.mjs');
need(assets,'await cp(source, destination, { recursive: true, force: true });','Android clean asset copy');
for(const token of ['touch-stability-runtime.js','injectTouchStabilityRuntime','TOUCH_RUNTIME','__ABU_TOUCH_STABILITY_V1__'])forbid(assets,token,'Android asset preparation');

const repair=readRoot('scripts/patch-startup-stability.mjs');
for(const token of ['feature-recovery-runtime.js','MutationObserver','restoreNativeTouch','touchAction','pointerEvents','abuNativeTouchResetStyle'])forbid(repair,token,'startup repair script');
need(repair,'does not modify web touch/pointer behavior','startup repair script');

if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write('Touch regression checks passed: legacy global runtime is absent, native interaction is not rewritten, permission/security layers do not scan the whole DOM or poll at 100ms, Android assets do not inject a touch patch, and repair scripts cannot reintroduce it.\n');
