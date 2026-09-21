const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const failures=[];
const need=(file,markers)=>{const source=read(file);for(const marker of markers)if(!source.includes(marker))failures.push(`${file}: missing ${marker}`)};
const forbid=(file,markers)=>{const source=read(file);for(const marker of markers)if(source.includes(marker))failures.push(`${file}: forbidden ${marker}`)};

need('index.js',['expo-local-authentication','expo-secure-store','expo-screen-capture','LocalAuthentication.authenticateAsync','SecureStore.setItemAsync','ScreenCapture.preventScreenCaptureAsync','ScreenCapture.allowScreenCaptureAsync',"action === 'privacyMode'",'BackHandler.exitApp','AbuBassamNativeBackPress','AbuBassamNativeAppState','STARTUP_WATCHDOG_MS',"originWhitelist={['file://*','about:*']}",'mixedContentMode="never"','onShouldStartLoadWithRequest']);
forbid('index.js',["originWhitelist={['*']}",'mixedContentMode="always"']);
need('web/app-security-runtime.js',["MAIN_USERNAME='akrama1992'",'MAX_DEVICES=5','abu_bassam_register_device','abu_bassam_manage_device','abu_bassam_remove_device','SECONDARY_DEFAULT','OWNER_PERMISSIONS','toggleBiometric','appearanceSync','اضغط مرة ثانية للخروج']);
need('web/security-extras-runtime.js',['verifyDangerPin','changePassword','abuBassamEmergencySnapshotV1','safeSnapshot','restoreSnapshot',"nativeRequest('privacyMode'",'خصوصية عالية','تسجيل الخروج']);
need('web/login-throttle-fix-runtime.js',['__ABU_LOGIN_THROTTLE_FIX_V2__','loginBusy','legacyInstalled','credentialFailure(message)','deviceOrPostAuthFailure(message)','recordCredentialFailure','attributeFilter']);
need('web/login-input-direction-runtime.js',["setAttribute('dir','ltr')","setAttribute('lang','en')","setAttribute('autocapitalize','off')","setAttribute('spellcheck','false')"]);
need('web/permission-guard-runtime.js',['__ABU_PERMISSION_GUARD_V1__',"return'print'","return'export'","return'appearance'","return'sync'","return'edit'",'beforeinput','stopImmediatePropagation']);
need('web/device-name-runtime.js',['app-security-runtime.js','security-extras-runtime.js','permission-guard-runtime.js','login-throttle-fix-runtime.js','login-input-direction-runtime.js']);

const packageJson=JSON.parse(read('package.json'));
for(const dep of ['expo-local-authentication','expo-secure-store','expo-screen-capture'])if(!packageJson.dependencies?.[dep])failures.push(`package.json: missing ${dep}`);
const production=['index.js','web/app-security-runtime.js','web/security-extras-runtime.js','web/permission-guard-runtime.js','web/login-throttle-fix-runtime.js','web/device-name-runtime.js'].map(read).join('\n');
for(const marker of [['service','role'].join('_'),['sb','secret',''].join('_'),['BEGIN','PRIVATE','KEY'].join(' ')])if(production.toLowerCase().includes(marker.toLowerCase()))failures.push(`Sensitive server credential marker found in production security source: ${marker}`);
if(failures.length){process.stderr.write(failures.join('\n')+'\n');process.exit(1)}
process.stdout.write('Security/control checks passed: biometrics, SecureStore, privacy, device roles, guarded permissions, single-attempt login repair, LTR credentials, and local-only WebView navigation.\n');
