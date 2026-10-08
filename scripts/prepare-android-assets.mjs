import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = resolve(projectRoot, 'web');
const destination = resolve(projectRoot, 'android', 'app', 'src', 'main', 'assets', 'library');
const vendorRoot = resolve(destination, 'vendor', 'tesseract');
const mediaPipeRoot = resolve(destination, 'vendor', 'mediapipe');
const nativeAndroidSource = resolve(projectRoot, 'native', 'android');
const DOWNLOAD_TIMEOUT_MS = 45000;
const MEDIAPIPE_VERSION = '0.1.1675465747';

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

const mediaPipePair = (file) => pair(
  `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@${MEDIAPIPE_VERSION}/${file}`,
  `https://unpkg.com/@mediapipe/selfie_segmentation@${MEDIAPIPE_VERSION}/${file}`
);
const MEDIAPIPE_ASSETS = [
  ['selfie_segmentation.js', mediaPipePair('selfie_segmentation.js'), 40000],
  ['selfie_segmentation.binarypb', mediaPipePair('selfie_segmentation.binarypb'), 300],
  ['selfie_segmentation.tflite', mediaPipePair('selfie_segmentation.tflite'), 200000],
  ['selfie_segmentation_landscape.tflite', mediaPipePair('selfie_segmentation_landscape.tflite'), 200000],
  ['selfie_segmentation_solution_simd_wasm_bin.data', mediaPipePair('selfie_segmentation_solution_simd_wasm_bin.data'), 0],
  ['selfie_segmentation_solution_simd_wasm_bin.js', mediaPipePair('selfie_segmentation_solution_simd_wasm_bin.js'), 250000],
  ['selfie_segmentation_solution_simd_wasm_bin.wasm', mediaPipePair('selfie_segmentation_solution_simd_wasm_bin.wasm'), 5000000],
  ['selfie_segmentation_solution_wasm_bin.js', mediaPipePair('selfie_segmentation_solution_wasm_bin.js'), 250000],
  ['selfie_segmentation_solution_wasm_bin.wasm', mediaPipePair('selfie_segmentation_solution_wasm_bin.wasm'), 5000000],
];

async function existsEnough(path,minBytes){try{return (await stat(path)).size>=minBytes}catch{return false}}
async function fetchWithTimeout(url){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),DOWNLOAD_TIMEOUT_MS);
  try{return await fetch(url,{redirect:'follow',signal:controller.signal})}
  finally{clearTimeout(timer)}
}
async function installHardenedWebView(){
  const appJson=JSON.parse(await readFile(resolve(projectRoot,'app.json'),'utf8'));
  const androidPackage=String(appJson?.expo?.android?.package||'').trim();
  if(!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+$/.test(androidPackage))throw new Error('Invalid Android package for hardened WebView');
  const javaRoot=resolve(projectRoot,'android','app','src','main','java',...androidPackage.split('.'));
  const mainApplication=resolve(javaRoot,'MainApplication.kt');
  if(!(await existsEnough(mainApplication,100)))throw new Error('Generated MainApplication.kt was not found');
  await mkdir(javaRoot,{recursive:true});
  for(const name of ['AbuBassamWebViewManager.java','AbuBassamWebViewPackage.java']){
    const sourcePath=resolve(nativeAndroidSource,name);
    if(!(await existsEnough(sourcePath,100)))throw new Error(`Missing native WebView source template: ${name}`);
    const sourceText=(await readFile(sourcePath,'utf8')).replace(/^package\s+[\w.]+;/m,`package ${androidPackage};`);
    await writeFile(resolve(javaRoot,name),sourceText,'utf8');
  }
  let mainText=await readFile(mainApplication,'utf8');
  const marker='PackageList(this).packages.apply {';
  const registration='add(AbuBassamWebViewPackage())';
  const count=mainText.split(marker).length-1;
  if(count!==1)throw new Error(`Expected exactly one MainApplication package-list marker, found ${count}`);
  if(!mainText.includes(registration))mainText=mainText.replace(marker,`${marker}\n              ${registration}`);
  if((mainText.split(registration).length-1)!==1)throw new Error('Hardened WebView package registration must occur exactly once');
  await writeFile(mainApplication,mainText,'utf8');
  process.stdout.write('Hardened Android WebView asset origin installed and registered.\n');
}

async function download(urls,path,minBytes,label='Android asset'){
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
        process.stdout.write(`${label} ready: ${path.replace(projectRoot,'')} (${data.length} bytes) from ${new URL(url).hostname}\n`);
        return;
      }catch(error){
        lastError=error;
        if(attempt<3)await new Promise(r=>setTimeout(r,1000*attempt));
      }
    }
  }
  throw new Error(`Failed to prepare required Android asset ${path.replace(projectRoot,'')}: ${lastError?.message||lastError}`);
}


// Canonical source is read-only during normal builds. Generate only the disposable
// Android asset tree created by expo prebuild; never write downloaded files into web/.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });

for(const [relative,urls,minBytes] of OCR_ASSETS){
  await download(urls,resolve(vendorRoot,relative),minBytes);
}
for(const [relative,urls,minBytes] of MEDIAPIPE_ASSETS){
  await download(urls,resolve(mediaPipeRoot,relative),minBytes,'MediaPipe Android asset');
}

for(const [relative,,minBytes] of OCR_ASSETS){
  const path=resolve(vendorRoot,relative);
  if(!(await existsEnough(path,minBytes)))throw new Error(`Required offline OCR asset is missing or incomplete: ${relative}`);
}
for(const [relative,,minBytes] of MEDIAPIPE_ASSETS){
  const path=resolve(mediaPipeRoot,relative);
  if(!(await existsEnough(path,minBytes)))throw new Error(`Required embedded MediaPipe asset is missing or incomplete: ${relative}`);
}

await installHardenedWebView();

process.stdout.write(`Android web assets prepared at ${destination}\n`);
process.stdout.write('Offline OCR assets (Arabic + English) are embedded only in generated Android assets; canonical web source remains unchanged.\n');
process.stdout.write('MediaPipe assets are embedded in the standalone Android package; the privileged WebView never loads MediaPipe scripts from a CDN.\n');
