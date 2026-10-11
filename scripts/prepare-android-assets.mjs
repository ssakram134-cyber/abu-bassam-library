import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = resolve(projectRoot, 'web');
const destination = resolve(projectRoot, 'android', 'app', 'src', 'main', 'assets', 'library');
const vendorRoot = resolve(destination, 'vendor', 'tesseract');
const documentVendorRoot = resolve(destination, 'vendor', 'documents');
const DOWNLOAD_TIMEOUT_MS = 45000;

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

const DOCUMENT_ASSETS = [
  ['pdf.min.js',pair('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js','https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js'),50000],
  ['pdf.worker.min.js',pair('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js','https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js'),100000],
  ['mammoth.browser.min.js',pair('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js','https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js'),50000],
  ['xlsx.full.min.js',pair('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'),100000],
];

function validAssetContent(data,path){
  if(!data?.length)return false;
  if(/\.gz$/i.test(path)){
    if(data[0]!==0x1f||data[1]!==0x8b||data[2]!==8)return false;
    try{return gunzipSync(data,{maxOutputLength:256*1024*1024}).length>10000}
    catch{return false}
  }
  if(/\.js$/i.test(path)){
    const head=data.subarray(0,Math.min(4096,data.length)).toString('utf8');
    if(/^\s*(?:<!doctype|<html|<\?xml|\{|\[)/i.test(head)||head.includes('\0'))return false;
    return /\b(?:function|var|const|let|typeof|importScripts|exports|module|self|window)\b|=>/.test(head)
  }
  return false
}
async function existsEnough(path,minBytes){
  try{
    if((await stat(path)).size<minBytes)return false;
    return validAssetContent(await readFile(path),path)
  }catch{return false}
}
async function fetchWithTimeout(url,maxBytes){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),DOWNLOAD_TIMEOUT_MS);
  try{
    // Keep the timeout active until the final byte, not just HTTP headers.
    const response=await fetch(url,{redirect:'follow',signal:controller.signal});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const declared=Number(response.headers?.get?.('content-length'));
    if(Number.isFinite(declared)&&declared>maxBytes)throw new Error('Offline asset exceeds maximum download size');
    let bytes=0,chunks=[];
    if(response.body?.getReader){
      const reader=response.body.getReader();
      try{
        for(;;){
          const {done,value}=await reader.read();
          if(done)break;
          bytes+=value.byteLength;
          if(bytes>maxBytes){controller.abort();throw new Error('Offline asset exceeds maximum download size')}
          chunks.push(Buffer.from(value))
        }
      }finally{reader.releaseLock()}
      return Buffer.concat(chunks,bytes)
    }
    const data=Buffer.from(await response.arrayBuffer());
    if(data.length>maxBytes)throw new Error('Offline asset exceeds maximum download size');
    return data
  }finally{clearTimeout(timer)}
}
async function download(urls,path,minBytes){
  if(await existsEnough(path,minBytes))return;
  await mkdir(dirname(path),{recursive:true});
  const maxBytes=Math.min(80*1024*1024,Math.max(8*1024*1024,minBytes*40));
  let lastError;
  for(const url of urls){
    for(let attempt=1;attempt<=3;attempt+=1){
      const temporary=path+'.partial-'+process.pid;
      try{
        const data=await fetchWithTimeout(url,maxBytes);
        if(data.length<minBytes)throw new Error(`asset too small: ${data.length}`);
        if(!validAssetContent(data,path))throw new Error('Invalid offline asset contents: '+path);
        await writeFile(temporary,data);
        await rename(temporary,path);
        process.stdout.write(`Android offline asset ready: ${path.replace(projectRoot,'')} (${data.length} bytes) from ${new URL(url).hostname}\n`);
        return
      }catch(error){
        lastError=error;
        try{await rm(temporary,{force:true})}catch{}
        if(attempt<3)await new Promise(resolve=>setTimeout(resolve,1000*attempt))
      }
    }
  }
  throw new Error(`Failed to prepare required offline asset ${path.replace(projectRoot,'')}: ${lastError?.message||lastError}`)
}

// Canonical source is read-only during normal builds. Generate only the disposable
// Android asset tree created by expo prebuild; never write downloaded files into web/.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });

for(const [relative,urls,minBytes] of OCR_ASSETS){
  await download(urls,resolve(vendorRoot,relative),minBytes);
}

for(const [relative,,minBytes] of OCR_ASSETS){
  const path=resolve(vendorRoot,relative);
  if(!(await existsEnough(path,minBytes)))throw new Error(`Required offline OCR asset is missing or incomplete: ${relative}`);
}
for(const [relative,urls,minBytes] of DOCUMENT_ASSETS){
  await download(urls,resolve(documentVendorRoot,relative),minBytes);
}
for(const [relative,,minBytes] of DOCUMENT_ASSETS){
  if(!(await existsEnough(resolve(documentVendorRoot,relative),minBytes)))throw new Error(`Required offline document viewer asset is missing: ${relative}`);
}

process.stdout.write(`Android web assets prepared at ${destination}\n`);
process.stdout.write('Offline OCR assets (Arabic + English) are embedded only in generated Android assets; canonical web source remains unchanged.\n');
process.stdout.write('Offline PDF/DOCX/XLSX viewer assets are embedded in generated Android assets.\n');
