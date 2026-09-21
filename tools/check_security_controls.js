const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const failures = [];
const requireMarkers = (file, markers) => {
  const source = read(file);
  for (const marker of markers) if (!source.includes(marker)) failures.push(`${file}: missing ${marker}`);
};

requireMarkers('index.js', [
  "expo-local-authentication",
  "expo-secure-store",
  "expo-screen-capture",
  'LocalAuthentication.authenticateAsync',
  'SecureStore.setItemAsync',
  'ScreenCapture.preventScreenCaptureAsync',
  'ScreenCapture.allowScreenCaptureAsync',
  "action === 'privacyMode'",
  'BackHandler.exitApp',
  'AbuBassamNativeBackPress',
  'AbuBassamNativeAppState',
]);

requireMarkers('web/app-security-runtime.js', [
  "MAIN_USERNAME='akrama1992'",
  'MAX_DEVICES=5',
  'abu_bassam_register_device',
  'abu_bassam_manage_device',
  'abu_bassam_remove_device',
  'SECONDARY_DEFAULT',
  'OWNER_PERMISSIONS',
  'toggleBiometric',
  'appearanceSync',
  'اضغط مرة ثانية للخروج',
]);

requireMarkers('web/security-extras-runtime.js', [
  'ATTEMPT_KEY',
  'recordLoginFailure',
  'verifyDangerPin',
  'changePassword',
  'abuBassamEmergencySnapshotV1',
  'safeSnapshot',
  'restoreSnapshot',
  "nativeRequest('privacyMode'",
  'خصوصية عالية',
  'تسجيل الخروج',
]);

requireMarkers('web/permission-guard-runtime.js', [
  '__ABU_PERMISSION_GUARD_V1__',
  "return'print'",
  "return'export'",
  "return'appearance'",
  "return'sync'",
  "return'edit'",
  'beforeinput',
  'stopImmediatePropagation',
]);

requireMarkers('web/device-name-runtime.js', [
  'app-security-runtime.js',
  'security-extras-runtime.js',
  'permission-guard-runtime.js',
]);

const packageJson = JSON.parse(read('package.json'));
for (const dep of ['expo-local-authentication', 'expo-secure-store', 'expo-screen-capture']) {
  if (!packageJson.dependencies?.[dep]) failures.push(`package.json: missing ${dep}`);
}

const currentProjectText = [
  'index.js',
  'web/app-security-runtime.js',
  'web/security-extras-runtime.js',
  'web/permission-guard-runtime.js',
  'tools/check_project.js',
  'tools/check_security_controls.js',
].map(read).join('\n');
if (/service_role|sb_secret_|BEGIN PRIVATE KEY/i.test(currentProjectText)) failures.push('Sensitive server credential marker found in current security source');

if (failures.length) {
  process.stderr.write(failures.join('\n') + '\n');
  process.exit(1);
}
process.stdout.write('Security/control checks passed (biometrics, secure storage, privacy, 5-device roles, permissions, recovery, login throttling and exit control).\n');
