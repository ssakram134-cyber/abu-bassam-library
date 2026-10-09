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
for(const marker of ["await stabilizeIdentity();","function heartbeatSafely()","void heartbeat().catch(","setTimeout(heartbeatSafely,200)","scheduleHeartbeat();","document.addEventListener('visibilitychange'","if(heartbeatPending)return heartbeatPending","window.addEventListener('online',heartbeatSafely)"])
  need(device,marker,'device identity startup and background heartbeat separation');
for(const marker of ["setTimeout(heartbeat,200)","window.addEventListener('online',heartbeat)","setInterval(()=>{if(document.visibilityState!=='hidden')heartbeat()}"])
  forbid(device,marker,'unhandled async device heartbeat');
async function testSecureDeviceHeartbeatLifecycle(){
  const device=read('device-name-runtime.js');
  const begin=device.indexOf('  let heartbeatPending=null,heartbeatTimer=null;');
  const end=device.indexOf('  async function adoptIdentity(',begin);
  if(begin<0||end<=begin)throw new Error('device identity heartbeat source missing');
  const factory=vm.runInNewContext('(deps)=>{'
    +'const {stabilizeIdentity,document,setTimeout,clearTimeout,console}=deps;'
    +device.slice(begin,end)
    +';return {heartbeat,heartbeatSafely,scheduleHeartbeat,state:()=>({pending:!!heartbeatPending,timer:heartbeatTimer})}}');
  let runs=0,finish=null;
  const timers=new Map();let seq=0;
  const dom={visibilityState:'visible'};
  const work=factory({
    stabilizeIdentity:()=>{runs++;return new Promise(resolve=>{finish=resolve})},
    document:dom,
    setTimeout:fn=>{const id=++seq;timers.set(id,fn);return id},
    clearTimeout:id=>timers.delete(id),
    console:{warn(){}}
  });
  const p1=work.heartbeat(),p2=work.heartbeat();
  if(p1!==p2||runs!==1)throw new Error('simultaneous identity checks were not deduplicated');
  finish({id:'device'});
  await Promise.all([p1,p2]);
  await Promise.resolve();
  const p3=work.heartbeat();
  if(runs!==2)throw new Error('identity check lock did not release after success');
  finish({id:'device'});await p3;
  work.scheduleHeartbeat();
  if(timers.size!==1)throw new Error('visible heartbeat did not set exactly one timer');
  const [id,fire]=[...timers][0];timers.delete(id);fire();
  if(timers.size!==1)throw new Error('heartbeat cycle created zero/multiple recurring timers');
  dom.visibilityState='hidden';
  work.scheduleHeartbeat();
  if(timers.size)throw new Error('identity heartbeat kept running in background');
  dom.visibilityState='visible';
  work.scheduleHeartbeat();
  if(timers.size!==1)throw new Error('identity heartbeat did not resume');
  const failed=factory({
    stabilizeIdentity:()=>{runs++;return Promise.reject(new Error('SECURESTORE_UNAVAILABLE'))},
    document:dom,setTimeout:()=>1,clearTimeout:()=>{},console:{warn(){}}
  });
  let rejected=false;
  try{await failed.heartbeat()}catch(error){rejected=error.message==='SECURESTORE_UNAVAILABLE'}
  await Promise.resolve();
  if(!rejected||failed.state().pending)throw new Error('failed device heartbeat remained stuck');
}

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
// An old renderer can emit webBootReady after its WebView was remounted.
// Only callbacks associated with the active generation may reveal the UI.
function testWebViewGenerationRecovery(){
  const match=native.match(/const isCurrentWebViewGeneration = ([^\n]+);/);
  if(!match)throw new Error('renderer generation helper missing');
  const isCurrent=vm.runInNewContext('('+match[1]+')');
  const ref={current:0};
  if(!isCurrent(0,ref)||isCurrent(1,ref))
    throw new Error('first renderer generation invalid');
  ref.current=1;
  if(isCurrent(0,ref)||!isCurrent(1,ref))
    throw new Error('old webBootReady could activate a remounted WebView');
  ref.current=2;
  if(isCurrent(1,ref)||!isCurrent(2,ref))
    throw new Error('prior renderer crash callback could restart the new WebView');
  for(const marker of [
    'webViewGenerationRef.current += 1;',
    'setWebViewKey(webViewGenerationRef.current);',
    'onMessage={(event) => { if (isCurrentWebViewGeneration(webViewKey, webViewGenerationRef)) void onWebMessage(event); }}',
    'if (!isCurrentWebViewGeneration(webViewKey, webViewGenerationRef)) return;',
    'if (isCurrentWebViewGeneration(webViewKey, webViewGenerationRef)) reportBootFailure(',
    'if (!webReady) return true;'
  ])need(native,marker,'renderer recovery and back press isolation');
}

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

async function testNativeOutputFailures(){
  if(!bridgeMatch)throw new Error('native output bridge missing');
  const raw=bridgeMatch[1];
  const first=raw.indexOf('window.__ABU_APP_META__ = ');
  const last=raw.indexOf(';\n  function send',first);
  if(first<0||last<first)throw new Error('bridge metadata delimiter missing');
  const code=raw.slice(0,first)+'window.__ABU_APP_META__ = {}'+raw.slice(last);
  function makeBridge(postMessage){
    const timers=new Map();let sequence=0;
    const window={};
    if(postMessage)window.ReactNativeWebView={postMessage};
    const context=vm.createContext({window,
      setTimeout:fn=>{const id=++sequence;timers.set(id,fn);return id},
      clearTimeout:id=>timers.delete(id)
    });
    vm.runInContext(code,context);
    return {window,context,timers};
  }
  for(const bridge of [null,()=>{throw new Error('BRIDGE_DESTROYED')}]){
    const test=makeBridge(bridge);let rejected=false;
    try{await test.window.Android.requestOutput('printHtml',{html:'test'})}
    catch(e){rejected=e.message==='ANDROID_BRIDGE_UNAVAILABLE'}
    if(!rejected||test.timers.size)throw new Error('failed native output send left an active request');
  }
  const sent=[],good=makeBridge(raw=>sent.push(JSON.parse(raw)));
  const save=good.window.Android.requestOutput('savePdfHtml',{name:'a.pdf'});
  const print=good.window.Android.requestOutput('printHtml',{html:'page'});
  if(sent.length!==2||sent[0].requestId===sent[1].requestId||good.timers.size!==2)
    throw new Error('native requests were not registered independently');
  const callback=good.window.AbuBassamNativeOutputResult;
  vm.runInContext(code,good.context);
  if(callback!==good.window.AbuBassamNativeOutputResult)
    throw new Error('bridge reinjection lost pending callbacks');
  callback({requestId:sent[1].requestId,ok:true,value:'printed'});
  callback({requestId:sent[0].requestId,ok:true,value:'saved'});
  if((await print)!=='printed'||(await save)!=='saved'||good.timers.size)
    throw new Error('native output responses failed when delivered out of order');
  const hang=good.window.Android.requestOutput('printHtml',{html:'stuck'});
  const timer=[...good.timers.entries()][0];
  if(!timer)throw new Error('no fallback output deadline');
  good.timers.delete(timer[0]);timer[1]();
  let expired=false;
  try{await hang}catch(e){expired=e.message==='OUTPUT_TIMEOUT'}
  if(!expired||good.timers.size)throw new Error('native output deadline did not reject');
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
for(const marker of ['function setSecondaryOwnerOnly','abuSecurityOwnerGuard',"const denied=(window.AbuBassamSecurity?.role?.()||currentDevice?.role)!=='owner'"])need(security,marker,'reversible owner-only security controls');
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
// A missing optional dialog must not leave the full-screen backdrop active.
function testMissingSheetCannotBlockTouch(){
  const html=read('index.html');
  const start=html.indexOf('function openSheet(id){');
  const end=html.indexOf('function openOptions()',start);
  if(start<0||end<=start)throw new Error('base sheet implementation not found');
  const source=html.slice(start,end);
  const list=(...names)=>({
    set:new Set(names),
    add(name){this.set.add(name)},remove(name){this.set.delete(name)},
    contains(name){return this.set.has(name)}
  });
  const backdrop={classList:list('sheet-backdrop')};
  const valid={classList:list('sheet')};
  const wrong={classList:list('other')};
  const items={sheetBackdrop:backdrop,valid,wrong};
  const document={
    getElementById:id=>items[id]||null,
    querySelectorAll:()=>[valid]
  };
  const factory=vm.runInNewContext(`(document,console)=>{
    const $=id=>document.getElementById(id);
    ${source}
    return {openSheet,closeSheets}
  }`);
  const api=factory(document,{warn(){}});
  if(api.openSheet('missing')!==false||backdrop.classList.contains('show'))throw new Error('missing sheet blocked all touches');
  if(api.openSheet('wrong')!==false||backdrop.classList.contains('show'))throw new Error('non-dialog element opened backdrop');
  if(api.openSheet('valid')!==true||!backdrop.classList.contains('show')||!valid.classList.contains('show'))
    throw new Error('valid sheet no longer opens');
  api.closeSheets();
  if(backdrop.classList.contains('show')||valid.classList.contains('show'))throw new Error('sheet close did not release touch backdrop')
}
// Hardware back must recover even if a lazy-loaded dialog close handler has
// vanished or throws. Clearing only an orphan backdrop consumes that back
// press, rather than accidentally switching tabs or exiting the app.
function testBackLayerFallback(){
  const security=read('app-security-runtime.js');
  const start=security.indexOf('function clearOrphanInteractionLayers(){');
  const end=security.indexOf('function home(){',start);
  if(start<0||end<=start)throw new Error('native back-layer handler missing');
  const src=security.slice(start,end);
  const create=vm.runInNewContext('(document,window,closeDevices,console)=>{const $=id=>document.getElementById(id);'
    +src+';return {closeTopLayer,clearOrphanInteractionLayers}}');
  function layer(...states){
    const values=new Set(states);
    return {id:'',classList:{
      contains:value=>values.has(value),
      add:value=>values.add(value),
      remove:value=>values.delete(value)
    }};
  }
  const back=layer('show'),items={sheetBackdrop:back},active={};
  const document={
    getElementById:id=>items[id]||null,
    querySelector:selector=>{
      if(selector==='.sheet.show')return active['.sheet.show']||null;
      return active[selector]||null
    }
  };
  let warnings=0;
  const window={},api=create(document,window,()=>{}, {warn:()=>{warnings++}});
  if(api.closeTopLayer()!==true||back.classList.contains('show'))
    throw new Error('orphan backdrop did not consume back or unblock touch');
  if(api.closeTopLayer()!==false)throw new Error('back was consumed without any open layer');
  const missing=layer('show');missing.id='abuA4EditorV2';
  active['#abuA4EditorV2.show']=missing;
  if(!api.closeTopLayer()||missing.classList.contains('show'))
    throw new Error('missing lazy dialog handler left its blocking layer visible');
  delete active['#abuA4EditorV2.show'];
  const alternate=layer('on');alternate.id='abuBackupModal';
  active['#abuBackupModal.on']=alternate;
  if(!api.closeTopLayer()||alternate.classList.contains('on'))
    throw new Error('alternate on-state layer remained visible');
  delete active['#abuBackupModal.on'];
  const preset=layer('abu-open');preset.id='abuPresetModal';
  active['#abuPresetModal.abu-open']=preset;
  if(!api.closeTopLayer()||preset.classList.contains('abu-open'))
    throw new Error('preset dialog alternate class was not dismissed');
  delete active['#abuPresetModal.abu-open'];
  const throwing=layer('show');throwing.id='abuSettingsModal';
  active['#abuSettingsModal.show']=throwing;
  window.AbuBassamSettings={close:()=>{throw new Error('UNAVAILABLE')}};
  if(!api.closeTopLayer()||throwing.classList.contains('show')||warnings!==1)
    throw new Error('throwing settings handler trapped the user behind a modal');
  delete active['#abuSettingsModal.show'];
  const sheet=layer('sheet','show');sheet.id='optionsSheet';
  back.classList.add('show');
  active['.sheet.show']=sheet;
  window.closeSheets=()=>{
    sheet.classList.remove('show');
    back.classList.remove('show')
  };
  if(!api.closeTopLayer()||sheet.classList.contains('show')||back.classList.contains('show'))
    throw new Error('ordinary sheet close failed to release backdrop');
  delete active['.sheet.show'];
}

// Crop guide choice is a non-sensitive print preference: it must survive a
// renderer crash/reload without serializing user photos into localStorage.
function testGuidePreferenceSurvivesWebViewReload(){
  const html=read('index.html');
  const saveStart=html.indexOf('function saveAppSettings(){');
  const loadStart=html.indexOf('function loadAppSettings(){',saveStart);
  const photoStart=html.indexOf('function onImageSelect(',loadStart);
  const toggleStart=html.indexOf('function toggleGuides(fromCrop=false){');
  const toggleEnd=html.indexOf('\n</script>',toggleStart);
  if([saveStart,loadStart,photoStart,toggleStart,toggleEnd].some(x=>x<0))
    throw new Error('print settings and guide lifecycle source missing');
  const source=html.slice(saveStart,photoStart)+'\n'+html.slice(toggleStart,toggleEnd);
  const factory=vm.runInNewContext('(storage)=>{'
    +'let guideEnabled=true;'
    +'const keys=["paperSize","photoSize","paperCustomW","paperCustomH","customW","customH",'
    +'"mediaType","dpiInput","photoCount","borderMode","gapInput","marginInput","aiBgMode"];'
    +'const nodes=Object.fromEntries(keys.map(key=>[key,{tagName:"INPUT",value:"1"}]));'
    +'const $=id=>nodes[id]||null;'
    +'const localStorage={setItem:(key,val)=>storage.set(key,val),getItem:key=>storage.get(key)||null};'
    +'const drawCrop=()=>{},alert=()=>{};'
    +source
    +';return {toggle:toggleGuides,restore:loadAppSettings,guide:()=>guideEnabled,'
    +'reset:()=>{guideEnabled=true}}}');
  const storage=new Map(),session=factory(storage);
  session.toggle(true);
  const saved=JSON.parse(storage.get('abuBassamPrintSettingsV1')||'{}');
  if(saved.guideEnabled!==false||'uploadedImages' in saved)
    throw new Error('guide choice was not saved as a safe print preference');
  session.reset();
  session.restore();
  if(session.guide()!==false)throw new Error('guide visibility did not survive WebView reload');
  session.toggle(true);
  session.reset();
  session.restore();
  if(session.guide()!==true)throw new Error('guide visibility was not restored after re-enabling');
}

// File-reader failures must not strand a batch. Clearing images must
// invalidate callbacks from previous file selections, even after load.
function testImageImportLifecycle(){
  const html=read('index.html');
  const start=html.indexOf('function onImageSelect(ev){'),end=html.indexOf('function refreshPeople()',start);
  const removeStart=html.indexOf('function removePerson(i){'),clearEnd=html.indexOf('function makePhotoCanvas(',removeStart);
  if([start,end,removeStart,clearEnd].some(x=>x<0))throw new Error('image import/clear source missing');
  const source=html.slice(start,end)+'\n'+html.slice(removeStart,clearEnd);
  const factory=vm.runInNewContext(`(FileReader,Image,stats)=>{
    let uploadedImages=[],selectedIndex=-1,pageCanvases=[],imageImportEpoch=0;
    const $=()=>({style:{},classList:{remove(){}},textContent:''});
    function refreshPeople(){stats.updated++}
    function renderPaper(){stats.rendered++}
    function updatePageNav(){}
    ${source}
    return {onImageSelect,clearImages,removePerson,images:()=>uploadedImages}
  }`);
  const readers=[];
  class Reader{constructor(){readers.push(this)}readAsDataURL(){}}
  class Image{set src(value){if(value.includes('broken'))this.onerror?.();else this.onload?.()}}
  const stats={updated:0,rendered:0},app=factory(Reader,Image,stats);
  app.onImageSelect({target:{files:[{n:1},{n:2},{n:3}],value:'selected'}});
  readers[2].onload({target:{result:'data:image/png;base64,third'}});
  readers[1].onerror();
  readers[0].onload({target:{result:'data:image/png;base64,first'}});
  if(stats.rendered!==1||stats.updated!==1)throw new Error('failed file prevented the batch from completing');
  if(app.images().map(x=>x.src).join('|')!=='data:image/png;base64,first|data:image/png;base64,third')
    throw new Error('images were reordered by async FileReader completion');
  app.onImageSelect({target:{files:[{n:4}],value:'selected'}});
  app.clearImages();
  readers[3].onload({target:{result:'data:image/png;base64,stale'}});
  if(app.images().length!==0)throw new Error('cleared images were reimported by a stale FileReader');
  // A generic MIME from an Android document picker can still decode as an
  // image; do not reject it by MIME prefix alone.
  app.onImageSelect({target:{files:[{n:5}],value:'selected'}});
  readers[4].onload({target:{result:'data:application/octet-stream;base64,generic-picture'}});
  if(app.images()[0]?.src!=='data:application/octet-stream;base64,generic-picture')
    throw new Error('generic Android MIME prevented an otherwise decodable image');
  // A newer photo-picker selection must supersede old callbacks, otherwise
  // a delayed old batch can change the selected photo during editing.
  app.onImageSelect({target:{files:[{n:6}],value:'first'}});
  app.onImageSelect({target:{files:[{n:7}],value:'second'}});
  readers[6].onload({target:{result:'data:image/png;base64,new-selection'}});
  readers[5].onload({target:{result:'data:image/png;base64,obsolete-selection'}});
  if(app.images().some(x=>x.src.includes('obsolete-selection'))||
     !app.images().some(x=>x.src.includes('new-selection')))
    throw new Error('stale first photo selection was accepted');
  // A removal during image decode should invalidate the outstanding import;
  // removed photos cannot reappear later because of an Android callback.
  app.onImageSelect({target:{files:[{n:8}],value:'pending'}});
  app.removePerson(1);
  readers[7].onload({target:{result:'data:image/png;base64,after-removal'}});
  if(app.images().some(x=>x.src.includes('after-removal'))||
     app.images().length!==1)
    throw new Error('photo removal did not cancel an unfinished picker read');
}
async function testCardPhotoAndBrandLogoRace(){
  const source=read('cards-studio-runtime.js');
  const photoStart=source.indexOf('async function loadPhoto(file,expectedEpoch=null){');
  const photoEnd=source.indexOf('function requestNative(mode){',photoStart);
  const nativeStart=source.indexOf('function onPhoto(dataUrl){');
  const nativeEnd=source.indexOf('const previousNativeResult=',nativeStart);
  const removeStart=source.indexOf('function removePhoto(){');
  const removeEnd=source.indexOf('function resetPhoto(){',removeStart);
  const logoStart=source.indexOf('async function loadDefaultLogo(){');
  const logoEnd=source.indexOf('async function resizeImage(',logoStart);
  if([photoStart,photoEnd,nativeStart,nativeEnd,removeStart,removeEnd,logoStart,logoEnd].some(n=>n<0))
    throw Error('card photo loader and logo race guards missing');
  function defer(){let resolve=null;const promise=new Promise(r=>resolve=r);return{promise,complete:v=>resolve(v)}}
  const photoReads=[],logoReads=[],nativeReads=[];
  let reader=null,draws=0,formDraws=0;
  const state={brand:{logo:'abu_bassam_icon.webp'},photo:'',
    photoTransform:{zoom:1,x:0,y:0,rotate:0,flipX:false,flipY:false}};
  const make=vm.runInNewContext('(deps)=>{'
    +'let photoLoadEpoch=0,brandLogoEpoch=0;'
    +'const {state,requireCard,canCard,resizeImage,renderForm,renderPreview,alert,$,'
    +'fetch,FileReader,File,savePhotoWorkingDraft}=deps;'
    +source.slice(photoStart,photoEnd)
    +source.slice(nativeStart,nativeEnd)
    +source.slice(removeStart,removeEnd)
    +source.slice(logoStart,logoEnd)
    +';return {loadPhoto,loadBrandLogo,onPhoto,removePhoto,loadDefaultLogo,'
    +'getEpochs:()=>({photoLoadEpoch,brandLogoEpoch})}}');
  const page=make({state,requireCard:()=>true,canCard:()=>true,
    resizeImage:()=>{const d=defer();photoReads.push(d);return d.promise},
    renderForm:()=>{formDraws++},renderPreview:()=>{draws++},
    alert:()=>{},$:()=>({value:'',src:''}),
    fetch:async value=>{
      if(value==='abu_bassam_icon.webp')return{ok:true,blob:async()=>({})};
      const d=defer();nativeReads.push(d);return d.promise
    },
    savePhotoWorkingDraft:()=>{},
    FileReader:class{readAsDataURL(){reader=this}},
    File:class{constructor(parts){this.parts=parts}}});
  const first=page.loadPhoto({id:'first'});
  const second=page.loadPhoto({id:'second'});
  photoReads[1].complete('data:image/png;base64,second');
  await second;
  photoReads[0].complete('data:image/png;base64,first');
  await first;
  if(!state.photo.includes('second')||draws!==1)
    throw Error('older photo decoder overwrote the newer card photo');
  const third=page.loadPhoto({id:'third'});
  page.removePhoto();
  photoReads[2].complete('data:image/png;base64,third');
  await third;
  if(state.photo!==''||draws!==2)
    throw Error('late photo decode recreated an explicitly deleted image');
  const native=page.onPhoto('data:image/png;base64,native');
  for(let i=0;i<8&&!nativeReads.length;i++)await Promise.resolve();
  if(!nativeReads.length)throw Error('native image fetch did not start');
  page.removePhoto();
  nativeReads[0].complete({blob:async()=>({})});
  await native;
  if(state.photo!==''||photoReads.length!==3)
    throw Error('stale native camera callback reimported a deleted photo');
  const oldLogo=page.loadBrandLogo({id:'old'});
  const newLogo=page.loadBrandLogo({id:'new'});
  photoReads[4].complete('data:image/png;base64,new-logo');
  await newLogo;
  photoReads[3].complete('data:image/png;base64,old-logo');
  await oldLogo;
  if(state.brand.logo!=='data:image/png;base64,new-logo')
    throw Error('older brand logo decoder overwrote the newer file');
  // Verify that a default logo request cannot replace a newer custom logo.
  state.brand.logo='abu_bassam_icon.webp';
  const loadDefault=page.loadDefaultLogo();
  for(let i=0;i<8&&!reader;i++)await Promise.resolve();
  if(!reader)throw Error('default logo file decoding did not start');
  state.brand.logo='data:image/png;base64,custom';
  reader.onload?.();
  await loadDefault;
  if(state.brand.logo!=='data:image/png;base64,custom')
    throw Error('delayed default logo overwrote the custom logo');
}

async function testCardPrintPreviewIdentity(){
  const src=read('cards-studio-runtime.js');
  const begin=src.indexOf('function previewPrint(){');
  const end=src.indexOf('async function exportPng(){',begin);
  if(begin<0||end<=begin)throw Error('card print/preview source missing');
  const factory=vm.runInNewContext('()=>{'
    +'let currentHtml="<html>CR80-ORIGINAL</html>";'
    +'const nativeCalls=[],sheetCalls=[],history=[];'
    +'const state={output:"cr80",activePrintHtml:"",activePrintOutput:""};'
    +'const modal={classList:{shown:false,contains:x=>x==="show"&&modal.classList.shown}};'
    +'const frame={srcdoc:""},$=id=>id==="csPrintModal"?modal:frame;'
    +'const requireCard=()=>true,requireCards=()=>true,requireOutputPermission=()=>true,'
    +'printDocument=()=>currentHtml,expandedJobs=()=>[{},{},{}],'
    +'recordHistory=x=>history.push(x),logOperation=()=>{},'
    +'openModal=()=>{modal.classList.shown=true},alert=()=>{},setTimeout=fn=>fn();'
    +'const window={Android:{requestOutput:async(name,payload)=>{nativeCalls.push({name,payload});return true}},'
    +'AbuA4CardSheetEditorV2:{'
    +'openPrint:(html,commit)=>{sheetCalls.push({type:"print",html});commit();return true},'
    +'openPdf:(name,html,commit)=>{sheetCalls.push({type:"pdf",html});commit();return true}}};'
    +'const Android=window.Android;'
    +src.slice(begin,end)
    +';return{previewPrint,printNow,savePdf,state,modal,frame,nativeCalls,sheetCalls,history,'
    +'setHtml:value=>{currentHtml=value}}}');
  const page=factory();
  page.previewPrint();
  page.setHtml('<html>NEWER</html>');
  page.state.output='a4-pairs';
  await page.printNow();
  await page.savePdf();
  if(page.frame.srcdoc!=='<html>CR80-ORIGINAL</html>'||
    page.nativeCalls.length!==2||
    !page.nativeCalls.every(entry=>entry.payload.html==='<html>CR80-ORIGINAL</html>')||
    page.sheetCalls.length)
    throw Error('visible CR80 preview and PDF/print output diverged');
  page.modal.classList.shown=false;
  await page.printNow();
  await page.savePdf();
  if(page.sheetCalls.length!==2||
    !page.sheetCalls.every(entry=>entry.html==='<html>NEWER</html>'))
    throw Error('closed preview did not follow latest A4 editor output');
}
async function testCardBackupRestorationCancelsPhotos(){
  const src=read('cards-studio-runtime.js');
  const begin=src.indexOf('async function loadPhoto(file,expectedEpoch=null){');
  const end=src.indexOf('async function loadBrandLogo(file){',begin);
  const restore=src.indexOf('function applyBackupSnapshot(data){');
  const restoreEnd=src.indexOf('function exportBackup(snapshot){',restore);
  const importStart=src.indexOf('async function importBackupFile(file){');
  const importEnd=src.indexOf('function restoreResetBackup(){',importStart);
  if([begin,end,restore,restoreEnd,importStart,importEnd].some(n=>n<0))
    throw Error('card backup/photo source missing');
  let finish=null;
  const factory=vm.runInNewContext('(deps)=>{'
    +'let photoLoadEpoch=0,brandLogoEpoch=0;'
    +'const state={brand:{logo:"old"},forms:{},photo:"",queue:[],textStyles:{},history:[]};'
    +'let restoreCount=0;const savePhotoWorkingDraft=()=>{};'
    +'const requireCard=()=>deps.allowed(),canCard=()=>deps.allowed(),'
    +'resizeImage=()=>new Promise(resolve=>deps.prepare(resolve)),$=()=>({value:""}),'
    +'renderForm=()=>{},renderPreview=()=>{},alert=()=>{},clone=v=>JSON.parse(JSON.stringify(v)),'
    +'DEFAULT_BRAND={logo:"default"},'
    +'DEFAULT_FORMS={personal:{name:""},login:{password:""},wifi:{password:""}},'
    +'TYPE_LABELS={personal:"person"},MAX_CARDS=25,'
    +'cap=(x,a,b)=>Math.max(a,Math.min(b,Number(x)||0)),'
    +'scrubModels=x=>Array.isArray(x)?x:[],window={AbuBassamTypography:null},'
    +'STORAGE_KEY="forms",BRAND_KEY="brand",CARD_STYLE_KEY="style",HISTORY_KEY="history",'
    +'localStorage={getItem:()=>null,setItem(){},removeItem(){}},renderAll=()=>{},confirm=()=>true;'
    +src.slice(begin,end)
    +src.slice(restore,restoreEnd).replace('function applyBackupSnapshot(data){',
      'function applyBackupSnapshot(data){restoreCount++;')
    +src.slice(importStart,importEnd)
    +';return{state,loadPhoto,applyBackupSnapshot,importBackupFile,'
    +'restores:()=>restoreCount,epochs:()=>[photoLoadEpoch,brandLogoEpoch]}}');
  let allowed=true,resolveImage=null;
  const app=factory({allowed:()=>allowed,prepare:done=>{resolveImage=done}});
  const photoJob=app.loadPhoto({name:'before-backup'});
  app.applyBackupSnapshot({brand:{logo:'restored'},forms:{personal:{name:'restored'}},
    workspace:{photo:'data:image/png;base64,restored'}});
  resolveImage('data:image/png;base64,older');
  await photoJob;
  if(app.state.photo!=='data:image/png;base64,restored'||
    app.state.brand.logo!=='restored'||app.epochs()[1]<1)
    throw Error('outstanding image decoder overwrote restored backup');
  let finishFile=null;
  const data={brand:{logo:'changed'},forms:{personal:{name:'changed'}},
    workspace:{photo:''}};
  const oldCount=app.restores();
  const file={size:100,text:()=>new Promise(resolve=>{finishFile=resolve})};
  const restoreJob=app.importBackupFile(file);
  for(let i=0;i<8&&!finishFile;i++)await Promise.resolve();
  if(!finishFile)throw Error('backup file read did not start');
  allowed=false;
  finishFile(JSON.stringify(data));
  await restoreJob;
  if(app.restores()!==oldCount||app.state.brand.logo!=='restored')
    throw Error('revoked restore permission accepted delayed backup file');
}

function testCardBackupQuotaRollback(){
  const source=read('cards-studio-runtime.js');
  const a=source.indexOf('function applyBackupSnapshot(data){');
  const b=source.indexOf('function exportBackup(snapshot){',a);
  if(a<0||b<=a)throw Error('backup restoration implementation missing');
  const factory=vm.runInNewContext('(fail)=>{'
    +'let photoLoadEpoch=0,brandLogoEpoch=0,renders=0;const savePhotoWorkingDraft=()=>{};'
    +'const state={brand:{logo:"orig"},forms:{personal:{name:"unchanged"}},'
    +'photo:"data:image/png;base64,original",photoTransform:{zoom:1},history:[],'
    +'textStyles:{},queue:[],type:"personal",width:85.6,output:"cr80"};'
    +'const STORAGE_KEY="forms",BRAND_KEY="brand",CARD_STYLE_KEY="styles",HISTORY_KEY="history";'
    +'const map=new Map([["forms","oldForms"],["brand","oldBrand"],'
    +'["styles","oldStyles"],["history","oldHistory"]]);'
    +'let once=true;'
    +'const localStorage={getItem:key=>map.has(key)?map.get(key):null,'
    +'setItem:(key,value)=>{if(fail&&key==="styles"&&once){once=false;throw Error("QUOTA_EXCEEDED")}'
    +'map.set(key,value)},removeItem:key=>map.delete(key)};'
    +'const clone=value=>JSON.parse(JSON.stringify(value)),DEFAULT_BRAND={logo:"default"},'
    +'DEFAULT_FORMS={personal:{name:""},login:{password:""},wifi:{password:""}},'
    +'TYPE_LABELS={personal:"personal"},MAX_CARDS=25,'
    +'cap=(x,a,b)=>Math.max(a,Math.min(b,Number(x)||0)),'
    +'scrubModels=x=>Array.isArray(x)?x:[],window={},renderAll=()=>{renders++};'
    +source.slice(a,b)
    +';return{restore:applyBackupSnapshot,state,saved:()=>[...map]}}');
  const backup={forms:{personal:{name:'restored'}},brand:{logo:'restored-logo'},
    workspace:{photo:'data:image/png;base64,restored'}};
  const broken=factory(true);
  let rejected=false;
  try{broken.restore(backup)}catch(e){rejected=e.message==='QUOTA_EXCEEDED'}
  if(!rejected||broken.state.photo!=='data:image/png;base64,original'||
    broken.state.forms.personal.name!=='unchanged'||broken.state.brand.logo!=='orig')
    throw Error('failed restore lost the original card workspace');
  const old=[['forms','oldForms'],['brand','oldBrand'],
    ['styles','oldStyles'],['history','oldHistory']];
  if(JSON.stringify(broken.saved())!==JSON.stringify(old))
    throw Error('partial backup wrote over surviving localStorage records');
  const good=factory(false);
  good.restore(backup);
  if(good.state.photo!=='data:image/png;base64,restored'||
    good.state.forms.personal.name!=='restored')
    throw Error('valid backup failed after transactional rollback guard');
}

async function testEncryptedCardPhotoDraft(){
  const source=read('cards-studio-runtime.js');
  const start=source.indexOf('const PHOTO_DRAFT_DB=');
  const end=source.indexOf('function referenceCardCss(',start);
  if(start<0||end<=start)throw Error('encrypted photo draft implementation missing');
  const rows=new Map();
  const db={objectStoreNames:{contains:()=>true},close(){},
    transaction(){
      const tx={};
      tx.objectStore=()=>({
        get:id=>{
          const r={};Promise.resolve().then(()=>{
            r.result=rows.get(id);r.onsuccess?.()
          });return r
        },
        put:row=>{rows.set(row.scope,row);Promise.resolve().then(()=>tx.oncomplete?.())},
        delete:id=>{rows.delete(id);Promise.resolve().then(()=>tx.oncomplete?.())}
      });
      return tx
    }
  };
  const indexedDB={open:()=>{
    const r={};Promise.resolve().then(()=>{r.result=db;r.onsuccess?.()});
    return r
  }};
  const Encoder=class{encode(s){return Uint8Array.from(
    [...String(s)].map(c=>c.charCodeAt(0)))}};
  const Decoder=class{decode(b){return [...new Uint8Array(b)]
    .map(n=>String.fromCharCode(n)).join('')}};
  // Crypto mock exercises the encrypted storage boundary and ownership;
  // actual encryption in Android is supplied by WebCrypto AES-GCM.
  const crypto={getRandomValues:x=>{x.fill(7);return x},subtle:{
    digest:async(_,x)=>Uint8Array.from(new Uint8Array(x).map(v=>v^21)).buffer,
    importKey:async(_,x)=>new Uint8Array(x),
    encrypt:async(_,key,x)=>Uint8Array.from(new Uint8Array(x)
      .map(v=>v^key[0]^7)).buffer,
    decrypt:async(_,key,x)=>Uint8Array.from(new Uint8Array(x)
      .map(v=>v^key[0]^7)).buffer
  }};
  const make=(options={})=>{
    let user=options.user||'owner1';
    const state={photo:'',photoTransform:{zoom:1,x:0,y:0,rotate:0,flipX:false,flipY:false}};
    const device={device_id:'phone-1',userId:options.untrustedOffline?'':user};
    const window={
      AbuBassamSecurity:{device:()=>device,role:()=> 'owner',
        isOfflineSession:()=>!!options.offline},
      AbuBassamCloud:{session:()=>({user:{id:user}})},
      AbuBassamNativeSecurity:{available:()=>options.native!==false,
        request:async()=> 'secure-device-key'},indexedDB
    };
    const factory=vm.runInNewContext('(deps)=>{'
      +'let photoLoadEpoch=0;'
      +'const {state,window,indexedDB,crypto,TextEncoder,TextDecoder,'
      +'canCard,renderForm,renderPreview,alert,console,clone,cap,$,setTimeout,clearTimeout}=deps;'
      +source.slice(start,end)
      +';return{photoDraftScope,refreshPhotoDraftSession,savePhotoWorkingDraft,'
      +'state,drain:()=>photoDraftTail}}');
    const app=factory({state,window,indexedDB,crypto,
      TextEncoder:Encoder,TextDecoder:Decoder,canCard:()=>true,
      renderForm(){},renderPreview(){},alert(){},console:{warn(){}},
      clone:v=>JSON.parse(JSON.stringify(v)),
      cap:(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0)),
      $:()=>true,setTimeout:cb=>{Promise.resolve().then(cb);return 1},
      clearTimeout(){}});
    return{app,state,setUser:id=>{user=id;device.userId=id}}
  };
  const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve()};
  const writer=make();
  writer.app.refreshPhotoDraftSession();
  await flush();
  writer.state.photo='data:image/png;base64,QUJD';
  writer.state.photoTransform.zoom=2;
  writer.app.savePhotoWorkingDraft();
  await flush();await writer.app.drain();
  const saved=rows.get(writer.app.photoDraftScope());
  if(!saved?.payload||JSON.stringify(saved).includes('QUJD'))
    throw Error('photo draft was absent or saved in plaintext');
  const restart=make();
  restart.app.refreshPhotoDraftSession();await flush();
  if(restart.state.photo!=='data:image/png;base64,QUJD'||
     restart.state.photoTransform.zoom!==2)
    throw Error('encrypted photo crop failed recovery after restart');
  restart.setUser('different-user');
  restart.app.refreshPhotoDraftSession();await flush();
  if(restart.state.photo)
    throw Error('previous account photo leaked across identity switch');
  const offline=make({offline:true});
  offline.app.refreshPhotoDraftSession();await flush();
  if(offline.state.photo!=='data:image/png;base64,QUJD')
    throw Error('signed offline identity could not restore its photo');
  const untrusted=make({offline:true,untrustedOffline:true});
  untrusted.app.refreshPhotoDraftSession();await flush();
  if(untrusted.state.photo)
    throw Error('unsigned offline session displayed photo');
  offline.state.photo='';
  offline.app.savePhotoWorkingDraft();await flush();await offline.app.drain();
  if(rows.has(writer.app.photoDraftScope()))
    throw Error('photo deletion did not erase encrypted record');
  const after=make();after.app.refreshPhotoDraftSession();await flush();
  if(after.state.photo)throw Error('deleted photo restored after restart');
}

function testCardDuplexPagePairing(){
  const src=read('cards-studio-runtime.js');
  const start=src.indexOf('function printDocument(){');
  const end=src.indexOf('function historyQueueSnapshot(){',start);
  if(start<0||end<=start)throw Error('card duplex print renderer missing');
  const renderer=vm.runInNewContext('(settings)=>{'
    +'const state={output:settings.output,sides:settings.sides,flip:settings.flip||"horizontal",'
    +'width:85.6,height:53.98,gap:2,marginX:7,marginY:5,bleed:1};'
    +'const fullPrintCss=()=>"",freeLayoutCss=()=>"",'
    +'expandedJobs=()=>settings.ids.map(id=>({id})),'
    +'cardHtml=(item,side)=>"<article data-id=\\""+item.id+"\\" data-side=\\""+side+"\\"></article>",'
    +'cap=(value,min,max)=>Math.max(min,Math.min(max,value));'
    +src.slice(start,end)
    +';return printDocument}');
  const ids=['A','B','C'];
  for(const output of ['cr80','a4-pairs','a4-duplex']){
    for(const sides of ['both','front','back']){
      const html=renderer({output,sides,ids});
      const front=(html.match(/data-side="front"/g)||[]).length;
      const back=(html.match(/data-side="back"/g)||[]).length;
      if(front!==(sides==='back'?0:3)||back!==(sides==='front'?0:3))
        throw Error(output+' did not preserve the requested card faces');
    }
  }
  for(const flip of ['horizontal','vertical']){
    const html=renderer({output:'a4-duplex',sides:'both',ids,flip});
    const pages=html.split(/<section class="duplex-page"[^>]*>/).slice(1)
      .map(part=>part.split('</section>')[0]);
    if(pages.length!==2||!pages[0].includes('data-side="front"')||
      !pages[1].includes('data-side="back"'))
      throw Error('duplex PDF did not produce separate front/back sheets');
    const backs=[...pages[1].matchAll(/data-id="([^"]+)"/g)].map(row=>row[1]);
    const expected=flip==='horizontal'?['B','A','C']:['C','A','B'];
    if(JSON.stringify(backs)!==JSON.stringify(expected))
      throw Error('duplex '+flip+' back-side mirroring drifted');
    if((pages[1].match(/duplex-empty/g)||[]).length!==7)
      throw Error('duplex alignment dropped empty slots');
  }
  const eleven=renderer({output:'a4-duplex',sides:'both',
    ids:'ABCDEFGHIJK'.split('')});
  if((eleven.match(/<section class="duplex-page"/g)||[]).length!==4)
    throw Error('multi-sheet duplex omitted a front/back page pair');
}

// Barcode native callbacks may arrive several times before React state updates.
// The scanner must synchronously latch the first code and reset only for a new
// explicit camera session.
function testBarcodeScanDeduplication(){
  const begin=native.indexOf('  const onBarcodeScanned = useCallback((result) => {');
  const end=native.indexOf('  }, [barcodeLocked, inject]);',begin);
  if(begin<0||end<=begin)throw new Error('native barcode scan handler not found');
  const body=native.slice(begin+'  const onBarcodeScanned = useCallback((result) => {'.length,end);
  const scanRef={current:false},events=[];
  const create=vm.runInNewContext(`(ref,events)=>{
    const barcodeScanHandledRef=ref,barcodeLocked=false,cameraSessionRef={current:0},captureInFlightRef={current:false};
    const setBarcodeLocked=()=>{},setCameraMode=()=>{},setCameraReady=()=>{},
      setCameraBusy=()=>{},setTorch=()=>{},setCameraFacing=()=>{},setCameraFrameKind=()=>{};
    const inject=(name,payload)=>events.push([name,payload]);
    return result=>{${body}}
  }`);
  const scan=create(scanRef,events);
  scan({data:'TEST-123',type:'qr'});
  scan({data:'TEST-123',type:'qr'});
  if(events.length!==1||events[0][1].data!=='TEST-123')throw new Error('duplicate barcode notifications were accepted');
  scanRef.current=false;
  scan({data:'NEW-456',type:'qr'});
  if(events.length!==2||events[1][1].data!=='NEW-456')throw new Error('a new barcode session cannot scan');
  need(native,'barcodeScanHandledRef.current = false;','barcode scanner reset on camera reopen or close');
  forbid(native,'setTimeout(() => setBarcodeLocked(false), 500)','old scanner timer cannot reopen after session change');
}
async function testCameraCaptureCancelledAfterClose(){
  for(const marker of ['const cameraSessionRef = useRef(0)','const cameraOpenPendingRef = useRef(false)',
    'if (session !== cameraSessionRef.current) return;',
    'cameraSessionRef.current += 1;'])
    need(native,marker,'camera session lifecycle');
  const start=native.indexOf('  const captureDocument = useCallback(async () => {');
  const end=native.indexOf('  }, [cameraBusy, cameraError, cameraMode, cameraReady, closeCamera, inject]);',start);
  if(start<0||end<=start)throw new Error('camera capture handler missing');
  const body=native.slice(start+'  const captureDocument = useCallback(async () => {'.length,end);
  const make=vm.runInNewContext('(photo,ref,events,counters)=>{'
    +'const cameraSessionRef=ref,captureInFlightRef={current:false},cameraRef={current:{takePictureAsync:()=>{counters.calls++;return photo}}},'
    +'cameraReady=true,cameraBusy=false,cameraMode="scan";'
    +'const setCameraBusy=()=>{},cameraError=()=>events.push("unexpected error");'
    +'const closeCamera=()=>{cameraSessionRef.current++};'
    +'const inject=(name,payload)=>events.push([name,payload]);'
    +'return {capture:async()=>{'+body+'},close:closeCamera}}');
  const openBegin=native.indexOf("  const openCamera = useCallback(async (mode, frameKind = 'paper') => {");
  const openEnd=native.indexOf('  }, [cameraError, cameraPermission, requestCameraPermission]);',openBegin);
  if(openBegin<0||openEnd<=openBegin)throw new Error('camera permission handler missing');
  const openBody=native.slice(openBegin+"  const openCamera = useCallback(async (mode, frameKind = 'paper') => {".length,openEnd);
  const makeOpen=vm.runInNewContext('(requestPermission,sessionRef,modeEvents,permission)=>{'
    +'const cameraSessionRef=sessionRef,cameraOpenPendingRef={current:false},captureInFlightRef={current:false},'
    +'cameraPermission=permission,requestCameraPermission=requestPermission,barcodeScanHandledRef={current:false};'
    +'const cameraError=()=>modeEvents.push("error");'
    +'const setCameraMode=mode=>modeEvents.push(mode),setCameraReady=()=>{},setBarcodeLocked=()=>{},'
    +'setTorch=()=>{},setCameraFacing=()=>{},setCameraFrameKind=()=>{};'
    +'return {open:async(mode,frameKind="paper")=>{'+openBody+'},pending:cameraOpenPendingRef}}');
  let finishPermission=null,permissionCalls=0;
  const modes=[],sessionRef={current:1};
  const opener=makeOpen(()=>{permissionCalls++;return new Promise(resolve=>{finishPermission=resolve})},
    sessionRef,modes,{granted:false});
  const firstOpen=opener.open('barcode');
  const duplicateOpen=opener.open('scan');
  sessionRef.current++;
  finishPermission({granted:true});
  await Promise.all([firstOpen,duplicateOpen]);
  if(permissionCalls!==1||modes.length||opener.pending.current)
    throw new Error('canceled camera permission reopened an old section or duplicated the system prompt');
  const normalModes=[],normalOpener=makeOpen(async()=>({granted:true}),{current:6},
    normalModes,{granted:true});
  await normalOpener.open('barcode');
  if(normalModes.length!==1||normalModes[0]!=='barcode')
    throw new Error('normal camera permission failed to open scanner');
  let finish;
  const pendingPhoto=new Promise(resolve=>{finish=resolve});
  const oldEvents=[],oldCalls={calls:0},old=make(pendingPhoto,{current:3},oldEvents,oldCalls);
  const request=old.capture(),doubleTap=old.capture();
  old.close();
  finish({base64:'old-picture'});
  await Promise.all([request,doubleTap]);
  if(oldCalls.calls!==1||oldEvents.length)throw new Error('repeated taps or stale photo returned after camera close');
  const newEvents=[],newCalls={calls:0},valid=make(Promise.resolve({base64:'fresh-picture'}),{current:9},newEvents,newCalls);
  await valid.capture();
  if(newCalls.calls!==1||newEvents.length!==1||newEvents[0][0]!=='AbuBassamNativeCameraResult'||
      newEvents[0][1].dataUrl!=='data:image/jpeg;base64,fresh-picture')
    throw new Error('valid camera capture no longer sends image to WebView');
}

function testVaultSyncConflictRules(){
  const source=read('document-vault-runtime.js');
  const begin=source.indexOf('function uploadedSnapshotUnchanged(');
  const end=source.indexOf('async function dbCommitUpload(',begin);
  const remote=source.slice(source.indexOf('function remoteSnapshotStillCurrent('),source.indexOf('async function dbReceiveRemoteIfUnchanged('));
  if(begin<0||end<=begin||!remote.startsWith('function remoteSnapshotStillCurrent('))throw Error('vault conflict guards missing');
  const rules=vm.runInNewContext('(()=>{'+source.slice(begin,end)+remote+'return {mergeUploadReceipt,remoteSnapshotStillCurrent}})()');
  const a={id:'x',name:'old',localEditToken:'one',updatedAt:'time',folder:'',favorite:false,size:10,mime:'image/png',deleted:false,syncState:'pending'};
  const b={...a,name:'new',localEditToken:'two',blob:{data:'new'}};
  const late=rules.mergeUploadReceipt(b,a,'remote-new');
  if(late.name!=='new'||late.blob!==b.blob||late.syncState!=='pending'||late.remoteUpdatedAt!=='remote-new')
    throw Error('late upload overwrote local edit');
  if(rules.mergeUploadReceipt(a,a,'remote-new').syncState!=='synced')throw Error('matching upload not acknowledged');
  if(rules.mergeUploadReceipt(null,a,'remote-new')!==null)throw Error('deleted row resurrected');
  if(rules.remoteSnapshotStillCurrent(b,{...b,syncState:'synced'}))throw Error('late download overwrote pending edit');
  if(!rules.remoteSnapshotStillCurrent({...a,syncState:'synced'}, {...a,syncState:'synced'}))
    throw Error('safe download was rejected');
  if(rules.remoteSnapshotStillCurrent({...b,syncState:'synced'}, {...a,syncState:'synced'}))
    throw Error('outdated download was accepted');
  for(const marker of ['tx=db.transaction(STORE,\'readwrite\')','await dbCommitUpload(item,saved?.updated_at,runScope)',
    'await dbReceiveRemoteIfUnchanged(here,remoteItem(data,blob,remoteVersion),runScope)'])
    need(source,marker,'atomic vault conflict handling');
  for(const marker of [
    "const stillPending=state.items.filter(item=>item.syncState==='pending').length;",
    "if(stillPending){",
    "syncSet(LAST_SYNC_KEY,String(Date.now()));"
  ])need(source,marker,'accurate vault sync completion');

}

async function testVaultConflictCommitIsolation(){
  const source=read('document-vault-runtime.js');
  const a=source.indexOf('function uploadedSnapshotUnchanged(');
  const b=source.indexOf('async function dbCommitUpload(',a);
  const c=source.indexOf('async function dbResolvePendingConflict(');
  const d=source.indexOf('function remoteSnapshotStillCurrent(',c);
  if([a,b,c,d].some(x=>x<0)||b<=a||d<=c)throw Error('vault conflict source missing');
  const tables=new Map();let id=0;
  const database={transaction(){
    const tx={};
    tx.objectStore=()=>({
      get:key=>{const request={};Promise.resolve().then(()=>{
        request.result=tables.get(key);request.onsuccess?.();
        Promise.resolve().then(()=>tx.oncomplete?.())
      });return request},
      put:row=>{tables.set(row.id,{...row});Promise.resolve().then(()=>tx.oncomplete?.())},
      delete:key=>{tables.delete(key);Promise.resolve().then(()=>tx.oncomplete?.())}
    });return tx
  }};
  const app=vm.runInNewContext('(openDb,uuid,STORE)=>{'
    +source.slice(a,b)+source.slice(c,d)
    +';return dbResolvePendingConflict}')(
      async()=>database,()=>String(++id),'items');
  const old={id:'doc',name:'before',updatedAt:'one',syncState:'pending',
    localEditToken:'revision1',size:1,favorite:false,folder:'',mime:'image/png',deleted:false};
  const newest={...old,name:'last-change',localEditToken:'revision2'};
  tables.set(old.id,newest);
  const changed=await app(old,{...old,name:'cloud'});
  if(changed||tables.get('doc').name!=='last-change')
    throw Error('stale remote conflict overwrote a new edit');
  tables.set(old.id,old);
  const backup={...old,id:'backup',name:'saved copy'};
  const applied=await app(old,{...old,name:'cloud'},backup);
  if(!applied||tables.get('doc').name!=='cloud'||tables.get('backup').name!=='saved copy')
    throw Error('atomic remote conflict did not preserve local copy');
  tables.set(old.id,newest);
  const removed=await app(old,null);
  if(removed||!tables.has('doc'))
    throw Error('late remote deletion erased an edited document');
}

async function testBackupRestoreExclusiveLock(){
  const src=read('backup-center-runtime.js');
  const b=src.indexOf("async function backupNow("),d=src.indexOf("async function downloadBytes(",b);
  const r=src.indexOf("async function restoreCloud("),e=src.indexOf("async function deleteCloud(",r);
  if([b,d,r,e].some(x=>x<0))throw Error('restore functions missing');
  const factory=vm.runInNewContext('(deps)=>{let busy=false;'
    +'const {can,status,fingerprint,stateGet,stateSet,stateRemove,packageBytes,digest,CHUNK,api,uploadPart,retention,APP,log,fmt,refreshList,paint,downloadBytes,dev,window,File,alert,confirm}=deps;'
    +'const LASTFP="fp",LAST="last",LASTERR="error",RETRY="retry";'
    +src.slice(b,d)+src.slice(r,e)+';return {backupNow,restoreCloud,busy:()=>busy}}');
  let resume=null,backupCount=0,restoreCount=0;
  const app=factory({
    can:()=>true,status:()=>{},fingerprint:()=>new Promise(resolve=>{resume=resolve}),
    stateGet:()=>null,stateSet:()=>{},stateRemove:()=>{},
    packageBytes:async()=>({bytes:new Uint8Array([1]),count:1}),
    digest:async()=>"a".repeat(64),CHUNK:5242880,
    api:async kind=>kind==='plan'?(backupCount++,{uploads:[],backup_id:'b1'}):{},
    uploadPart:async()=>{},retention:()=>7,APP:'1',log:()=>{},fmt:()=>'',refreshList:async()=>{},paint:()=>{},
    downloadBytes:async()=>({bytes:new Uint8Array([1]),backup:{branch_device_id:'phone'}}),
    dev:()=>({device_id:'phone'}),window:{AbuDocumentVaultHardening:{restore:async()=>{restoreCount++;return true}}},
    File:class{constructor(){}},alert:()=>{},confirm:()=>true
  });
  const active=app.restoreCloud('old');
  for(let i=0;i<8&&!resume;i++)await Promise.resolve();
  if(!resume||!app.busy())throw Error('restore dropped exclusive lock before snapshot');
  let blocked=false;
  try{await app.backupNow('manual')}catch(e){blocked=true}
  if(!blocked||await app.restoreCloud('second')!==false)throw Error('parallel backup/restore accepted');
  resume('verified');
  if(await active!==true||backupCount!==1||restoreCount!==1||app.busy())
    throw Error('restore did not complete or release exclusive lock');
}

async function testVaultDeleteAckPreservesNewEdits(){
  const src=read('document-vault-runtime.js');
  const b=src.indexOf('function uploadedSnapshotUnchanged(');
  const e=src.indexOf('async function dbCommitUpload(',b);
  const rb=src.indexOf('function remoteSnapshotStillCurrent(');
  const re=src.indexOf('async function dbReceiveRemoteIfUnchanged(',rb);
  const db=src.indexOf('async function dbDeleteIfUnchanged('),de=src.indexOf('async function dbDelete(id){',db);
  if([b,e,rb,re,db,de].some(x=>x<0))throw Error('delete acknowledgement guard missing');
  const table=new Map();let changes=0;
  const database={transaction(){const tx={};tx.objectStore=()=>({
    get:id=>{const req={};Promise.resolve().then(()=>{req.result=table.get(id);req.onsuccess?.();Promise.resolve().then(()=>tx.oncomplete?.())});return req},
    delete:id=>{table.delete(id);changes++;Promise.resolve().then(()=>tx.oncomplete?.())}
  });return tx}};
  const call=vm.runInNewContext('(openDb,STORE)=>{'+src.slice(b,e)+src.slice(rb,re)+src.slice(db,de)+';return dbDeleteIfUnchanged}')(
    async()=>database,'items');
  const saved={id:'one',syncState:'pending',localEditToken:'rev1',name:'old',folder:'',favorite:false,size:0,mime:'image/png',updatedAt:'same',deleted:true};
  table.set('one',{...saved,localEditToken:'rev2',name:'edited'});
  if(await call(saved)!==false||changes!==0||!table.has('one'))throw Error('stale tombstone removed new local edit');
  table.set('one',{...saved});
  if(await call(saved)!==true||table.has('one'))throw Error('matching tombstone was not deleted');
  const clean={...saved,syncState:'synced',remoteUpdatedAt:'cloud1'};
  table.set('one',{...clean,remoteUpdatedAt:'cloud2'});
  if(await call(clean)!==false||!table.has('one'))throw Error('remote delete removed newer version');
}

function testVaultPendingSyncSchedule(){
  const source=read('document-vault-runtime.js');
  const b=source.indexOf('function automaticDue(){'),e=source.indexOf('function vaultOwner(){',b);
  if(b<0||e<=b)throw Error('vault sync scheduler missing');
  const make=vm.runInNewContext('(deps)=>{'
    +'const {autoSync,navigator,syncPolicy,wifiVerified,hasPending,syncGet,LAST_SYNC_KEY}=deps;'
    +source.slice(b,e)+';return automaticDue}');
  function due(policy,pending,online=true,wifi=true){
    const fn=make({autoSync:()=>true,navigator:{onLine:online},syncPolicy:()=>policy,
      wifiVerified:()=>wifi,hasPending:()=>pending,syncGet:()=>String(Date.now()-10000),
      LAST_SYNC_KEY:'last'});
    return fn()
  }
  for(const mode of ['daily','weekly'])
    if(!due({mode,wifiOnly:false},true))throw Error('pending vault edits delayed until calendar cadence: '+mode);
  if(due({mode:'manual',wifiOnly:false},true))throw Error('manual-only policy was ignored');
  if(due({mode:'daily',wifiOnly:true},true,true,false))throw Error('Wi-Fi requirement was ignored');
  if(due({mode:'daily',wifiOnly:false},true,false,false))throw Error('offline scheduler unexpectedly ran');
  if(due({mode:'daily',wifiOnly:false},false))throw Error('unchanged vault was synced ahead of daily schedule');
}

async function testVaultBatchImportLifecycle(){
  const src=read('document-vault-runtime.js');
  const b=src.indexOf('async function addFiles(fileList,category,input){');
  const e=src.indexOf('function findItem(id){',b);
  if(b<0||e<=b)throw Error('vault import handler missing');
  const create=vm.runInNewContext('(deps)=>{'
    +'const {state,MAX_ITEMS,setBusy,dbAll,addBlob,refresh,alert,logOperation,setSyncStatus,autoSync,navigator,setTimeout,syncNow}=deps;'
    +src.slice(b,e)+';return addFiles}');
  function app(used,write){
    const state={busy:false,uploadFolder:'',items:[]},alerts=[];
    let writes=0;
    const fn=create({state,MAX_ITEMS:1000,setBusy:value=>{state.busy=value},
      dbAll:async()=>Array.from({length:used},(_,id)=>({id,deleted:false})),
      addBlob:async(...args)=>{writes++;if(write)await write(...args)},
      refresh:async()=>{},alert:message=>alerts.push(message),
      logOperation:()=>{},setSyncStatus:()=>{},autoSync:()=>false,
      navigator:{onLine:false},setTimeout:()=>{},syncNow:()=>{}});
    return{fn,state,alerts,writes:()=>writes}
  }
  const full=app(1000);
  if(await full.fn([{name:'file'}],'file',{value:'x'})!==false||full.writes())
    throw Error('vault accepted files beyond 1000');
  const near=app(999);
  if(await near.fn([{name:'a'},{name:'b'}],'file',{value:'x'})!==false||near.writes())
    throw Error('vault partially wrote over-capacity batch');
  let release=null;
  const slow=app(0,()=>new Promise(resolve=>{release=resolve}));
  const first=slow.fn([{name:'a'}],'file',{value:'x'});
  for(let i=0;i<8&&!release;i++)await Promise.resolve();
  if(!release||!slow.state.busy)throw Error('vault import did not lock immediately');
  const repeat=await slow.fn([{name:'b'}],'file',{value:'x'});
  release();
  if(repeat!==false||await first!==true||slow.writes()!==1)
    throw Error('overlapping imports wrote duplicates');
  let n=0;
  const partial=app(0,async()=>{if(++n===2)throw Error('DISK_FULL')});
  if(await partial.fn([{name:'a'},{name:'b'}],'file',{value:'x'})!==false
    ||!partial.alerts.some(message=>message.includes('1 من 2')))
    throw Error('partially saved files were not disclosed');
}

async function testVaultMetadataAndEditorRace(){
  const source=read('document-vault-runtime.js');
  const a=source.indexOf('async function dbModifyItem(');
  const z=source.indexOf('function uploadedSnapshotUnchanged(',a);
  const p=source.indexOf('async function saveEditor(){');
  const q=source.indexOf('function editorCanvas(){',p);
  if(a<0||z<=a||p<0||q<=p)throw Error('safe metadata editor missing');
  const rows=new Map([['a',{id:'a',name:'photo.jpg',size:30,blob:{data:'original'},
    favorite:false,folder:'',deleted:false,syncState:'synced',updatedAt:'old',localEditToken:'old'}]]);
  let seq=0;
  const database={transaction(){
    const tx={};tx.objectStore=()=>({
      get:id=>{const req={};Promise.resolve().then(()=>{
        req.result=rows.get(id)?{...rows.get(id)}:undefined;
        req.onsuccess?.();Promise.resolve().then(()=>tx.oncomplete?.())
      });return req},
      put:row=>{rows.set(row.id,{...row});Promise.resolve().then(()=>tx.oncomplete?.())}
    });return tx
  }};
  const update=vm.runInNewContext('(openDb,uuid,STORE)=>{'+source.slice(a,z)+';return dbModifyItem}')(
    async()=>database,()=>String(++seq),'items');
  await update('a',row=>({...row,name:'renamed.jpg'}));
  await update('a',row=>({...row,favorite:true}));
  await update('a',row=>({...row,folder:'documents'}));
  const current=rows.get('a');
  if(current.name!=='renamed.jpg'||!current.favorite||current.folder!=='documents'||seq!==3)
    throw Error('metadata edit used a stale list snapshot');
  let finish=null;
  const oldEditor={id:'a',sourceEditToken:current.localEditToken,
    sourceUpdatedAt:current.updatedAt,sourceName:current.name,sourceSize:current.size};
  const state={editor:oldEditor,busy:false};
  const alerts=[],canvas={toBlob:callback=>{finish=callback}};
  const factory=vm.runInNewContext('(deps)=>{'
    +'const {state,drawEditor,dbModifyItem,setBusy,alert,closeModal,refresh,autoSync,navigator,setTimeout,syncNow,requireVault}=deps;'
    +source.slice(p,q)+';return saveEditor}');
  const save=factory({state,drawEditor:()=>canvas,dbModifyItem:update,
    setBusy:v=>{state.busy=v},alert:x=>alerts.push(x),closeModal:()=>{},
    refresh:async()=>{},autoSync:()=>false,navigator:{onLine:false},
    setTimeout:()=>{},syncNow:()=>{},requireVault:()=>true});
  const pending=save();
  if(!finish)throw Error('editor conversion did not start');
  await update('a',row=>({...row,name:'newer.jpg',blob:{data:'new image'}}));
  finish({size:40,data:'stale image'});
  await pending;
  const last=rows.get('a');
  if(last.name!=='newer.jpg'||last.blob.data!=='new image'||!alerts.length)
    throw Error('stale image editor replaced a newer document');
  if(state.busy)throw Error('editor busy layer remained active after a conflict');
}

async function testVaultDownloadRevisionConsistency(){
  const src=read('branch-vault-runtime.js');
  const a=src.indexOf('async function downloadVault(path){');
  const b=src.indexOf('async function removeVault(',a);
  if(a<0||b<=a)throw Error('vault signed download handler missing');
  let planPath='user/branch-vault/phone/doc/rev2',downloads=0;
  const expected='user/branch-vault/phone/doc/rev1';
  const factory=vm.runInNewContext('(deps)=>{'
    +'const {allowed,pathToId,edge,fetch}=deps;'
    +src.slice(a,b)+';return downloadVault}');
  const download=factory({allowed:()=>true,pathToId:new Map([[expected,'doc']]),
    edge:async()=>({path:planPath,url:'https://storage.example/signed'}),
    fetch:async()=>{downloads++;return {ok:true,blob:async()=>({size:2})}}});
  let mismatch=false;
  try{await download(expected)}catch(error){mismatch=error.message==='VAULT_REMOTE_VERSION_CHANGED'}
  if(!mismatch||downloads!==0)throw Error('revision drift downloaded bytes for an obsolete vault record');
  planPath=expected;
  const blob=await download(expected);
  if(!blob||blob.size!==2||downloads!==1)
    throw Error('matching vault version refused signed download');
}

async function testRestoreSettingsValidatedBeforeDatabaseCommit(){
  const source=read('document-vault-hardening-runtime.js');
  const start=source.indexOf('async function readRestoreSettings(zip){');
  const end=source.indexOf('function restoreSettings(',start);
  if(start<0||end<=start)throw Error('ZIP settings preflight handler missing');
  const parse=vm.runInNewContext('(()=>{'+source.slice(start,end)+';return readRestoreSettings})()');
  const zip=content=>({file:key=>key==='app-settings.json'
    ?(content===null?null:{async:async()=>content}):null});
  if(await parse(zip(null))!==null)throw Error('optional backup settings were not optional');
  for(const invalid of ['not-json','[]','{"format":"Other","settings":{}}',
    '{"format":"AbuBassamSettings","settings":[]}']){
    let rejected=false;
    try{await parse(zip(invalid))}catch(error){rejected=true}
    if(!rejected)throw Error('malformed backup settings passed ZIP preflight');
  }
  const settings=await parse(zip('{"format":"AbuBassamSettings","settings":{"theme":"dark"}}'));
  if(settings.settings.theme!=='dark')throw Error('valid backup settings rejected');
  const verified=source.indexOf('const settingsSnapshot=await readRestoreSettings(zip);');
  const committed=source.indexOf("await applyAtomic(prepared,{replaceAll:mode==='snapshot'});");
  if(verified<0||committed<=verified)throw Error('archive DB changes precede ZIP settings validation');
}

async function testVaultStaleDeleteGuard(){
  const source=read('document-vault-runtime.js');
  const a=source.indexOf('async function deleteItem(id){');
  const b=source.indexOf('async function editItem(id){',a);
  if(a<0||b<=a)throw Error('vault deletion handler missing');
  const factory=vm.runInNewContext('(deps)=>{'
    +'const {requireVault,findItem,confirm,dbModifyItem,refresh,alert,logOperation,autoSync,navigator,setTimeout,syncNow}=deps;'
    +source.slice(a,b)+';return deleteItem}');
  const shown={id:'photo',name:'original.png',size:10,updatedAt:'t1',
    localEditToken:'rev1',folder:'school',blob:{data:'old'}};
  let current={...shown,name:'new-photo.png',localEditToken:'rev2'};
  const warnings=[];let writes=0,refreshes=0;
  const remove=factory({requireVault:()=>true,findItem:()=>shown,confirm:()=>true,
    dbModifyItem:async(id,change)=>{const result=change({...current});if(result){current=result;writes++}return result},
    refresh:async()=>{refreshes++},alert:message=>warnings.push(message),
    logOperation:()=>{},autoSync:()=>false,navigator:{onLine:false},setTimeout:()=>{},syncNow:()=>{}});
  const rejected=await remove('photo');
  if(rejected!==false||writes||current.name!=='new-photo.png'||warnings.length!==1)
    throw Error('stale vault delete erased a recently changed document');
  current={...shown};
  if(await remove('photo')!==true||!current.deleted||current.blob!==null||
    current.size!==0||current.folder!=='school'||writes!==1||refreshes!==2)
    throw Error('confirmed deletion failed to store a safe local tombstone');
}

async function testVaultSyncAccountFence(){
  const source=read('document-vault-runtime.js');
  const a=source.indexOf('function vaultSyncContextValid(scope){');
  const b=source.indexOf('function onShow(){',a);
  if(a<0||b<=a)throw Error('vault sync session fence missing');
  const factory=vm.runInNewContext('(deps)=>{'
    +'const {requireVault,state,syncPolicy,wifiVerified,setSyncStatus,alert,navigator,sessionOk,cloud,window,syncScope,dbAll,uuid,niceName,remoteItem,dbResolvePendingConflict,dbDeleteIfUnchanged,dbCommitUpload,dbReceiveRemoteIfUnchanged,refresh,syncSet,LAST_SYNC_KEY,logOperation,autoSync,automaticDue,vaultScopeOk,vaultAllowed}=deps;'
    +source.slice(a,b)+';return syncNow}');
  const sample=[{id:'doc1',name:'photo.jpg',mime:'image/jpeg',size:3,
    blob:{size:3},syncState:'pending',createdAt:'a',updatedAt:'a'}];
  function prepare(){
    let scope='owner:phone',online=true,allowed=true,connected=true,oldGet=null;
    let writes=0,uploads=0,upserts=0,removes=0,completed=0,badReply=false;
    const state={syncing:false,items:[]};
    const service={
      get:async()=>oldGet?await new Promise(resolve=>{oldGet.resume=resolve}):null,
      uploadVault:async()=>{uploads++;return 'v/path'},
      upsert:async()=>{upserts++;if(badReply)throw Error('NETWORK_TIMEOUT');return{updated_at:'v2'}},
      removeVault:async()=>{removes++},list:async()=>[],
      downloadVault:async()=>({size:3})
    };
    const sync=factory({requireVault:()=>true,state,syncPolicy:()=>({wifiOnly:false}),
      wifiVerified:()=>true,setSyncStatus:()=>{},alert:()=>{},
      navigator:{get onLine(){return online}},sessionOk:()=>connected,
      cloud:()=>service,window:{AbuBassamSecurity:{device:()=>({device_id:'phone'})}},
      syncScope:()=>scope,dbAll:async()=>sample,uuid:()=> 'unique',
      niceName:x=>x,remoteItem:x=>x,
      dbResolvePendingConflict:async()=>{writes++},
      dbDeleteIfUnchanged:async()=>{writes++},
      dbCommitUpload:async()=>{writes++},
      dbReceiveRemoteIfUnchanged:async()=>{writes++},
      refresh:async()=>{state.items=[]},syncSet:()=>{completed++},
      LAST_SYNC_KEY:'last',logOperation:()=>{},autoSync:()=>true,
      automaticDue:()=>true,vaultScopeOk:()=>true,vaultAllowed:()=>allowed});
    return {
      sync,state,deferGet:()=>{oldGet={resume:null};return oldGet},
      change:key=>{if(key==='scope')scope='other:phone';
        if(key==='offline')online=false;
        if(key==='permission')allowed=false;
        if(key==='session')connected=false;
        if(key==='uncertain')badReply=true},
      counters:()=>({writes,uploads,upserts,removes,completed})
    }
  }
  for(const change of ['scope','offline','permission','session']){
    const app=prepare(),hold=app.deferGet(),running=app.sync();
    for(let i=0;i<8&&!hold.resume;i++)await Promise.resolve();
    if(!hold.resume)throw Error('vault request did not start');
    app.change(change);hold.resume(null);
    if(await running!==false)throw Error('old vault sync session continued after '+change);
    const c=app.counters();
    if(c.writes||c.uploads||c.upserts||c.completed)
      throw Error('vault sync touched data after '+change);
  }
  const uncertain=prepare();uncertain.change('uncertain');
  if(await uncertain.sync()!==false)throw Error('failed upsert was reported successful');
  const failed=uncertain.counters();
  if(failed.uploads!==1||failed.upserts!==1||failed.removes!==0||failed.writes)
    throw Error('ambiguous cloud acknowledgement deleted the uploaded object');
  const normal=prepare();
  if(await normal.sync()!==true)throw Error('normal vault sync rejected');
  const ok=normal.counters();
  if(ok.upserts!==1||ok.writes!==1||ok.completed!==1)
    throw Error('normal vault sync lost its acknowledgement');
  for(const marker of [
    'function vaultSyncContextValid(scope){',
    "throw new Error('VAULT_SYNC_CONTEXT_CHANGED')",
    'tx.abort();return',
    'await dbCommitUpload(item,saved?.updated_at,runScope);'
  ])need(source,marker,'vault account and permission fence');
}

function testVaultSyncTimerVisibility(){
  const source=read('document-vault-runtime.js');
  const start=source.indexOf('let vaultSyncTimer=null;');
  const end=source.indexOf('async function build(){',start);
  if(start<0||end<=start)throw Error('vault sync scheduling helper missing');
  const scheduler=vm.runInNewContext('(deps)=>{'
    +'const {document,setTimeout,clearTimeout,automaticDue,syncNow}=deps;'
    +source.slice(start,end)
    +';return {scheduleVaultSyncTimer,state:()=>vaultSyncTimer}}');
  const timers=new Map(),doc={visibilityState:'visible'};
  let seq=0,attempts=0,due=true;
  const clock=scheduler({document:doc,
    setTimeout:fn=>{const id=++seq;timers.set(id,fn);return id},
    clearTimeout:id=>timers.delete(id),
    automaticDue:()=>due,
    syncNow:()=>{attempts++;return Promise.resolve(true)}
  });
  clock.scheduleVaultSyncTimer(5000);
  if(timers.size!==1)throw Error('first vault sync check not scheduled');
  clock.scheduleVaultSyncTimer();
  if(timers.size!==1)throw Error('vault sync created redundant timers');
  const [timer,fire]=[...timers][0];
  timers.delete(timer);fire();
  if(attempts!==1||timers.size!==1)
    throw Error('visible vault sync did not resume its one-timer loop');
  doc.visibilityState='hidden';
  clock.scheduleVaultSyncTimer();
  if(timers.size)throw Error('vault timer continued running while hidden');
  doc.visibilityState='visible';due=false;
  clock.scheduleVaultSyncTimer();
  const [resumed,run]=[...timers][0];
  timers.delete(resumed);run();
  if(attempts!==1||timers.size!==1)
    throw Error('offline/unchanged vault caused unnecessary sync');
  for(const marker of [
    "document.addEventListener('visibilitychange'",
    "clearTimeout(vaultSyncTimer);vaultSyncTimer=null",
    "if(automaticDue())void syncNow(false);",
    "scheduleVaultSyncTimer(5000);"
  ])need(source,marker,'vault visibility-aware sync lifecycle');
  if(source.includes("setInterval(()=>{if(automaticDue())syncNow(false)},900000)"))
    throw Error('legacy permanent vault sync interval still active');
}

async function testVaultTransactionSessionRevocation(){
  const source=read('document-vault-runtime.js');
  const a=source.indexOf('async function dbCommitUpload(');
  const b=source.indexOf('async function dbResolvePendingConflict(',a);
  if(a<0||b<=a)throw Error('vault atomic commit missing');
  const uploaded={id:'doc',name:'draft.png',size:10,mime:'image/png',
    folder:'',favorite:false,deleted:false,updatedAt:'now',
    localEditToken:'edit1',syncState:'pending'};
  const records=new Map([['doc',{...uploaded}]]);
  let allowed=true,aborts=0,writes=0;
  const database={transaction(){
    const tx={};
    tx.abort=()=>{aborts++;Promise.resolve().then(()=>tx.onabort?.())};
    tx.objectStore=()=>({
      get:id=>{
        const req={};Promise.resolve().then(()=>{
          req.result=records.get(id)?{...records.get(id)}:undefined;
          req.onsuccess?.();
          if(!aborts)Promise.resolve().then(()=>tx.oncomplete?.())
        });return req
      },
      put:row=>{writes++;records.set(row.id,{...row})}
    });
    return tx
  }};
  const commit=vm.runInNewContext('(deps)=>{'
    +'const {openDb,STORE,vaultSyncContextValid,mergeUploadReceipt}=deps;'
    +source.slice(a,b)+';return dbCommitUpload}')({
      openDb:async()=>database,STORE:'items',
      vaultSyncContextValid:()=>allowed,
      mergeUploadReceipt:(current,snapshot,version)=>({...current,
        syncState:'synced',remoteUpdatedAt:version})
    });
  const pending=commit(uploaded,'cloud2','owner:phone');
  allowed=false;
  let rejected=false;
  try{await pending}catch(error){rejected=error.message==='VAULT_SYNC_ACK_ABORTED'}
  if(!rejected||aborts!==1||writes!==0||records.get('doc').syncState!=='pending')
    throw Error('IndexedDB committed an old session after permission revocation');
  aborts=0;allowed=true;
  if(await commit(uploaded,'cloud2','owner:phone')!==true||
    records.get('doc').syncState!=='synced'||writes!==1)
    throw Error('active vault session could not acknowledge its own upload');
}

// The optional AI PRO connection must never keep a blocking busy overlay
// indefinitely while a remote session check is stalled or the phone is offline.
async function testAiCloudStartupTimeout(){
  const html=read('index.html');
  const begin=html.indexOf('async function readyAiCloudWithin(');
  const end=html.indexOf('async function runAiPro()',begin);
  if(begin<0||end<=begin)throw new Error('AI PRO session timeout routine not found');
  need(html,"navigator.onLine===false)return alert('تحتاج خدمة AI PRO إلى اتصال بالإنترنت.')",'AI PRO should refuse offline operations before blocking touch');
  const factory=vm.runInNewContext(`(window,setTimeout,clearTimeout)=>{
    ${html.slice(begin,end)}
    return readyAiCloudWithin
  }`);
  let watchdog,cleared=false;
  const waitForever=factory({AbuBassamCloud:{ready:()=>new Promise(()=>{})}},
    fn=>{watchdog=fn;return 1},id=>{if(id===1)cleared=true});
  const waiting=waitForever();
  for(let i=0;i<6;i+=1)await Promise.resolve();
  if(typeof watchdog!=='function')throw new Error('cloud readiness watchdog was not armed');
  watchdog();
  let expired=false;
  try{await waiting}catch(error){expired=/انتهت مهلة/.test(String(error.message))}
  if(!expired||!cleared)throw new Error('stalled cloud session did not release its watchdog');
  const ready=factory({AbuBassamCloud:{ready:()=>Promise.resolve(true)}},()=>2,()=>{});
  if((await ready())!==true)throw new Error('available cloud session did not pass readiness');
}
// Removing the final photo must invalidate print/PDF canvases. Impossibly
// large margins must also hide the previous preview, not allow stale exports.
function testPhotoPreviewClearedWhenEmpty(){
  const html=read('index.html');
  const ranges=[
    [html.indexOf('function removePerson(i){'),html.indexOf('function clearImages(){')],
    [html.indexOf('function renderPaper(){'),html.indexOf('function showPage(i){')]
  ];
  if(ranges.some(([a,b])=>a<0||b<=a))throw new Error('photo preview/render source not found');
  const source=ranges.map(([a,b])=>html.slice(a,b)).join('\n');
  const factory=vm.runInNewContext(`(elements,photos,document,paper,photoSize)=>{
    let uploadedImages=photos,pageCanvases=[{tag:'previous-private-photo'}],
      currentPage=2,selectedIndex=photos.length-1;
    const $=id=>elements[id],updateFooter=()=>{},updatePageNav=()=>{},
      refreshPeople=()=>{},showPage=()=>{},makePhotoCanvas=()=>({}),
      getPaperSize=()=>paper,getPhotoSize=()=>photoSize,mmToPx=x=>x;
    ${source}
    return {removePerson,renderPaper,summary:()=>({
      pages:pageCanvases.length,currentPage,
      hidden:elements['preview-canvas'].style.display==='none',
      zoomHidden:elements.paperZoomOverlay.classList.removed==='show',
      info:elements['info-text'].textContent
    })}
  }`);
  const create=(margin,paper={w:100,h:100},photoSize={w:40,h:40},count=2)=>{
    const elements={
      'preview-canvas':{style:{display:'block'},onclick:()=>{}},
      paperZoomOverlay:{classList:{remove(value){this.removed=value}}},
      'info-text':{textContent:'stale page'},
      photoCount:{value:String(count)},marginInput:{value:String(margin)},
      gapInput:{value:'2'},borderMode:{value:'none'}
    };
    const document={createElement:()=>({getContext:()=>({fillRect(){},drawImage(){}})})};
    return factory(elements,[{}],document,paper,photoSize)
  };
  const single=create(5);
  single.removePerson(0);
  const cleared=single.summary();
  if(cleared.pages!==0||cleared.currentPage!==0||!cleared.hidden||!cleared.zoomHidden)
    throw new Error('deleting the final photo left a printable stale preview');
  const invalid=create(40);
  invalid.renderPaper();
  const emptyLayout=invalid.summary();
  if(emptyLayout.pages!==0||!emptyLayout.hidden||!emptyLayout.zoomHidden||
      !emptyLayout.info.includes('تعذر ترتيب الصور'))
    throw new Error('unplaceable photos retained a previous printable image');
  // Custom 100 cm paper at high DPI would exceed WebView canvas limits.
  const paperTooSmall=create(2,{w:20,h:20});
  paperTooSmall.renderPaper();
  const outOfBounds=paperTooSmall.summary();
  if(outOfBounds.pages!==0||outOfBounds.currentPage!==0||!outOfBounds.hidden||
      !outOfBounds.zoomHidden||!outOfBounds.info.includes('مقاس الصورة أكبر'))
    throw new Error('paper smaller than photo kept the zoom overlay open');
  const giant=create(2,{w:24000,h:24000});
  giant.renderPaper();
  const refused=giant.summary();
  if(refused.pages!==0||!refused.hidden||!refused.info.includes('دقة الورقة كبيرة'))
    throw new Error('oversized bitmap allocation was not blocked before rendering');
  // Standard A4 at 600 DPI is below the 40-million-pixel ceiling.
  const a4HighDpi=create(2,{w:4961,h:7016});
  a4HighDpi.renderPaper();
  if(a4HighDpi.summary().pages!==1)
    throw new Error('valid A4 600 DPI pages were incorrectly rejected');
  const hugeBatch=create(2,{w:4961,h:7016},{w:4800,h:6900},12);
  hugeBatch.renderPaper();
  const limited=hugeBatch.summary();
  if(limited.pages!==0||!limited.hidden||!limited.info.includes('الدفعة كبيرة'))
    throw new Error('unbounded cumulative photo pages may exhaust Android WebView memory');
  const allowedBatch=create(2,{w:4961,h:7016},{w:4800,h:6900},2);
  allowedBatch.renderPaper();
  if(allowedBatch.summary().pages!==2)
    throw new Error('two valid 600 DPI pages should fit the cumulative memory guard');
}
// The optional Questions / image-compressor module loader must not remain
// blocked by a failed script tag, nor treat onload without runtime as success.
async function testAdvancedRuntimeLoader(){
  const source=read('productivity-tools-runtime.js');
  const start=source.indexOf('const pendingAdvancedScripts=new Map();');
  const end=source.indexOf('async function loadAdvancedRuntime()',start);
  if(start<0||end<=start)throw new Error('advanced script loader missing');
  const factory=vm.runInNewContext(`(document,window,setTimeout,clearTimeout,CustomEvent)=>{
    ${source.slice(start,end)}
    return loadOne
  }`);
  const appended=[],nodes=new Map(),timers=new Map(),window={};
  let counter=0;
  const document={
    getElementById:id=>nodes.get(id)||null,
    createElement:()=>({dataset:{},remove(){nodes.delete(this.id)}}),
    body:{appendChild(node){appended.push(node);nodes.set(node.id,node)}},
    dispatchEvent:()=>{}
  };
  const load=factory(document,window,fn=>{let id=++counter;timers.set(id,fn);return id},id=>timers.delete(id),function CustomEvent(){});
  const p1=load('demo','demo.js','__DEMO__');
  const p2=load('demo','demo.js','__DEMO__');
  if(p1!==p2||appended.length!==1)throw new Error('duplicate advanced scripts were appended');
  window.__DEMO__=true;appended[0].onload();
  await Promise.all([p1,p2]);
  await Promise.resolve();
  delete window.__DEMO__;
  let refused=false;
  try{await load('demo','demo.js','__DEMO__')}catch(error){refused=/present without/.test(error.message)}
  if(!refused)throw new Error('missing advanced runtime readiness flag was accepted');
  const broken=load('broken','broken.js','__BROKEN__');
  appended[1].onerror();
  let failure=false;
  try{await broken}catch(error){failure=/resource error/.test(error.message)}
  if(!failure||nodes.has('broken'))throw new Error('failed advanced script was not cleaned up');
  await Promise.resolve();
  const retry=load('broken','broken.js','__BROKEN__');
  window.__BROKEN__=true;appended[2].onload();
  await retry;
  const hung=load('hung','hung.js','__HUNG__');
  const watchdog=[...timers.values()][0];
  if(typeof watchdog!=='function')throw new Error('advanced script missing load timeout');
  watchdog();
  let timedOut=false;
  try{await hung}catch(error){timedOut=/timeout/.test(error.message)}
  if(!timedOut||nodes.has('hung'))throw new Error('advanced script timeout left a blocked script tag');
  need(source,"script.onerror=()=>{script.remove();console.warn(src+' failed to load')}","Arabic question retries after iframe script failure");
  need(source,"script.remove();console.warn('questions-en-fixes-runtime.js failed to load')","English question retries after iframe script failure");
}
// Embedded Tesseract must never hang after an OCR script load fails. Browser
// source pickers must surface FileReader errors without unhandled rejections.
async function testOfflineOcrRecovery(){
  const source=read('document-vault-offline-ocr-runtime.js');
  const start=source.indexOf('function loadLocalScript(){');
  const end=source.indexOf('async function worker(){',start);
  if(start<0||end<=start)throw new Error('OCR local script loader source missing');
  const create=vm.runInNewContext(`(document,window,setTimeout,clearTimeout)=>{
    let localScriptPromise=null;
    ${source.slice(start,end)}
    return loadLocalScript
  }`);
  const nodes=new Map(),scripts=[],timers=new Map();let number=0;
  const doc={
    getElementById:id=>nodes.get(id)||null,
    createElement:()=>({remove(){nodes.delete(this.id)}}),
    head:{appendChild(node){nodes.set(node.id,node);scripts.push(node)}}
  };
  const window={};
  const load=create(doc,window,fn=>{const id=++number;timers.set(id,fn);return id},id=>timers.delete(id));
  const a=load(),b=load();
  if(a!==b||scripts.length!==1)throw new Error('simultaneous OCR startup duplicated its script');
  scripts[0].onerror();
  const rejected=await Promise.allSettled([a,b]);
  if(rejected.some(v=>v.status!=='rejected')||nodes.size!==0)
    throw new Error('failed OCR script stayed active or did not reject callers');
  const again=load();
  if(scripts.length!==2)throw new Error('failed OCR script did not retry');
  window.Tesseract={createWorker(){}};
  scripts[1].onload();
  await again;
  if(timers.size!==0)throw new Error('OCR load timeout was not cleared after success');
  delete window.Tesseract;
  const hung=load(),watchdog=[...timers.values()][0];
  if(typeof watchdog!=='function')throw new Error('OCR local load lacked timeout');
  watchdog();
  let expired=false;
  try{await hung}catch(e){expired=/انتهت مهلة/.test(String(e.message))}
  if(!expired||nodes.size!==0)throw new Error('timed-out OCR script remained in DOM');
  const inputStart=source.indexOf('async function inputChanged(ev){');
  const inputEnd=source.indexOf('function bind(){',inputStart);
  if(inputStart<0||inputEnd<=inputStart)throw new Error('OCR file input handler missing');
  const handlerFactory=vm.runInNewContext(`(readFile,report)=>{
    const fileToData=readFile,setProgress=report,recognize=()=>Promise.resolve();
    ${source.slice(inputStart,inputEnd)}
    return inputChanged
  }`);
  let notice='';
  const inputHandler=handlerFactory(()=>Promise.reject(new Error('FILE_READ_FAILED')),v=>{notice=v});
  const event={target:{files:[{}],value:'picked'}};
  await inputHandler(event);
  if(!notice.includes('FILE_READ_FAILED')||event.target.value!=='')
    throw new Error('OCR image read failure left pending input or unhandled error');
  need(source,"if(busy){setProgress('جاري قراءة صورة أخرى","do not overlap simultaneous OCR recognitions");
}
async function testReportExcelLoader(){
  const src=read('notification-excel-runtime.js');
  const start=src.indexOf('let zipLoadPending=null;');
  const end=src.indexOf('async function makeWorkbook(',start);
  if(start<0||end<=start)throw new Error('Excel JSZip loader not found');
  const factory=vm.runInNewContext(`(document,window,setTimeout,clearTimeout)=>{
    ${src.slice(start,end)}
    return loadZip
  }`);
  const elements=[],nodes=new Map(),timers=new Map(),window={};let seq=0;
  const document={
    querySelector:()=>nodes.get('script')||null,
    createElement:()=>({dataset:{},remove(){nodes.delete('script')}}),
    head:{appendChild(node){nodes.set('script',node);elements.push(node)}}
  };
  const load=factory(document,window,fn=>{const id=++seq;timers.set(id,fn);return id},id=>timers.delete(id));
  const one=load(),two=load();
  if(one!==two||elements.length!==1)throw new Error('simultaneous Excel loader requests were not coalesced');
  elements[0].onerror();
  const results=await Promise.allSettled([one,two]);
  if(results.some(x=>x.status!=='rejected')||nodes.size!==0)
    throw new Error('failed Excel loader was not cleaned up');
  const retry=load();window.JSZip=function Zip(){};
  elements[1].onload();
  if((await retry)!==window.JSZip)throw new Error('Excel retry did not load JSZip');
  delete window.JSZip;
  const hanging=load(),watchdog=[...timers.values()][0];
  if(typeof watchdog!=='function')throw new Error('Excel loader has no timeout');
  watchdog();
  let expired=false;try{await hanging}catch(e){expired=/timeout/.test(String(e.message))}
  if(!expired||nodes.size!==0)throw new Error('Excel load timeout retained the failed resource');
}
async function testBackupIndexedDbConnectionLifecycle(){
  const source=read('backup-center-runtime.js');
  const begin=source.indexOf('async function all(){');
  const end=source.indexOf('async function backupItems()',begin);
  if(begin<0||end<=begin)throw new Error('IndexedDB backup reader missing');
  const create=vm.runInNewContext(`(openDb)=>{
    const STORE='items';
    ${source.slice(begin,end)}
    return all
  }`);
  const make=(mode)=>{
    const state={closed:0,tx:null,req:null};
    const db={
      close(){state.closed++},
      transaction(){
        if(mode==='throw')throw new Error('DB_TRANSACTION_FAILED');
        state.tx={
          objectStore(){return{
            getAll(){
              if(mode==='getAllThrow')throw new Error('DB_QUERY_FAILED');
              state.req={result:[{id:'safe'}],error:new Error('DB_READ_FAILED')};
              return state.req
            }
          }}
        };
        return state.tx
      }
    };
    return {state,run:create(()=>Promise.resolve(db))}
  };
  const ok=make('ok'),reading=ok.run();
  for(let i=0;i<3;i++)await Promise.resolve();
  ok.state.req.onsuccess();
  if((await reading)?.[0]?.id!=='safe'||ok.state.closed!==1)
    throw new Error('backup success did not close database');
  const failure=make('failure'),broken=failure.run();
  for(let i=0;i<3;i++)await Promise.resolve();
  failure.state.req.onerror();
  let failed=false;
  try{await broken}catch(e){failed=/DB_READ_FAILED/.test(e.message)}
  if(!failed||failure.state.closed!==1)throw new Error('backup getAll error leaked database connection');
  const aborted=make('abort'),cancelled=aborted.run();
  for(let i=0;i<3;i++)await Promise.resolve();
  aborted.state.tx.error=new Error('DB_ABORTED');
  aborted.state.tx.onabort();
  let cancelledCorrectly=false;
  try{await cancelled}catch(e){cancelledCorrectly=/DB_ABORTED/.test(e.message)}
  if(!cancelledCorrectly||aborted.state.closed!==1)
    throw new Error('backup transaction abort leaked database connection');
  const unexpected=make('throw');
  let threw=false;
  try{await unexpected.run()}catch(e){threw=/DB_TRANSACTION_FAILED/.test(e.message)}
  if(!threw||unexpected.state.closed!==1)throw new Error('backup transaction creation failure leaked database connection');
}
Promise.all([Promise.resolve().then(testCardDuplexPagePairing),testEncryptedCardPhotoDraft(),Promise.resolve().then(testCardBackupQuotaRollback),testCardPrintPreviewIdentity(),testCardBackupRestorationCancelsPhotos(),testCardPhotoAndBrandLogoRace(),testVaultTransactionSessionRevocation(),Promise.resolve().then(testVaultSyncTimerVisibility),testVaultSyncAccountFence(),testVaultStaleDeleteGuard(),testRestoreSettingsValidatedBeforeDatabaseCommit(),testVaultDownloadRevisionConsistency(),testVaultMetadataAndEditorRace(),testVaultBatchImportLifecycle(),Promise.resolve().then(testVaultPendingSyncSchedule),testVaultDeleteAckPreservesNewEdits(),testBackupRestoreExclusiveLock(),testVaultConflictCommitIsolation(),Promise.resolve().then(testVaultSyncConflictRules),testSecureDeviceHeartbeatLifecycle(),Promise.resolve().then(testWebViewGenerationRecovery),testCameraCaptureCancelledAfterClose(),testNativeOutputFailures(),testBoundedSegmentation(),testRuntimeScriptLoader(),testAdvancedRuntimeLoader(),testOfflineOcrRecovery(),testReportExcelLoader(),testBackupIndexedDbConnectionLifecycle(),Promise.resolve().then(testGuidePreferenceSurvivesWebViewReload),Promise.resolve().then(testBackLayerFallback),Promise.resolve().then(testMissingSheetCannotBlockTouch),Promise.resolve().then(testImageImportLifecycle),Promise.resolve().then(testBarcodeScanDeduplication),testAiCloudStartupTimeout(),Promise.resolve().then(testPhotoPreviewClearedWhenEmpty)]).then(()=>{
  if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exitCode=1;return}
  process.stdout.write('Runtime regression checks passed: reliable script loader retries and timeouts, offline-first secure gate, bounded image segmentation, native bridge boot, and touch/backdrop cleanup.\n');
}).catch(error=>{
  errors.push('startup/segmentation behavior regression: '+error.message);
  process.stderr.write(errors.join('\n')+'\n');
  process.exitCode=1
});
