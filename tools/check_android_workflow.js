const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
function read(p){if(!fs.existsSync(p))throw new Error(`missing ${p}`);return fs.readFileSync(p,'utf8')}
function need(src,token,label){if(!src.includes(token))throw new Error(label)}
function reject(src,token,label){if(src.includes(token))throw new Error(label)}
const workflow=read(path.join(root,'.github','workflows','android.yml'));
const pkgText=read(path.join(root,'package.json'));
const pkg=JSON.parse(pkgText);
const native=read(path.join(root,'index.js'));
const local=read(path.join(root,'scripts','build-android-local.mjs'));
const assets=read(path.join(root,'scripts','prepare-android-assets.mjs'));

for(const marker of [
  'permissions:\n  contents: read','workflow_dispatch:','production:',
  'Require production signing only when explicitly requested',
  "github.event_name == 'workflow_dispatch' && inputs.production",
  'Production signing was requested, but one or more Android release signing secrets are missing.',
  'npm ci --no-audit --no-fund','./gradlew assembleRelease --no-daemon',
  'assets/index.android.bundle','apksigner" verify --verbose','apksigner" verify --print-certs',
  'SIGNING_CERTIFICATE.txt','dist/Abu_Bassam_Library_4.3.2.apk',
  'sha256sum dist/Abu_Bassam_Library_4.3.2.apk','Upload APK artifacts','retention-days: 14'
])need(workflow,marker,'Android workflow missing safeguard: '+marker);
for(const marker of ['./gradlew assembleDebug --no-daemon','contents: write','git push','npm install --no-audit --no-fund'])
  reject(workflow,marker,'Android workflow contains unsafe behavior: '+marker);

const checkWeb=String(pkg.scripts?.['check:web']||'');
if(!checkWeb.startsWith('node tools/check_project.js'))throw new Error('check:web must begin with read-only project checks');
if(/scripts\/patch-|repair:source/.test(checkWeb))throw new Error('check:web must not patch source');
if(Object.prototype.hasOwnProperty.call(pkg.scripts||{},'repair:source'))throw new Error('obsolete repair:source command must not return');
for(const file of ['scripts/patch-startup-stability.mjs','scripts/patch-customer-camera.mjs','web/touch-stability-runtime.js'])
  if(fs.existsSync(path.join(root,file)))throw new Error('obsolete patch/touch file still exists: '+file);

for(const marker of [
  "const vendorRoot = resolve(destination, 'vendor', 'tesseract');",
  'const DOWNLOAD_TIMEOUT_MS = 45000;',
  'await rm(destination, { recursive: true, force: true });',
  'await cp(source, destination, { recursive: true, force: true });',
  'for(const [relative,urls,minBytes] of OCR_ASSETS)',
  'await download(urls,resolve(vendorRoot,relative),minBytes);',
  'async function fetchWithTimeout(url)',
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/ara@1.0.0/4.0.0_best_int/ara.traineddata.gz',
  'https://unpkg.com/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz',
  'Required offline OCR asset is missing or incomplete',
  'canonical web source remains unchanged'
])need(assets,marker,'Android asset preparation missing safeguard: '+marker);
for(const marker of ['TOUCH_RUNTIME','injectTouchStabilityRuntime','patchAccountEmail','LEGACY_ACCOUNT_EMAIL','ACCOUNT_EMAIL ='])
  reject(assets,marker,'Android asset preparation must not rewrite canonical source: '+marker);
const copyAt=assets.indexOf('await cp(source, destination');
const downloadAt=assets.indexOf('for(const [relative,urls,minBytes] of OCR_ASSETS)');
if(copyAt<0||downloadAt<0||copyAt>downloadAt)throw new Error('Android assets must copy canonical web source before generating OCR assets');

need(native,"message.type === 'webBootReady'",'native shell must wait for explicit webBootReady');
need(native,'const STARTUP_WATCHDOG_MS = 12000;','startup watchdog must be 12 seconds and fail closed');
need(native,'لم تكتمل طبقات الأمان والواجهة خلال المهلة المحددة','startup timeout must report failure instead of unlocking');
for(const marker of [
  'onLoad={() => setWebReady(true)}',
  'onLoadEnd={() => setWebReady(true)}',
  'onLoadProgress={(event) => { if ((event.nativeEvent?.progress || 0) >= 0.35) setWebReady(true); }}',
  'setTimeout(() => setWebReady(true), STARTUP_WATCHDOG_MS)'
])reject(native,marker,'WebView must not become ready before canonical runtime boot: '+marker);
for(const marker of [
  "originWhitelist={['file://*','about:*']}",'mixedContentMode="never"',
  'onShouldStartLoadWithRequest',"if (/^(https:|tel:|mailto:|tg:|whatsapp:)/i.test(url))",
  "const [cameraFrameKind, setCameraFrameKind] = useState('paper');",
  "openCamera(message.mode, message.frameKind)",
  'cameraFrameKind === \'card\' ? styles.cardDocumentFrame'
])need(native,marker,'native Android shell missing source-level safeguard: '+marker);

for(const [marker,label] of [
  ['"build:apk:local": "node scripts/build-android-local.mjs"','local test build command'],
  ['"build:apk:release": "node scripts/build-android-local.mjs --require-release-key"','strict release build command']
])need(pkgText,marker,'package missing '+label);
for(const [marker,label] of [
  ["process.argv.includes('--require-release-key')",'strict local release switch'],
  ["['ANDROID_KEYSTORE_FILE','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD']",'complete signing variable set'],
  ['Production release signing is required.','missing production key rejection'],
  ["['run', 'check:web']",'local build web checks'],
  ["['run', 'android:prebuild']",'local Android prebuild'],
  ["['assembleRelease', '--no-daemon']",'local release build'],
  ['assets/index.android.bundle','embedded JS verification'],
  ["['verify', '--verbose', apk]",'APK signature verification'],
  ["['verify', '--print-certs', apk]",'APK signing certificate verification'],
  ['Abu_Bassam_Library_4.3.2.apk','distribution APK name'],
  ['SHA256.txt','SHA-256 output'],
  ['SIGNING_CERTIFICATE.txt','signing certificate output']
])need(local,marker,'Android local build missing '+label);
console.log('Android workflow check passed: builds copy canonical web source without patching it, runtime readiness is explicit/fail-closed, OCR assets are generated separately, and APK signing/bundle verification remain enforced.');
