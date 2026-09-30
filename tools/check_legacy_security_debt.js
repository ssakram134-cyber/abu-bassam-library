const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),web=path.join(root,'web');
const files=fs.readdirSync(web).filter(n=>n.endsWith('.js'));
const cleanupOnly=new Set(['security-bootstrap-guard-runtime.js','security-hardening-runtime.js']);
const generatedRemoval=new Set(['app-security-runtime.js','settings-enhancements-runtime.js','operation-log-corrections-runtime.js']);
const failures=[];
const hardener=fs.readFileSync(path.join(root,'scripts','harden-v5-secondary-runtime.mjs'),'utf8');

for(const name of files){
  const src=fs.readFileSync(path.join(web,name),'utf8');
  if(!src.includes('__dev_secure_'))continue;
  if(cleanupOnly.has(name))continue;
  if(generatedRemoval.has(name)){
    if(!hardener.includes(`'${name}'`))failures.push(`${name}: legacy secret fallback exists but generated Android hardener does not target this file`);
    continue;
  }
  failures.push(`${name}: legacy device-secret web-storage reference is forbidden`);
}

const requiredHardener=[
  "await patch('app-security-runtime.js'",
  "await patch('settings-enhancements-runtime.js'",
  "await patch('operation-log-corrections-runtime.js'",
  "secureGet')return Promise.reject(new Error('NATIVE_SECURITY_REQUIRED'))",
  "Promise.reject(new Error('SECURE_STORAGE_REQUIRED'))",
  'Generated Android runtime still contains insecure legacy localStorage secret references outside cleanup guards'
];
for(const marker of requiredHardener)if(!hardener.includes(marker))failures.push(`generated Android secret hardening missing ${marker}`);

const bootstrap=fs.readFileSync(path.join(web,'security-bootstrap-guard-runtime.js'),'utf8');
for(const marker of ['LEGACY_SECRET_PREFIX','wipeLegacySecretStorage','installLegacySecretStorageBlock','Storage?.prototype','startsWith(LEGACY_SECRET_PREFIX)'])if(!bootstrap.includes(marker))failures.push(`security bootstrap missing ${marker}`);
const hardening=fs.readFileSync(path.join(web,'security-hardening-runtime.js'),'utf8');
for(const marker of ["k.startsWith('__dev_secure_')","Promise.reject(new Error('NATIVE_SECURITY_REQUIRED'))"])if(!hardening.includes(marker))failures.push(`security hardening missing ${marker}`);
const failClosed=fs.readFileSync(path.join(web,'fail-closed-runtime.js'),'utf8');
for(const marker of ['sensitiveButtons','acctRecoveryGenerate','acctRecoverDo','secureBridgeReady','stopImmediatePropagation','blockBranchVaultWithoutSecureStore'])if(!failClosed.includes(marker))failures.push(`fail-closed guard missing ${marker}`);
const password=fs.readFileSync(path.join(web,'password-policy-runtime.js'),'utf8');
for(const marker of ["setAttribute('minlength','12')",'enforceSignup','stopImmediatePropagation'])if(!password.includes(marker))failures.push(`password compatibility guard missing ${marker}`);
const secureSync=fs.readFileSync(path.join(web,'secure-sync-runtime.js'),'utf8');
if(!secureSync.includes("path = `${account.id}/vault/"))failures.push('secure-sync legacy vault marker changed: review this debt allowlist before accepting new behavior');
const branch=fs.readFileSync(path.join(web,'branch-vault-runtime.js'),'utf8');
for(const marker of ['SECURE_STORAGE_REQUIRED','c.uploadVault=uploadVault','c.downloadVault=downloadVault','c.removeVault=removeVault','__abuBranchVaultPatched'])if(!branch.includes(marker))failures.push(`branch gateway missing ${marker}`);

if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log('legacy security debt is contained: legacy localStorage secret references are limited to cleanup guards or explicitly stripped from generated Android app-security/settings/operation-log runtimes; final Android hardening rejects any remaining functional __dev_secure_ reference; Branch Vault and password/security fail-closed guards remain required.');
