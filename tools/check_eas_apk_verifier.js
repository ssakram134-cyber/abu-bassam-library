'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'scripts/verify-eas-android-apk.mjs'), 'utf8');
const script = source.replace(/^import [^\n]+;\r?\n/gm, '')
  .replace("fileURLToPath(new URL('..', import.meta.url))", "'/project'");
assert.ok(!/\bimport\b|import\.meta/.test(script), 'Verifier must be runnable without external modules');

const EXPECTED_OFFLINE_ASSETS = [
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
  'assets/library/vendor/tesseract/lang/ara.traineddata.gz',
  'assets/library/vendor/tesseract/lang/eng.traineddata.gz',
  'assets/library/vendor/documents/pdf.min.js',
  'assets/library/vendor/documents/pdf.worker.min.js',
  'assets/library/vendor/documents/mammoth.browser.min.js',
  'assets/library/vendor/documents/xlsx.full.min.js'
];
for (const asset of EXPECTED_OFFLINE_ASSETS) {
  assert.ok(source.includes("'" + asset + "'"), 'APK verifier must require ' + asset);
}

function verify(options = {}) {
  const fingerprint = 'a'.repeat(64);
  const logs = [];
  const readFileSync = filename => {
    if (String(filename).endsWith('release-signing-certificate.sha256')) return options.badBaseline ? '' : fingerprint;
    if (String(filename).endsWith('.apk')) return new Uint8Array([65, 66, 85, 66, 65, 83, 83, 65, 77]);
    throw Error('Unexpected file read ' + filename);
  };
  const readdirSync = directory => {
    if (String(directory).endsWith('/outputs/apk/release')) return options.multipleApks ? ['app-release.apk', 'old.apk'] : ['app-release.apk'];
    if (String(directory).endsWith('/build-tools')) return ['35.0.0'];
    throw Error('Unexpected directory ' + directory);
  };
  const statSync = filename => ({
    size: options.tinyApk ? 100 : 1800000,
    isFile: () => true
  });
  const spawnSync = (command, args) => {
    if (String(command).endsWith('/apksigner')) {
      return options.badSignature ? { status: 1, stderr: 'not signed' } : {
        status: 0,
        stdout: 'Signer #1 certificate SHA-256 digest: ' + (options.wrongCertificate ? 'b'.repeat(64) : fingerprint)
          + (options.multipleSigners ? '\nSigner #2 certificate SHA-256 digest: ' + fingerprint : '')
      };
    }
    if (command === 'unzip') {
      if (options.unreadableZip) return { status: 9, stderr: 'cannot list APK' };
      const names = ['assets/index.android.bundle', ...EXPECTED_OFFLINE_ASSETS, 'META-INF/MANIFEST.MF'];
      const present = names.filter(name =>
        !(options.missingBundle && name === 'assets/index.android.bundle') &&
        name !== options.missingOfflineAsset
      );
      return { status: 0, stdout: present.join('\n') + '\n' };
    }
    throw Error('Unexpected command ' + command);
  };
  const crypto = {createHash: () => ({
    update: function () {return this;},
    digest: () => 'mock-sha256'
  })};
  const run = new Function('readFileSync', 'readdirSync', 'statSync', 'resolve', 'join',
    'spawnSync', 'createHash', 'process', 'console', script);
  run(readFileSync, readdirSync, statSync, path.resolve, path.join, spawnSync, crypto.createHash,
    { env: options.missingSDK ? {} : { ANDROID_HOME: '/sdk' } },
    { log: value => logs.push(String(value)) });
  return logs;
}
assert.match(verify().join('\n'), /Verified Android APK signing certificate/);
assert.match(verify().join('\n'), /APK SHA-256: mock-sha256/);
for (const [label, options, message] of [
  ['wrong signing key', {wrongCertificate: true}, /different key/],
  ['bad APK signature', {badSignature: true}, /signature verification failed/],
  ['missing JS bundle', {missingBundle: true}, /missing its offline React Native JavaScript bundle/],
  ['multiple signers', {multipleSigners: true}, /exactly one readable signing certificate/],
  ['multiple APK outputs', {multipleApks: true}, /exactly one Android release APK/],
  ['undersized APK', {tinyApk: true}, /suspiciously small/],
  ['missing Android SDK', {missingSDK: true}, /Android SDK location is unavailable/],
  ['invalid baseline', {badBaseline: true}, /production signing certificate is missing or invalid/]
]) {
  assert.throws(() => verify(options), message, label);
}
for (const missingOfflineAsset of EXPECTED_OFFLINE_ASSETS) {
  assert.throws(() => verify({ missingOfflineAsset }), /missing required offline assets/,
    'Missing offline component must block APK release: ' + missingOfflineAsset);
}
assert.throws(() => verify({ unreadableZip: true }), /Unable to inspect the contents of the release APK/);
console.log('EAS APK verifier passed: valid signature, 8 signing/bundle failures, 20 missing offline assets and unreadable APK rejection.');
