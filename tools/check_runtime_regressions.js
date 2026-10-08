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
for(const marker of ['webViewKey','restartWebView','onRenderProcessGone','nativeConfig={{ component: RCTAbuBassamWebView }}'])need(native,marker,'native WebView recovery');
forbid(device,'login-throttle-fix-runtime.js','obsolete login-throttle patch');
const security=read('app-security-runtime.js');
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
if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write('Runtime regression checks passed: persistent removable optional envelope fields, deterministic Cards recovery, non-blocking offline startup, native startup watchdog, canonical login guards, touch/backdrop cleanup, lifecycle-driven customer documents, and reversible secondary-permission UI guards.\n');
