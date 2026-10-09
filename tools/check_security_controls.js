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

  // A SecureStore write may finish after logout started. Deletion must
  // serialize after that write; unfinished HMAC work must not reseal trust.
  const trustWriteBegin=hardening.indexOf('let trustEpoch=0');
  const trustWriteEnd=hardening.indexOf('async function loadTrust(){',trustWriteBegin);
  const trustDeleteBegin=hardening.indexOf('async function clearTrust(){',trustWriteEnd);
  const trustDeleteEnd=hardening.indexOf('async function biometricCheck(){',trustDeleteBegin);
  if([trustWriteBegin,trustWriteEnd,trustDeleteBegin,trustDeleteEnd].some(x=>x<0))
    throw new Error('offline SecureStore trust serialization code missing');
  const buildTrust=vm.runInNewContext('(options)=>{'
    +'let lastSealAt=0,offlineEpoch=0,offlineSession=false,saved=null,writes=0,deletes=0,marker=null;'

    +'const SECRET_KEY="secret",SECURE_TRUST_KEY="trust",TRUST_REVOCATION_KEY="revocation",'
    +'localStorage={getItem:()=>marker,setItem:()=>{if(options.failMarker)throw new Error("STORAGE_UNAVAILABLE");marker="1"},removeItem:()=>{marker=null}},'
    +'window={AbuBassamSecurity:{isOnlineUnlocked:()=>true}},'
    +'nativeAvailable=()=>true,online=()=>true,currentId=()=>"phone",'
    +'normalizeDevice=value=>value,cleanLegacy=()=>{},console={warn(){}},'
    +'nativeRequest=async(action,payload)=>{'
    +'if(action==="secureGet")return "secret-key";'
    +'if(action==="secureSet"){writes++;if(options.waitWrite)await options.waitWrite();saved=payload.value;return true}'
    +'if(action==="secureDelete"){deletes++;if(options.failDelete)throw new Error("SECURESTORE_DELETE_FAILED");saved=null;return true}},'
    +'hmac=async()=>options.waitMac?await options.waitMac():"signed";'
    +hardening.slice(trustWriteBegin,trustWriteEnd)
    +hardening.slice(trustWriteEnd,hardening.indexOf('async function clearTrust(){',trustWriteEnd))
    +hardening.slice(trustDeleteBegin,trustDeleteEnd)
    +';return{seal,clearTrust,loadTrust,state:()=>({lastSealAt,writes,deletes,saved,marker})}}');
  let finishWrite=null;
  const pendingWrite=buildTrust({waitWrite:()=>new Promise(resolve=>{finishWrite=resolve})});
  const writing=pendingWrite.seal({device_id:'phone',active:true});
  for(let i=0;i<12&&!finishWrite;i++)await Promise.resolve();
  if(!finishWrite)throw new Error('SecureStore seal did not start');
  const deleting=pendingWrite.clearTrust();
  if(pendingWrite.state().deletes!==0)
    throw new Error('SecureStore deletion jumped ahead of pending seal');
  finishWrite();
  await Promise.all([writing,deleting]);
  const ended=pendingWrite.state();
  if(ended.saved!==null||ended.deletes!==1||ended.writes!==1||ended.lastSealAt!==0)
    throw new Error('offline trust resurrected or marked sealed after logout');
  let finishMac=null;
  const delayedMac=buildTrust({waitMac:()=>new Promise(resolve=>{finishMac=resolve})});
  const signing=delayedMac.seal({device_id:'phone',active:true});
  for(let i=0;i<12&&!finishMac;i++)await Promise.resolve();
  if(!finishMac)throw new Error('HMAC test was never started');
  await delayedMac.clearTrust();
  finishMac('signed');
  if(await signing!==false||delayedMac.state().writes!==0||
    delayedMac.state().saved!==null)
    throw new Error('revoked offline trust resealed after delayed HMAC');
  const deletionFailure=buildTrust({failDelete:true});
  if(await deletionFailure.seal({device_id:'phone',active:true})!==true)
    throw new Error('failed deletion test could not create trust');
  await deletionFailure.clearTrust();
  const failedState=deletionFailure.state();
  if(failedState.marker!=='1'||!failedState.saved||
    await deletionFailure.loadTrust()!==null)
    throw new Error('SecureStore deletion failure allowed old signed trust to open offline');
  if(await deletionFailure.seal({device_id:'phone',active:true})!==true||
    deletionFailure.state().marker!==null)
    throw new Error('verified online login failed to replace revoked offline trust');

  const storageFailure=buildTrust({failDelete:true,failMarker:true});
  if(await storageFailure.seal({device_id:'phone',active:true})!==true)
    throw new Error('storage-failure fixture could not create signed trust');
  await storageFailure.clearTrust();
  if(storageFailure.state().marker!==null||
    await storageFailure.loadTrust()!==null)
    throw new Error('failed localStorage write bypassed in-memory offline revocation');

  const normalTrust=buildTrust({});
  if(await normalTrust.seal({device_id:'phone',active:true})!==true||
    normalTrust.state().writes!==1||!normalTrust.state().saved)
    throw new Error('online owner cannot establish legitimate signed offline trust');

  const effectiveBegin=hardening.indexOf('function effectiveRole(){');
  const effectiveEnd=hardening.indexOf('async function refreshLimit()',effectiveBegin);
  if(effectiveBegin<0||effectiveEnd<=effectiveBegin)throw new Error('effective offline authorization functions missing');
  const secondary={role:'secondary',device_id:'verified-secondary',permissions:{cardsPrint:false,cardsEdit:true}};
  const staleOwner={role:'owner',device_id:'old-online-owner'};
  const mockWindow={AbuBassamSecurity:{
    __baseDevice:()=>staleOwner,__baseCan:()=>true,isOnlineUnlocked:()=>mockWindow.onlineOpen===true,
    __offlineRole:'secondary',__offlineTrust:secondary,
    __offlinePermissions:secondary.permissions
  }};
  mockWindow.onlineOpen=true;
  const roleContext={window:mockWindow,offlineSession:true};
  vm.runInNewContext(hardening.slice(effectiveBegin,effectiveEnd)+';var result={role:effectiveRole(),device:effectiveDevice(),print:effectiveCan("cardsPrint"),edit:effectiveCan("cardsEdit")}',roleContext);
  if(roleContext.result.role!=='secondary'||roleContext.result.device.device_id!=='verified-secondary'||roleContext.result.print!==false||roleContext.result.edit!==true)
    throw new Error('verified offline secondary privileges were replaced by stale owner data');
  roleContext.offlineSession=false;
  vm.runInNewContext('result={role:effectiveRole(),device:effectiveDevice(),print:effectiveCan("cardsPrint")}',roleContext);
  if(roleContext.result.role!=='owner'||roleContext.result.device.device_id!=='old-online-owner'||roleContext.result.print!==true)
    throw new Error('online authorization did not return to its base implementation');
  mockWindow.onlineOpen=false;
  vm.runInNewContext('result={role:effectiveRole(),device:effectiveDevice(),print:effectiveCan("cardsPrint")}',roleContext);
  if(roleContext.result.role!==''||roleContext.result.device!==null||roleContext.result.print!==false)
    throw new Error('locked online gate leaked stale owner permissions');
  mockWindow.onlineOpen=true;
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
    '(confirm,cloud,showGate,log,securityApi)=>{const window={AbuBassamSecurity:securityApi};let currentDevice={role:"owner"},unlocked=true;'
    +authSource.slice(logoutBegin,logoutEnd)+';return{logout,state:()=>unlocked}}');
  let logoutCalled=0,gateClosed=0;
  const cancelLogout=makeLogout(()=>false,()=>({client:{auth:{signOut:async()=>{logoutCalled++}}}}),()=>{gateClosed++},()=>{},{clearOfflineTrust:async()=>{logoutCalled++}});
  if((await cancelLogout.logout())!==false||logoutCalled||gateClosed||cancelLogout.state()!==true)
    throw new Error('Cancel destroyed the current login');
  let releaseLogout=null,offlineTrustRevoked=0;
  const slowSignout=()=>new Promise(resolve=>{releaseLogout=resolve});
  const acceptLogout=makeLogout(()=>true,()=>({client:{auth:{signOut:slowSignout}}}),()=>{gateClosed++},()=>{},
    {clearOfflineTrust:async()=>{offlineTrustRevoked++}});
  const pendingLogout=acceptLogout.logout();
  if(gateClosed!==1||acceptLogout.state()!==false||offlineTrustRevoked!==1)
    throw new Error('confirmed logout failed to gate UI and revoke trust before network signout');
  for(let i=0;i<5&&!releaseLogout;i++)await Promise.resolve();
  if(!releaseLogout)throw new Error('network signout did not start after local trust revocation');
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

  // Verify device RPC decisions on the actual shipped auth functions:
  // missing/disabled rows are not valid logins, while slow responses from
  // an older unlocked session cannot restore roles after a lock/logout.
  const deviceBegin=authSource.indexOf('async function registerDevice(){');
  const deviceEnd=authSource.indexOf('function loginRemaining(){',deviceBegin);
  if(deviceBegin<0||deviceEnd<=deviceBegin)throw new Error('device RPC authorization functions missing');
  const makeDevice=vm.runInNewContext('(options)=>{'
    +'let currentDevice={role:"owner",active:true},deviceSessionEpoch=0,deviceTouchSeq=0,unlocked=true,locks=[],renders=0;'
    +'const client=()=>({rpc:options.rpc}),cloud=()=>({isConnected:()=>true}),navigator={onLine:true},'
    +'getSecret=async()=>"secret",ensureDeviceName=async()=>({id:"phone1",name:"device"}),'
    +'identity=()=>({id:"phone1"}),APP_VERSION="test",DEVICE_NAME_KEY="testkey",'
    +'deviceInfo={model:"Android",os:"Android",name:"Android"},'
    +'localStorage={getItem:()=>null,setItem:()=>{}},'
    +'normalizeDevice=value=>Array.isArray(value)?value[0]||null:value,'
    +'renderSecurityCard=()=>{renders++},emitSecurityState=()=>{},'
    +'lock=message=>{deviceSessionEpoch++;unlocked=false;locks.push(message)};'
    +authSource.slice(deviceBegin,deviceEnd)
    +';return {registerDevice,touchDevice,state:()=>({currentDevice,unlocked,locks,renders}),'
    +'forceLock:()=>{deviceSessionEpoch++;unlocked=false}}}');
  for(const [row,expected] of [[null,'DEVICE_NOT_AUTHORIZED'],[{active:false},'DEVICE_DISABLED']]){
    const app=makeDevice({rpc:async()=>({data:row,error:null})});
    let denied=false;
    try{await app.registerDevice()}catch(error){denied=error.message===expected}
    if(!denied||app.state().renders)throw new Error('unauthorized registration accepted: '+expected);
    const checking=makeDevice({rpc:async()=>({data:row,error:null})});
    await checking.touchDevice();
    if(checking.state().unlocked||checking.state().locks.length!==1)
      throw new Error('invalid device heartbeat failed to lock: '+expected);
  }
  const approved=makeDevice({rpc:async()=>({data:{active:true,role:'secondary'},error:null})});
  await approved.registerDevice();
  if(approved.state().currentDevice.role!=='secondary'||approved.state().renders!==1)
    throw new Error('valid secondary device registration rejected');
  const disconnected=makeDevice({rpc:async()=>{throw new Error('network unreachable')}});
  await disconnected.touchDevice();
  if(!disconnected.state().unlocked||disconnected.state().locks.length)
    throw new Error('transient network failure incorrectly disabled approved device');
  let reply=null;
  const stale=makeDevice({rpc:()=>new Promise(resolve=>{reply=resolve})});
  const oldHeartbeat=stale.touchDevice();
  for(let step=0;step<8&&!reply;step++)await Promise.resolve();
  if(!reply)throw new Error('device heartbeat did not reach RPC');
  stale.forceLock();
  reply({data:{active:true,role:'secondary'},error:null});
  await oldHeartbeat;
  if(stale.state().unlocked||stale.state().currentDevice.role!=='owner')
    throw new Error('late device RPC overwrote a locked session');

  const replies=[];const overlapping=makeDevice({rpc:()=>new Promise(resolve=>replies.push(resolve))});
  const firstTouch=overlapping.touchDevice();
  for(let i=0;i<8&&replies.length<1;i++)await Promise.resolve();
  const secondTouch=overlapping.touchDevice();
  for(let i=0;i<8&&replies.length<2;i++)await Promise.resolve();
  if(replies.length!==2)throw new Error('two device revalidations did not start');
  replies[1]({data:{active:true,role:'secondary',permissions:{cardsPrint:false}},error:null});
  await secondTouch;
  replies[0]({data:{active:true,role:'owner',permissions:{cardsPrint:true}},error:null});
  await firstTouch;
  if(overlapping.state().currentDevice.role!=='secondary'||
     overlapping.state().currentDevice.permissions.cardsPrint!==false)
    throw new Error('older device heartbeat restored revoked admin capabilities');

  // Test the shipped password/biometric handlers rather than a model of them:
  // explicit locking must invalidate in-flight authentication completions.
  const authAttemptStart=authSource.indexOf('async function login(){');
  const authAttemptEnd=authSource.indexOf('function lock(reason=',authAttemptStart);
  if(authAttemptStart<0||authAttemptEnd<=authAttemptStart)
    throw new Error('login/biometric cancellation source missing');
  const makeAttempt=vm.runInNewContext('(opts)=>{'
    +'let busy=false,unlocked=false,deviceSessionEpoch=1,currentDevice=null,signOuts=0,opens=0,registers=0;'
    +'const MAIN_USERNAME="akram",MAIN_EMAIL="akram@domain",'
    +'cloud=()=>({isConnected:()=>true}),'
    +'client=()=>({auth:{signInWithPassword:opts.signIn,signOut:async()=>{signOuts++}}}),'
    +'navigator={onLine:true},$=id=>({value:id==="abuLoginUser"?"akram":"validpass123"}),'
    +'loginRemaining=()=>0,formatWait=x=>String(x),recordCredentialFailure=()=>{},'
    +'setError=()=>{},authError=x=>String(x?.message||x),'
    +'isCredentialFailure=()=>false,clearCredentialFailures=()=>{},'
    +'fetchDeviceInfo=async()=>{},registerDevice=async()=>{registers++;currentDevice={role:"owner"}},'
    +'hideGate=()=>{opens++;unlocked=true},pullAppearanceIfNeeded=async()=>{},log=()=>{},'
    +'getBiometricEnabled=async()=>true,biometricStatus=async()=>({available:true,enrolled:true}),'
    +'biometricAuth=opts.biometric||(async()=>({success:true})),roleLabel=()=>currentDevice?.role||"";'
    +authSource.slice(authAttemptStart,authAttemptEnd)
    +';return {login,unlockWithBiometric,lock:()=>{deviceSessionEpoch++;unlocked=false},'
    +'state:()=>({opens,registers,signOuts,busy,unlocked})}}');
  let finishLogin=null;
  const oldLogin=makeAttempt({signIn:()=>new Promise(resolve=>{finishLogin=resolve})});
  const oldLoginWork=oldLogin.login();
  for(let i=0;i<8&&!finishLogin;i++)await Promise.resolve();
  if(!finishLogin)throw new Error('password auth race did not start');
  oldLogin.lock();
  finishLogin({data:{session:{id:'valid'}},error:null});
  await oldLoginWork;
  const oldStatus=oldLogin.state();
  if(oldStatus.opens!==0||oldStatus.signOuts!==1||oldStatus.busy)
    throw new Error('stale successful sign-in reopened the locked app or leaked Supabase session');
  const currentLogin=makeAttempt({signIn:async()=>({data:{session:{id:'valid'}},error:null})});
  await currentLogin.login();
  const accepted=currentLogin.state();
  if(accepted.opens!==1||accepted.registers!==1||accepted.signOuts!==0)
    throw new Error('current valid password sign-in failed');
  let finishBio=null;
  const oldBio=makeAttempt({signIn:async()=>({data:{session:{}},error:null}),
    biometric:()=>new Promise(resolve=>{finishBio=resolve})});
  const oldBioWork=oldBio.unlockWithBiometric();
  for(let i=0;i<8&&!finishBio;i++)await Promise.resolve();
  if(!finishBio)throw new Error('biometric auth race did not start');
  oldBio.lock();
  finishBio({success:true});
  await oldBioWork;
  const oldBioStatus=oldBio.state();
  if(oldBioStatus.opens||oldBioStatus.registers||oldBioStatus.busy)
    throw new Error('late biometric response reopened a locked app');

  // A removed secondary device must be revalidated, not silently
  // re-registered when a cloud auth event fires.
  if(!authSource.includes('onSessionChanged:async()=>{if(unlocked&&cloud()?.isConnected?.()&&navigator.onLine)await touchDevice()}'))
    throw new Error('auth change still registers a revoked device');

  // An old cloud appearance response must not apply a previous account's
  // theme after lock/logout; a failed upload must remain eligible for retry.
  const appearanceStart=authSource.indexOf('async function pushAppearance(){');
  const appearanceEnd=authSource.indexOf('async function appearanceSync(',appearanceStart);
  if(appearanceStart<0||appearanceEnd<=appearanceStart)
    throw new Error('appearance session fence missing');
  const makeAppearance=vm.runInNewContext('(opts)=>{'
    +'let unlocked=true,deviceSessionEpoch=1,appearanceStamp="",userId="owner1",pushes=0,applied=0;'
    +'const values=new Map([["abuBassamAppearanceSyncV1","1"],["theme","old"]]);'
    +'const APPEARANCE_SYNC_KEY="abuBassamAppearanceSyncV1",PREVIOUS_THEME_KEY="prev";'
    +'const localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value))};'
    +'const window={applyTheme:()=>{applied++},AbuBassamTypography:{applyApp:()=>{applied++}}};'
    +'const service={isConnected:()=>true,session:()=>({user:{id:userId}}),'
    +'upsert:async(...args)=>{pushes++;return opts.upsert?.(...args)},get:(...args)=>opts.get(...args)};'
    +'const cloud=()=>service,can=()=>true,currentRole=()=>"owner",'
    +'appearancePayload=()=>({theme:localStorage.getItem("theme")||"default",typography:{}});'
    +authSource.slice(appearanceStart,appearanceEnd)
    +';return{pull:pullAppearanceIfNeeded,push:pushAppearance,lock:()=>{unlocked=false;deviceSessionEpoch++},'
    +'changeUser:id=>{userId=id},state:()=>({theme:localStorage.getItem("theme"),pushes,applied,appearanceStamp})}}');
  for(const race of ['lock','switch']){
    let release=null;
    const app=makeAppearance({get:()=>new Promise(resolve=>{release=resolve})});
    const active=app.pull();
    for(let i=0;i<8&&!release;i++)await Promise.resolve();
    if(!release)throw new Error('appearance cloud read did not begin');
    if(race==='lock')app.lock();else app.changeUser('owner2');
    release({data:{theme:'foreign-account'}});
    await active;
    if(app.state().theme!=='old'||app.state().applied!==0)
      throw new Error('stale appearance response crossed a '+race+' boundary');
  }
  const validAppearance=makeAppearance({get:async()=>({data:{theme:'new'}})});
  await validAppearance.pull();
  if(validAppearance.state().theme!=='new'||validAppearance.state().applied!==1)
    throw new Error('valid appearance sync did not apply');
  let uploadFails=true;
  const retryable=makeAppearance({get:async()=>null,upsert:async()=>{
    if(uploadFails)throw new Error('NETWORK_UNAVAILABLE')
  }});
  await retryable.push();
  if(retryable.state().appearanceStamp!==''||retryable.state().pushes!==1)
    throw new Error('failed appearance sync was marked as completed');
  uploadFails=false;
  await retryable.push();
  if(retryable.state().pushes!==2||!retryable.state().appearanceStamp)
    throw new Error('failed theme upload never retried');

  const separateAccounts=makeAppearance({get:async()=>null,upsert:async()=>({ok:true})});
  await separateAccounts.push();
  separateAccounts.changeUser('owner2');
  await separateAccounts.push();
  if(separateAccounts.state().pushes!==2)
    throw new Error('appearance cache skipped synchronization for a different account');

  // Device revalidation can finish after an explicit lock. Its maintenance
  // continuation must not push or pull appearance on that locked session.
  const maintenanceBegin=authSource.indexOf('async function maintenanceTick(){');
  const maintenanceEnd=authSource.indexOf('function installMaintenance(){',maintenanceBegin);
  if(maintenanceBegin<0||maintenanceEnd<=maintenanceBegin)
    throw new Error('security maintenance handler missing');
  const maintenanceFactory=vm.runInNewContext('(deps)=>{'
    +'let maintenanceTimer=null;'
    +'const {document,unlockedState,epochState,touchDevice,localStorage,currentRole,pushAppearance,pullAppearanceIfNeeded,scheduleMaintenance}=deps;'
    +'const window={};'
    +'Object.defineProperty(window,"unused",{value:true});'
    +'return (async()=>{'
    +authSource.slice(maintenanceBegin,maintenanceEnd)
    .replace(/deviceSessionEpoch/g,'epochState()')
    .replace(/\bunlocked\b/g,'unlockedState()')
    +';return maintenanceTick})()'
    +'}');
  let stillOpen=true,epoch=1,finishTouch=null,pushCount=0,pullCount=0,scheduled=0;
  const runner=await maintenanceFactory({
    document:{visibilityState:'visible'},unlockedState:()=>stillOpen,epochState:()=>epoch,
    touchDevice:()=>new Promise(resolve=>{finishTouch=resolve}),
    localStorage:{getItem:()=> '1'},currentRole:()=> 'owner',
    pushAppearance:async()=>{pushCount++},pullAppearanceIfNeeded:async()=>{pullCount++},
    scheduleMaintenance:()=>{scheduled++}
  });
  const oldTick=runner();
  for(let i=0;i<8&&!finishTouch;i++)await Promise.resolve();
  if(!finishTouch)throw new Error('device heartbeat did not begin');
  epoch++;stillOpen=false;
  finishTouch();await oldTick;
  if(pushCount||pullCount||scheduled!==1)
    throw new Error('maintenance continued cloud changes after locking the app');

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
