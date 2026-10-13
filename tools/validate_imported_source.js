const fs=require('fs');
const path=require('path');
const cp=require('child_process');

const root=path.resolve(process.argv[2]||'.');
function fail(message){console.error('Source import rejected: '+message);process.exit(1)}
function readJson(rel){const file=path.join(root,rel);if(!fs.existsSync(file))fail(`missing ${rel}`);try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch(e){fail(`invalid JSON in ${rel}: ${e.message}`)}}
function read(rel){const file=path.join(root,rel);if(!fs.existsSync(file))fail(`missing ${rel}`);return fs.readFileSync(file,'utf8')}
function need(rel,markers){const text=read(rel);for(const marker of markers)if(!text.includes(marker))fail(`${rel} is missing required safeguard: ${marker}`);return text}
function forbid(rel,markers){const text=read(rel);for(const marker of markers)if(text.includes(marker))fail(`${rel} contains forbidden/downgraded behavior: ${marker}`);return text}
function walk(dir,out=[]){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isSymbolicLink())fail(`symbolic link is not allowed: ${path.relative(root,p)}`);if(entry.isDirectory()){if(!['node_modules','.git','dist','android','ios'].includes(entry.name))walk(p,out)}else out.push(p)}return out}

for(const rel of [
  'package.json','package-lock.json','app.json','index.js','index-auth.js','web/index.html','web/security-bootstrap-guard-runtime.js','web/security-hardening-runtime.js','web/security-extras-runtime.js','web/device-name-runtime.js','web/device-reconcile-runtime.js','web/secure-sync-runtime.js','web/app-security-runtime.js','web/branch-vault-runtime.js','web/backup-center-runtime.js','web/account-recovery-hardening-runtime.js',
  'web/questions-paper-runtime.js','web/questions-en-fixes-runtime.js','web/card-template-library.js','web/notification-excel-runtime.js',
  'scripts/build-android-local.mjs','scripts/prepare-android-assets.mjs','tools/check_project.js','tools/check_security_controls.js','tools/check_account_center.js','tools/check_fail_closed_runtime.js','tools/check_branch_private_vault.js','tools/check_backup_center.js','tools/check_web_audit_fixes.js','tools/check_tools_audit.js'
])if(!fs.existsSync(path.join(root,rel)))fail(`missing ${rel}`);
const pkg=readJson('package.json');
const lock=readJson('package-lock.json');
const app=readJson('app.json').expo||{};
if(pkg.name!=='abu-bassam-library-native')fail('unexpected package name');
if(pkg.version!=='4.3.2'||app.version!=='4.3.2')fail('version must remain 4.3.2 for this import workflow');
if(pkg.main!=='index-auth.js')fail('package main must remain index-auth.js so auth callbacks are captured before the native app entry');
if(app.slug!=='abu-bassam-library')fail('unexpected Expo slug');
if(app.android?.package!=='com.abubassam.librarycamera3')fail('unexpected Android package');
if(Number(app.android?.versionCode)!==432)fail('unexpected Android versionCode');
if(lock.name!==pkg.name||lock.version!==pkg.version)fail('package-lock identity/version does not match package.json');
if(pkg.engines?.node!=='>=20 <25')fail('Node engine must remain >=20 <25');
if(pkg.scripts?.['build:apk:local']!=='node scripts/build-android-local.mjs')fail('local APK test build command is missing or changed');
if(pkg.scripts?.['build:apk:release']!=='node scripts/build-android-local.mjs --require-release-key')fail('strict production APK build command is missing or changed');
const checkWeb=String(pkg.scripts?.['check:web']||'');
if(!checkWeb.startsWith('node tools/check_project.js'))fail('check:web must be read-only and start with tools/check_project.js');
if(/scripts\/patch-|repair:source/.test(checkWeb))fail('check:web must not repair or mutate source');
for(const checker of ['check_security_controls.js','check_account_center.js','check_fail_closed_runtime.js','check_branch_private_vault.js','check_backup_center.js'])if(!checkWeb.includes(`node tools/${checker}`))fail(`check:web missing mandatory security checker: ${checker}`);
for(const name of ['start','android','android:prebuild'])if(/scripts\/patch-/.test(String(pkg.scripts?.[name]||'')))fail(`${name} must not auto-patch canonical source`);
if(Object.prototype.hasOwnProperty.call(pkg.scripts||{},'repair:source'))fail('obsolete repair:source script must not return');
const buildScript=read('scripts/build-android-local.mjs');
for(const marker of ["process.argv.includes('--require-release-key')","ANDROID_KEYSTORE_FILE','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD'",'Production release signing is required.','SIGNING_CERTIFICATE.txt'])if(!buildScript.includes(marker))fail(`local APK signing safeguard missing: ${marker}`);
for(const name of ['preinstall','install','postinstall','prepare','prepublish','prepublishOnly'])if(pkg.scripts?.[name])fail(`npm lifecycle script is not allowed in imported source: ${name}`);

need('index.js',[
  'STARTUP_WATCHDOG_MS',"originWhitelist={['file://*','about:*']}",'mixedContentMode="never"','onShouldStartLoadWithRequest',"if (message.type === 'webBootReady')",
  'cameraFrameKind','cardDocumentFrame','photoDocumentFrame','openCamera(message.mode, message.frameKind)',
  'if (imagePages.length > 20)','const encodedNameMatch = raw.match(/;name=([^;]+);base64,/i);',
  'expo-secure-store','expo-local-authentication','expo-screen-capture'
]);
forbid('index.js',["originWhitelist={['*']}",'mixedContentMode="always"']);
need('index-auth.js',['validAuthCallback','base !== AUTH_CALLBACK_PREFIX','await SecureStore.setItemAsync(AUTH_CALLBACK_KEY, value)','lastCallback = value',"require('./index.js')"]);
forbid('index-auth.js',['.startsWith(AUTH_CALLBACK_PREFIX)']);
const authEntry=read('index-auth.js'),secureWrite=authEntry.indexOf('await SecureStore.setItemAsync(AUTH_CALLBACK_KEY, value)'),dedupeWrite=authEntry.indexOf('lastCallback = value');
if(secureWrite<0||dedupeWrite<secureWrite)fail('auth callback must be marked handled only after SecureStore write succeeds');
need('web/security-bootstrap-guard-runtime.js',['__ABU_SECURITY_BOOTSTRAP_GUARD_V1__','localStorage.removeItem(LEGACY_TRUST_KEY)','sec.offlineUnlock=denyLegacyOffline','stopImmediatePropagation']);
need('web/security-hardening-runtime.js',['__ABU_SECURITY_HARDENING_V2__','OFFLINE_GRACE_MS=12*60*60*1000',"name:'HMAC',hash:'SHA-256'",'constantTime(expected,env.mac)','revalidateOfflineSession']);
need('web/security-extras-runtime.js',['NATIVE_SECURITY_REQUIRED','requireNativeSecurity','passwordWeakness',"AbuBassamCloud?.session?.()?.user",'v.length<12',"c.auth.signOut({scope:'others'})",'تعذر تفعيل الخصوصية العالية']);
forbid('web/security-extras-runtime.js',["const MAIN_EMAIL=",'__dev_secure_','next.length<10','١٠ محارف']);
need('web/device-name-runtime.js',['security-bootstrap-guard-runtime.js','loadSecurityBootstrapGuard','loadSecurityHardening()','await loadSecurity();','await loadBranchVault();','await loadAccountCenter();','signalBootReady()','void loadApprovedUi().catch','account-recovery-hardening-runtime.js']);
forbid('web/device-name-runtime.js',['loadFailClosedRuntime(','fail-closed-runtime.js']);
if(fs.existsSync(path.join(root,'web/fail-closed-runtime.js')))fail('obsolete fail-closed runtime must not return');
need('web/secure-sync-runtime.js',['window.AbuBassamNativeSecurityResult','window.AbuBassamNativeSecurity = { request: nativeRequest, available: nativeAvailable }','registerVaultAdapter','VAULT_GATEWAY_NOT_READY']);
forbid('web/secure-sync-runtime.js',["localStorage.getItem('__dev_secure_'"]);
need('web/app-security-runtime.js',['SECONDARY_DEFAULT={edit:false','ATTEMPT_KEY','recordCredentialFailure','AbuBassamNativeSecurity']);
need('web/device-reconcile-runtime.js',['SECURE_STORAGE_REQUIRED','abu_bassam_owner_devices','abu_bassam_manage_device']);
forbid('web/device-reconcile-runtime.js',['__dev_secure_']);
need('web/account-recovery-hardening-runtime.js',['__ABU_ACCOUNT_RECOVERY_HARDENING_V1__','verifyLocalArchiveEmpty','PENDING_SECRET_KEY','skipBrowserRedirect:true','visibleRecoveryCode','copyVisibleRecoveryCode','shareVisibleRecoveryCode']);
need('web/branch-vault-runtime.js',['SECURE_STORAGE_REQUIRED','if(!Object.prototype.hasOwnProperty.call(LABELS,key))return false',"return api.can(key)===true","return device().permissions?.[key]===true","if(!registerCloudAdapter())throw new Error('VAULT_GATEWAY_NOT_READY')","if(!allowed('vaultDelete')||!allowed('vaultSync'))",'if(path)await removeVault(path)']);
forbid('web/branch-vault-runtime.js',['__dev_secure_',"permissions?.[key]!==false",'removeVault(path).catch(()=>{})']);
need('web/backup-center-runtime.js',['SECURE_STORAGE_REQUIRED',"typeof restore!=='function'",'خدمة الاستعادة الآمنة غير جاهزة']);
forbid('web/backup-center-runtime.js',['__dev_secure_']);
need('web/questions-paper-runtime.js',['A4P','A4L','A5P','A5L','value="custom"']);
forbid('web/questions-paper-runtime.js',['A4 فقط']);
need('web/questions-en-fixes-runtime.js',['A4P','A4L','A5P','A5L','Custom size']);
forbid('web/questions-en-fixes-runtime.js',['A4 only']);
need('web/notification-excel-runtime.js',['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.xlsx','JSZip']);
const prepare=need('scripts/prepare-android-assets.mjs',["const vendorRoot = resolve(destination, 'vendor', 'tesseract');",'await cp(source, destination, { recursive: true, force: true });','Required offline OCR asset is missing or incomplete','canonical web source remains unchanged']);
if(prepare.includes("resolve(source, 'vendor', 'tesseract')"))fail('OCR preparation must not write generated assets into canonical web source');

const forbiddenNames=new Set(['.env','.npmrc','local.properties','google-services.json','id_rsa','id_ed25519']);
const forbiddenEnvironmentName=/^\.env(?:\..+)?$/i;
const forbiddenExt=new Set(['.jks','.keystore','.p12','.pfx','.pem','.key']);
const files=walk(root);
if(files.length>5000)fail('too many files');
let total=0;
for(const file of files){const rel=path.relative(root,file).replaceAll('\\','/');const st=fs.statSync(file);total+=st.size;if(st.size>100*1024*1024)fail(`file too large: ${rel}`);const base=path.basename(file).toLowerCase(),ext=path.extname(file).toLowerCase();if(forbiddenNames.has(base)||forbiddenEnvironmentName.test(base)||forbiddenExt.has(ext))fail(`secret/signing file is forbidden: ${rel}`);if(/(^|\/)\.git(\/|$)/.test(rel))fail(`embedded git metadata is forbidden: ${rel}`);}
if(total>500*1024*1024)fail('uncompressed source is larger than 500 MB');

for(const file of files){if(!/\.(?:js|mjs)$/i.test(file))continue;const result=cp.spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0)fail(`JavaScript syntax error in ${path.relative(root,file)}: ${(result.stderr||result.stdout||'').trim()}`)}

const scanExt=/\.(?:js|mjs|ts|py|json|yml|yaml|gradle|properties|html|sql)$/i;
let approvedDesigner=false;
for(const file of files){
  if(!scanExt.test(file))continue;
  let text;try{text=fs.readFileSync(file,'utf8')}catch(_){continue}
  const rel=path.relative(root,file);
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))fail(`private key material found in ${rel}`);
  if(/(?:SUPABASE_SERVICE_ROLE_KEY|ANDROID_KEYSTORE_PASSWORD|ANDROID_KEY_PASSWORD)\s*[=:]\s*['\"]?[A-Za-z0-9_\-\.]{8,}/i.test(text)&&!/process\.env|Deno\.env|getenv|secrets\./i.test(text))fail(`possible embedded secret in ${rel}`);
  if(/Ahmed Hassan|أحمد حسن/i.test(text))fail(`previous designer identity found in ${rel}`);
  if(text.includes('أكرم حاتم الغزالي')||text.includes('Akram Hatem Al-Ghazali'))approvedDesigner=true;
}
if(!approvedDesigner)fail('approved designer identity أكرم حاتم الغزالي is missing');

console.log(`Trusted source validation passed: ${files.length} files, ${(total/1024/1024).toFixed(1)} MB; canonical startup/auth/security/recovery/vault/backup/questions/camera/export safeguards are present.`);
