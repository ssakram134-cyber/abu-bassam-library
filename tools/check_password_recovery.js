import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const recovery=fs.readFileSync(path.join(root,'web/password-recovery-runtime.js'),'utf8');
const prepare=fs.readFileSync(path.join(root,'scripts/prepare-android-assets.mjs'),'utf8');
const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
const requiredRecovery=[
  "const ACCOUNT_EMAIL='akramag1992@gmail.com'",
  "resetPasswordForEmail(ACCOUNT_EMAIL",
  "exchangeCodeForSession(code)",
  "updateUser({password})",
  "abu-bassam-library://auth/callback",
  "نسيت كلمة المرور؟",
  "PASSWORD_RECOVERY"
];
for(const needle of requiredRecovery){if(!recovery.includes(needle))throw new Error(`password recovery missing: ${needle}`)}
const requiredPrepare=[
  "const LEGACY_ACCOUNT_EMAIL = 'akrama1992@gmail.com'",
  "const ACCOUNT_EMAIL = 'akramag1992@gmail.com'",
  "PASSWORD_RECOVERY_RUNTIME = 'password-recovery-runtime.js'",
  'await patchAccountEmail();',
  'await injectRequiredRuntimes();'
];
for(const needle of requiredPrepare){if(!prepare.includes(needle))throw new Error(`android asset preparation missing: ${needle}`)}
if(app?.expo?.scheme!=='abu-bassam-library')throw new Error('Expo deep-link scheme is not abu-bassam-library');
console.log('Password recovery checks passed.');
