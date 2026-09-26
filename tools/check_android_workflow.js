const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
function read(p){if(!fs.existsSync(p))throw new Error(`missing ${p}`);return fs.readFileSync(p,'utf8')}
const source=read(path.join(root,'.github','workflows','android.yml'));
const pkg=read(path.join(root,'package.json'));
const packageJson=JSON.parse(pkg);
const local=read(path.join(root,'scripts','build-android-local.mjs'));
const assets=read(path.join(root,'scripts','prepare-android-assets.mjs'));
try{new Function(read(path.join(root,'tools','check_import_workflow.js')))}catch(e){throw new Error(`import workflow checker syntax error: ${e.message}`)}
const required=[
  'permissions:\n  contents: read',
  'workflow_dispatch:',
  'production:',
  'Require production signing only when explicitly requested',
  "github.event_name == 'workflow_dispatch' && inputs.production",
  'Production signing was requested, but one or more Android release signing secrets are missing.',
  "secrets.ANDROID_KEYSTORE_PASSWORD != ''",
  "secrets.ANDROID_KEY_ALIAS != ''",
  "secrets.ANDROID_KEY_PASSWORD != ''",
  'npm ci --no-audit --no-fund',
  'Build standalone APK with embedded JS bundle',
  './gradlew assembleRelease --no-daemon',
  'Verify standalone APK contains React Native bundle',
  'assets/index.android.bundle',
  'test -n "$BUILD_TOOLS"',
  'apksigner" verify --verbose',
  'apksigner" verify --print-certs',
  'SIGNING_CERTIFICATE.txt',
  'signed-production-release-with-embedded-js',
  'test-release-default-key-with-embedded-js-NOT-FOR-PRODUCTION-UPDATES',
  'Enforce requested production signature',
  "grep -qx 'signed-production-release-with-embedded-js' dist/BUILD_TYPE.txt",
  'Prepare distributable APK',
  'dist/Abu_Bassam_Library_4.3.2.apk',
  'sha256sum dist/Abu_Bassam_Library_4.3.2.apk',
  'Upload APK artifacts',
  'retention-days: 14'
];
const missing=required.filter(marker=>!source.includes(marker));
if(missing.length){process.stderr.write('Android workflow missing safeguards:\n'+missing.map(x=>'- '+x).join('\n')+'\n');process.exit(1)}
const forbidden=[
  './gradlew assembleDebug --no-daemon',
  'android/app/build/outputs/apk/debug/',
  'standalone-release-debug-key-with-embedded-js',
  'pull-request-test-release-debug-key-with-embedded-js',
  'Require production signing for distributable builds',
  "github.event_name != 'pull_request'",
  'installable-debug',
  'contents: write',
  'git push',
  'Synchronize package lock',
  'npm install --no-audit --no-fund'
];
const bad=forbidden.filter(marker=>source.includes(marker));
if(bad.length){process.stderr.write('Android workflow contains unsafe/non-reproducible behavior:\n'+bad.map(x=>'- '+x).join('\n')+'\n');process.exit(1)}
const checkWeb=String(packageJson.scripts?.['check:web']||'');
const normalScripts=['start','android','android:prebuild'];
if(!checkWeb.startsWith('node tools/check_project.js')){process.stderr.write('check:web must start with read-only project checks, not a mutating patch.\n');process.exit(1)}
if(/scripts\/patch-|repair:source/.test(checkWeb)){process.stderr.write('check:web must not mutate or repair canonical source.\n');process.exit(1)}
for(const name of normalScripts){if(/scripts\/patch-/.test(String(packageJson.scripts?.[name]||''))){process.stderr.write(`${name} must not patch canonical source automatically.\n`);process.exit(1)}}
const repair=String(packageJson.scripts?.['repair:source']||'');
for(const marker of ['patch-startup-stability.mjs','patch-customer-camera.mjs'])if(!repair.includes(marker)){process.stderr.write(`repair:source missing explicit compatibility repair ${marker}.\n`);process.exit(1)}
const assetRequired=[
  "const vendorRoot = resolve(destination, 'vendor', 'tesseract');",
  'const DOWNLOAD_TIMEOUT_MS = 45000;',
  'await rm(destination, { recursive: true, force: true });',
  'await cp(source, destination, { recursive: true, force: true });',
  'for(const [relative,urls,minBytes] of OCR_ASSETS)',
  'await download(urls,resolve(vendorRoot,relative),minBytes);',
  'async function fetchWithTimeout(url)',
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/ara@1.0.0/4.0.0_best_int/ara.traineddata.gz',
  'https://unpkg.com/@tesseract.js-data/ara@1.0.0/4.0.0_best_int/ara.traineddata.gz',
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz',
  'https://unpkg.com/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz',
  'Required offline OCR asset is missing or incomplete',
  'canonical web source remains unchanged'
];
for(const marker of assetRequired)if(!assets.includes(marker)){process.stderr.write(`Android asset preparation missing canonical-source safeguard: ${marker}\n`);process.exit(1)}
for(const forbiddenAsset of ["resolve(source, 'vendor', 'tesseract')",'tessdata.projectnaptha.com'])if(assets.includes(forbiddenAsset)){process.stderr.write(`Android asset preparation contains deprecated/unsafe OCR source behavior: ${forbiddenAsset}\n`);process.exit(1)}
const copyAt=assets.indexOf('await cp(source, destination');
const downloadAt=assets.indexOf('for(const [relative,urls,minBytes] of OCR_ASSETS)');
if(copyAt<0||downloadAt<0||copyAt>downloadAt){process.stderr.write('Android assets must copy canonical web source before generating OCR assets in the disposable Android tree.\n');process.exit(1)}
const fallbackRequired=[
  ['"build:apk:local": "node scripts/build-android-local.mjs"',pkg,'package local test build command'],
  ['"build:apk:release": "node scripts/build-android-local.mjs --require-release-key"',pkg,'package strict release build command'],
  ["process.argv.includes('--require-release-key')",local,'strict local release switch'],
  ["['ANDROID_KEYSTORE_FILE','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD']",local,'complete signing variable set'],
  ['Production release signing is required.',local,'missing production key rejection'],
  ["['run', 'check:web']",local,'local build web checks'],
  ["['run', 'android:prebuild']",local,'local Android prebuild'],
  ["['assembleRelease', '--no-daemon']",local,'local release build'],
  ['assets/index.android.bundle',local,'embedded JS verification'],
  ["['verify', '--verbose', apk]",local,'APK signature verification'],
  ["['verify', '--print-certs', apk]",local,'APK signing certificate verification'],
  ['ANDROID_HOME || process.env.ANDROID_SDK_ROOT',local,'Android SDK discovery'],
  ["path.join(root, 'android', 'local.properties')",local,'local.properties SDK fallback'],
  ['Abu_Bassam_Library_4.3.2.apk',local,'distribution APK name'],
  ['SHA256.txt',local,'SHA-256 output'],
  ['SIGNING_CERTIFICATE.txt',local,'signing certificate output'],
  ['signed-production-release-with-embedded-js',local,'production build marker'],
  ['local-test-release-default-key-with-embedded-js',local,'test build marker']
];
const fallbackMissing=fallbackRequired.filter(([marker,src])=>!src.includes(marker)).map(([, ,label])=>label);
if(fallbackMissing.length){process.stderr.write('Android local fallback missing safeguards:\n'+fallbackMissing.map(x=>'- '+x).join('\n')+'\n');process.exit(1)}
process.stdout.write('Android build check passed: push/PR builds may produce a clearly marked test APK without release secrets; explicit production requests fail closed; OCR uses pinned supported npm data with jsDelivr+unpkg fallback and timeouts; canonical source stays read-only; JS bundle/signature/certificate are verified; SHA-256 is emitted; CI remains read-only.\n');
