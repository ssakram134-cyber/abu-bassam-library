const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),failures=[];
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const need=(file,markers)=>{const s=read(file);for(const m of markers)if(!s.includes(m))failures.push(`${file}: missing ${m}`)};
const forbid=(file,markers)=>{const s=read(file);for(const m of markers)if(s.includes(m))failures.push(`${file}: forbidden ${m}`)};

need('index.js',['expo-local-authentication','expo-secure-store','expo-screen-capture','SecureStore.setItemAsync','ScreenCapture.preventScreenCaptureAsync',"action === 'privacyMode'",'AbuBassamNativeSecurityResult',"message.type === 'webBootReady'",'STARTUP_WATCHDOG_MS = 12000',"const APP_ORIGIN = 'https://appassets.androidplatform.net';","originWhitelist={[APP_ORIGIN,'about:*']}",'nativeConfig={{ component: RCTAbuBassamWebView }}','allowFileAccess={false}','allowFileAccessFromFileURLs={false}','allowUniversalAccessFromFileURLs={false}','mixedContentMode="never"','onRenderProcessGone','const SECURE_KEYS = new Set([',"'abu_bassam_auth_session_v1'","'abu_bassam_device_secret_v1'","'abu_bassam_device_id_v1'","'abu_bassam_auth_callback_v1'","'abu_bassam_recovery_pending_secret_v1'",'SECURE_KEYS.has(key)']);
forbid('index.js',["originWhitelist={['*']}","originWhitelist={['file://*','about:*']}","file:///android_asset/library/index.html",'mixedContentMode="always"','onLoad={() => setWebReady(true)}','onLoadEnd={() => setWebReady(true)}','/^abu_bassam_[a-z0-9_]{3,80}$/i']);
need('native/android/AbuBassamWebViewManager.java',['RCTAbuBassamWebView','appassets.androidplatform.net','safeRelativePath','shouldInterceptRequest']);
need('native/android/AbuBassamWebViewPackage.java',['new AbuBassamWebViewManager()']);
need('scripts/prepare-android-assets.mjs',['installHardenedWebView','add(AbuBassamWebViewPackage())']);

need('web/secure-sync-runtime.js',['window.AbuBassamNativeSecurityResult','window.AbuBassamNativeSecurity = { request: nativeRequest, available: nativeAvailable }','storage: authStorage','registerVaultAdapter','VAULT_GATEWAY_NOT_READY']);
forbid('web/secure-sync-runtime.js',["localStorage.getItem('__dev_secure_'","upsert('operation'","upsert('device'","setInterval("]);
need('web/secure-sync-runtime.js',['abu-runtime-loaded','abu-settings-ready',"document.visibilityState==='visible'"]);

need('web/app-security-runtime.js',["MAIN_USERNAME='akrama1992'",'abu_bassam_register_device','SECONDARY_DEFAULT={edit:false','ATTEMPT_KEY','recordCredentialFailure','clearCredentialFailures',"signOut({scope:'local'})",'AbuBassamNativeSecurity']);
need('web/app-security-runtime.js',[
  'function isCredentialFailure(error){',"code==='invalid_credentials'","if(isCredentialFailure(result.error))recordCredentialFailure(authError(result.error));",
  'let deviceSecretPending=null;', 'if(deviceSecretPending)return deviceSecretPending;',
  "if(stored!==generated)throw new Error('SECURE_DEVICE_SECRET_PERSIST_FAILED');",
  'deviceSecret=stored;', 'window.__ABU_SECURITY_BOOT_PROMISE__=new Promise(', 'startSecurityBoot',
  "if(!document.getElementById('abuSecurityGate'))throw new Error('SECURITY_GATE_NOT_READY');"
]);
need('web/device-name-runtime.js',[
  'const securityBoot=window.__ABU_SECURITY_BOOT_PROMISE__;',
  'await securityBoot;', "if(!document.getElementById('abuSecurityGate'))throw new Error('APP_SECURITY_GATE_REQUIRED');"
]);

forbid('web/app-security-runtime.js',['window.AbuBassamNativeSecurityResult=function',"localStorage.getItem('__dev_secure_'"]);

need('web/security-bootstrap-guard-runtime.js',['LEGACY_SECRET_PREFIX','wipeLegacySecretStorage','installLegacySecretStorageBlock','localStorage.removeItem(LEGACY_TRUST_KEY)','stopImmediatePropagation']);
need('web/security-hardening-runtime.js',["SECURE_TRUST_KEY='abu_bassam_offline_trust_v2'","name:'HMAC',hash:'SHA-256'",'constantTime(expected,env.mac)','OFFLINE_GRACE_MS=12*60*60*1000','AbuBassamNativeSecurity']);
forbid('web/security-hardening-runtime.js',['window.AbuBassamNativeSecurityResult']);
need('web/security-extras-runtime.js',['verifyDangerPin','verifyStoredPin','PIN_FAIL_KEY','PIN_LOCK_KEY','recordPinFailure','clearPinFailures','/^\\d{6,8}$/','changePassword','safeSnapshot','restoreSnapshot',"nativeRequest('privacyMode'",'v.length<12','AbuBassamNativeSecurity']);
forbid('web/security-extras-runtime.js',['window.AbuBassamNativeSecurityResult','__dev_secure_']);
need('web/password-policy-runtime.js',['v.length<12','enforceSignup',"setAttribute('minlength','12')","c.auth.updateUser({password:next})"]);
need('web/login-input-direction-runtime.js',["setAttribute('dir','ltr')","setAttribute('autocapitalize','off')","setAttribute('spellcheck','false')"]);
need('web/device-name-runtime.js',['script.async=false','await loadSecurity();','await loadBranchVault();','await loadAccountCenter();','signalBootReady()',"if(!id)throw new Error('SECURE_DEVICE_ID_RANDOM_REQUIRED')","SECURE_DEVICE_ID_KEY = 'abu_bassam_device_id_v1'",'stabilizeIdentity','adoptIdentity','SECURE_DEVICE_ID_PERSIST_FAILED']);
forbid('web/device-name-runtime.js',['login-throttle-fix-runtime.js','fail-closed-runtime.js',"cloud.list('device')",'Math.random()']);
need('web/device-reconcile-runtime.js',['abu_bassam_owner_devices','abu_bassam_owner_device_count','abu_bassam_set_device_limit','AbuBassamNativeSecurity']);
forbid('web/device-reconcile-runtime.js',['window.AbuBassamNativeSecurityResult','__dev_secure_']);

const web=path.join(root,'web'),nativeOwners=[];
for(const name of fs.readdirSync(web).filter(n=>n.endsWith('.js'))){const s=fs.readFileSync(path.join(web,name),'utf8');if(s.includes('window.AbuBassamNativeSecurityResult'))nativeOwners.push(name)}
if(nativeOwners.length!==1||nativeOwners[0]!=='secure-sync-runtime.js')failures.push('exactly secure-sync-runtime.js must own AbuBassamNativeSecurityResult; found '+nativeOwners.join(','));

for(const file of ['web/secure-sync-runtime.js','web/app-security-runtime.js','web/security-bootstrap-guard-runtime.js','web/security-hardening-runtime.js','web/security-extras-runtime.js','web/device-name-runtime.js','web/device-reconcile-runtime.js'])try{new vm.Script(read(file),{filename:file})}catch(e){failures.push(file+': syntax '+e.message)}
for(const dep of ['expo-local-authentication','expo-secure-store','expo-screen-capture'])if(!JSON.parse(read('package.json')).dependencies?.[dep])failures.push('package.json missing '+dep);
// Offline UI must never use unsigned legacy localStorage trust. It must
// preserve a verified secondary role even if an older online owner device
// snapshot remains in memory before a successful offline biometric check.
forbid('web/app-security-runtime.js', [
  "TRUST_KEY='abuBassamSecurityTrustV1'",
  'function offlineAllowed()',
  'function offlineUnlock()',
  'else if(offlineAllowed())',
]);
need('web/app-security-runtime.js', [
  'function sessionUnlocked(){return unlocked||window.AbuBassamSecurity?.isOfflineSession?.()===true}',
  "if(!navigator.onLine||!cloud()?.isConnected?.())throw new Error(",
  "void window.AbuBassamSecurity?.unlockWithBiometric?.()",
  "if(need&&!window.AbuBassamSecurity?.can?.(need))",
]);
need('web/app-security-runtime.js', ["if(!confirm('تسجيل الخروج من هذا الجهاز؟'))return false;"]);
need('web/security-hardening-runtime.js', [
  'offlineRevalidationEpoch=epoch',
  'if(offlineRevalidationPending&&offlineRevalidationEpoch===offlineEpoch)',
  "if(event?.detail?.state==='locked'){if(offlineSession)clearOfflineState();else offlineEpoch++;}",
  'if(baseLogout)sec.logout=async function(...args){const didLogout=await baseLogout(...args);',
  'if(startEpoch!==offlineEpoch)',
]);
forbid('web/security-hardening-runtime.js', [
  'await clearTrust();clearOfflineState();return baseLogout(...args)'
]);
need('web/security-hardening-runtime.js', [
  'if(offlineSession)return sec?.__offlineRole',
  'if(offlineSession)return sec?.__offlineTrust',
  'if(offlineSession){if(sec?.__offlineRole',
  'sec.isOfflineSession=()=>offlineSession',
  "state:'unlocked',offline:true,device:trust",
]);

// Behavior tests, not just source markers: reject network errors from the
// credential lockout counter and verify secure-device-key persistence.
const authSource=read('web/app-security-runtime.js');
async function verifyAuthStartupAndSecret(){
  const credentialStart=authSource.indexOf('function isCredentialFailure(error){');
  const credentialEnd=authSource.indexOf('function authError(error){',credentialStart);
  if(credentialStart<0||credentialEnd<0)throw new Error('credential classifier not found');
  const classify=vm.runInNewContext('('+authSource.slice(credentialStart,credentialEnd).trim()+')');
  const cases=[
    [{code:'invalid_credentials',message:'Invalid login credentials'},true],
    [{message:'Invalid login credentials'},true],
    [{code:'network_error',message:'Failed to fetch'},false],
    [{code:'over_request_rate_limit',message:'Too many requests'},false],
    [{code:'email_not_confirmed',message:'Email not confirmed'},false]
  ];
  for(const [error,expected] of cases)if(classify(error)!==expected)
    throw new Error('credential classifier miscounted '+String(error.code||error.message));

  const secretStart=authSource.indexOf('async function getSecret(){');
  const secretEnd=authSource.indexOf('async function getBiometricEnabled()',secretStart);
  if(secretStart<0||secretEnd<0)throw new Error('secure device secret routine not found');
  const secretTest=`
    let deviceSecret='',deviceSecretPending=null;
    const SECRET_KEY='test-key';
    let store='',failWrite=true,writes=0;
    function randomSecret(){return 'verified-device-secret'}
    async function nativeRequest(action,payload){
      if(action==='secureGet')return store;
      if(action==='secureSet'){
        writes+=1;
        if(failWrite)throw new Error('WRITE_FAILED');
        store=payload.value;return true
      }
      throw new Error('UNEXPECTED_NATIVE_ACTION')
    }
    `+authSource.slice(secretStart,secretEnd)+`
    (async()=>{
      let rejected=false;
      try{await getSecret()}catch(error){rejected=error.message==='WRITE_FAILED'}
      if(!rejected||deviceSecret||deviceSecretPending)throw new Error('failed SecureStore write was cached');
      failWrite=false;
      const both=await Promise.all([getSecret(),getSecret()]);
      if(both[0]!=='verified-device-secret'||both[1]!==both[0]||writes!==2)
        throw new Error('parallel SecureStore requests created inconsistent device secrets');
      return true
    })()
  `;
  await vm.runInNewContext(secretTest,{Promise,Error});

  const handshakeStart=authSource.indexOf('let resolveSecurityBoot,rejectSecurityBoot;');
  const handshakeEnd=authSource.lastIndexOf('})();');
  if(handshakeStart<0||handshakeEnd<handshakeStart)throw new Error('security startup handshake missing');
  const handshake=authSource.slice(handshakeStart,handshakeEnd);
  for(const gateReady of [true,false]){
    const w={},ctx={
      window:w,Promise,Error,
      document:{readyState:'complete',getElementById:()=>gateReady?{}:null},
      boot:async()=>true
    };
    vm.runInNewContext(handshake,ctx);
    let success=false;
    try{await w.__ABU_SECURITY_BOOT_PROMISE__;success=true}catch(error){}
    if(success!==gateReady)throw new Error('security boot handshake accepted an absent login gate');
  }
  // Reproduce a stale base owner session while a different verified offline
  // secondary session is active. Neither role, device nor permissions may leak.
  const hardening=read('web/security-hardening-runtime.js');
  const effectiveBegin=hardening.indexOf('function effectiveRole(){');
  const effectiveEnd=hardening.indexOf('async function refreshLimit()',effectiveBegin);
  if(effectiveBegin<0||effectiveEnd<=effectiveBegin)throw new Error('effective offline authorization functions missing');
  const secondary={role:'secondary',device_id:'verified-secondary',permissions:{cardsPrint:false,cardsEdit:true}};
  const staleOwner={role:'owner',device_id:'old-online-owner'};
  const mockWindow={AbuBassamSecurity:{
    __baseDevice:()=>staleOwner,__baseCan:()=>true,
    __offlineRole:'secondary',__offlineTrust:secondary,
    __offlinePermissions:secondary.permissions
  }};
  const roleContext={window:mockWindow,offlineSession:true};
  vm.runInNewContext(hardening.slice(effectiveBegin,effectiveEnd)+';var result={role:effectiveRole(),device:effectiveDevice(),print:effectiveCan("cardsPrint"),edit:effectiveCan("cardsEdit")}',roleContext);
  if(roleContext.result.role!=='secondary'||roleContext.result.device.device_id!=='verified-secondary'||roleContext.result.print!==false||roleContext.result.edit!==true)
    throw new Error('verified offline secondary privileges were replaced by stale owner data');
  roleContext.offlineSession=false;
  vm.runInNewContext('result={role:effectiveRole(),device:effectiveDevice(),print:effectiveCan("cardsPrint")}',roleContext);
  if(roleContext.result.role!=='owner'||roleContext.result.device.device_id!=='old-online-owner'||roleContext.result.print!==true)
    throw new Error('online authorization did not return to its base implementation');
  // The original biometric handler must not perform unsigned offline login.
  const originalBio=authSource.slice(authSource.indexOf('async function unlockWithBiometric(){'),authSource.indexOf('function lock(reason='));
  if(originalBio.includes('offlineAllowed()')||originalBio.includes('localTrust()'))
    throw new Error('legacy biometric bypass remains reachable');
  // The real logout implementation must not change state on Cancel, and
  // must close the gate before any slow asynchronous network sign-out.
  const logoutBegin=authSource.indexOf('async function logout(){');
  const logoutEnd=authSource.indexOf('function lockNow(){',logoutBegin);
  if(logoutBegin<0||logoutEnd<=logoutBegin)throw new Error('logout source missing');
  const makeLogout=vm.runInNewContext(
    '(confirm,cloud,showGate,log)=>{let currentDevice={role:"owner"},unlocked=true;'
    +authSource.slice(logoutBegin,logoutEnd)+';return{logout,state:()=>unlocked}}');
  let logoutCalled=0,gateClosed=0;
  const cancelLogout=makeLogout(()=>false,()=>({client:{auth:{signOut:async()=>{logoutCalled++}}}}),()=>{gateClosed++},()=>{});
  if((await cancelLogout.logout())!==false||logoutCalled||gateClosed||cancelLogout.state()!==true)
    throw new Error('Cancel destroyed the current login');
  let releaseLogout=()=>{};
  const slowSignout=()=>new Promise(resolve=>{releaseLogout=resolve});
  const acceptLogout=makeLogout(()=>true,()=>({client:{auth:{signOut:slowSignout}}}),()=>{gateClosed++},()=>{});
  const pendingLogout=acceptLogout.logout();
  if(gateClosed!==1||acceptLogout.state()!==false)throw new Error('logout did not lock UI before sign-out');
  releaseLogout();
  if((await pendingLogout)!==true)throw new Error('confirmed logout did not complete');

  const hardenedLogoutLine=hardening.split('\n').find(line=>line.includes('if(baseLogout)sec.logout=async function'));
  if(!hardenedLogoutLine)throw new Error('secure logout wrapper missing');
  const wrapLogout=vm.runInNewContext('(baseLogout,clearTrust,clearOfflineState)=>{const sec={};'
    +hardenedLogoutLine+';return sec.logout}');
  let trustErases=0,stateResets=0,wasConfirmed=false;
  const safeLogout=wrapLogout(async()=>wasConfirmed,async()=>{trustErases++},()=>{stateResets++});
  await safeLogout();
  if(trustErases||stateResets)throw new Error('canceled logout erased the offline trust');
  wasConfirmed=true;
  await safeLogout();
  if(trustErases!==1||stateResets!==1)throw new Error('confirmed logout kept offline access');

  // Actual signed offline gate: reconnect, expiration, double click and
  // locking while a biometric challenge is open must not bypass access checks.
  const unlockStart=hardening.indexOf('async function secureOfflineUnlock(){');
  const unlockStop=hardening.indexOf('function effectiveRole(){',unlockStart);
  if(unlockStart<0||unlockStop<=unlockStart)throw new Error('offline unlock source missing');
  const makeGate=vm.runInNewContext('(deps)=>{'
    +'let offlineSession=false,offlineEpoch=0,offlineBackgroundAt=0,offlineUnlockPending=null;'
    +'const {$,online,loadTrust,biometricCheck,applyOfflineDevice,document,window,CustomEvent,OFFLINE_GRACE_MS}=deps;'
    +hardening.slice(unlockStart,unlockStop)
    +';return {unlock:secureOfflineUnlock,invalidate:()=>{offlineEpoch++}}}');
  const verifiedTrust={device_id:'phone-1',device_name:'Android',role:'secondary',permissions:{cardsPrint:false}};
  function makeScenario(options={}){
    let connected=false,grants=0,hidden=false,reads=0;
    const elements={
      abuLoginError:{textContent:''},abuLoginDevice:{textContent:''},
      abuSecurityGate:{classList:{add:()=>{hidden=true}}}
    };
    const gate=makeGate({
      $:id=>elements[id],online:()=>connected,
      loadTrust:async()=>{reads++;return options.trust?options.trust(reads):verifiedTrust},
      biometricCheck:options.bio||(async()=>true),
      applyOfflineDevice:()=>{grants++},document:{dispatchEvent:()=>{}},
      window:{AbuBassamOps:{add:()=>{}}},
      CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},
      OFFLINE_GRACE_MS:43200000
    });
    return {gate,connect:()=>{connected=true},state:()=>({grants,hidden})}
  }
  const acceptedTrust=makeScenario();
  if((await acceptedTrust.gate.unlock())!==true||acceptedTrust.state().grants!==1)
    throw new Error('valid signed offline trust rejected after fingerprint');
  const networkReturns=makeScenario({bio:async()=>{networkReturns.connect()}});
  if((await networkReturns.gate.unlock())!==false||networkReturns.state().grants||networkReturns.state().hidden)
    throw new Error('offline session opened after online network restored');
  const expiredTrust=makeScenario({trust:read=>read===1?verifiedTrust:null});
  if((await expiredTrust.gate.unlock())!==false||expiredTrust.state().grants)
    throw new Error('expired offline trust was accepted');
  let finishBiometric=null,promptCount=0;
  const doubleTap=makeScenario({bio:()=>{promptCount++;return new Promise(resolve=>{finishBiometric=resolve})}});
  const firstTap=doubleTap.gate.unlock(),secondTap=doubleTap.gate.unlock();
  for(let attempt=0;attempt<5&&!finishBiometric;attempt++)await Promise.resolve();
  if(!finishBiometric)throw new Error('biometric prompt was not started');
  finishBiometric();
  const bothTaps=await Promise.all([firstTap,secondTap]);
  if(promptCount!==1||bothTaps.some(value=>value!==true)||doubleTap.state().grants!==1)
    throw new Error('concurrent biometric prompts were not deduplicated');
  let finishLockedBiometric=null;
  const userLocked=makeScenario({bio:()=>new Promise(resolve=>{finishLockedBiometric=resolve})});
  const lockedRequest=userLocked.gate.unlock();
  for(let attempt=0;attempt<5&&!finishLockedBiometric;attempt++)await Promise.resolve();
  if(!finishLockedBiometric)throw new Error('locking biometric prompt not started');
  userLocked.gate.invalidate();
  finishLockedBiometric();
  if((await lockedRequest)!==false||userLocked.state().grants)
    throw new Error('canceled fingerprint reopened a locked session');

  // A delayed RPC from a previous session may arrive after its lock/logout.
  // Only the matching offline epoch may restore an authorized device.
  const validationStart=hardening.indexOf('async function revalidateOfflineSession(){');
  const validationStop=hardening.indexOf('function patchSecurity(){',validationStart);
  if(validationStart<0||validationStop<=validationStart)throw new Error('offline RPC source missing');
  const makeRevalidation=vm.runInNewContext('(deps)=>{'
    +'let offlineSession=true,offlineEpoch=1,offlineRevalidationPending=null,offlineRevalidationEpoch=-1;'
    +'const {online,window,nativeRequest,SECRET_KEY,currentId,APP_VERSION,normalizeDevice,applyOfflineDevice,seal,lockOffline}=deps;'
    +hardening.slice(validationStart,validationStop)
    +';return{check:revalidateOfflineSession,invalidate:()=>{offlineEpoch++;offlineSession=false}}}');
  let finishRpc=null,rpcCalls=0,roleUpdates=0,reseals=0;
  const staleResponse=makeRevalidation({
    online:()=>true,
    window:{
      AbuBassamSecurity:{__offlineTrust:verifiedTrust},
      AbuBassamCloud:{client:{rpc:()=>{
        rpcCalls++;return new Promise(resolve=>{finishRpc=resolve})
      }}}
    },
    nativeRequest:async()=>'secret',SECRET_KEY:'test-secret',
    currentId:()=>verifiedTrust.device_id,APP_VERSION:'4.3.2',
    normalizeDevice:value=>value,applyOfflineDevice:()=>{roleUpdates++},
    seal:async()=>{reseals++},lockOffline:()=>{}
  });
  const firstServerCheck=staleResponse.check(),secondServerCheck=staleResponse.check();
  for(let attempt=0;attempt<6&&!finishRpc;attempt++)await Promise.resolve();
  if(!finishRpc)throw new Error('device RPC check never started');
  staleResponse.invalidate();
  finishRpc({data:{...verifiedTrust,active:true},error:null});
  const serverResults=await Promise.all([firstServerCheck,secondServerCheck]);
  if(serverResults.some(value=>value!==false)||rpcCalls!==1||roleUpdates||reseals)
    throw new Error('late device RPC reauthorized a locked session');

  // A synchronous Android postMessage failure must release its native request
  // immediately. Malformed native callbacks must not crash the dispatcher.
  const sync=read('web/secure-sync-runtime.js');
  const bridgeBegin=sync.indexOf('  const nativePending = new Map();');
  const bridgeEnd=sync.indexOf('  async function authNative(',bridgeBegin);
  if(bridgeBegin<0||bridgeEnd<=bridgeBegin)throw new Error('native security dispatcher missing');
  const factory=vm.runInNewContext(`(window,Android,setTimeout,clearTimeout)=>{
    ${sync.slice(bridgeBegin,bridgeEnd)}
    return {pending:nativePending,request:nativeRequest,result:window.AbuBassamNativeSecurityResult}
  }`);
  const timers=new Map();
  let nextTimer=0;
  const schedule=fn=>{const id=++nextTimer;timers.set(id,fn);return id};
  const cancel=id=>timers.delete(id);
  const throwingAndroid={security(){throw new Error('BRIDGE_SEND_FAILED')}};
  const throwing=factory({Android:throwingAndroid},throwingAndroid,schedule,cancel);
  let rejected=false;
  try{await throwing.request('secureGet',{key:'test'})}
  catch(error){rejected=error.message==='BRIDGE_SEND_FAILED'}
  if(!rejected||throwing.pending.size||timers.size)throw new Error('sync Android bridge failure leaked pending request');
  let requestId='';
  const goodAndroid={security(action,id){requestId=id}};
  const working=factory({Android:goodAndroid},goodAndroid,schedule,cancel);
  const request=working.request('secureGet',{key:'test'});
  for(const malformed of ['null','0','[]','{invalid']){
    try{working.result(malformed)}
    catch(error){throw new Error('malformed native response crashed dispatcher')}
  }
  working.result({requestId,ok:true,value:'verified'});
  if((await request)!=='verified'||working.pending.size||timers.size)
    throw new Error('native response was not resolved and cleaned up');
}
verifyAuthStartupAndSecret().then(()=>{
  if(failures.length){process.stderr.write(failures.join('\n')+'\n');process.exitCode=1;return}
  console.log('Security/control checks passed: secure offline login, concurrent biometric challenges, logout cancellation, stale RPC permissions, SecureStore and startup.');
}).catch(error=>{failures.push('auth/startup behavior: '+error.message);process.stderr.write(failures.join('\n')+'\n');process.exitCode=1});
