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

const legacyPath=path.join(web,'touch-stability-runtime.js');
if(fs.existsSync(legacyPath))errors.push('Legacy global touch stability runtime must stay deleted');

const recovery=readWeb('feature-recovery-runtime.js');
try{new vm.Script(recovery,{filename:'feature-recovery-runtime.js'})}catch(e){errors.push(`feature recovery syntax: ${e.message}`)}
need(recovery,'__ABU_FEATURE_RECOVERY_V1__','feature recovery');
for(const token of [
  '.style.touchAction',
  'touch-action:auto',
  'touch-action:manipulation',
  'pointer-events:none',
  '.style.pointerEvents',
  '.inert',
  'MutationObserver',
  'restoreNativeTouch',
  'abuNativeTouchResetStyle'
])forbid(recovery,token,'feature recovery global interaction guard');

const gestures=readWeb('questions-gesture-runtime.js');
try{new vm.Script(gestures,{filename:'questions-gesture-runtime.js'})}catch(e){errors.push(`questions gesture shim syntax: ${e.message}`)}
need(gestures,'__ABU_QUESTION_GESTURES_DISABLED__','question gesture shim');
need(gestures,'disabled:true','question gesture shim');
for(const token of ['touchAction','touchstart','touchmove','pointerdown','pointermove','preventDefault(','setPointerCapture'])forbid(gestures,token,'question gesture shim');

const assets=readRoot('scripts/prepare-android-assets.mjs');
need(assets,'await cp(source, destination, { recursive: true, force: true });','Android clean asset copy');
for(const token of ['touch-stability-runtime.js','injectTouchStabilityRuntime','TOUCH_RUNTIME','__ABU_TOUCH_STABILITY_V1__'])forbid(assets,token,'Android asset preparation');

const repair=readRoot('scripts/patch-startup-stability.mjs');
for(const token of ['feature-recovery-runtime.js','MutationObserver','restoreNativeTouch','touchAction','pointerEvents','abuNativeTouchResetStyle'])forbid(repair,token,'startup repair script');
need(repair,'does not modify web touch/pointer behavior','startup repair script');

if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write('Touch regression checks passed: legacy global runtime is absent, recovery and questions leave native interaction untouched, Android assets do not inject a touch patch, and repair scripts cannot reintroduce it.\n');
