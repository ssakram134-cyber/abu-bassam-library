const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),failures=[];
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const need=(file,markers)=>{const s=read(file);for(const m of markers)if(!s.includes(m))failures.push(`${file}: missing ${m}`)};
const forbid=(file,markers)=>{const s=read(file);for(const m of markers)if(s.includes(m))failures.push(`${file}: forbidden ${m}`)};

need('index.js',['expo-local-authentication','expo-secure-store','expo-screen-capture','SecureStore.setItemAsync','ScreenCapture.preventScreenCaptureAsync',"action === 'privacyMode'",'AbuBassamNativeSecurityResult',"message.type === 'webBootReady'",'STARTUP_WATCHDOG_MS = 12000',"originWhitelist={['file://*','about:*']}",'mixedContentMode="never"']);
forbid('index.js',["originWhitelist={['*']}",'mixedContentMode="always"','onLoad={() => setWebReady(true)}','onLoadEnd={() => setWebReady(true)}']);

need('web/secure-sync-runtime.js',['window.AbuBassamNativeSecurityResult','window.AbuBassamNativeSecurity = { request: nativeRequest, available: nativeAvailable }','storage: authStorage','registerVaultAdapter','VAULT_GATEWAY_NOT_READY']);
forbid('web/secure-sync-runtime.js',["localStorage.getItem('__dev_secure_'","upsert('operation'","upsert('device'"]);

need('web/app-security-runtime.js',["MAIN_USERNAME='akrama1992'",'abu_bassam_register_device','SECONDARY_DEFAULT={edit:false','ATTEMPT_KEY','recordCredentialFailure','clearCredentialFailures',"signOut({scope:'local'})",'AbuBassamNativeSecurity',"if(document.visibilityState==='hidden')return",'if(unlocked){touchDevice();']);
forbid('web/app-security-runtime.js',['window.AbuBassamNativeSecurityResult=function',"localStorage.getItem('__dev_secure_'"]);

need('web/security-bootstrap-guard-runtime.js',['LEGACY_SECRET_PREFIX','wipeLegacySecretStorage','installLegacySecretStorageBlock','localStorage.removeItem(LEGACY_TRUST_KEY)','stopImmediatePropagation']);
need('web/security-hardening-runtime.js',["SECURE_TRUST_KEY='abu_bassam_offline_trust_v2'","name:'HMAC',hash:'SHA-256'",'constantTime(expected,env.mac)','OFFLINE_GRACE_MS=12*60*60*1000','AbuBassamNativeSecurity']);
forbid('web/security-hardening-runtime.js',['window.AbuBassamNativeSecurityResult']);
need('web/security-extras-runtime.js',['verifyDangerPin','changePassword','safeSnapshot','restoreSnapshot',"nativeRequest('privacyMode'",'v.length<12','AbuBassamNativeSecurity']);
forbid('web/security-extras-runtime.js',['window.AbuBassamNativeSecurityResult','__dev_secure_']);
need('web/password-policy-runtime.js',['v.length<12','enforceSignup',"setAttribute('minlength','12')","c.auth.updateUser({password:next})"]);
need('web/login-input-direction-runtime.js',["setAttribute('dir','ltr')","setAttribute('autocapitalize','off')","setAttribute('spellcheck','false')"]);
need('web/device-name-runtime.js',['script.async=false','await loadSecurity();','await loadBranchVault();','await loadAccountCenter();','signalBootReady()']);
forbid('web/device-name-runtime.js',['login-throttle-fix-runtime.js','fail-closed-runtime.js',"cloud.list('device')"]);
need('web/device-reconcile-runtime.js',['abu_bassam_owner_devices','abu_bassam_owner_device_count','abu_bassam_set_device_limit','AbuBassamNativeSecurity']);
forbid('web/device-reconcile-runtime.js',['window.AbuBassamNativeSecurityResult','__dev_secure_']);

const web=path.join(root,'web'),nativeOwners=[];
for(const name of fs.readdirSync(web).filter(n=>n.endsWith('.js'))){const s=fs.readFileSync(path.join(web,name),'utf8');if(s.includes('window.AbuBassamNativeSecurityResult'))nativeOwners.push(name)}
if(nativeOwners.length!==1||nativeOwners[0]!=='secure-sync-runtime.js')failures.push('exactly secure-sync-runtime.js must own AbuBassamNativeSecurityResult; found '+nativeOwners.join(','));

for(const file of ['web/secure-sync-runtime.js','web/app-security-runtime.js','web/security-bootstrap-guard-runtime.js','web/security-hardening-runtime.js','web/security-extras-runtime.js','web/device-name-runtime.js','web/device-reconcile-runtime.js'])try{new vm.Script(read(file),{filename:file})}catch(e){failures.push(file+': syntax '+e.message)}
for(const dep of ['expo-local-authentication','expo-secure-store','expo-screen-capture'])if(!JSON.parse(read('package.json')).dependencies?.[dep])failures.push('package.json missing '+dep);
if(failures.length){process.stderr.write(failures.join('\n')+'\n');process.exit(1)}
console.log('Security/control checks passed: one native security dispatcher, SecureStore-backed auth/device secrets, fail-closed device and vault authorization, deterministic startup, core login throttling, HMAC offline trust, and no legacy patch runtimes.');
