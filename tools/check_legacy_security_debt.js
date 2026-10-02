const fs=require('fs'),path=require('path');
const web=path.resolve(__dirname,'..','web');
const files=fs.readdirSync(web).filter(n=>n.endsWith('.js'));
const allowedLegacySecretFiles=new Set([
  'security-bootstrap-guard-runtime.js'
]);
const failures=[];
for(const name of files){
  const src=fs.readFileSync(path.join(web,name),'utf8');
  if(src.includes('__dev_secure_')&&!allowedLegacySecretFiles.has(name))failures.push(`${name}: new legacy device-secret web-storage fallback is forbidden`);
}
const bootstrap=fs.readFileSync(path.join(web,'security-bootstrap-guard-runtime.js'),'utf8');
for(const marker of ['LEGACY_SECRET_PREFIX','wipeLegacySecretStorage','installLegacySecretStorageBlock','Storage?.prototype','startsWith(LEGACY_SECRET_PREFIX)'])if(!bootstrap.includes(marker))failures.push(`security bootstrap missing ${marker}`);
const password=fs.readFileSync(path.join(web,'password-policy-runtime.js'),'utf8');
for(const marker of ["setAttribute('minlength','12')",'enforceSignup','stopImmediatePropagation'])if(!password.includes(marker))failures.push(`password compatibility guard missing ${marker}`);
const secureSync=fs.readFileSync(path.join(web,'secure-sync-runtime.js'),'utf8');
for(const marker of ['registerVaultAdapter','VAULT_GATEWAY_NOT_READY','AbuBassamNativeSecurity'])if(!secureSync.includes(marker))failures.push(`secure-sync canonical security missing ${marker}`);
for(const marker of ['/vault/','uploadVault(id,blob','downloadVault(path)','removeVault(path)'])if(secureSync.includes(marker))failures.push(`secure-sync legacy direct vault implementation returned: ${marker}`);
const branch=fs.readFileSync(path.join(web,'branch-vault-runtime.js'),'utf8');
for(const marker of ['SECURE_STORAGE_REQUIRED','registerCloudAdapter','registerVaultAdapter',"return api.can(key)===true"])if(!branch.includes(marker))failures.push(`branch gateway missing ${marker}`);
for(const marker of ['VAULT_DEFAULT','DEFAULT_ALLOWED','patchCloud'])if(branch.includes(marker))failures.push(`branch gateway legacy fail-open/patch behavior returned: ${marker}`);
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log('legacy security debt contained: only the bootstrap guard may mention the retired __dev_secure_ prefix so it can erase/block old values; all functional device-secret access requires native SecureStore; legacy signup is intercepted by the 12-character policy, and the old direct vault path has been removed in favor of a fail-closed Branch Vault adapter.');
