import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const win = process.platform === 'win32';
const requireReleaseKey = process.argv.includes('--require-release-key');
const signingVars = ['ANDROID_KEYSTORE_FILE','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD'];

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
  return signingVars.every(name => String(process.env[name] || '').trim());
}

function validateSigningConfiguration() {
  const configured = signingConfigured();
  if (requireReleaseKey && !configured) {
    const missing = signingVars.filter(name => !String(process.env[name] || '').trim());
    throw new Error(`Production release signing is required. Missing: ${missing.join(', ')}`);
  }
  if (configured && !fs.existsSync(process.env.ANDROID_KEYSTORE_FILE)) {
    throw new Error(`ANDROID_KEYSTORE_FILE does not exist: ${process.env.ANDROID_KEYSTORE_FILE}`);
  }
  if (configured && !fs.statSync(process.env.ANDROID_KEYSTORE_FILE).isFile()) {
    throw new Error('ANDROID_KEYSTORE_FILE must point to a regular file');
  }
  return configured;
}

function findApk(dir) {
  if (!fs.existsSync(dir)) return null;
  const stack = [dir], found = [];
  while (stack.length) {
    const cur = stack.pop();
    for (const name of fs.readdirSync(cur)) {
      const p = path.join(cur, name), st = fs.statSync(p);
      if (st.isDirectory()) stack.push(p);
      else if (st.isFile() && /\.apk$/i.test(name)) found.push(p);
    }
  }
  if (found.length > 1) {
    throw new Error('Multiple release APKs found; cannot safely choose an arbitrary build: ' + found.sort().join(', '));
  }
  return found[0] || null;
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
  const zip = fs.readFileSync(apk);
  const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;
  function crc32(bytes) {
    let crc = -1;
    for (const byte of bytes) {
      crc ^= byte;
      for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ -1) >>> 0;
  }
  const bad = (reason) => { throw new Error('Embedded JS bundle validation failed: ' + reason); };
  if (zip.length < 22) bad('APK is not a complete ZIP archive');
  // ZIP end-of-central-directory can be up to 65,535 bytes behind EOF.
  let eocd = -1;
  const minOffset = Math.max(0, zip.length - 22 - 65535);
  for (let i = zip.length - 22; i >= minOffset; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50 && i + 22 + zip.readUInt16LE(i + 20) === zip.length) {
      eocd = i; break;
    }
  }
  if (eocd < 0) bad('ZIP central directory is missing');
  if (zip.readUInt16LE(eocd + 4) || zip.readUInt16LE(eocd + 6)) bad('Multi-disk APK is unsupported');
  const entries = zip.readUInt16LE(eocd + 10);
  const directorySize = zip.readUInt32LE(eocd + 12);
  const directoryStart = zip.readUInt32LE(eocd + 16);
  if (entries === 65535 || directorySize === 0xffffffff || directoryStart === 0xffffffff ||
      directoryStart + directorySize > eocd) bad('ZIP directory bounds are invalid or ZIP64 is unsupported');
  const target = 'assets/index.android.bundle';
  let cursor = directoryStart;
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > eocd || zip.readUInt32LE(cursor) !== 0x02014b50) bad('Invalid ZIP directory entry');
    const flags = zip.readUInt16LE(cursor + 8);
    const method = zip.readUInt16LE(cursor + 10);
    const expectedCrc = zip.readUInt32LE(cursor + 16);
    const compressed = zip.readUInt32LE(cursor + 20);
    const expanded = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > eocd) bad('ZIP filename or metadata exceeds directory bounds');
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (name === target) {
      if (expanded < 1000 || compressed === 0 || compressed > MAX_BUNDLE_BYTES ||
          expanded > MAX_BUNDLE_BYTES || (flags & 1) || (method !== 0 && method !== 8)) {
        bad('Embedded JS bundle is empty, encrypted, or uses an unsupported encoding');
      }
      if (localOffset + 30 > directoryStart || zip.readUInt32LE(localOffset) !== 0x04034b50) bad('JS bundle has no local ZIP file entry');
      const localNameLength = zip.readUInt16LE(localOffset + 26);
      const localExtraLength = zip.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      if (zip.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString('utf8') !== target ||
          dataStart + compressed > directoryStart) bad('JS bundle local file is missing or incomplete');
      const bytes = zip.subarray(dataStart, dataStart + compressed);
      const contents = method === 8 ? inflateRawSync(bytes, { maxOutputLength: MAX_BUNDLE_BYTES }) : bytes;
      if (contents.length !== expanded || contents.length < 1000) bad('Embedded JS bundle content is incomplete');
      if (crc32(contents) !== expectedCrc) bad('Embedded JS bundle CRC-32 does not match ZIP directory');
      return contents.length;
    }
    cursor = next;
  }
  bad('APK does not contain a real assets/index.android.bundle ZIP entry');
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
  const apk = findApk(path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release'));
  if (!apk || !fs.statSync(apk).size) throw new Error('Release APK was not produced');
  verifyBundle(apk);

  console.log('5/6 Verifying APK signature and certificate...');
  const certificate = verifySignature(apk);

  console.log('6/6 Preparing distributable files...');
  const dist = path.join(root, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  const out = path.join(dist, 'Abu_Bassam_Library_4.3.2.apk');
  fs.copyFileSync(apk, out);
  const hash = sha256(out);
  fs.writeFileSync(path.join(dist, 'SHA256.txt'), `${hash}  Abu_Bassam_Library_4.3.2.apk\n`);
  fs.writeFileSync(path.join(dist, 'SIGNING_CERTIFICATE.txt'), certificate);
  fs.writeFileSync(path.join(dist, 'BUILD_TYPE.txt'), customSigning ? 'signed-production-release-with-embedded-js\n' : 'local-test-release-default-key-with-embedded-js\n');
  if (requireReleaseKey && !customSigning) throw new Error('Refusing to mark an unsigned/test APK as a production release');
  console.log(`APK ready: ${out}`);
  console.log(`SHA-256: ${hash}`);
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
}
