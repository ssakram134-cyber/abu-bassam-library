const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
function read(p){if(!fs.existsSync(p))throw new Error(`missing ${p}`);return fs.readFileSync(p,'utf8')}
const source=read(path.join(root,'.github','workflows','android.yml'));
const pkg=read(path.join(root,'package.json'));
const local=read(path.join(root,'scripts','build-android-local.mjs'));
const required=[
  'permissions:\n  contents: read',
  'npm ci --no-audit --no-fund',
  'Build standalone APK with embedded JS bundle',
  './gradlew assembleRelease --no-daemon',
  'Verify standalone APK contains React Native bundle',
  'assets/index.android.bundle',
  'apksigner',
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
  'installable-debug',
  'contents: write',
  'git push',
  'Synchronize package lock',
  'npm install --no-audit --no-fund'
];
const bad=forbidden.filter(marker=>source.includes(marker));
if(bad.length){process.stderr.write('Android workflow contains unsafe/non-reproducible behavior:\n'+bad.map(x=>'- '+x).join('\n')+'\n');process.exit(1)}
const fallbackRequired=[
  ['"build:apk:local": "node scripts/build-android-local.mjs"',pkg,'package local build command'],
  ["['run', 'check:web']",local,'local build web checks'],
  ["['run', 'android:prebuild']",local,'local Android prebuild'],
  ["['assembleRelease', '--no-daemon']",local,'local release build'],
  ['assets/index.android.bundle',local,'embedded JS verification'],
  ["['verify', '--verbose', apk]",local,'APK signature verification'],
  ['ANDROID_HOME || process.env.ANDROID_SDK_ROOT',local,'Android SDK discovery'],
  ['android\', \'local.properties',local,'local.properties SDK fallback'],
  ['Abu_Bassam_Library_4.3.2.apk',local,'distribution APK name'],
  ['SHA256.txt',local,'SHA-256 output'],
  ['BUILD_TYPE.txt',local,'build type output']
];
const fallbackMissing=fallbackRequired.filter(([marker,src])=>!src.includes(marker)).map(([, ,label])=>label);
if(fallbackMissing.length){process.stderr.write('Android local fallback missing safeguards:\n'+fallbackMissing.map(x=>'- '+x).join('\n')+'\n');process.exit(1)}
process.stdout.write('Android build check passed: read-only hosted CI plus local release fallback, locked dependencies, embedded bundle verification, APK signature verification, SHA-256, and no repository self-mutation.\n');
