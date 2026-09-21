const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'.github','workflows','android.yml');
const source=fs.readFileSync(file,'utf8');
const required=[
  'Build installable test APK',
  './gradlew assembleDebug --no-daemon',
  'Prepare distributable APK',
  'dist/Abu_Bassam_Library_4.3.2.apk',
  'test -s dist/Abu_Bassam_Library_4.3.2.apk',
  'Upload APK artifacts'
];
const missing=required.filter(marker=>!source.includes(marker));
if(missing.length){
  process.stderr.write('Android workflow missing installable APK safeguards:\n'+missing.map(x=>'- '+x).join('\n')+'\n');
  process.exit(1);
}
if(source.includes('if: ${{ env.HAS_ANDROID_RELEASE_KEY != \'true\' }}\n        working-directory: android\n        run: ./gradlew assembleRelease')){
  process.stderr.write('Android workflow still uses unsigned release as the no-key fallback.\n');
  process.exit(1);
}
process.stdout.write('Android workflow check passed: CI always produces an installable APK artifact.\n');
