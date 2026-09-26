import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = resolve(projectRoot, 'web');
const destination = resolve(projectRoot, 'android', 'app', 'src', 'main', 'assets', 'library');
const vendorRoot = resolve(destination, 'vendor', 'tesseract');

const OCR_ASSETS = [
  ['tesseract.min.js','https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',20000],
  ['worker.min.js','https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',20000],
  ['core/tesseract-core.wasm.js','https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core.wasm.js',500000],
  ['core/tesseract-core-simd.wasm.js','https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd.wasm.js',500000],
  ['core/tesseract-core-lstm.wasm.js','https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-lstm.wasm.js',500000],
  ['core/tesseract-core-simd-lstm.wasm.js','https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm.js',500000],
  ['lang/ara.traineddata.gz','https://tessdata.projectnaptha.com/4.0.0/ara.traineddata.gz',500000],
  ['lang/eng.traineddata.gz','https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz',500000],
];

async function existsEnough(path,minBytes){try{return (await stat(path)).size>=minBytes}catch{return false}}
async function download(url,path,minBytes){
  if(await existsEnough(path,minBytes))return;
  await mkdir(dirname(path),{recursive:true});
  let lastError;
  for(let attempt=1;attempt<=3;attempt+=1){
    try{
      const response=await fetch(url,{redirect:'follow'});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=Buffer.from(await response.arrayBuffer());
      if(data.length<minBytes)throw new Error(`asset too small: ${data.length}`);
      await writeFile(path,data);
      process.stdout.write(`OCR Android asset ready: ${path.replace(projectRoot,'')} (${data.length} bytes)\n`);
      return;
    }catch(error){lastError=error;if(attempt<3)await new Promise(r=>setTimeout(r,1200*attempt))}
  }
  throw new Error(`Failed to prepare required offline OCR asset ${url}: ${lastError?.message||lastError}`);
}

// Canonical source is read-only during normal builds. Generate only the disposable
// Android asset tree created by expo prebuild; never write downloaded files into web/.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });

for(const [relative,url,minBytes] of OCR_ASSETS){
  await download(url,resolve(vendorRoot,relative),minBytes);
}

for(const [relative,,minBytes] of OCR_ASSETS){
  const path=resolve(vendorRoot,relative);
  if(!(await existsEnough(path,minBytes)))throw new Error(`Required offline OCR asset is missing or incomplete: ${relative}`);
}

process.stdout.write(`Android web assets prepared at ${destination}\n`);
process.stdout.write('Offline OCR assets (Arabic + English) are embedded only in generated Android assets; canonical web source remains unchanged.\n');
