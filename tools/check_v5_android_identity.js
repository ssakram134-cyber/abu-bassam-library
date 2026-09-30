const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const failures=[];
const fail=message=>failures.push(message);

const specs=[
  {
    file:'web/app-security-runtime.js',
    replacements:[
      ["const APP_VERSION='4.3.2';","const APP_VERSION='5.0.0';"],
      ["const DEVICE_ID_KEY='abuBassamLockedDeviceIdV3';","const DEVICE_ID_KEY='abuBassamLockedDeviceIdV5';"],
      ["const DEVICE_NAME_KEY='abuBassamLockedDeviceNameV3';","const DEVICE_NAME_KEY='abuBassamLockedDeviceNameV5';"],
    ],
    required:["const APP_VERSION='5.0.0';",'abuBassamLockedDeviceIdV5','abuBassamLockedDeviceNameV5','p_app_version:APP_VERSION'],
  },
  {
    file:'web/security-hardening-runtime.js',
    replacements:[
      ["const APP_VERSION='4.3.2';","const APP_VERSION='5.0.0';"],
      ["localStorage.getItem('abuBassamLockedDeviceIdV3')","localStorage.getItem('abuBassamLockedDeviceIdV5')"],
    ],
    required:["const APP_VERSION='5.0.0';",'abuBassamLockedDeviceIdV5','trust?.appVersion!==APP_VERSION','p_app_version:APP_VERSION'],
  },
  {
    file:'web/account-center-runtime.js',
    replacements:[
      ["APP='4.3.2'","APP='5.0.0'"],
      ["'abuBassamLockedDeviceIdV3'","'abuBassamLockedDeviceIdV5'"],
      ["'abuBassamLockedDeviceNameV3'","'abuBassamLockedDeviceNameV5'"],
      ["'abuBassamLockedDeviceCreatedV3'","'abuBassamLockedDeviceCreatedV5'"],
    ],
    required:["APP='5.0.0'",'abuBassamLockedDeviceIdV5','abuBassamLockedDeviceNameV5','abuBassamLockedDeviceCreatedV5','p_app_version:APP'],
  },
  {
    file:'web/account-recovery-hardening-runtime.js',
    replacements:[
      ["const APP='4.3.2';","const APP='5.0.0';"],
      ["'abuBassamLockedDeviceIdV3'","'abuBassamLockedDeviceIdV5'"],
      ["'abuBassamLockedDeviceNameV3'","'abuBassamLockedDeviceNameV5'"],
      ["'abuBassamLockedDeviceCreatedV3'","'abuBassamLockedDeviceCreatedV5'"],
    ],
    required:["const APP='5.0.0';",'abuBassamLockedDeviceIdV5','abuBassamLockedDeviceNameV5','abuBassamLockedDeviceCreatedV5','p_app_version:APP'],
  },
  {
    file:'web/device-reconcile-runtime.js',
    replacements:[["localStorage.getItem('abuBassamLockedDeviceIdV3')","localStorage.getItem('abuBassamLockedDeviceIdV5')"]],
    required:['abuBassamLockedDeviceIdV5','abu_bassam_owner_devices','abu_bassam_owner_device_count','abu_bassam_set_device_limit'],
  },
  {
    file:'web/branch-vault-runtime.js',
    replacements:[
      ["localStorage.getItem('abuBassamLockedDeviceIdV3')","localStorage.getItem('abuBassamLockedDeviceIdV5')"],
      ["localStorage.getItem('abuBassamLockedDeviceNameV3')","localStorage.getItem('abuBassamLockedDeviceNameV5')"],
    ],
    required:['abuBassamLockedDeviceIdV5','abuBassamLockedDeviceNameV5','p_device_id:c.deviceId','p_device_secret:c.secret'],
  },
  {
    file:'web/settings-enhancements-runtime.js',
    replacements:[
      ["localStorage.getItem('abuBassamLockedDeviceIdV3')","localStorage.getItem('abuBassamLockedDeviceIdV5')"],
      ["if(!(window.Android&&typeof Android.security==='function'))return Promise.resolve(localStorage.getItem('__dev_secure_'+payload.key)||'');","if(!(window.Android&&typeof Android.security==='function'))return Promise.reject(new Error('SECURE_STORAGE_REQUIRED'));"],
    ],
    required:['abuBassamLockedDeviceIdV5',"Promise.reject(new Error('SECURE_STORAGE_REQUIRED'))",'abu_bassam_owner_device_count','abu_bassam_set_device_limit'],
    forbidden:['__dev_secure_'],
  },
  {
    file:'web/backup-center-runtime.js',
    replacements:[["APP='4.3.2'","APP='5.0.0'"]],
    required:["APP='5.0.0'",'appVersion:APP','app_version:APP','branchDeviceId:'],
  },
  {
    file:'web/app-update-runtime.js',
    replacements:[["const APP_VERSION='4.3.2',BUILD_NUMBER=432","const APP_VERSION='5.0.0',BUILD_NUMBER=500"]],
    required:["const APP_VERSION='5.0.0',BUILD_NUMBER=500",'current_code=${BUILD_NUMBER}'],
  },
  {
    file:'web/app-settings-runtime.js',
    replacements:[["const APP_VERSION='4.3.2',BUILD_NUMBER='432',RELEASE_DATE='2026-09-20';","const APP_VERSION='5.0.0',BUILD_NUMBER='500',RELEASE_DATE='2026-09-30';"]],
    required:["const APP_VERSION='5.0.0',BUILD_NUMBER='500',RELEASE_DATE='2026-09-30';"],
  },
];

const forbiddenIdentity=['abuBassamLockedDeviceIdV3','abuBassamLockedDeviceNameV3','abuBassamLockedDeviceCreatedV3'];
for(const spec of specs){
  let source=read(spec.file);
  for(const [legacy,current] of spec.replacements){
    if(source.includes(legacy))source=source.split(legacy).join(current);
    else if(!source.includes(current))fail(`${spec.file}: neither legacy nor v5 marker exists: ${current}`);
  }
  for(const marker of spec.required||[])if(!source.includes(marker))fail(`${spec.file}: generated Android runtime missing ${marker}`);
  for(const marker of forbiddenIdentity)if(source.includes(marker))fail(`${spec.file}: generated Android runtime still contains ${marker}`);
  for(const marker of spec.forbidden||[])if(source.includes(marker))fail(`${spec.file}: generated Android runtime contains forbidden insecure fallback ${marker}`);
  if(source.includes("APP_VERSION='4.3.2'")||source.includes("APP='4.3.2'"))fail(`${spec.file}: generated Android runtime still reports 4.3.2`);
}

const device=read('web/device-name-runtime.js');
for(const marker of ['abuBassamLockedDeviceIdV5','abuBassamLockedDeviceNameV5','abuBassamLockedDeviceCreatedV5',"const APP_VERSION = '5.0.0'"]){
  if(!device.includes(marker))fail(`web/device-name-runtime.js: missing ${marker}`);
}

const app=JSON.parse(read('app.json')).expo||{};
if(app.version!=='5.0.0')fail(`app.json: expected version 5.0.0, found ${app.version}`);
if(app.android?.package!=='com.abubassam.libraryv5')fail(`app.json: expected Android package com.abubassam.libraryv5, found ${app.android?.package}`);
if(Number(app.android?.versionCode)!==500)fail(`app.json: expected versionCode 500, found ${app.android?.versionCode}`);

const pkg=JSON.parse(read('package.json'));
if(pkg.version!=='5.0.0')fail(`package.json: expected version 5.0.0, found ${pkg.version}`);
if(!String(pkg.scripts?.['check:web']||'').includes('node tools/check_v5_android_identity.js'))fail('package.json: check:web does not run v5 Android identity validation');
const native=read('index.js');
for(const marker of ["const APP_VERSION = '5.0.0'","const BUILD_NUMBER = '500'"])if(!native.includes(marker))fail(`index.js: missing ${marker}`);

const assets=read('scripts/prepare-android-assets.mjs');
for(const marker of [
  'V5_RUNTIME_PATCHES','hardenV5RuntimeIdentity','await hardenV5RuntimeIdentity();',
  "file: 'device-reconcile-runtime.js'","file: 'branch-vault-runtime.js'","file: 'settings-enhancements-runtime.js'","file: 'backup-center-runtime.js'",
  'Android v5 runtime still references legacy device identity','Android v5 runtime contains forbidden insecure fallback','Primary device runtime is not v5-isolated'
])if(!assets.includes(marker))fail(`prepare-android-assets.mjs: missing ${marker}`);

if(failures.length){process.stderr.write(failures.join('\n')+'\n');process.exit(1)}
process.stdout.write('Android v5 identity check passed: generated APK runtime uses one v5 device identity through login, device registry, offline trust, recovery, branch vault, owner settings and backup/update metadata; owner-sensitive settings fail closed without native SecureStore; app/package/native identities agree on 5.0.0 / 500 / com.abubassam.libraryv5.\n');
