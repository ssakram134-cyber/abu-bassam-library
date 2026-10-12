import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const baseline = readFileSync(join(root, 'config/release-signing-certificate.sha256'), 'utf8')
  .trim().replace(/:/g, '').toLowerCase();
if (!/^[a-f0-9]{64}$/.test(baseline)) throw new Error('Pinned production signing certificate is missing or invalid');

const releaseDir = join(root, 'android/app/build/outputs/apk/release');
const apks = readdirSync(releaseDir).filter(name => name.endsWith('.apk'));
if (apks.length !== 1) throw new Error('Expected exactly one Android release APK to verify');
const apk = join(releaseDir, apks[0]);
if (statSync(apk).size < 100000) throw new Error('Generated APK is suspiciously small');

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk) throw new Error('Android SDK location is unavailable');
const toolsRoot = join(sdk, 'build-tools');
const versions = readdirSync(toolsRoot).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
let signer = '';
for (const version of versions.reverse()) {
  const candidate = join(toolsRoot, version, 'apksigner');
  try { if (statSync(candidate).isFile()) { signer = candidate; break; } } catch (_) {}
}
if (!signer) throw new Error('apksigner is required to check the release signature');
const signing = spawnSync(signer, ['verify', '--print-certs', apk], { encoding: 'utf8' });
if (signing.error || signing.status !== 0) throw new Error('APK signature verification failed: ' + String(signing.stderr || signing.error || '').slice(0, 250));
const printed = String(signing.stdout || '');
const fingerprints = Array.from(printed.matchAll(/Signer #\d+ certificate SHA-256 digest:\s*([a-f0-9:]{64,95})/gi),
  match => match[1].replace(/:/g, '').toLowerCase());
if (fingerprints.length !== 1) throw new Error('APK must have exactly one readable signing certificate');
if (fingerprints[0] !== baseline) throw new Error('APK was signed with a different key: refusing to mark this as a safe update');

const listing = spawnSync('unzip', ['-Z', '-1', apk], {
  encoding: 'utf8', maxBuffer: 8 * 1024 * 1024
});
if (listing.error || listing.status !== 0) {
  throw new Error('Unable to inspect the contents of the release APK');
}
const bundled = new Set(String(listing.stdout).split(/\r?\n/).filter(Boolean));
if (!bundled.has('assets/index.android.bundle')) {
  throw new Error('APK is missing its offline React Native JavaScript bundle');
}
// Android's WebView opens file:///android_asset/library/index.html. The APK must
// include this entire offline entry point, not merely the React Native bundle.
const requiredOfflineAssets = [
  'assets/library/index.html',
  'assets/library/device-name-runtime.js',
  'assets/library/app-security-runtime.js',
  'assets/library/document-vault-runtime.js',
  'assets/library/national-id-runtime.js',
  'assets/library/questions-ar.html',
  'assets/library/questions-en.html',
  'assets/library/image-compressor.html',
  'assets/library/vendor/tesseract/tesseract.min.js',
  'assets/library/vendor/tesseract/worker.min.js',
  'assets/library/vendor/tesseract/core/tesseract-core.wasm.js',
  'assets/library/vendor/tesseract/core/tesseract-core-simd.wasm.js',
  'assets/library/vendor/tesseract/core/tesseract-core-lstm.wasm.js',
  'assets/library/vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js',
  'assets/library/vendor/tesseract/lang/ara.traineddata',
  'assets/library/vendor/tesseract/lang/eng.traineddata',
  'assets/library/vendor/documents/pdf.min.js',
  'assets/library/vendor/documents/pdf.worker.min.js',
  'assets/library/vendor/documents/mammoth.browser.min.js',
  'assets/library/vendor/documents/xlsx.full.min.js'
];
const missingAssets = requiredOfflineAssets.filter(name => !bundled.has(name));
if (missingAssets.length) {
  throw new Error('APK is missing required offline assets: ' + missingAssets.join(', '));
}
const sha = createHash('sha256').update(readFileSync(apk)).digest('hex');
console.log('Verified Android APK signing certificate matches the pinned production key.');
console.log('Verified React Native bundle and all required offline library assets. APK SHA-256: ' + sha);
