const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
function read(p){if(!fs.existsSync(p))throw new Error(`missing ${p}`);return fs.readFileSync(p,'utf8')}
const source=read(path.join(root,'.github','workflows','android.yml'));
const pkg=read(path.join(root,'package.json'));
const packageJson=JSON.parse(pkg);
const native=read(path.join(root,'index.js'));
const local=read(path.join(root,'scripts','build-android-local.mjs'));
const assets=read(path.join(root,'scripts','prepare-android-assets.mjs'));
const touch=read(path.join(root,'web','touch-stability-runtime.js'));
try{new Function(read(path.join(root,'tools','check_import_workflow.js')))}catch(e){throw new Error(`import workflow checker syntax error: ${e.message}`)}
try{new Function(touch)}catch(e){throw new Error(`touch stability runtime syntax error: ${e.message}`)}
const required=[
  'permissions:\n  contents: read','workflow_dispatch:','production:',
  'Remove stale build and installer artifacts','rm -rf android dist .expo',"-name '*.apk'","-name '*.aab'","-name '*.apks'",
  'Require production signing only when explicitly requested',"github.event_name == 'workflow_dispatch' && inputs.production",
  'Production signing was requested, but one or more Android release signing secrets are missing.',
  "secrets.ANDROID_KEYSTORE_PASSWORD != ''","secrets.ANDROID_KEY_ALIAS != ''","secrets.ANDROID_KEY_PASSWORD != ''",
  'npm ci --no-audit --no-fund','npm run check:web','npm run android:prebuild',
  'Build standalone APK with embedded JS bundle','./gradlew assembleRelease --no-daemon',
  'Verify standalone APK contains React Native bundle','assets/index.android.bundle','test -n "$BUILD_TOOLS"',
  'apksigner" verify --verbose','apksigner" verify --print-certs','SIGNING_CERTIFICATE.txt',
  'signed-production-release-with-embedded-js','test-release-default-key-with-embedded-js-NOT-FOR-PRODUCTION-UPDATES',
  'Enforce requested production signature',"grep -qx 'signed-production-release-with-embedded-js' dist/BUILD_TYPE.txt",
  'Prepare distributable APK','dist/Abu_Bassam_Library_5.0.0.apk','sha256sum dist/Abu_Bassam_Library_5.0.0.apk',
  'Upload APK artifacts','retention-days: 14'
];
const missing=required.filter(marker=>!source.includes(marker));
if(missing.length){process.stderr.write('Android workflow missing safeguards:\n'+missing.map(x=>'- '+x).join('\n')+'\n');process.exit(1)}
const forbidden=[
  './gradlew assembleDebug --no-daemon','android/app/build/outputs/apk/debug/','installable-debug','contents: write','git push',
  'Synchronize package lock','npm install --no-audit --no-fund','Abu_Bassam_Library_4.3.2.apk'
];
const bad=forbidden.filter(marker=>source.includes(marker));
if(bad.length){process.stderr.write('Android workflow contains unsafe/stale behavior:\n'+bad.map(x=>'- '+x).join('\n')+'\n');process.exit(1)}
const checkWeb=String(packageJson.scripts?.['check:web']||'');
if(!checkWeb.startsWith('node tools/check_project.js')){process.stderr.write('check:web must start with read-only project checks.\n');process.exit(1)}
if(/scripts\/patch-|repair:source/.test(checkWeb)){process.stderr.write('check:web must not mutate canonical source.\n');process.exit(1)}
for(const name of ['start','android','android:prebuild'])if(/scripts\/patch-/.test(String(packageJson.scripts?.[name]||''))){process.stderr.write(`${name} must not patch canonical source automatically.\n`);process.exit(1)}
const repair=String(packageJson.scripts?.['repair:source']||'');
for(const marker of ['patch-startup-stability.mjs','patch-customer-camera.mjs'])if(!repair.includes(marker)){process.stderr.write(`repair:source missing compatibility repair ${marker}.\n`);process.exit(1)}
const assetRequired=[
  "const vendorRoot = resolve(destination, 'vendor', 'tesseract');",'const DOWNLOAD_TIMEOUT_MS = 45000;',
  "const TOUCH_RUNTIME = 'touch-stability-runtime.js';",'async function injectTouchStabilityRuntime()','await injectTouchStabilityRuntime();',
  'Touch stability runtime was not injected into Android web entry point','await rm(destination, { recursive: true, force: true });',
  'await cp(source, destination, { recursive: true, force: true });','for(const [relative,urls,minBytes] of OCR_ASSETS)',
  'await download(urls,resolve(vendorRoot,relative),minBytes);','async function fetchWithTimeout(url)',
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/ara@1.0.0/4.0.0_best_int/ara.traineddata.gz',
  'https://unpkg.com/@tesseract.js-data/ara@1.0.0/4.0.0_best_int/ara.traineddata.gz',
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz',
  'https://unpkg.com/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz',
  'Required offline OCR asset is missing or incomplete','canonical web source remains unchanged'
];
for(const marker of assetRequired)if(!assets.includes(marker)){process.stderr.write(`Android asset preparation missing safeguard: ${marker}\n`);process.exit(1)}
const touchRequired=['__ABU_TOUCH_STABILITY_V2__','__ABU_TOUCH_STABILITY_V1__','html,body,.app{touch-action:auto!important}',
  '.sheet:not(.show)','.nat-modal:not(.show)','.cs-modal:not(.show)','.v-modal:not(.show)','.v-busy:not(.show)',
  '.abu-settings-modal:not(.show)','#abuRecoveryModal','pointer-events:none!important',"JSON.stringify({type:'webBootReady'",'window.AbuBassamTouchStability={version:2'];
const touchMissing=touchRequired.filter(marker=>!touch.includes(marker));
if(touchMissing.length){process.stderr.write('Touch runtime missing V2 safeguards:\n'+touchMissing.map(x=>'- '+x).join('\n')+'\n');process.exit(1)}
const touchForbidden=['new MutationObserver','MutationObserver(','pointerup','touchend','style.pointerEvents','.inert=','inert=true'];
const touchBad=touchForbidden.filter(marker=>touch.includes(marker));
if(touchBad.length){process.stderr.write('Touch runtime contains forbidden global interception:\n'+touchBad.map(x=>'- '+x).join('\n')+'\n');process.exit(1)}
const nativeRequired=["message.type === 'webBootReady'",'const STARTUP_WATCHDOG_MS = 3500;',
  'onLoad={() => setWebReady(true)}','onLoadProgress={(event) => { if ((event.nativeEvent?.progress || 0) >= 0.35) setWebReady(true); }}',
  'onLoadEnd={() => setWebReady(true)}','webInstanceKey','recoverWebRenderer','onRenderProcessGone'];
const nativeMissing=nativeRequired.filter(marker=>!native.includes(marker));
if(nativeMissing.length){process.stderr.write('Native WebView recovery/startup safeguards missing:\n'+nativeMissing.map(x=>'- '+x).join('\n')+'\n');process.exit(1)}
for(const forbiddenAsset of ["resolve(source, 'vendor', 'tesseract')",'tessdata.projectnaptha.com'])if(assets.includes(forbiddenAsset)){process.stderr.write(`Android asset preparation contains deprecated OCR source: ${forbiddenAsset}\n`);process.exit(1)}
const copyAt=assets.indexOf('await cp(source, destination');const injectTouchAt=assets.indexOf('await injectTouchStabilityRuntime();');const downloadAt=assets.indexOf('for(const [relative,urls,minBytes] of OCR_ASSETS)');
if(copyAt<0||injectTouchAt<0||downloadAt<0||copyAt>injectTouchAt||injectTouchAt>downloadAt){process.stderr.write('Android assets must copy canonical source, inject touch runtime, then generate OCR assets.\n');process.exit(1)}
const fallbackRequired=[
  ['"build:apk:local": "node scripts/build-android-local.mjs"',pkg,'package local test build command'],
  ['"build:apk:release": "node scripts/build-android-local.mjs --require-release-key"',pkg,'package strict release build command'],
  ["process.argv.includes('--require-release-key')",local,'strict local release switch'],
  ["['ANDROID_KEYSTORE_FILE','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD']",local,'complete signing variable set'],
  ['Production release signing is required.',local,'missing production key rejection'],
  ['removeStaleBuildArtifacts()',local,'local clean-build guard'],
  ["['run', 'check:web']",local,'local build web checks'],["['run', 'android:prebuild']",local,'local Android prebuild'],
  ["['assembleRelease', '--no-daemon']",local,'local release build'],['assets/index.android.bundle',local,'embedded JS verification'],
  ["['verify', '--verbose', apk]",local,'APK signature verification'],["['verify', '--print-certs', apk]",local,'APK certificate verification'],
  ['ANDROID_HOME || process.env.ANDROID_SDK_ROOT',local,'Android SDK discovery'],["path.join(root, 'android', 'local.properties')",local,'local.properties SDK fallback'],
  ['Abu_Bassam_Library_5.0.0.apk',local,'distribution APK name'],['SHA256.txt',local,'SHA-256 output'],['SIGNING_CERTIFICATE.txt',local,'certificate output'],
  ['signed-production-release-with-embedded-js',local,'production build marker'],['local-test-release-default-key-with-embedded-js',local,'test build marker']
];
const fallbackMissing=fallbackRequired.filter(([marker,src])=>!src.includes(marker)).map(([, ,label])=>label);
if(fallbackMissing.length){process.stderr.write('Android local fallback missing safeguards:\n'+fallbackMissing.map(x=>'- '+x).join('\n')+'\n');process.exit(1)}
process.stdout.write('Android build check passed: clean-build artifact purge, v5 APK naming, non-invasive touch runtime, WebView renderer recreation, pinned OCR assets, embedded bundle/signature/certificate verification, SHA-256 output, and read-only CI are enforced.\n');
