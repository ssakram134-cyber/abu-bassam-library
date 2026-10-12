'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),{TextEncoder}=require('node:util');
const ActualJSZip=require('../web/jszip.min.js');
const source=fs.readFileSync('web/document-vault-hardening-runtime.js','utf8');
for(const token of [
 'function validateZipCatalog(zip)',
 'async function verifyZipEntryCrc(blob,entry)',
 'if(usedPaths.has(p))',
 'if(usedZipPaths.has(path))',
 'blob.size!==Number(meta.size)',
 "readValidatedBackupSettings(zip)",
 "if(/\\.abuvault$/i.test(String(file.name||''))",
 'MAX_MANIFEST_BYTES=4*1024*1024'
])assert.ok(source.includes(token),'ZIP integrity invariant missing: '+token);

class BlobMock{
 constructor(bytes){this.bytes=Uint8Array.from(bytes);this.size=this.bytes.length;this.type='application/pdf'}
 async arrayBuffer(){return this.bytes.slice().buffer}
 slice(start,end){return new BlobMock(this.bytes.slice(start,end))}
}
class ZipMock{
 constructor(){this.files={}}
 file(path,data){
  if(arguments.length>1){
   const sz=data instanceof BlobMock?data.size:new TextEncoder().encode(String(data)).length;
   this.files[path]={name:path,dir:false,_data:{uncompressedSize:sz},async:async()=>data};
   return this
  }
  return this.files[path]||null
 }
 async generateAsync(){ZipMock.current=this;return Uint8Array.of(80,75,3,4)}
 static async loadAsync(){return ZipMock.current}
}
const window={JSZip:ZipMock,records:[],AbuBassamSecurity:{role:()=>'owner',device:()=>({device_id:'test-branch'})},
 AbuBassamBranchVault:{localScopeOk:()=>true},DocumentVault:{onShow:async()=>{}}};
const notifications=[];
const code=source.replace('window.AbuDocumentVaultHardening=Object.freeze({',
 "all=async()=>window.records;applyAtomic=async(items,options)=>{window.restored={items,options}};window.testVault={backupBytes,safeRestore};window.AbuDocumentVaultHardening=Object.freeze({");
assert.notEqual(code,source,'Cannot expose vault restore to the isolated test harness');
new Function('window','document','TextEncoder','JSZip','crypto','localStorage','alert','confirm','prompt','setTimeout',code)(
 window,{getElementById:()=>null},TextEncoder,ZipMock,{randomUUID:()=> 'new-unique-id'},
 {length:0,key:()=>null,getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
 message=>notifications.push(String(message)),()=>true,()=>null,fn=>Promise.resolve().then(fn)
);
const file={name:'snapshot.zip',size:4,arrayBuffer:async()=>Uint8Array.of(80,75,3,4).buffer};
const goodBlob=new BlobMock([97,98,99]);
const entryPath='files/a/report.pdf';
const manifest=()=>({format:'AbuBassamVault',version:6,branchDeviceId:'test-branch',count:1,
 items:[{id:'a',name:'report.pdf',category:'file',mime:'application/pdf',size:3,path:entryPath,deleted:false,updatedAt:'2026-10-12'}]});
const fixture=(m=manifest(),blob=goodBlob)=>{
 const zip=new ZipMock().file('manifest.json',JSON.stringify(m)).file(entryPath,blob);
 zip.files[entryPath]._data.crc32=891568578; // CRC32 of the literal bytes 'abc'.
 ZipMock.current=zip;return zip
};
const restore=async(f=file)=>{window.restored=null;notifications.length=0;return window.testVault.safeRestore(f,{mode:'snapshot',skipSafetyBackup:true,silentConfirm:true,silentSuccess:true,silentError:false})};
let checks=0;
function ok(value,msg){assert.ok(value,msg);checks++}
async function rejectIntegrity(label){
 const success=await restore();
 ok(success===false&&window.restored===null,label+' must reject before modifying archive');
}
(async()=>{
 fixture();
 ok((await restore())===true&&window.restored.items[0].size===3,'Valid archive must restore the original file');
 let m=manifest();m.items[0].size=999;fixture(m);
 await rejectIntegrity('Wrong manifest file size');
 fixture();ZipMock.current.files[entryPath]._data.crc32=0;
 await rejectIntegrity('Corrupted CRC-32');
 m=manifest();m.count=2;m.items.push({...m.items[0],id:'b'});fixture(m);
 await rejectIntegrity('Multiple manifest rows sharing a ZIP entry');
 fixture().file('unexpected.bin',new BlobMock([1]));
 await rejectIntegrity('Unknown ZIP entry');
 fixture();ZipMock.current.files[entryPath].unsafeOriginalName='../outside.pdf';
 await rejectIntegrity('Unsafe original ZIP path');
 fixture();ZipMock.current.files[entryPath]._data.uncompressedSize=101*1024*1024;
 await rejectIntegrity('Oversized compressed entry metadata');
 fixture();ZipMock.current.files['manifest.json']._data.uncompressedSize=5*1024*1024;
 await rejectIntegrity('Oversized manifest metadata');
 fixture().file('app-settings.json','{bad json');
 await rejectIntegrity('Malformed settings before commit');
 fixture();
 const badEncrypted={...file,name:'archive.abuvault'};
 ok((await restore(badEncrypted))===false&&window.restored===null,
  'Damaged encrypted backup header must never be interpreted as plain ZIP');
 fixture();window.records=[
  {id:'a/b',name:'same.pdf',blob:new BlobMock([1]),size:1,deleted:false,category:'file'},
  {id:'a_b',name:'same.pdf',blob:new BlobMock([2]),size:1,deleted:false,category:'file'}
 ];
 await assert.rejects(()=>window.testVault.backupBytes(),/بالمسار نفسه/,
  'Generating a ZIP must reject filename collisions caused by sanitizing IDs');
 checks++;
 window.records=[];
 
 const crcStart=source.indexOf('const CRC32_TABLE=');
 const crcEnd=source.indexOf('async function readValidatedBackupSettings(',crcStart);
 assert.ok(crcStart>=0&&crcEnd>crcStart,'Cannot isolate actual ZIP CRC checker');
 const verifyCRC=new Function('setTimeout',source.slice(crcStart,crcEnd)+';return verifyZipEntryCrc')(callback=>Promise.resolve().then(callback));
 const actualZip=new ActualJSZip();
 const payload='UNIQUE_ARCHIVE_PAYLOAD_FOR_CRC_2026';
 actualZip.file(entryPath,payload);
 const packed=await actualZip.generateAsync({type:'uint8array',compression:'STORE'});
 const goodZip=await ActualJSZip.loadAsync(packed);
 const actualEntry=goodZip.file(entryPath);
 await verifyCRC(await actualEntry.async('blob'),actualEntry);
 checks++;
 const altered=packed.slice(),pattern=new TextEncoder().encode(payload);
 let located=-1;
 for(let i=0;i<=altered.length-pattern.length;i++){
  if(pattern.every((x,j)=>altered[i+j]===x)){located=i;break}
 }
 assert.ok(located>=0,'Unable to locate uncompressed payload in actual JSZip archive');
 altered[located+3]^=1;
 const badZip=await ActualJSZip.loadAsync(altered,{checkCRC32:false});
 const badEntry=badZip.file(entryPath);
 await assert.rejects(async()=>verifyCRC(await badEntry.async('blob'),badEntry),/CRC32/,'Modified ZIP payload must fail CRC verification');
 checks++;
console.log('Vault ZIP integrity checks passed: '+checks+' cases (sizes, CRC32, paths, encrypted header, manifest, settings, backup path collision).')
})().catch(error=>{console.error(error);process.exitCode=1});
