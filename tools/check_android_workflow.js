const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'.github','workflows','android.yml');
const source=fs.readFileSync(file,'utf8');
const required=[
  'Build standalone APK with embedded JS bundle',
  './gradlew assembleRelease --no-daemon',
  'Verify standalone APK contains React Native bundle',
  'assets/index.android.bundle',
  'apksigner',
  'Prepare distributable APK',
  'dist/Abu_Bassam_Library_4.3.2.apk',
  'Upload APK artifacts'
];
const missing=required.filter(marker=>!source.includes(marker));
if(missing.length){
  process.stderr.write('Android workflow missing standalone APK safeguards:\n'+missing.map(x=>'- '+x).join('\n')+'\n');
  process.exit(1);
}
const forbidden=[
  './gradlew assembleDebug --no-daemon',
  'android/app/build/outputs/apk/debug/',
  'installable-debug'
];
const bad=forbidden.filter(marker=>source.includes(marker));
if(bad.length){
  process.stderr.write('Android workflow still permits Metro-dependent debug APK output:\n'+bad.map(x=>'- '+x).join('\n')+'\n');
  process.exit(1);
}
process.stdout.write('Android workflow check passed: distributable APK must be release-mode, signed, and contain assets/index.android.bundle.\n');
