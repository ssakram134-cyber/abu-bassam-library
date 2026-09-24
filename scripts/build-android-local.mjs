import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const win = process.platform === 'win32';

function run(cmd, args, cwd = root, env = process.env) {
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: win });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed with exit code ${r.status}`);
}

function findApk(dir) {
  if (!fs.existsSync(dir)) return null;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const name of fs.readdirSync(cur)) {
      const p = path.join(cur, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) stack.push(p);
      else if (/\.apk$/i.test(name)) return p;
    }
  }
  return null;
}

function ensureReleaseSigningHook() {
  if (!process.env.ANDROID_KEYSTORE_FILE) return;
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

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

try {
  console.log('1/5 Checking project...');
  run(win ? 'npm.cmd' : 'npm', ['run', 'check:web']);

  console.log('2/5 Generating Android project and offline assets...');
  run(win ? 'npm.cmd' : 'npm', ['run', 'android:prebuild'], root, { ...process.env, CI: '1' });
  ensureReleaseSigningHook();

  console.log('3/5 Building release APK...');
  const androidDir = path.join(root, 'android');
  const gradle = win ? 'gradlew.bat' : './gradlew';
  run(gradle, ['assembleRelease', '--no-daemon'], androidDir);

  console.log('4/5 Verifying embedded JS bundle...');
  const apk = findApk(path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release'));
  if (!apk || !fs.statSync(apk).size) throw new Error('Release APK was not produced');
  verifyBundle(apk);

  console.log('5/5 Preparing distributable files...');
  const dist = path.join(root, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  const out = path.join(dist, 'Abu_Bassam_Library_4.3.2.apk');
  fs.copyFileSync(apk, out);
  const hash = sha256(out);
  fs.writeFileSync(path.join(dist, 'SHA256.txt'), `${hash}  Abu_Bassam_Library_4.3.2.apk\n`);
  fs.writeFileSync(path.join(dist, 'BUILD_TYPE.txt'), process.env.ANDROID_KEYSTORE_FILE ? 'local-release-custom-key\n' : 'local-release-default-signing\n');
  console.log(`APK ready: ${out}`);
  console.log(`SHA-256: ${hash}`);
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
}
