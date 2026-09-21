const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const workflow=fs.readFileSync(path.join(root,'.github','workflows','android.yml'),'utf8');
const signing=fs.readFileSync(path.join(root,'scripts','android-ci-debug-release-signing.gradle'),'utf8');
const required=[
  'Build standalone release APK',
  './gradlew assembleRelease --no-daemon',
  'Verify standalone JS bundle is packaged',
  'assets/index.android.bundle',
  'Verify APK signature',
  'apksigner verify',
  'dist/Abu_Bassam_Library_4.3.2.apk'
];
const missing=required.filter(x=>!workflow.includes(x));
if(missing.length){
  process.stderr.write('Standalone Android workflow is incomplete:\n'+missing.map(x=>'- '+x).join('\n')+'\n');
  process.exit(1);
}
if(workflow.includes('assembleDebug')){
  process.stderr.write('Debug APK fallback is forbidden because it requires Metro.\n');
  process.exit(1);
}
if(!signing.includes('signingConfig signingConfigs.debug')){
  process.stderr.write('CI fallback release signing is not configured.\n');
  process.exit(1);
}
process.stdout.write('Standalone Android workflow check passed: release variant, bundled JS, and signature verification are enforced.\n');
