const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const web=path.join(root,'web');
const read=(name)=>fs.readFileSync(path.join(web,name),'utf8');
const errors=[];
const need=(src,marker,label)=>{if(!src.includes(marker))errors.push(`${label}: missing ${marker}`)};
const forbid=(src,marker,label)=>{if(src.includes(marker))errors.push(`${label}: forbidden ${marker}`)};

const envelope=read('envelope-agreement-runtime.js');
for(const marker of ['__ABU_ENVELOPE_AGREEMENT_V3__','REMOVED_KEY','markRemoved','clearRemoved','patchTemplateApply','DesignStudio.remove=function','DesignStudio.reset=function','اليوم والتاريخ اختياريان ويمكن حذفهما'])need(envelope,marker,'envelope optional fields');
forbid(envelope,'new MutationObserver','envelope optional fields');

const productivity=read('productivity-tools-runtime.js');
for(const marker of ['src="about:blank"','data-src="questions-ar.html"','data-src="image-compressor.html"','ensureQuestionFrame','ensureCompressorFrame','a4-card-sheet-editor-v2-runtime.js','__ABU_A4_CARD_SHEET_EDITOR_V2__'])need(productivity,marker,'startup lazy loading');
for(const marker of ['envelopeFrame','abuModeEnvelope','abuPaneEnvelope','src="envelopes.html"','a4-card-sheet-editor-runtime.js','__ABU_A4_CARD_SHEET_EDITOR_V1__'])forbid(productivity,marker,'questions-only section');

const recovery=read('feature-recovery-runtime.js');
for(const marker of ["addCardTool(types,'envelope'",'scheduleRecovery','installRecoverySignals','top:76px','width:52px','height:52px'])need(recovery,marker,'cards/startup UI');
for(const marker of ['new MutationObserver','MutationObserver(','observer.observe(document.documentElement','inert=true','style.pointerEvents='])forbid(recovery,marker,'cards/startup UI');

const touch=read('touch-stability-runtime.js');
for(const marker of ['__ABU_TOUCH_STABILITY_V2__','window.AbuBassamTouchStability={version:2','pointer-events:none!important'])need(touch,marker,'touch stability');
for(const marker of ['new MutationObserver','MutationObserver(','pointerup','touchend','inert=true','style.pointerEvents='])forbid(touch,marker,'touch stability');

const gestures=read('questions-gesture-runtime.js');
for(const marker of ['__ABU_QUESTION_GESTURES_DISABLED__','disabled:true','version:2'])need(gestures,marker,'question gestures');
for(const marker of ['touchstart','touchmove','pointerdown','pointermove','MutationObserver','style.touchAction','style.pointerEvents','inert='])forbid(gestures,marker,'question gestures');

const device=read('device-name-runtime.js');
for(const marker of ['dismissSplash','installSplashWatchdog','setTimeout(dismissSplash,1800)','login-throttle-fix-runtime.js','login-input-direction-runtime.js',"abuBassamLockedDeviceIdV5","const APP_VERSION = '5.0.0'"])need(device,marker,'startup/login guards');

const native=fs.readFileSync(path.join(root,'index.js'),'utf8');
for(const marker of ['webInstanceKey','recoverWebRenderer','onRenderProcessGone',"const APP_VERSION = '5.0.0'","const BUILD_NUMBER = '500'"])need(native,marker,'native renderer recovery');

for(const file of ['envelope-agreement-runtime.js','productivity-tools-runtime.js','feature-recovery-runtime.js','touch-stability-runtime.js','questions-gesture-runtime.js','device-name-runtime.js']){
  try{new vm.Script(read(file),{filename:file})}catch(error){errors.push(`${file}: ${error.message}`)}
}

if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write('Runtime regression checks passed: lazy questions/compressor, V2 A4 editor, no global touch/DOM interception, native-only question gestures, v5 isolated device identity, WebView renderer recovery, Cards placement, splash watchdog, and login guards.\n');
