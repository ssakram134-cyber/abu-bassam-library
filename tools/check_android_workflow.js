const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const workflow=fs.readFileSync(path.join(root,'.github','workflows','android.yml'),'utf8');
const fallback=fs.readFileSync(path.join(root,'scripts','android-ci-debug-release-signing.gradle'),'utf8');
const required=[
  'Configure fallback release signing',
  'android/app/debug.keystore',
  'android-ci-debug-release-signing.gradle',
  'Build standalone release APK',
  './gradlew assembleRelease --no-daemon',
  'Verify standalone JS bundle is packaged',
  "assets/index.android.bundle",
  'unzip -t "$APK"',
  'Verify APK signature',
  'apksigner',
  'dist/Abu_Bassam_Library_4.3.2.apk',
  'BUNDLE_VERIFIED.txt',
  'Upload APK artifacts'
];
const missing=required.filter(marker=>!workflow.includes(marker));
if(missing.length){
  process.stderr.write('Android standalone workflow missing safeguards:\n'+missing.map(x=>'- '+x).join('\n')+'\n');
  process.exit(1);
}
if(/assembleDebug/.test(workflow)){
  process.stderr.write('Debug APK is forbidden as the distributable artifact because it depends on Metro.\n');
  process.exit(1);
}
if(!fallback.includes('signingConfig signingConfigs.debug')){
  process.stderr.write('Fallback Release signing must use the generated project debug signingConfig.\n');
  process.exit(1);
}
process.stdout.write('Android workflow check passed: distributable is Release, JS bundle presence and APK signature are verified.\n');
