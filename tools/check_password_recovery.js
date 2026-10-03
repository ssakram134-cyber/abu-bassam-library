const fs=require('node:fs');
const path=require('node:path');

const root=process.cwd();
const recovery=fs.readFileSync(path.join(root,'web/password-recovery-runtime.js'),'utf8');
const prepare=fs.readFileSync(path.join(root,'scripts/prepare-android-assets.mjs'),'utf8');
const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
const requiredRecovery=[
  "function accountEmail(){return String(window.AbuBassamSecurity?.email||window.AbuBassamCloud?.session?.()?.user?.email||'').trim().toLowerCase()}",
  "resetPasswordForEmail(accountEmail()",
  "exchangeCodeForSession(code)",
  "updateUser({password})",
  "abu-bassam-library://auth/callback",
  "نسيت كلمة المرور؟",
  "PASSWORD_RECOVERY",
  "if(!email||email!==accountEmail())throw new Error('تعذر تأكيد أن الحساب المفتوح يطابق البريد المعتمد')",
  "if(email&&email===accountEmail())openResetModal()"
];
for(const needle of requiredRecovery){if(!recovery.includes(needle))throw new Error(`password recovery missing: ${needle}`)}
if(recovery.includes('akramag1992@gmail.com'))throw new Error('password recovery contains obsolete incorrect account email');
if(/DEFAULT_ACCOUNT_EMAIL|akrama1992@gmail\.com/.test(recovery))throw new Error('password recovery must derive the account email from the canonical security identity');
const requiredPrepare=[
  "const source = resolve(projectRoot, 'web')",
  "await rm(destination, { recursive: true, force: true });",
  "await cp(source, destination, { recursive: true, force: true });",
  "Canonical source is read-only during normal builds"
];
for(const needle of requiredPrepare){if(!prepare.includes(needle))throw new Error(`android asset preparation missing: ${needle}`)}
for(const forbidden of ['patchAccountEmail','LEGACY_ACCOUNT_EMAIL',"ACCOUNT_EMAIL = 'akramag1992@gmail.com'"]){
  if(prepare.includes(forbidden))throw new Error(`android asset preparation must not rewrite account identity: ${forbidden}`)
}
if(app?.expo?.scheme!=='abu-bassam-library')throw new Error('Expo deep-link scheme is not abu-bassam-library');
console.log('Password recovery checks passed.');
