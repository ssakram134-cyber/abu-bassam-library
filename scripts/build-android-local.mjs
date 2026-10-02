import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const win = process.platform === 'win32';
const requireReleaseKey = process.argv.includes('--require-release-key');
const signingVars = ['ANDROID_KEYSTORE_FILE','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD'];
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const appVersion = String(packageJson.version || '').trim();
if (!appVersion) throw new Error('package.json version is missing');

function run(cmd, args, cwd = root, env = process.env) {
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: win });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed with exit code ${r.status}`);
}

function capture(cmd, args, cwd = root, env = process.env) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', shell: win });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed with exit code ${r.status}: ${(r.stderr || r.stdout || '').trim()}`);
  return String(r.stdout || '');
}

function signingConfigured() {
  const present = signingVars.filter(name => String(process.env[name] || '').trim());
  if (present.length > 0 && present.length < signingVars.length) {
    const missing = signingVars.filter(name => !String(process.env[name] || '').trim());
    throw new Error(`Incomplete Android signing configuration. Missing: ${missing.join(', ')}`);
  }
  return present.length === signingVars.length;
}

function validateSigningConfiguration() {
  const configured = signingConfigured();
  if (requireReleaseKey && !configured) {
    throw new Error(`Production release signing is required. Missing: ${signingVars.join(', ')}`);
  }
  if (configured && !fs.existsSync(process.env.ANDROID_KEYSTORE_FILE)) {
    throw new Error(`ANDROID_KEYSTORE_FILE does not exist: ${process.env.ANDROID_KEYSTORE_FILE}`);
  }
  if (configured && !fs.statSync(process.env.ANDROID_KEYSTORE_FILE).isFile()) {
    throw new Error('ANDROID_KEYSTORE_FILE must point to a regular file');
  }
  return configured;
}

function findReleaseApk(dir) {
  if (!fs.existsSync(dir)) return '';
  const apks = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const name of fs.readdirSync(cur)) {
      const p = path.join(cur, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) stack.push(p);
      else if (/\.apk$/i.test(name)) apks.push(p);
    }
  }
  if (apks.length !== 1) throw new Error(`Expected exactly one release APK, found ${apks.length}`);
  return apks[0];
}

function ensureReleaseSigningHook(configured) {
  if (!configured) return;
  const gradle = path.join(root, 'android', 'app', 'build.gradle');
  const hook = 'apply from: file("../../scripts/android-release-signing.gradle")';
  let src = fs.readFileSync(gradle, 'utf8');
  if (!src.includes(hook)) {
    src += `\n${hook}\n`;
    fs.writeFileSync(gradle, src);
  }
}

function verifyBundle(apk) {
  const buf = fs.readFileSync(apk);
  if (!buf.includes(Buffer.from('assets/index.android.bundle'))) {
    throw new Error('APK does not contain assets/index.android.bundle');
  }
}

function sdkRoot() {
  const fromEnv = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const local = path.join(root, 'android', 'local.properties');
  if (!fs.existsSync(local)) return '';
  const text = fs.readFileSync(local, 'utf8');
  const m = text.match(/^sdk\.dir=(.+)$/m);
  if (!m) return '';
  const value = m[1].trim().replace(/\\\\/g, '\\').replace(/\\:/g, ':');
  return fs.existsSync(value) ? value : '';
}

function findApksigner() {
  const sdk = sdkRoot();
  if (!sdk) return '';
  const buildTools = path.join(sdk, 'build-tools');
  if (!fs.existsSync(buildTools)) return '';
  const dirs = fs.readdirSync(buildTools)
    .filter(name => fs.statSync(path.join(buildTools, name)).isDirectory())
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (let i = dirs.length - 1; i >= 0; i--) {
    const candidate = path.join(buildTools, dirs[i], win ? 'apksigner.bat' : 'apksigner');
    if (fs.existsSync(candidate)) return candidate;
  }
  return '';
}

function verifySignature(apk) {
  const apksigner = findApksigner();
  if (!apksigner) throw new Error('Android SDK apksigner was not found; cannot verify APK signature');
  run(apksigner, ['verify', '--verbose', apk]);
  const cert = capture(apksigner, ['verify', '--print-certs', apk]);
  if (!/Signer #1 certificate/i.test(cert)) throw new Error('APK signer certificate details were not produced');
  return cert;
}

function expectedReleaseCertificateDigest() {
  const file = path.join(root, 'config', 'release-signing-certificate.sha256');
  if (!fs.existsSync(file)) throw new Error('Missing config/release-signing-certificate.sha256');
  const digest = fs.readFileSync(file, 'utf8').replace(/\s+/g, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error('release-signing-certificate.sha256 must contain exactly one SHA-256 digest');
  return digest;
}

function certificateDigest(certText) {
  const match = String(certText).match(/^Signer #1 certificate SHA-256 digest:\s*([^\r\n]+)$/mi);
  if (!match) throw new Error('APK signer SHA-256 certificate digest was not produced');
  const digest = match[1].replace(/[:\s]/g, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error('APK signer certificate SHA-256 digest is invalid');
  return digest;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

try {
  const customSigning = validateSigningConfiguration();
  console.log(`Signing mode: ${customSigning ? 'production/custom key' : 'test/default key'}`);
  if (!customSigning && !requireReleaseKey) console.warn('WARNING: local test build only; do not distribute as production release.');

  console.log('1/6 Checking project...');
  run(win ? 'npm.cmd' : 'npm', ['run', 'check:web']);

  console.log('2/6 Generating Android project and offline assets...');
  run(win ? 'npm.cmd' : 'npm', ['run', 'android:prebuild'], root, { ...process.env, CI: '1' });
  ensureReleaseSigningHook(customSigning);

  console.log('3/6 Building release APK...');
  const androidDir = path.join(root, 'android');
  const gradle = win ? 'gradlew.bat' : './gradlew';
  run(gradle, ['assembleRelease', '--no-daemon'], androidDir);

  console.log('4/6 Verifying embedded JS bundle...');
  const apk = findReleaseApk(path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release'));
  if (!fs.statSync(apk).size) throw new Error('Release APK was not produced');
  verifyBundle(apk);

  console.log('5/6 Verifying APK signature and certificate...');
  const certificate = verifySignature(apk);
  if (customSigning) {
    const expected = expectedReleaseCertificateDigest();
    const actual = certificateDigest(certificate);
    if (actual !== expected) throw new Error(`Production signing certificate mismatch. Expected ${expected}, got ${actual}`);
  }

  console.log('6/6 Preparing distributable files...');
  const dist = path.join(root, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  for (const name of fs.readdirSync(dist)) {
    if (/^Abu_Bassam_Library_.*\.apk$/i.test(name) || ['SHA256.txt','SIGNING_CERTIFICATE.txt','BUILD_TYPE.txt'].includes(name)) {
      fs.rmSync(path.join(dist, name), { force: true });
    }
  }
  const apkFileName = `Abu_Bassam_Library_${appVersion}.apk`;
  const out = path.join(dist, apkFileName);
  fs.copyFileSync(apk, out);
  const hash = sha256(out);
  fs.writeFileSync(path.join(dist, 'SHA256.txt'), `${hash}  ${apkFileName}\n`);
  fs.writeFileSync(path.join(dist, 'SIGNING_CERTIFICATE.txt'), certificate);
  fs.writeFileSync(path.join(dist, 'BUILD_TYPE.txt'), customSigning ? 'signed-production-release-with-embedded-js\n' : 'test-release-default-key-with-embedded-js-NOT-FOR-PRODUCTION-UPDATES\n');
  if (requireReleaseKey && !customSigning) throw new Error('Refusing to mark an unsigned/test APK as a production release');
  console.log(`APK ready: ${out}`);
  console.log(`SHA-256: ${hash}`);
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
}
