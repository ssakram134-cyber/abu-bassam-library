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
// File-reader failures must not strand a batch. Clearing images must
// invalidate callbacks from previous file selections, even after load.
function testImageImportLifecycle(){
  const html=read('index.html');
  const start=html.indexOf('function onImageSelect(ev){'),end=html.indexOf('function refreshPeople()',start);
  const clearStart=html.indexOf('function clearImages(){'),clearEnd=html.indexOf('function makePhotoCanvas(',clearStart);
  if([start,end,clearStart,clearEnd].some(x=>x<0))throw new Error('image import/clear source missing');
  const source=html.slice(start,end)+'\n'+html.slice(clearStart,clearEnd);
  const factory=vm.runInNewContext(`(FileReader,Image,stats)=>{
    let uploadedImages=[],selectedIndex=-1,pageCanvases=[],imageImportEpoch=0;
    const $=()=>({style:{},classList:{remove(){}},textContent:''});
    function refreshPeople(){stats.updated++}
    function renderPaper(){stats.rendered++}
    function updatePageNav(){}
    ${source}
    return {onImageSelect,clearImages,images:()=>uploadedImages}
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
    const barcodeScanHandledRef=ref,barcodeLocked=false;
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
  const factory=vm.runInNewContext(`(elements,photos,document,paper)=>{
    let uploadedImages=photos,pageCanvases=[{tag:'previous-private-photo'}],
      currentPage=2,selectedIndex=photos.length-1;
    const $=id=>elements[id],updateFooter=()=>{},updatePageNav=()=>{},
      refreshPeople=()=>{},showPage=()=>{},
      getPaperSize=()=>paper,getPhotoSize=()=>({w:40,h:40}),mmToPx=x=>x;
    ${source}
    return {removePerson,renderPaper,summary:()=>({
      pages:pageCanvases.length,currentPage,
      hidden:elements['preview-canvas'].style.display==='none',
      zoomHidden:elements.paperZoomOverlay.classList.removed==='show',
      info:elements['info-text'].textContent
    })}
  }`);
  const create=(margin,paper={w:100,h:100})=>{
    const elements={
      'preview-canvas':{style:{display:'block'},onclick:()=>{}},
      paperZoomOverlay:{classList:{remove(value){this.removed=value}}},
      'info-text':{textContent:'stale page'},
      photoCount:{value:'2'},marginInput:{value:String(margin)},
      gapInput:{value:'2'},borderMode:{value:'none'}
    };
    const document={createElement:()=>({getContext:()=>({fillRect(){},drawImage(){}})})};
    return factory(elements,[{}],document,paper)
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
Promise.all([testBoundedSegmentation(),testRuntimeScriptLoader(),testAdvancedRuntimeLoader(),Promise.resolve().then(testMissingSheetCannotBlockTouch),Promise.resolve().then(testImageImportLifecycle),Promise.resolve().then(testBarcodeScanDeduplication),testAiCloudStartupTimeout(),Promise.resolve().then(testPhotoPreviewClearedWhenEmpty)]).then(()=>{
  if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exitCode=1;return}
  process.stdout.write('Runtime regression checks passed: reliable script loader retries and timeouts, offline-first secure gate, bounded image segmentation, native bridge boot, and touch/backdrop cleanup.\n');
}).catch(error=>{
  errors.push('startup/segmentation behavior regression: '+error.message);
  process.stderr.write(errors.join('\n')+'\n');
  process.exitCode=1
});
