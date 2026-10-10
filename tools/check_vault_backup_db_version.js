'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const backup=fs.readFileSync(path.join(__dirname,'..','web/backup-center-runtime.js'),'utf8');
const vault=fs.readFileSync(path.join(__dirname,'..','web/document-vault-runtime.js'),'utf8');
const advanced=fs.readFileSync(path.join(__dirname,'..','web/document-vault-advanced-runtime.js'),'utf8');
const hardening=fs.readFileSync(path.join(__dirname,'..','web/document-vault-hardening-runtime.js'),'utf8');
for(const s of [backup,vault,advanced,hardening])new vm.Script(s);
assert.match(vault,/indexedDB\.open\(DB_NAME,3\)/);
assert.match(advanced,/indexedDB\.open\(DB_NAME,3\)/);
assert.match(hardening,/indexedDB\.open\(DB,3\)/);
const start=backup.indexOf('function openDb(){'),end=backup.indexOf('\nasync function all()',start);
assert.ok(start>=0&&end>start,'Find backup openDb method');
const body=backup.slice(start,end);
const run=(version,hasItems=true)=>{
 let requested=null,aborted=false,closed=false;
 const idb={open(name,askedVersion){
   assert.equal(name,'AbuBassamDocumentVaultV4');
   requested=askedVersion;
   if(askedVersion!==undefined&&askedVersion<version)throw Error('VersionError');
   const db={version,objectStoreNames:{contains:name=>hasItems&&name==='items'},close(){closed=true}};
   const request={result:db,error:null,onsuccess:null,onerror:null,onupgradeneeded:null,transaction:{abort(){aborted=true}}};
   queueMicrotask(()=>{
     if(version===0){request.onupgradeneeded?.();if(aborted){request.error=new Error('AbortError');request.onerror?.();return}}
     request.onsuccess?.();
   });
   return request;
 }};
 const open=new Function('indexedDB','DB','STORE',body+';return openDb')(idb,'AbuBassamDocumentVaultV4','items');
 return {open,requested:()=>requested,aborted:()=>aborted,closed:()=>closed}
};
(async()=>{
 for(const version of [1,2,3,4]){
   const test=run(version);
   const db=await test.open();
   assert.equal(db.version,version);
   assert.equal(test.requested(),undefined,'Never pass an old explicit version to IndexedDB');
   assert.equal(typeof db.onversionchange,'function','Backup reader must not block a later database upgrade');
   db.onversionchange();
   assert.equal(test.closed(),true,'Close the connection on future migrations');
 }
 let absent=run(0,false);
 await assert.rejects(absent.open(),/AbortError/);
 assert.equal(absent.aborted(),true,'Do not create an empty archive database when no items store exists');
 absent=run(3,false);
 await assert.rejects(absent.open(),/ARCHIVE_STORE_UNAVAILABLE/);
 assert.equal(absent.closed(),true,'Reject and close a pre-existing malformed database');
 console.log('Archive v3 backup compatibility passed: versions 1-4, missing store and no downgrade');
})().catch(e=>{console.error(e);process.exitCode=1});
