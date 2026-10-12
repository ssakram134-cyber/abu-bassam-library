'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const eas=JSON.parse(read('eas.json'));
const pkg=JSON.parse(read('package.json'));
const app=JSON.parse(read('app.json'));
const ignored=read('.gitignore').split(/\r?\n/);
const prepare=read('scripts/prepare-android-assets.mjs');
const actions=read('.github/workflows/android.yml');
const pinned=read('config/release-signing-certificate.sha256').trim();
const verifier=read('scripts/verify-eas-android-apk.mjs');
const profile=eas.build?.['production-apk'];
assert.ok(profile,'Only explicit production-apk profile should be used for existing installations');
assert.equal(profile.credentialsSource,'local','Do not auto-generate a new EAS signing key');
assert.equal(profile.android?.buildType,'apk','Output must be an installable APK, not an AAB');
assert.equal(profile.distribution,'internal');
assert.equal(profile.autoIncrement,false,'Preserve canonical local versionCode');
assert.equal(eas.cli?.appVersionSource,'local');
assert.equal(app.expo.android.package,'com.abubassam.librarycamera3');
assert.equal(app.expo.android.versionCode,432);
assert.equal(pkg.scripts['eas-build-post-install'],'node scripts/prepare-android-assets.mjs');
assert.equal(pkg.scripts['eas-build-on-success'],'node scripts/verify-eas-android-apk.mjs');
for(const marker of ['--print-certs','assets/index.android.bundle','fingerprints[0] !== baseline',
 'APK was signed with a different key','APK SHA-256: ']) {
  assert.ok(verifier.includes(marker),'EAS production verification missing '+marker);
}
assert.ok(prepare.includes("resolve(projectRoot, 'android', 'app', 'src', 'main', 'assets', 'library')"),'Assets must be bundled in Android');
assert.ok(prepare.includes('await cp(source, destination, { recursive: true, force: true });'),'Copy canonical web assets');
assert.ok(prepare.includes('Offline OCR assets (Arabic + English) are embedded'),'Offline OCR must remain bundled');
assert.ok(prepare.includes('Offline PDF/DOCX/XLSX viewer assets are embedded'),'Offline document viewers must remain bundled');
assert.ok(ignored.includes('credentials.json'),'Never track local signing passwords');
assert.ok(ignored.includes('.env')&&ignored.includes('.env.*'),'Never track local environment secrets');
assert.match(pinned,/^[a-fA-F0-9]{64}$/,'Production signing certificate baseline must remain pinned');
assert.ok(actions.includes('if: ${{ false }}'),'GitHub Actions APK build remains deliberately disabled');
assert.equal(Object.keys(eas.build).length,1,'No accidental remote-key APK profile may be exposed');
console.log('EAS cloud APK configuration passed: explicit local keystore, offline assets after prebuild, pinned app identity, protected secrets, and disabled GitHub Actions.');
