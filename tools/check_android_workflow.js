const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');

function read(p){if(!fs.existsSync(p))throw new Error(`missing ${p}`);return fs.readFileSync(p,'utf8')}
function need(src,token,label){if(!src.includes(token))throw new Error(label)}
function reject(src,token,label){if(src.includes(token))throw new Error(label)}

const testWorkflow=read(path.join(root,'.github','workflows','android.yml'));
const productionWorkflow=read(path.join(root,'.github','workflows','android-production.yml'));
const pkgText=read(path.join(root,'package.json'));
const pkg=JSON.parse(pkgText);
const native=read(path.join(root,'index.js'));
const local=read(path.join(root,'scripts','build-android-local.mjs'));
const assets=read(path.join(root,'scripts','prepare-android-assets.mjs'));
const certDigest=read(path.join(root,'config','release-signing-certificate.sha256')).trim();

for(const marker of [
  'name: Android checks and test build',
  'workflow_dispatch:',
  'push:',
  'branches: [main]',
  'pull_request:',
  'permissions:\n  contents: read',
  'group: android-test-${{ github.event.pull_request.number || github.ref }}',
  "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
  "github.event_name != 'pull_request' || !startsWith(github.head_ref, 'source-import-')",
  'runs-on: ubuntu-24.04',
  'uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
  'persist-credentials: false',
  'uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0',
  'node-version: 24',
  'uses: actions/setup-java@de7274f081f381c8f8158605e0321c36c376e2e6 # v6.0.1',
  'java-version: 17',
  'verify-signature: true',
  'npm ci --no-audit --no-fund',
  'npm run build:apk:local',
  "grep -qx 'test-release-default-key-with-embedded-js-NOT-FOR-PRODUCTION-UPDATES' dist/BUILD_TYPE.txt",
  'uses: actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f # v7.0.0',
  'dist/*.apk',
  'dist/BUILD_TYPE.txt',
  'dist/SHA256.txt',
  'dist/SIGNING_CERTIFICATE.txt',
  'retention-days: 14'
]) need(testWorkflow,marker,'Android test workflow missing safeguard: '+marker);

for(const marker of [
  'contents: write','git push','secrets.','ANDROID_KEYSTORE_','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD',
  'npm run build:apk:release','./gradlew','npm run android:prebuild','npm run check:web',
  'actions/checkout@v','actions/setup-node@v','actions/setup-java@v','actions/upload-artifact@v',
  'npm install --no-audit --no-fund'
]) reject(testWorkflow,marker,'Android test workflow contains production/duplicate/unsafe behavior: '+marker);

for(const marker of [
  'name: Android production release',
  'workflow_dispatch:',
  'permissions:\n  contents: read',
  'group: android-production-main',
  'cancel-in-progress: false',
  "if: ${{ github.ref == 'refs/heads/main' }}",
  'runs-on: ubuntu-24.04',
  'uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
  'persist-credentials: false',
  'uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0',
  'node-version: 24',
  'uses: actions/setup-java@de7274f081f381c8f8158605e0321c36c376e2e6 # v6.0.1',
  'java-version: 17',
  'verify-signature: true',
  'npm ci --no-audit --no-fund',
  'ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}',
  'ANDROID_KEYSTORE_FILE: ${{ runner.temp }}/abu-bassam-release-key.p12',
  'ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}',
  'ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}',
  'ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}',
  'npm run build:apk:release',
  "grep -qx 'signed-production-release-with-embedded-js' dist/BUILD_TYPE.txt",
  "if: ${{ always() }}",
  'rm -f "$RUNNER_TEMP/abu-bassam-release-key.p12"',
  'uses: actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f # v7.0.0',
  'retention-days: 14'
]) need(productionWorkflow,marker,'Android production workflow missing safeguard: '+marker);

for(const marker of [
  'pull_request:','push:','contents: write','git push','npm run build:apk:local','./gradlew',
  'npm run android:prebuild','npm run check:web','actions/checkout@v','actions/setup-node@v',
  'actions/setup-java@v','actions/upload-artifact@v','npm install --no-audit --no-fund'
]) reject(productionWorkflow,marker,'Android production workflow contains duplicate/unsafe behavior: '+marker);

const prodStepsAt=productionWorkflow.indexOf('\n    steps:');
if(prodStepsAt<0)throw new Error('Android production workflow steps block missing');
if(/secrets\.ANDROID_KEY/i.test(productionWorkflow.slice(0,prodStepsAt)))
  throw new Error('Android production secrets must not be exposed at job scope');

if(!/^[0-9a-fA-F]{64}$/.test(certDigest))throw new Error('release signing certificate digest must be exactly 64 hex characters');

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
  'Required offline OCR asset is missing or incomplete',
  'canonical web source remains unchanged'
]) need(assets,marker,'Android asset preparation missing safeguard: '+marker);
for(const marker of ['TOUCH_RUNTIME','injectTouchStabilityRuntime','patchAccountEmail','LEGACY_ACCOUNT_EMAIL','ACCOUNT_EMAIL ='])
  reject(assets,marker,'Android asset preparation must not rewrite canonical source: '+marker);

need(native,"message.type === 'webBootReady'",'native shell must wait for explicit webBootReady');
need(native,'const STARTUP_WATCHDOG_MS = 12000;','startup watchdog must be 12 seconds and fail closed');
for(const marker of [
  'onLoad={() => setWebReady(true)}','onLoadEnd={() => setWebReady(true)}',
  'setTimeout(() => setWebReady(true), STARTUP_WATCHDOG_MS)'
]) reject(native,marker,'WebView must not become ready before canonical runtime boot: '+marker);

for(const [marker,label] of [
  ['"build:apk:local": "node scripts/build-android-local.mjs"','local test build command'],
  ['"build:apk:release": "node scripts/build-android-local.mjs --require-release-key"','strict release build command']
]) need(pkgText,marker,'package missing '+label);

for(const [marker,label] of [
  ["process.argv.includes('--require-release-key')",'strict local release switch'],
  ["['ANDROID_KEYSTORE_FILE','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD']",'complete signing variable set'],
  ['Incomplete Android signing configuration.','partial signing rejection'],
  ['Production release signing is required.','missing production key rejection'],
  ["['run', 'check:web']",'central build web checks'],
  ["['run', 'android:prebuild']",'central Android prebuild'],
  ["['assembleRelease', '--no-daemon']",'central release build'],
  ['assets/index.android.bundle','embedded JS verification'],
  ["['verify', '--verbose', apk]",'APK signature verification'],
  ["['verify', '--print-certs', apk]",'APK signing certificate verification'],
  ['expectedReleaseCertificateDigest','expected release certificate validation'],
  ['certificateDigest(certificate)','actual release certificate validation'],
  ['Production signing certificate mismatch.','certificate mismatch rejection'],
  ['Expected exactly one release APK','deterministic APK selection'],
  ["const apkFileName = `Abu_Bassam_Library_${appVersion}.apk`",'dynamic distribution APK name'],
  ['test-release-default-key-with-embedded-js-NOT-FOR-PRODUCTION-UPDATES','explicit non-production marker'],
  ['signed-production-release-with-embedded-js','explicit production marker'],
  ['SHA256.txt','SHA-256 output'],
  ['SIGNING_CERTIFICATE.txt','signing certificate output']
]) need(local,marker,'Android central build missing '+label);
reject(local,'Abu_Bassam_Library_4.3.2.apk','central build must derive the APK name from package.json version');

console.log('Android workflow check passed: PR/push builds contain no production secrets, production signing is isolated to a manual main-only workflow, both paths use one verified build implementation, action dependencies are immutable, and production certificate pinning remains enforced.');
