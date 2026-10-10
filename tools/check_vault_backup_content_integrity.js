'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const source=read('web/backup-center-runtime.js');
const restoreSource=read('web/document-vault-hardening-runtime.js');
new vm.Script(source);
new vm.Script(restoreSource);
function section(a,b){
 const start=source.indexOf(a),end=source.indexOf(b,start+a.length);
 assert.ok(start>=0&&end>start,'missing source section '+a);
 return source.slice(start,end)
}
const fingerprintSrc=section('async function fingerprint(){','\nasync function packageBytes(){');
const packageSrc=section('async function packageBytes(){','\nasync function secret(){');
const backupSrc=section("async function backupNow(kind='manual',force=false){",'\nasync function downloadBytes(');
assert.match(fingerprintSrc,/await item\.blob\.arrayBuffer\(\)/);
assert.match(fingerprintSrc,/await digest\(bytes\)/);
assert.match(fingerprintSrc,/Number\.isInteger\(item\.manualOrder\)\?item\.manualOrder:null/);
assert.match(packageSrc,/manualOrder:Number\.isInteger\(item\.manualOrder\)\?item\.manualOrder:null/);
assert.match(backupSrc,/if\(await fingerprint\(\)!==fp\)throw Error\('BACKUP_CHANGED_DURING_CAPTURE'\)/);
assert.match(restoreSource,/manualOrder:Number\.isInteger\(meta\.manualOrder\)\?meta\.manualOrder:null/);

// Deterministic test digest; the production helper uses SHA-256. These checks
// assert content sensitivity and capture invariants, not cryptographic strength.
async function digest(bytes){
 const input=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 let h=2166136261;
 for(const b of input)h=Math.imul(h^b,16777619)>>>0;
 return String(h)+'-'+input.length
}
function blob(content){
 const bytes=new Uint8Array([...content].map(c=>c.charCodeAt(0)));
 return{size:bytes.length,type:'application/pdf',async arrayBuffer(){return bytes.slice().buffer}}
}
let files=[{id:'item1',name:'contract.pdf',blob:blob('ABCD'),size:4,category:'file',mime:'application/pdf',updatedAt:'2026-10-01',createdAt:'2026-09-01',folder:'زيد',favorite:false,lastOpenedAt:'',manualOrder:3}];
let options={theme:'dark'};
const fingerprint=new Function('backupItems','digest','TextEncoder','safeSettings',
 fingerprintSrc+';return fingerprint')(
 ()=>Promise.resolve(files),digest,TextEncoder,()=>options);
let added=[];
class JSZip{
 constructor(){this.entries={}}
 file(name,data){this.entries[name]=data;added.push(name)}
 async generateAsync(){return new Uint8Array([1,2,3])}
}
const makePackage=new Function('window','dev','JSZip','backupItems','MAX_TOTAL','MAX_ZIP','APP','safeSettings','crypto','Date','CHUNK',packageSrc+';return packageBytes')(
 {JSZip},()=>({device_id:'branch1',device_name:'فرع 1'}),JSZip,()=>Promise.resolve(files),
 500*1024*1024,120*1024*1024,'4.3.2',()=>options,{randomUUID:()=> 'generated'},Date,5*1024*1024);
(async()=>{
 const original=await fingerprint();
 const same=await fingerprint();
 assert.equal(same,original,'Same file and settings must keep backup checkpoint stable');
 files=[{...files[0],blob:blob('WXYZ')}]; // Same byte count and identical metadata.
 assert.notEqual(await fingerprint(),original,'Equal-length modifications must not be skipped');
 const updated=await fingerprint();
 files=[{...files[0],manualOrder:1}];
 assert.notEqual(await fingerprint(),updated,'Manual order change must trigger a new backup');
 const reordered=await fingerprint();
 options={theme:'light'};
 assert.notEqual(await fingerprint(),reordered,'Safe setting edits should be included');
 const packaged=await makePackage();
 assert.equal(packaged.count,1);
 assert.ok(added.includes('manifest.json'));
 const saved=JSON.parse(String(new TextDecoder().decode(new TextEncoder().encode(''+new JSZip().entries['manifest.json']))||'null'))||'null');
 // Verify the actual zip manifest instead of a constructed source fixture.
 let captured;
 class Archive extends JSZip{file(name,data){super.file(name,data);if(name==='manifest.json')captured=JSON.parse(data)}}
 const packageAgain=new Function('window','dev','JSZip','backupItems','MAX_TOTAL','MAX_ZIP','APP','safeSettings','crypto','Date','CHUNK',packageSrc+';return packageBytes')(
 {JSZip:Archive},()=>({device_id:'branch1',device_name:'فرع 1'}),Archive,()=>Promise.resolve(files),
 500*1024*1024,120*1024*1024,'4.3.2',()=>options,{randomUUID:()=> 'generated'},Date,5*1024*1024);
 await packageAgain();
 assert.equal(captured.items[0].manualOrder,1,'The cloud ZIP manifest must preserve ordering');
 assert.equal(captured.branchDeviceId,'branch1','Do not merge different branch namespaces');
 assert.equal(captured.items[0].name,'contract.pdf');

 let busy=false,cloudCalls=0,paintCalls=0,attempt=0;
 const last=new Map(),events=[];
 const backup=new Function('busy','can','status','fingerprint','stateGet','stateSet','stateRemove','packageBytes','digest','CHUNK','api','uploadPart','retention','log','fmt','refreshList','paint','Date','Blob',backupSrc+
 ';return (...args)=>backupNow(...args)')(
 busy,()=>true,()=>{},async()=>++attempt===1?'same':'changed',
 ()=>null,(k,v)=>last.set(k,v),k=>last.delete(k),
 async()=>({bytes:new Uint8Array([1,2,3]),count:1}),digest,5*1024*1024,
 async()=>{cloudCalls++;throw Error('CLOUD_SHOULD_NOT_BE_CALLED')},
 async()=>{cloudCalls++;},()=>7,(...a)=>events.push(a),String,async()=>{},()=>{paintCalls++},Date,Blob);
 await assert.rejects(backup('automatic',false),/BACKUP_CHANGED_DURING_CAPTURE/);
 assert.equal(cloudCalls,0,'No upload plan for inconsistent snapshot');
 assert.equal(paintCalls,1,'Busy state is reset even when local capture fails');
 console.log('Backup integrity checks passed: equal-size content updates, manual ordering, branch ownership and abort before inconsistent cloud upload.');
})().catch(error=>{console.error(error);process.exitCode=1});
