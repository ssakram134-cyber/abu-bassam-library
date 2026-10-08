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
for(const marker of ['src="about:blank"','data-src="questions-ar.html"','data-src="image-compressor.html"','ensureQuestionFrame','ensureCompressorFrame'])need(productivity,marker,'startup lazy loading');
for(const marker of ['envelopeFrame','abuModeEnvelope','abuPaneEnvelope','src="envelopes.html"'])forbid(productivity,marker,'questions-only section');

const recovery=read('feature-recovery-runtime.js');
for(const marker of ["addCardTool(types,'envelope'",'function init()','installCards()','removeOldPlacements()',"document.addEventListener('DOMContentLoaded',init)",'top:76px','width:52px','height:52px'])need(recovery,marker,'cards/startup UI');
forbid(recovery,'scheduleRecovery','obsolete recovery retry loop');
forbid(recovery,'new MutationObserver','obsolete recovery observer');

const device=read('device-name-runtime.js');
for(const marker of ['dismissSplash','signalBootReady()','await loadApprovedUi();','login-input-direction-runtime.js'])need(device,marker,'startup/login guards');
forbid(device,'installSplashWatchdog','obsolete web splash watchdog');
forbid(device,'setTimeout(dismissSplash,1800)','obsolete time-based splash dismissal');
for(const marker of ["await stabilizeIdentity();","function heartbeatSafely()","void heartbeat().catch(","setTimeout(heartbeatSafely,200)","setInterval(heartbeatSafely,120000)","window.addEventListener('online',heartbeatSafely)"])
  need(device,marker,'device identity startup and background heartbeat separation');
for(const marker of ["setTimeout(heartbeat,200)","window.addEventListener('online',heartbeat)","setInterval(()=>{if(document.visibilityState!=='hidden')heartbeat()}"])
  forbid(device,marker,'unhandled async device heartbeat');
// Exercise the actual startup-failure handler against the shipped image-only
// splash markup. A missing #splashText must not leave the failure invisible.
{
  const page=read('index.html');
  if(!page.includes('<div id="splash" class="splash"><img')||page.includes('id="splashText"'))
    errors.push('startup-failure fixture changed: review splash regression test');
  const handlerStart=device.indexOf('  function showBootFailure(error){');
  const handlerEnd=device.indexOf('\n  async function startApprovedUi()',handlerStart);
  if(handlerStart<0||handlerEnd<0)errors.push('secure startup failure handler not found');
  else {
    const messages=[], nodes={};
    const splash={style:{},appendChild(element){nodes[element.id]=element}};
    nodes.splash=splash;
    const doc={
      getElementById(id){return nodes[id]||null},
      createElement(){return {style:{},setAttribute(key,value){this[key]=value}}}
    };
    const stubWindow={ReactNativeWebView:{postMessage(payload){messages.push(JSON.parse(payload))}}};
    try{
      vm.runInNewContext(device.slice(handlerStart,handlerEnd)+'\nshowBootFailure(new Error("offline startup failure"));',{
        document:doc,window:stubWindow,console:{error(){}}
      });
      if(!nodes.splashText||!nodes.splashText.textContent.includes('تعذر تحميل مكونات التطبيق')||nodes.splashText.role!=='alert')
        errors.push('image-only splash does not surface secure boot failure visibly');
      if(messages.length!==1||messages[0].type!=='webBootFailed')
        errors.push('secure boot failure not forwarded to the native loading overlay');
    }catch(error){errors.push('startup-failure simulation failed: '+error.message)}
  }
}
const secureSync=read('secure-sync-runtime.js');
for(const marker of [
  'function init()',
  'buildOperations();',
  'wrapActions();',
  "ready().catch(() => updateStatus('تعذر التحقق من جلسة المزامنة'))"
])need(secureSync,marker,'offline startup must stay non-blocking');
const nativeAuth=fs.readFileSync(path.join(root,'index-auth.js'),'utf8');
for(const marker of [
  "Linking.getInitialURL().then(captureAuthCallback).catch(() => {});",
  "require('./index.js');"
])need(nativeAuth,marker,'native auth must not block offline startup');

const native=fs.readFileSync(path.join(root,'index.js'),'utf8');
// The native bridge is injected at document-start AND document-end. Reinjection
// must not replace pending-response callbacks or lose native request state.
const bridgeMarker='const ANDROID_BRIDGE = '+String.fromCharCode(96);
const bridgeStart=native.indexOf(bridgeMarker);
const bridgeEnd=bridgeStart<0?-1:native.indexOf(String.fromCharCode(96)+';',bridgeStart+bridgeMarker.length);
const bridgeMatch=bridgeEnd<0?null:['',native.slice(bridgeStart+bridgeMarker.length,bridgeEnd)];
if(!bridgeMatch)errors.push('native WebView bridge template missing');
else{
  const interpolation='\${JSON.stringify({ version: APP_VERSION, buildNumber: BUILD_NUMBER, releaseDate: RELEASE_DATE })}';
  const bridgeSource=bridgeMatch[1].replace(interpolation, '{"version":"test","buildNumber":"test","releaseDate":"test"}');
  const testWindow={ReactNativeWebView:{postMessage:()=>{}}};
  try{
    const context=vm.createContext({window:testWindow});
    vm.runInContext(bridgeSource,context);
    const firstAndroid=testWindow.Android;
    const firstOutputCallback=testWindow.AbuBassamNativeOutputResult;
    vm.runInContext(bridgeSource,context);
    if(!testWindow.__ABU_NATIVE_BRIDGE_INSTALLED_V1__||testWindow.Android!==firstAndroid||testWindow.AbuBassamNativeOutputResult!==firstOutputCallback)
      errors.push('native bridge reinjection replaced a live bridge or its output callback');
  }catch(error){errors.push('native bridge reinjection simulation failed: '+error.message)}
}
for(const metadataMarker of ["window.__ABU_APP_META__ =","releaseDate: RELEASE_DATE"])need(native,metadataMarker,'canonical native app metadata');
for(const file of ['device-name-runtime.js','app-settings-runtime.js','account-center-runtime.js','app-update-runtime.js','app-security-runtime.js','security-hardening-runtime.js','backup-center-runtime.js','settings-corrections-runtime.js']){
  const src=read(file);need(src,'__ABU_APP_META__','runtime app metadata');forbid(src,"'4.3.2'",'runtime hard-coded app version');
}

for(const marker of ['const STARTUP_WATCHDOG_MS = 12000;',"message.type === 'webBootReady'",'if (webReady) return undefined;','setTimeout(() => {'])need(native,marker,'native startup watchdog');
for(const marker of ["message.type === 'webBootFailed'","bootFailureAlertShown.current = true;","if (bootFailureAlertShown.current) return;","reportBootFailure('تعذر فتح مكتبة أبو بسام'","onError={() => reportBootFailure("])
  need(native,marker,'native boot failure must be visible once and provide retry');
need(native,"if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') return;",'WebView bridge must reject JSON primitives before property access');
for(const marker of ['webViewKey','restartWebView','onRenderProcessGone','nativeConfig={{ component: RCTAbuBassamWebView }}'])need(native,marker,'native WebView recovery');
forbid(device,'login-throttle-fix-runtime.js','obsolete login-throttle patch');
const security=read('app-security-runtime.js');
const bootStart=security.indexOf('async function boot(){');
const bootEnd=security.indexOf('\nwindow.AbuBassamSecurity={',bootStart);
if(bootStart<0||bootEnd<0)errors.push('secure boot function could not be inspected');
else {
  const bootSource=security.slice(bootStart,bootEnd);
  for(const forbidden of ['await cloud()?.ready?.()','await fetchDeviceInfo()','await getBiometricEnabled()'])
    if(bootSource.includes(forbidden))errors.push('offline startup is blocked by '+forbidden);
  for(const marker of ["showGate('أدخل بيانات الدخول لفتح التطبيق.')",'void fetchDeviceInfo().catch(',"cloudReady.catch(()=>{})",'abu-bassam-approved-ui-ready'])
    need(bootSource,marker,'offline login gate and deferred native biometric startup');
}
for(const marker of ['window.__ABU_APPROVED_UI_READY__=true;',"new CustomEvent('abu-bassam-approved-ui-ready')"])
  need(device,marker,'approved UI handshake must wait for all loaded guards');
forbid(security,'setInterval(','app security must not keep a permanent background heartbeat');for(const marker of ['function scheduleMaintenance(delay=60000)','function maintenanceTick()','document.visibilityState===\'hidden\'','clearTimeout(maintenanceTimer)'])need(security,marker,'visibility-aware security maintenance');
for(const marker of ['function setSecondaryOwnerOnly','abuSecurityOwnerGuard',"const denied=currentDevice?.role!=='owner'"])need(security,marker,'reversible owner-only security controls');
for(const marker of ["'#abuA4EditorV2.show'","'#abuPosterAssemblyModal.show'","'#abuEnhanceModal.show'","'#abuPosterModal.show'","'#abuGeoModal.show'","'#abuRulerModal.show'","'#abuPresetModal.abu-open'","window.AbuA4CardSheetEditorV2?.close?.()","window.AbuPosterProject?.closePreview?.()","window.AbuPhotoAdvanced?.close?.(el.id)","window.AbuPhotoGeometry?.close?.(el.id)","window.AbuPrintPresets?.close?.()","'#abuPasswordResetModal.show'","window.AbuBassamPasswordRecovery?.close?.()","'#natZoom.show'","'#custView.on'","'#custPick.on'","'#custModal.on'","'#abuBackupModal.on'","'#abuVaultAdvancedModal.show'","'#abuRecoveryModal.show'","window.AbuFeatureRecovery?.close?.()","'#abuAccountModal.on'","'#abuNotificationSheet.show'","'#abuOpsV2.show'","window.AbuBassamOperationLogV2?.close?.()","window.Nat?.zoomClose?.()","window.AbuCustomerDocs?.closeTop?.()","window.AbuBackupCenter?.close?.()","window.AbuDocumentVaultAdvanced?.close?.()","window.AbuBassamAccount?.close?.()","window.AbuBassamNotifications?.close?.()"])need(security,marker,'top-layer back handling');
const accountCenter=read('account-center-runtime.js');need(accountCenter,'open:()=>show(user()?\'profile\':\'home\'),close,login:','account center close export');


for(const marker of ['ATTEMPT_KEY','LOGIN_LOCK_KEY','BLOCK_COUNT_KEY','recordCredentialFailure','clearCredentialFailures'])need(security,marker,'canonical login throttle');
for(const marker of ['clearOrphanInteractionLayers',"#paperZoomOverlay.show","window.closeSheets","el.classList.contains('sheet')"])need(security,marker,'touch/backdrop cleanup');
const sectionGuards=read('permission-section-guards-runtime.js');
const legacyPermissionGuard=read('permission-guard-runtime.js');
for(const marker of ['function restoreDecorated()','data-abu-permission-guarded','abu-bassam-security-state'])need(legacyPermissionGuard,marker,'legacy permission guard restoration');

need(sectionGuards,"#cardsCenter,.cs-modal,#abuRecoveryModal",'card permission context');
forbid(sectionGuards,'[class*="card" i]','over-broad card permission context');

for(const marker of ["const secondary=()=>window.AbuBassamSecurity?.role?.()==='secondary'","abu-bassam-security-state","abuSectionGuarded"])need(sectionGuards,marker,'secondary permission UI restoration');
const adminPermissions=read('admin-permissions-runtime.js');
for(const marker of ['setUiGuardDisabled','restorePermissionUi',"role()!=='secondary'","abu-bassam-security-state","abuPermissionHidden"])need(adminPermissions,marker,'permission UI lifecycle restoration');

for(const file of ['envelope-agreement-runtime.js','productivity-tools-runtime.js','feature-recovery-runtime.js','device-name-runtime.js','app-security-runtime.js','permission-section-guards-runtime.js','admin-permissions-runtime.js']){
  try{new vm.Script(read(file),{filename:file})}catch(error){errors.push(`${file}: ${error.message}`)}
}

for(const [file,marker] of [['customer-documents-runtime.js','closeTop'],['backup-center-runtime.js','open,close,backupNow'],['document-vault-advanced-runtime.js','{open,close}']])need(read(file),marker,'back-close export');
const customerDocs=read('customer-documents-runtime.js');
for(const lifecycle of ["document.addEventListener('abu-runtime-loaded',inject)","document.addEventListener('abu-settings-ready',inject)"])need(customerDocs,lifecycle,'customer documents lifecycle injection');
forbid(customerDocs,'setInterval(','customer documents must not poll the DOM');
forbid(customerDocs,'new MutationObserver','customer documents must not observe the full DOM');
const notificationCenter=read('notification-center-runtime.js');
need(notificationCenter,'function syncOperationBridge(notifyOwner=false)','notification center event bridge');
need(notificationCenter,"document.addEventListener('abu-bassam-auth-changed',()=>syncOperationBridge(false))",'notification center auth lifecycle');
need(notificationCenter,'120000','notification center must keep only low-frequency visible refresh');
if((notificationCenter.match(/setInterval\s*\(/g)||[]).length!==1)errors.push('notification-center-runtime.js: only the low-frequency 120s interval is allowed');
forbid(notificationCenter,'},250)','notification center must not restore 250ms startup polling');
forbid(notificationCenter,'15000','notification center must not restore startup polling timeout');

const notificationCorrections=read('notification-center-corrections-runtime.js');
for(const marker of ["document.addEventListener('abu-runtime-loaded',event=>","src==='notification-center-runtime.js'","document.addEventListener('abu-bassam-auth-changed',refreshGuards)"])need(notificationCorrections,marker,'notification corrections lifecycle');
forbid(notificationCorrections,'setInterval(','notification corrections must not poll');
forbid(notificationCorrections,'[300,800,1600,3500,7000]','notification corrections must not retry by timer ladder');

const secondaryNotificationPrivacy=read('secondary-notification-privacy-runtime.js');
for(const marker of ["document.addEventListener('abu-runtime-loaded',event=>","src==='notification-center-runtime.js'","document.addEventListener('abu-bassam-auth-changed',refresh)"])need(secondaryNotificationPrivacy,marker,'secondary notification privacy lifecycle');
forbid(secondaryNotificationPrivacy,'setInterval(','secondary notification privacy must not poll');
forbid(secondaryNotificationPrivacy,'[100,300,900,1800,3500,7000]','secondary notification privacy must not retry by timer ladder');
const notificationBridge=read('notification-ops-bridge-runtime.js');
need(notificationBridge,'function refreshBridge(){install();loadSecondaryPrivacy();loadCorrections()}','notification bridge lifecycle refresh');
forbid(notificationBridge,'setInterval(','notification bridge must not poll');
forbid(notificationBridge,'7000','notification bridge must not use delayed startup retry');

const operationPrivacy=read('operation-log-privacy-runtime.js');
need(operationPrivacy,'function refreshPrivacy(){const installed=installClientBoundary();forceClean();','operation privacy lifecycle refresh');
forbid(operationPrivacy,'setInterval(','operation privacy must not poll');
forbid(operationPrivacy,'[250,800,1800,3500,7000]','operation privacy must not use retry ladder');

const passwordRecovery=read('password-recovery-runtime.js');need(passwordRecovery,'close:()=>closeResetModal(false)','password reset native-back close');
const securityExtras=read('security-extras-runtime.js');for(const marker of ['privacyHideTimer','clearTimeout(privacyHideTimer)','abuSecurityExtrasOwnerGuard','abu-settings-ready','abu-runtime-loaded','function scheduleSnapshot()','clearTimeout(snapshotTimer)'])need(securityExtras,marker,'security extras lifecycle restoration');forbid(securityExtras,'new MutationObserver','security extras must use settings lifecycle events');forbid(securityExtras,'setInterval(','security extras must not poll or keep a permanent interval');

const featureRecovery=read('feature-recovery-runtime.js');for(const marker of ['function closeTool()','close:closeTool',"classList.add('show')"])need(featureRecovery,marker,'feature recovery modal back-close');

const printPresets=read('print-presets-runtime.js');for(const marker of ["classList.add('abu-open')","classList.remove('abu-open')"])need(printPresets,marker,'print presets back state');
// Validate actual loader behavior: duplicate calls coalesce, an existing
// script element is not treated as success, and failed loads are retryable.
async function testRuntimeScriptLoader(){
  const start=device.indexOf('  const pendingScriptLoads=new Map();');
  const end=device.indexOf('  const loadFeatureRecovery=',start);
  if(start<0||end<=start)throw new Error('runtime loader source not found');
  const loader=device.slice(start,end);
  const factory=vm.runInNewContext(`(document,window,setTimeout,clearTimeout,CustomEvent)=>{
    ${loader}
    return loadScript
  }`);
  const scripts=new Map(),appends=[],timers=new Map();
  let nextTimerId=0;
  const document={
    getElementById:id=>scripts.get(id)||null,
    createElement:()=>({remove(){scripts.delete(this.id)}}),
    head:{appendChild(el){scripts.set(el.id,el);appends.push(el)}},
    dispatchEvent:()=>{}
  };
  const window={};
  const load=factory(document,window,fn=>{const id=++nextTimerId;timers.set(id,fn);return id},id=>timers.delete(id),function CustomEvent(){});
  const first=load('testRuntime','runtime-test.js','__READY_TEST__');
  const duplicate=load('testRuntime','runtime-test.js','__READY_TEST__');
  if(first!==duplicate||appends.length!==1)throw new Error('concurrent script load is not deduplicated');
  window.__READY_TEST__=true;
  appends[0].onload();
  if(!(await first)||!(await duplicate))throw new Error('successful script load was not delivered');
  await Promise.resolve();
  delete window.__READY_TEST__;
  let existingFailed=false;
  try{await load('testRuntime','runtime-test.js','__READY_TEST__')}
  catch(error){existingFailed=/already exists/.test(String(error.message))}
  if(!existingFailed)throw new Error('loaded script without runtime flag was treated as ready');
  const failed=load('failedRuntime','failed-runtime.js','__FAILED_TEST__');
  appends[1].onerror();
  let rejected=false;
  try{await failed}catch(error){rejected=/resource error/.test(String(error.message))}
  if(!rejected||scripts.has('failedRuntime'))throw new Error('failed script was not cleaned up for retry');
  await Promise.resolve();
  const retry=load('failedRuntime','failed-runtime.js','__FAILED_TEST__');
  window.__FAILED_TEST__=true;
  appends[2].onload();
  if(!(await retry))throw new Error('previously failed script could not be retried');
  const stuck=load('stuckRuntime','stuck-runtime.js','__STUCK_TEST__');
  const timeout=[...timers.values()][0];
  if(typeof timeout!=='function')throw new Error('script load watchdog was not armed');
  timeout();
  let timedOut=false;
  try{await stuck}catch(error){timedOut=/script load timeout/.test(String(error.message))}
  if(!timedOut||scripts.has('stuckRuntime'))throw new Error('script timeout did not clean up stale script');
}
// Exercise the real inline MediaPipe operation with an instant fake watchdog:
// an engine that never emits onResults must not leave #busyOverlay stuck.
async function testBoundedSegmentation(){
  const html=read('index.html');
  const begin=html.indexOf('async function segment(src){');
  const end=html.indexOf('function setBusy(',begin);
  if(begin<0||end<begin)throw new Error('segmentation routine not found');
  const source=html.slice(begin,end);
  if(!source.includes('},30000)')||!source.includes('clearTimeout(timer)'))
    throw new Error('segmentation watchdog or cleanup is missing');
  const factory=vm.runInNewContext(`(getSelfie,schedule,cancel)=>{
    const setTimeout=schedule,clearTimeout=cancel;
    let selfieResolve=null;
    ${source}
    return {segment,deliver(value){if(selfieResolve)selfieResolve(value)}}
  }`);
  let timeout=null;
  const test=factory(async()=>({send:async()=>{}}),fn=>{timeout=fn;return 1},()=>{});
  const first=test.segment({});
  for(let i=0;i<10;i+=1)await Promise.resolve();
  if(typeof timeout!=='function')throw new Error('segment watchdog was not armed');
  timeout();
  let rejected=false;
  try{await first}catch(error){rejected=/انتهت مهلة/.test(String(error.message))}
  if(!rejected)throw new Error('unresponsive segmentation did not reject at deadline');
  const next=test.segment({});
  for(let i=0;i<10;i+=1)await Promise.resolve();
  test.deliver({segmentationMask:true});
  const result=await next;
  if(result?.segmentationMask!==true)throw new Error('segmentation remained locked after timeout');
}
Promise.all([testBoundedSegmentation(),testRuntimeScriptLoader()]).then(()=>{
  if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exitCode=1;return}
  process.stdout.write('Runtime regression checks passed: reliable script loader retries and timeouts, offline-first secure gate, bounded image segmentation, native bridge boot, and touch/backdrop cleanup.\n');
}).catch(error=>{
  errors.push('startup/segmentation behavior regression: '+error.message);
  process.stderr.write(errors.join('\n')+'\n');
  process.exitCode=1
});
