import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const assets=resolve(root,'android','app','src','main','assets','library');
const LEGACY=['abuBassamLockedDeviceIdV3','abuBassamLockedDeviceNameV3','abuBassamLockedDeviceCreatedV3'];

async function patch(relative,replacements,required=[],forbidden=[]){
  const file=resolve(assets,relative);
  let source=await readFile(file,'utf8');
  let changed=false;
  for(const [oldValue,newValue] of replacements){
    if(source.includes(oldValue)){
      source=source.split(oldValue).join(newValue);
      changed=true;
    }
    if(!source.includes(newValue))throw new Error(`v5 secondary hardening could not verify ${relative}: ${newValue}`);
  }
  if(changed)await writeFile(file,source,'utf8');
  const verified=changed?source:await readFile(file,'utf8');
  for(const marker of required)if(!verified.includes(marker))throw new Error(`v5 secondary hardening missing ${marker} in ${relative}`);
  for(const marker of forbidden)if(verified.includes(marker))throw new Error(`v5 secondary hardening found forbidden ${marker} in ${relative}`);
}

async function runtimeFiles(dir,out=[]){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const target=resolve(dir,entry.name);
    if(entry.isDirectory())await runtimeFiles(target,out);
    else if(entry.isFile()&&/\.(?:js|html)$/i.test(entry.name))out.push(target);
  }
  return out;
}

await stat(assets).catch(()=>{throw new Error('Generated Android web assets are missing; run prepare-android-assets first')});

await patch('app-security-runtime.js',[
  ["if(action==='secureGet')return Promise.resolve(localStorage.getItem('__dev_secure_'+payload.key)||'');","if(action==='secureGet')return Promise.reject(new Error('NATIVE_SECURITY_REQUIRED'));"],
  ["if(action==='secureSet'){localStorage.setItem('__dev_secure_'+payload.key,String(payload.value||''));return Promise.resolve(true)}","if(action==='secureSet')return Promise.reject(new Error('NATIVE_SECURITY_REQUIRED'));"],
  ["if(action==='secureDelete'){localStorage.removeItem('__dev_secure_'+payload.key);return Promise.resolve(true)}","if(action==='secureDelete')return Promise.reject(new Error('NATIVE_SECURITY_REQUIRED'));"],
],[
  "if(action==='secureGet')return Promise.reject(new Error('NATIVE_SECURITY_REQUIRED'));",
  "if(action==='secureSet')return Promise.reject(new Error('NATIVE_SECURITY_REQUIRED'));",
  "if(action==='secureDelete')return Promise.reject(new Error('NATIVE_SECURITY_REQUIRED'));",
  'abuBassamLockedDeviceIdV5',
  'abuBassamLockedDeviceNameV5',
],['__dev_secure_',...LEGACY]);

await patch('settings-corrections-runtime.js',[
  ["localStorage.getItem('abuBassamLockedDeviceIdV3')","localStorage.getItem('abuBassamLockedDeviceIdV5')"],
  ["device.app_version||'4.3.2'","device.app_version||'5.0.0'"],
],[
  'abuBassamLockedDeviceIdV5',
  "device.app_version||'5.0.0'",
  'AbuBassamDevices?.ensure?.().id',
],LEGACY);

await patch('settings-enhancements-runtime.js',[],[
  'abuBassamLockedDeviceIdV5',
  "Promise.reject(new Error('SECURE_STORAGE_REQUIRED'))",
],['__dev_secure_',...LEGACY]);

const leftovers=[];
for(const file of await runtimeFiles(assets)){
  const source=await readFile(file,'utf8');
  const found=LEGACY.filter(marker=>source.includes(marker));
  if(found.length)leftovers.push(`${file.slice(assets.length+1)}: ${found.join(', ')}`);
}
if(leftovers.length){
  throw new Error('Generated Android runtime still contains legacy V3 device identity references:\n'+leftovers.join('\n'));
}

process.stdout.write('Generated Android runtime v5 identity verified: no V3 device-id/name/created references remain; app-security secret get/set/delete and owner-sensitive settings fail closed without native SecureStore; settings corrections use V5.\n');
