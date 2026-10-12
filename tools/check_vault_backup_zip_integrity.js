'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const runtime=fs.readFileSync('web/document-vault-hardening-runtime.js','utf8');
const start=runtime.indexOf('const MAX_MANIFEST_BYTES=');
const end=runtime.indexOf('async function safeRestore(file,options={}){',start);
assert.ok(start>=0&&end>start,'Backup ZIP validation implementation must exist');
const code=runtime.slice(start,end);
const {validateZipCatalog,verifyZipEntryCrc,readValidatedBackupSettings}=new Function(
 'MAX_BACKUP_RECORDS','MAX_FILE','MAX_TOTAL','setTimeout',
 code+';return {validateZipCatalog,verifyZipEntryCrc,readValidatedBackupSettings}'
)(2000,100*1024*1024,500*1024*1024,fn=>Promise.resolve().then(fn));
const entry=(name,len=3,crc32=0)=>({
 name,dir:false,_data:{uncompressedSize:len,crc32},
 async:async()=>'{ "format":"AbuBassamSettings", "settings":{} }'
});
function zip(items){return {files:Object.fromEntries(items.map(([name,e])=>[name,e]))}}
const manifest=entry('manifest.json',100);
const settings=entry('app-settings.json',100);
const sample=zip([
 ['manifest.json',manifest],['app-settings.json',settings],
 ['files/abc/document.pdf',entry('files/abc/document.pdf',20)]
]);
validateZipCatalog(sample);
for(const [label,candidate,re] of [
 ['path traversal',zip([['files/abc/../doc.pdf',entry('files/abc/../doc.pdf')]]),/مسار غير مسموح/],
 ['unexpected root file',zip([['evil.txt',entry('evil.txt')]]),/مسار غير مسموح/],
 ['unsafe ZIP original name',zip([['files/abc/doc.pdf',{...entry('files/abc/doc.pdf'),unsafeOriginalName:'../hidden'}]]),/مسار غير آمن/],
 ['mismatched file name',zip([['files/abc/doc.pdf',entry('files/abc/other.pdf')]]),/اسم ملف غير متطابق/],
 ['huge settings',zip([['app-settings.json',entry('app-settings.json',4194305)]]),/يتجاوز الحد الآمن/],
 ['single oversized blob',zip([['files/abc/large',entry('files/abc/large',100*1024*1024+1)]]),/يتجاوز الحد الآمن/],
 ['aggregate decompressed limit',zip(Array.from({length:6},(_,i)=>[
   'files/id'+i+'/file',entry('files/id'+i+'/file',100*1024*1024)
 ])),/إجمالي أحجام/]
]) assert.throws(()=>validateZipCatalog(candidate),re,label);
const bytes=Uint8Array.from([49,50,51,52,53,54,55,56,57]);
const blob={size:bytes.length,slice:(from,to)=>({arrayBuffer:async()=>{
 const x=bytes.slice(from,to);return x.buffer.slice(x.byteOffset,x.byteOffset+x.byteLength)
}})};
(async()=>{
 await verifyZipEntryCrc(blob,entry('files/abc/a',9,0xcbf43926));
 await assert.rejects(verifyZipEntryCrc(blob,entry('files/abc/a',9,0)),/CRC32/,
   'Corrupt byte checksums must prevent file restoration');
 await assert.rejects(verifyZipEntryCrc({size:9},entry('files/abc/a',9,0xcbf43926)),
  /تعذر فحص سلامة/,'CRC check must reject uninspectable blobs');
 const prepared=await readValidatedBackupSettings({file:()=>settings});
 assert.equal(prepared.format,'AbuBassamSettings');
 assert.deepEqual(prepared.settings,{});
 console.log('Backup ZIP integrity passed: safe path/catalog limits, CRC32 known vector, tampered checksums and settings decoding.');
})().catch(error=>{console.error(error);process.exitCode=1});
