import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = resolve(projectRoot, 'web');
const destination = resolve(projectRoot, 'android', 'app', 'src', 'main', 'assets', 'library');
const vendorRoot = resolve(destination, 'vendor', 'tesseract');
const DOWNLOAD_TIMEOUT_MS = 45000;
const TOUCH_RUNTIME = 'touch-stability-runtime.js';

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

// Canonical source is read-only during normal builds. Generate only the disposable
// Android asset tree created by expo prebuild; never write downloaded files into web/.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });
await injectTouchStabilityRuntime();

for(const [relative,urls,minBytes] of OCR_ASSETS){
  await download(urls,resolve(vendorRoot,relative),minBytes);
}

for(const [relative,,minBytes] of OCR_ASSETS){
  const path=resolve(vendorRoot,relative);
  if(!(await existsEnough(path,minBytes)))throw new Error(`Required offline OCR asset is missing or incomplete: ${relative}`);
}

process.stdout.write(`Android web assets prepared at ${destination}\n`);
process.stdout.write('Offline OCR assets (Arabic + English) are embedded only in generated Android assets; canonical web source remains unchanged.\n');
