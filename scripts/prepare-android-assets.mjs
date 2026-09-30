import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = resolve(projectRoot, 'web');
const destination = resolve(projectRoot, 'android', 'app', 'src', 'main', 'assets', 'library');
const vendorRoot = resolve(destination, 'vendor', 'tesseract');
const DOWNLOAD_TIMEOUT_MS = 45000;
const TOUCH_RUNTIME = 'touch-stability-runtime.js';
const LEGACY_GLOBAL_TOUCH_RE = /\*\{([^{}]*?)touch-action\s*:\s*manipulation;?([^{}]*?)\}/gi;

const V5_RUNTIME_PATCHES = [
  {
    file: 'app-security-runtime.js',
    replacements: [
      ["const APP_VERSION='4.3.2';", "const APP_VERSION='5.0.0';"],
      ["const DEVICE_ID_KEY='abuBassamLockedDeviceIdV3';", "const DEVICE_ID_KEY='abuBassamLockedDeviceIdV5';"],
      ["const DEVICE_NAME_KEY='abuBassamLockedDeviceNameV3';", "const DEVICE_NAME_KEY='abuBassamLockedDeviceNameV5';"],
    ],
    required: ["const APP_VERSION='5.0.0';", "abuBassamLockedDeviceIdV5", "abuBassamLockedDeviceNameV5", "p_app_version:APP_VERSION"],
  },
  {
    file: 'security-hardening-runtime.js',
    replacements: [
      ["const APP_VERSION='4.3.2';", "const APP_VERSION='5.0.0';"],
      ["localStorage.getItem('abuBassamLockedDeviceIdV3')", "localStorage.getItem('abuBassamLockedDeviceIdV5')"],
    ],
    required: ["const APP_VERSION='5.0.0';", "abuBassamLockedDeviceIdV5", "trust?.appVersion!==APP_VERSION", "p_app_version:APP_VERSION"],
  },
  {
    file: 'account-center-runtime.js',
    replacements: [
      ["APP='4.3.2'", "APP='5.0.0'"],
      ["'abuBassamLockedDeviceIdV3'", "'abuBassamLockedDeviceIdV5'"],
      ["'abuBassamLockedDeviceNameV3'", "'abuBassamLockedDeviceNameV5'"],
      ["'abuBassamLockedDeviceCreatedV3'", "'abuBassamLockedDeviceCreatedV5'"],
    ],
    required: ["APP='5.0.0'", "abuBassamLockedDeviceIdV5", "abuBassamLockedDeviceNameV5", "abuBassamLockedDeviceCreatedV5", "p_app_version:APP"],
  },
  {
    file: 'account-recovery-hardening-runtime.js',
    replacements: [
      ["const APP='4.3.2';", "const APP='5.0.0';"],
      ["'abuBassamLockedDeviceIdV3'", "'abuBassamLockedDeviceIdV5'"],
      ["'abuBassamLockedDeviceNameV3'", "'abuBassamLockedDeviceNameV5'"],
      ["'abuBassamLockedDeviceCreatedV3'", "'abuBassamLockedDeviceCreatedV5'"],
    ],
    required: ["const APP='5.0.0';", "abuBassamLockedDeviceIdV5", "abuBassamLockedDeviceNameV5", "abuBassamLockedDeviceCreatedV5", "p_app_version:APP"],
  },
  {
    file: 'app-update-runtime.js',
    replacements: [
      ["const APP_VERSION='4.3.2',BUILD_NUMBER=432", "const APP_VERSION='5.0.0',BUILD_NUMBER=500"],
    ],
    required: ["const APP_VERSION='5.0.0',BUILD_NUMBER=500", "current_code=${BUILD_NUMBER}"],
  },
  {
    file: 'app-settings-runtime.js',
    replacements: [
      ["const APP_VERSION='4.3.2',BUILD_NUMBER='432',RELEASE_DATE='2026-09-20';", "const APP_VERSION='5.0.0',BUILD_NUMBER='500',RELEASE_DATE='2026-09-30';"],
    ],
    required: ["const APP_VERSION='5.0.0',BUILD_NUMBER='500',RELEASE_DATE='2026-09-30';"],
  },
];

const pair = (jsdelivr, unpkg) => [jsdelivr, unpkg];
const OCR_ASSETS = [
  ['tesseract.min.js', pair(
    'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
    'https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js'
  ), 20000],
  ['worker.min.js', pair(
    'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
    'https://unpkg.com/tesseract.js@5.1.1/dist/worker.min.js'
  ), 20000],
  ['core/tesseract-core.wasm.js', pair(
    'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core.wasm.js',
    'https://unpkg.com/tesseract.js-core@5.1.1/tesseract-core.wasm.js'
  ), 500000],
  ['core/tesseract-core-simd.wasm.js', pair(
    'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd.wasm.js',
    'https://unpkg.com/tesseract.js-core@5.1.1/tesseract-core-simd.wasm.js'
  ), 500000],
  ['core/tesseract-core-lstm.wasm.js', pair(
    'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-lstm.wasm.js',
    'https://unpkg.com/tesseract.js-core@5.1.1/tesseract-core-lstm.wasm.js'
  ), 500000],
  ['core/tesseract-core-simd-lstm.wasm.js', pair(
    'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm.js',
    'https://unpkg.com/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm.js'
  ), 500000],
  ['lang/ara.traineddata.gz', pair(
    'https://cdn.jsdelivr.net/npm/@tesseract.js-data/ara@1.0.0/4.0.0_best_int/ara.traineddata.gz',
    'https://unpkg.com/@tesseract.js-data/ara@1.0.0/4.0.0_best_int/ara.traineddata.gz'
  ), 500000],
  ['lang/eng.traineddata.gz', pair(
    'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz',
    'https://unpkg.com/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz'
  ), 500000],
];

async function existsEnough(path,minBytes){try{return (await stat(path)).size>=minBytes}catch{return false}}
async function fetchWithTimeout(url){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),DOWNLOAD_TIMEOUT_MS);
  try{return await fetch(url,{redirect:'follow',signal:controller.signal})}
  finally{clearTimeout(timer)}
}
async function download(urls,path,minBytes){
  if(await existsEnough(path,minBytes))return;
  await mkdir(dirname(path),{recursive:true});
  let lastError;
  for(const url of urls){
    for(let attempt=1;attempt<=3;attempt+=1){
      try{
        const response=await fetchWithTimeout(url);
        if(!response.ok)throw new Error(`HTTP ${response.status}`);
        const data=Buffer.from(await response.arrayBuffer());
        if(data.length<minBytes)throw new Error(`asset too small: ${data.length}`);
        await writeFile(path,data);
        process.stdout.write(`OCR Android asset ready: ${path.replace(projectRoot,'')} (${data.length} bytes) from ${new URL(url).hostname}\n`);
        return;
      }catch(error){
        lastError=error;
        if(attempt<3)await new Promise(r=>setTimeout(r,1000*attempt));
      }
    }
  }
  throw new Error(`Failed to prepare required offline OCR asset ${path.replace(projectRoot,'')}: ${lastError?.message||lastError}`);
}

async function neutralizeLegacyGlobalTouchPolicy(){
  const entryPath=resolve(destination,'index.html');
  let html=await readFile(entryPath,'utf8');
  let replacements=0;
  html=html.replace(LEGACY_GLOBAL_TOUCH_RE,(_,before,after)=>{
    replacements+=1;
    return `*{${before}${after}}`;
  });
  if(/\*\{[^{}]*touch-action\s*:\s*manipulation/i.test(html)){
    throw new Error('Android web entry point still contains a global touch-action:manipulation rule');
  }
  if(replacements>0)await writeFile(entryPath,html,'utf8');
  process.stdout.write(`Android legacy global touch policy neutralized (${replacements} replacement${replacements===1?'':'s'}).\n`);
}

async function injectTouchStabilityRuntime(){
  const runtimePath=resolve(destination,TOUCH_RUNTIME);
  if(!(await existsEnough(runtimePath,1000)))throw new Error(`Required Android touch runtime is missing or incomplete: ${TOUCH_RUNTIME}`);
  const entryPath=resolve(destination,'index.html');
  let html=await readFile(entryPath,'utf8');
  const tag=`<script src="${TOUCH_RUNTIME}"></script>`;
  if(!html.includes(tag)){
    if(!html.includes('</body>'))throw new Error('Android web entry point is missing </body>; cannot install touch stability runtime');
    html=html.replace('</body>',`${tag}\n</body>`);
    await writeFile(entryPath,html,'utf8');
  }
  const verified=await readFile(entryPath,'utf8');
  if(!verified.includes(tag))throw new Error('Touch stability runtime was not injected into Android web entry point');
  process.stdout.write(`Android touch stability runtime enabled: ${TOUCH_RUNTIME}\n`);
}

async function hardenV5RuntimeIdentity(){
  const forbiddenLegacyMarkers=['abuBassamLockedDeviceIdV3','abuBassamLockedDeviceNameV3','abuBassamLockedDeviceCreatedV3'];
  for(const spec of V5_RUNTIME_PATCHES){
    const runtimePath=resolve(destination,spec.file);
    let sourceText=await readFile(runtimePath,'utf8');
    let changed=false;
    for(const [legacy,current] of spec.replacements){
      if(sourceText.includes(legacy)){
        sourceText=sourceText.split(legacy).join(current);
        changed=true;
      }
      if(!sourceText.includes(current)){
        throw new Error(`Android v5 runtime identity hardening could not verify ${spec.file}: ${current}`);
      }
    }
    if(changed)await writeFile(runtimePath,sourceText,'utf8');
    const verified=await readFile(runtimePath,'utf8');
    for(const marker of spec.required){
      if(!verified.includes(marker))throw new Error(`Android v5 runtime identity requirement missing in ${spec.file}: ${marker}`);
    }
    for(const marker of forbiddenLegacyMarkers){
      if(verified.includes(marker))throw new Error(`Android v5 runtime still references legacy device identity in ${spec.file}: ${marker}`);
    }
    if(verified.includes("APP_VERSION='4.3.2'")||verified.includes("APP='4.3.2'")){
      throw new Error(`Android v5 runtime still reports legacy app version in ${spec.file}`);
    }
  }
  const deviceRuntime=await readFile(resolve(destination,'device-name-runtime.js'),'utf8');
  for(const marker of ["abuBassamLockedDeviceIdV5","abuBassamLockedDeviceNameV5","abuBassamLockedDeviceCreatedV5","const APP_VERSION = '5.0.0'"]){
    if(!deviceRuntime.includes(marker))throw new Error(`Primary device runtime is not v5-isolated: ${marker}`);
  }
  process.stdout.write('Android v5 runtime identity hardened: security, offline trust, account recovery, settings and update metadata use the v5 device namespace/build.\n');
}

// Canonical source is read-only during normal builds. Generate only the disposable
// Android asset tree created by expo prebuild; never write downloaded files into web/.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });
await neutralizeLegacyGlobalTouchPolicy();
await injectTouchStabilityRuntime();
await hardenV5RuntimeIdentity();

for(const [relative,urls,minBytes] of OCR_ASSETS){
  await download(urls,resolve(vendorRoot,relative),minBytes);
}

for(const [relative,,minBytes] of OCR_ASSETS){
  const path=resolve(vendorRoot,relative);
  if(!(await existsEnough(path,minBytes)))throw new Error(`Required offline OCR asset is missing or incomplete: ${relative}`);
}

process.stdout.write(`Android web assets prepared at ${destination}\n`);
process.stdout.write('Offline OCR assets (Arabic + English) are embedded only in generated Android assets; canonical web source remains unchanged.\n');
