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
const certDigest=read(path.join(root,'config','release-signing-certificate.sha256')).trim();

for(const marker of [
  'permissions:\n  contents: read',
  'concurrency:',
  "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
  "github.event_name != 'pull_request' || !startsWith(github.head_ref, 'source-import-')",
  'runs-on: ubuntu-24.04',
  "PRODUCTION_REQUESTED: ${{ github.event_name == 'workflow_dispatch' && inputs.production }}",
  'uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
  'persist-credentials: false',
  'uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0',
  'node-version: 24',
  'uses: actions/setup-java@de7274f081f381c8f8158605e0321c36c376e2e6 # v6.0.1',
  'java-version: 17',
  'verify-signature: true',
  'npm ci --no-audit --no-fund',
  'npm run check:web',
  'npm run android:prebuild',
  'Configure production release key',
  'Production signing is allowed only from refs/heads/main.',
  'config/release-signing-certificate.sha256',
  'Build standalone APK with test signing',
  'Build production standalone APK',
  './gradlew assembleRelease --no-daemon',
  'Verify standalone APK, signature, and production certificate',
  'assets/index.android.bundle',
  'apksigner" verify --verbose',
  'apksigner" verify --print-certs',
  'Production signing certificate mismatch.',
  'APP_VERSION="$(node -p "require(\'./package.json\').version")"',
  'dist/*.apk',
  'dist/APK_FILE.txt',
  'SIGNING_CERTIFICATE.txt',
  'sha256sum "$OUT" > dist/SHA256.txt',
  'uses: actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f # v7.0.0',
  'retention-days: 14'
]) need(workflow,marker,'Android workflow missing safeguard: '+marker);

for(const marker of [
  'contents: write',
  'git push',
  'HAS_ANDROID_RELEASE_KEY',
  'actions/checkout@v',
  'actions/setup-node@v',
  'actions/setup-java@v',
  'actions/upload-artifact@v',
  './gradlew assembleDebug --no-daemon',
  'npm install --no-audit --no-fund',
  'dist/Abu_Bassam_Library_4.3.2.apk'
]) reject(workflow,marker,'Android workflow contains obsolete/unsafe behavior: '+marker);

if(!/^[0-9a-fA-F]{64}$/.test(certDigest))throw new Error('release signing certificate digest must be exactly 64 hex characters');

const stepsAt=workflow.indexOf('\n    steps:');
if(stepsAt<0)throw new Error('Android workflow steps block missing');
const jobHeader=workflow.slice(0,stepsAt);
if(/secrets\.ANDROID_KEY/i.test(jobHeader))throw new Error('Android release secrets must not be exposed at job scope');

const testBuildStart=workflow.indexOf('- name: Build standalone APK with test signing');
const prodBuildStart=workflow.indexOf('- name: Build production standalone APK');
if(testBuildStart<0||prodBuildStart<0||prodBuildStart<=testBuildStart)throw new Error('Android signing build steps are malformed');
const testBuildBlock=workflow.slice(testBuildStart,prodBuildStart);
if(/secrets\.ANDROID_KEY|ANDROID_KEYSTORE_PASSWORD|ANDROID_KEY_ALIAS|ANDROID_KEY_PASSWORD/.test(testBuildBlock))
  throw new Error('test/PR Android build must not receive production signing secrets');

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
]) need(assets,marker,'Android asset preparation missing safeguard: '+marker);
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
]) reject(native,marker,'WebView must not become ready before canonical runtime boot: '+marker);
for(const marker of [
  "originWhitelist={['file://*','about:*']}",
  'mixedContentMode="never"',
  'onShouldStartLoadWithRequest',
  "if (/^(https:|tel:|mailto:|tg:|whatsapp:)/i.test(url))",
  "const [cameraFrameKind, setCameraFrameKind] = useState('paper');",
  'openCamera(message.mode, message.frameKind)',
  "cameraFrameKind === 'card' ? styles.cardDocumentFrame"
]) need(native,marker,'native Android shell missing source-level safeguard: '+marker);

for(const [marker,label] of [
  ['"build:apk:local": "node scripts/build-android-local.mjs"','local test build command'],
  ['"build:apk:release": "node scripts/build-android-local.mjs --require-release-key"','strict release build command']
]) need(pkgText,marker,'package missing '+label);

for(const [marker,label] of [
  ["process.argv.includes('--require-release-key')",'strict local release switch'],
  ["['ANDROID_KEYSTORE_FILE','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD']",'complete signing variable set'],
  ['Incomplete Android signing configuration.','partial signing rejection'],
  ['Production release signing is required.','missing production key rejection'],
  ["['run', 'check:web']",'local build web checks'],
  ["['run', 'android:prebuild']",'local Android prebuild'],
  ["['assembleRelease', '--no-daemon']",'local release build'],
  ['assets/index.android.bundle','embedded JS verification'],
  ["['verify', '--verbose', apk]",'APK signature verification'],
  ["['verify', '--print-certs', apk]",'APK signing certificate verification'],
  ['expectedReleaseCertificateDigest','expected release certificate validation'],
  ['certificateDigest(certificate)','actual release certificate validation'],
  ['Production signing certificate mismatch.','certificate mismatch rejection'],
  ["const apkFileName = `Abu_Bassam_Library_${appVersion}.apk`",'dynamic distribution APK name'],
  ['SHA256.txt','SHA-256 output'],
  ['SIGNING_CERTIFICATE.txt','signing certificate output']
]) need(local,marker,'Android local build missing '+label);
reject(local,'Abu_Bassam_Library_4.3.2.apk','local build must derive the APK name from package.json version');

console.log('Android workflow check passed: CI is read-only for PR/push, imported source branches are not auto-executed, production signing is main/manual-only with certificate pinning, action dependencies are immutable, and local signing enforces the same certificate identity.');
