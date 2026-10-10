'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const vault=fs.readFileSync('web/document-vault-hardening-runtime.js','utf8');
const cloud=fs.readFileSync('web/backup-center-runtime.js','utf8');
const runtime=fs.readFileSync('web/document-vault-runtime.js','utf8');
const advanced=fs.readFileSync('web/document-vault-advanced-runtime.js','utf8');
for(const s of [vault,cloud,runtime,advanced])new Function(s);
for(const token of ['MAX_BACKUP_RECORDS=2000','deleted:!!item.deleted','deleted:!!meta.deleted','deletedAt:meta.deleted','if(blob&&old&&!old.deleted','existing.some(x=>x.blob)'])assert.ok(vault.includes(token),'Local trash backup protection missing: '+token);
for(const token of ['deleted:!!item.deleted','deletedAt:item.deletedAt','!!x.deleted,x.deletedAt','const items=await all()'])assert.ok(cloud.includes(token),'Cloud backup includes trash in content and fingerprint: '+token);
assert.ok(runtime.includes("(تعديل من جهاز آخر)"),'Remote concurrent edit must be retained independently');
assert.ok(runtime.includes("conflict.syncState='pending'"),'Concurrent remote edit copy must be uploaded on next sync');
assert.ok(runtime.includes("if(remaining){setSyncStatus('مزامنة جزئية"),'Outstanding conflicts must not be reported as a completed synchronization');
assert.ok(runtime.includes("filter(x=>!x.deleted).length>=MAX_ITEMS"),'Restoring trash must respect the 1000-file limit');
assert.ok(runtime.includes('async function copyItem(id)'),'Copy-to-folder action must stay available');
assert.ok(runtime.includes("const choice=prompt('طريقة حفظ الصورة المعدلة"),'Basic editor must ask copy or replace');
assert.ok(advanced.includes("const choice=prompt('طريقة حفظ الصورة المتقدمة"),'Advanced editor must ask copy or replace');
assert.ok(runtime.includes('data-vault-id="${esc(String(item.id))}"'),'Vault must retain safe identifier for advanced editor');
assert.ok(advanced.includes('card.dataset.vaultId'),'Advanced editor must use explicit file ID');
class BlobMock{constructor(chunks=[],options={}){this.bytes=Uint8Array.from(chunks.flatMap(value=>typeof value==='number'?[value]:value instanceof Uint8Array?[...value]:[]));this.size=this.bytes.length;this.type=options.type||''}async arrayBuffer(){return this.bytes.buffer.slice(0)}}
class ZipMock{constructor(){this.entries=new Map()}file(name,data){if(arguments.length>1){this.entries.set(name,data);return this}const content=this.entries.get(name);return content===undefined?null:{_data:{uncompressedSize:content?.size||0},async:async()=>content}}async generateAsync(){ZipMock.current=this;return new Uint8Array([90,73,80])}static async loadAsync(){return ZipMock.current}}
const window={records:[
 {id:'live',name:'active.pdf',category:'file',mime:'application/pdf',blob:new BlobMock([1,2,3]),size:3,deleted:false,updatedAt:'2026-10-11'},
 {id:'trash',name:'trash.jpg',category:'image',mime:'image/jpeg',blob:new BlobMock([4,5]),size:2,deleted:true,deletedAt:'2026-10-10T00:00:00Z',updatedAt:'2026-10-10'},
 {id:'tomb',name:'tomb.txt',category:'file',mime:'text/plain',blob:null,size:0,deleted:true,deletedAt:'2026-10-09T00:00:00Z',updatedAt:'2026-10-09'}
],JSZip:ZipMock,AbuBassamSecurity:{role:()=>'owner',device:()=>({device_id:'trusted-device'})},AbuBassamBranchVault:{localScopeOk:()=>true}};
const mockSource=vault.replace('window.AbuDocumentVaultHardening=Object.freeze({','all=async()=>window.records;applyAtomic=async(items,opts)=>{window.restored={items,opts}};window.testVault={backupBytes,safeRestore};window.AbuDocumentVaultHardening=Object.freeze({');
assert.notEqual(mockSource,vault,'Vault backup exports could not be tested');
new Function('window','document','TextEncoder','JSZip','crypto','localStorage','alert','confirm','prompt',mockSource)(window,{getElementById:()=>null},require('node:util').TextEncoder,ZipMock,{randomUUID:()=> 'new-id'},{length:0,key:()=>null},()=>{},()=>true,()=>null);
(async()=>{
 const zip=await window.testVault.backupBytes();
 const manifest=JSON.parse(await ZipMock.current.file('manifest.json').async('string'));
 assert.equal(manifest.items.length,3);
 assert.deepEqual(manifest.items.map(x=>!!x.deleted),[false,true,true]);
 assert.ok(manifest.items[1].path,'Recoverable trash must include its original blob');
 assert.equal(manifest.items[2].path,'','Tombstone may not contain a blob');
 const file={size:zip.length,arrayBuffer:async()=>zip.buffer.slice(0)};
 const ok=await window.testVault.safeRestore(file,{mode:'snapshot',skipSafetyBackup:true,silentConfirm:true,silentSuccess:true,silentError:true});
 assert.equal(ok,true,'Restoring a valid snapshot must succeed');
 assert.equal(window.restored?.opts?.replaceAll,true);
 assert.deepEqual(window.restored.items.map(x=>!!x.deleted),[false,true,true]);
 assert.deepEqual(window.restored.items.map(x=>x.blob?.size||0),[3,2,0]);
 assert.ok(window.restored.items[1].deletedAt,'30-day trash timestamp must survive restore');
 assert.ok(window.restored.items.every(x=>x.syncState==='pending'),'Restored records must resync intentionally');
 console.log('Vault trash backup checks passed: active file, 30-day deleted blob and deletion tombstone survive snapshot restore; conflicts/copy-vs-replace guarded.');
})().catch(error=>{console.error(error);process.exitCode=1});
