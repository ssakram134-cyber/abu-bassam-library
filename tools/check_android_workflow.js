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
const certDigest=read(path.join(root,'config','release-signing-certificate.sha256')).trim().toLowerCase();

for(const marker of [
  'name: Android checks and test build',
  'workflow_dispatch:',
  'push:',
  'branches: [main]',
  'pull_request:',
  'permissions:\n  contents: read',
  'group: android-test-${{ github.event.pull_request.number || github.ref }}',
  "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
  "github.event_name != 'pull_request' || github.event.pull_request.user.login != 'github-actions[bot]' || !startsWith(github.head_ref, 'source-import-')",
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
  'EXPECTED_RELEASE_CERT_SHA256:',
  'build:',
  "if: ${{ github.ref == 'refs/heads/main' }}",
  'Build and verify APK with no production secrets',
  'npm run build:apk:local',
  'Enforce non-production build input',
  'Upload verified production-signing input',
  'abu-bassam-production-input-${{ github.sha }}',
  'sign:',
  'needs: build',
  "needs.build.result == 'success'",
  'permissions:\n      contents: read\n      actions: read',
  'Set up Java for apksigner',
  'uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1',
  'Download verified APK input',
  'Validate isolated signing input',
  'Decode production signing key',
  'ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}',
  'Sign and verify production APK',
  'ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}',
  'ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}',
  'ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}',
  '--ks-pass env:ANDROID_KEYSTORE_PASSWORD',
  '--key-pass env:ANDROID_KEY_PASSWORD',
  'Production signing certificate mismatch.',
  "grep -qx 'signed-production-release-with-embedded-js' dist/BUILD_TYPE.txt",
  'sha256sum -c dist/SHA256.txt',
  "if: ${{ always() }}",
  'rm -f "$RUNNER_TEMP/abu-bassam-release-key.p12"',
  'Upload production APK artifacts'
]) need(productionWorkflow,marker,'Android production workflow missing safeguard: '+marker);

for(const marker of [
  'pull_request:','push:','contents: write','git push','npm run build:apk:release',
  'actions/checkout@v','actions/setup-node@v','actions/setup-java@v','actions/upload-artifact@v',
  'actions/download-artifact@v','npm install --no-audit --no-fund'
]) reject(productionWorkflow,marker,'Android production workflow contains obsolete/unsafe behavior: '+marker);

if(!/^[0-9a-f]{64}$/.test(certDigest))throw new Error('release signing certificate digest must be exactly 64 hex characters');
const certMatch=productionWorkflow.match(/EXPECTED_RELEASE_CERT_SHA256:\s*([0-9a-fA-F]{64})/);
if(!certMatch)throw new Error('production workflow must pin the expected certificate digest');
if(certMatch[1].toLowerCase()!==certDigest)throw new Error('production workflow certificate digest must match config/release-signing-certificate.sha256');

const buildJobAt=productionWorkflow.indexOf('\n  build:\n');
const signJobAt=productionWorkflow.indexOf('\n  sign:\n');
if(buildJobAt<0||signJobAt<0||signJobAt<=buildJobAt)throw new Error('production workflow must separate build and signing jobs');
const buildBlock=productionWorkflow.slice(buildJobAt,signJobAt);
const signBlock=productionWorkflow.slice(signJobAt);
if(/secrets\.ANDROID_KEY|ANDROID_KEYSTORE_PASSWORD|ANDROID_KEY_ALIAS|ANDROID_KEY_PASSWORD/.test(buildBlock))
  throw new Error('production build job must not receive production signing secrets');
if(/actions\/checkout|setup-node|npm |npx |node |gradle|expo /.test(signBlock))
  throw new Error('isolated signing job must not checkout or execute project/package tooling');
if(!/actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c/.test(signBlock))
  throw new Error('isolated signing job must consume only the verified build artifact');
if(!/actions: read/.test(signBlock))throw new Error('isolated signing job needs actions: read only for artifact download');

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
for(const marker of ['onLoad={() => setWebReady(true)}','onLoadEnd={() => setWebReady(true)}','setTimeout(() => setWebReady(true), STARTUP_WATCHDOG_MS)'])
  reject(native,marker,'WebView must not become ready before canonical runtime boot: '+marker);

for(const [marker,label] of [
  ['"build:apk:local": "node scripts/build-android-local.mjs"','local test build command'],
  ['"build:apk:release": "node scripts/build-android-local.mjs --require-release-key"','strict local release build command']
]) need(pkgText,marker,'package missing '+label);

for(const [marker,label] of [
  ["process.argv.includes('--require-release-key')",'strict local release switch'],
  ["['ANDROID_KEYSTORE_FILE','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD']",'complete local signing variable set'],
  ['Incomplete Android signing configuration.','partial local signing rejection'],
  ['Production release signing is required.','missing local production key rejection'],
  ["['run', 'check:web']",'central build web checks'],
  ["['run', 'android:prebuild']",'central Android prebuild'],
  ["['assembleRelease', '--no-daemon']",'central release build'],
  ['assets/index.android.bundle','embedded JS verification'],
  ["['verify', '--verbose', '--print-certs', apk]",'APK signature and certificate verification'],
  ["return [stdout, stderr].filter(Boolean).join('\\n');",'combined apksigner output capture'],
  ['expectedReleaseCertificateDigest','local expected release certificate validation'],
  ['certificateDigest(certificate)','local actual release certificate validation'],
  ['Production signing certificate mismatch.','local certificate mismatch rejection'],
  ['Expected exactly one release APK','deterministic APK selection'],
  ["const apkFileName = `Abu_Bassam_Library_${appVersion}.apk`",'dynamic distribution APK name'],
  ['test-release-default-key-with-embedded-js-NOT-FOR-PRODUCTION-UPDATES','explicit non-production marker'],
  ['signed-production-release-with-embedded-js','explicit production marker'],
  ['SHA256.txt','SHA-256 output'],
  ['SIGNING_CERTIFICATE.txt','signing certificate output']
]) need(local,marker,'Android central build missing '+label);
reject(local,'Abu_Bassam_Library_4.3.2.apk','central build must derive the APK name from package.json version');

console.log('Android workflow check passed: PR/push builds contain no production secrets, production APK construction and signing run on separate runners, the signing runner never checks out or executes project code, immutable Actions transfer only the verified APK artifact, and certificate pinning remains enforced.');
