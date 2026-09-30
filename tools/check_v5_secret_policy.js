const fs=require('fs');
const source=fs.readFileSync('scripts/harden-v5-secondary-runtime.mjs','utf8');
const failures=[];
const need=marker=>{if(!source.includes(marker))failures.push(`missing ${marker}`)};

for(const marker of [
  "LEGACY_SECRET_CLEANUP_ALLOWLIST=new Set(['security-bootstrap-guard-runtime.js','security-hardening-runtime.js'])",
  "if(source.includes('__dev_secure_')&&!LEGACY_SECRET_CLEANUP_ALLOWLIST.has(basename(file)))",
  'secretFallbackLeftovers.push',
  'Generated Android runtime still contains insecure legacy localStorage secret references outside cleanup guards',
  "secureGet')return Promise.reject(new Error('NATIVE_SECURITY_REQUIRED'))",
  "secureSet')return Promise.reject(new Error('NATIVE_SECURITY_REQUIRED'))",
  "secureDelete')return Promise.reject(new Error('NATIVE_SECURITY_REQUIRED'))",
  "settings-enhancements-runtime.js",
  "operation-log-corrections-runtime.js",
  "notification-center-runtime.js",
  "Promise.reject(new Error('SECURE_STORAGE_REQUIRED'))",
  'abuBassamLockedDeviceIdV5',
  'abuBassamLockedDeviceNameV5',
  'abu_bassam_owner_activity_report',
  'abu_bassam_record_device_activity'
])need(marker);

const bootstrap=fs.readFileSync('web/security-bootstrap-guard-runtime.js','utf8');
for(const marker of ["LEGACY_SECRET_PREFIX='__dev_secure_'",'wipeLegacySecretStorage','installLegacySecretStorageBlock','proto.getItem','proto.setItem']){
  if(!bootstrap.includes(marker))failures.push(`security bootstrap missing cleanup/block marker ${marker}`);
}
const hardening=fs.readFileSync('web/security-hardening-runtime.js','utf8');
if(!hardening.includes("k.startsWith('__dev_secure_')"))failures.push('security hardening must continue removing legacy __dev_secure_ entries');
if(!hardening.includes("Promise.reject(new Error('NATIVE_SECURITY_REQUIRED'))"))failures.push('security hardening must fail closed without native security');

const operationLog=fs.readFileSync('web/operation-log-corrections-runtime.js','utf8');
if(!operationLog.includes("Promise.resolve(localStorage.getItem('__dev_secure_'+payload.key)||'')"))failures.push('operation-log legacy fallback changed; review generated hardening replacement before accepting');
const notifications=fs.readFileSync('web/notification-center-runtime.js','utf8');
if(!notifications.includes("Promise.reject(new Error('SECURE_STORAGE_REQUIRED'))"))failures.push('notification audit must already fail closed without native SecureStore');

if(failures.length){process.stderr.write(failures.join('\n')+'\n');process.exit(1)}
process.stdout.write('V5 secret-storage policy check passed: generated Android app-security/settings/operation-log secret operations fail closed; notifications already fail closed; legacy localStorage secret names are permitted only inside cleanup/block guards; audit RPC identity is required to use the v5 device namespace.\n');
