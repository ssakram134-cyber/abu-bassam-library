'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'..','web/document-vault-hardening-runtime.js'),'utf8');
new vm.Script(source,{filename:'document-vault-hardening-runtime.js'});
function between(a,b){
  const start=source.indexOf(a),end=source.indexOf(b,start+a.length);
  assert.ok(start>=0&&end>start,'Missing restore validation block '+a);
  return source.slice(start,end);
}
const validation=between('let declared=0,seenIds=new Set(),seenPaths=new Set();','if(!options.silentConfirm){const msg=');
const validate=new Function('manifest','MAX_FILE','MAX_TOTAL',validation+'\nreturn {declared,seenIds,seenPaths}');
function manifest(items){return {items:items.map(item=>({id:item.id,path:item.path,size:item.size||10}))}}
const file=(id,path)=>({id,path,size:12});
const ok=validate(manifest([file('one','files/one/image.png'),file('two','files/two/image.png')]),1000,2000);
assert.equal(ok.declared,24);assert.equal(ok.seenIds.size,2);assert.equal(ok.seenPaths.size,2);
assert.throws(()=>validate(manifest([file('one','files/one/a.png'),file('one','files/one/b.png')]),1000,2000),/معرّف ملف مكرر/);
assert.throws(()=>validate(manifest([file('one','files/one/a.png'),file('two','files/one/a.png')]),1000,2000),/مسار ملف مكرر/);
assert.throws(()=>validate(manifest([file('one','files/one/../secret')]),1000,2000),/مسار غير آمن/);
assert.throws(()=>validate(manifest([file('one','files/one/gigantic.png')]),5,2000),/100MB/);
assert.throws(()=>validate(manifest([file('one','files/one/a.png'),file('two','files/two/b.png')]),1000,20),/500MB/);

const mergeCode=between("if(mode==='merge'&&usedIds.has(id)){","usedIds.add(id);");
assert.match(mergeCode,/else\{continue\}\}/,'Identical merge must skip writing and re-sync');
const mergeSource="return (async()=>{"+
  "const mode='merge',usedIds=new Set(['same-id']),byId=new Map([['same-id',old]]);"+
  "const meta={name:'document.png'},blob={size:7,data:same?'equal':'different'};"+
  "let id='same-id',name='document.png',createdAt='2026-10-09';"+
  "const nice=s=>s,prepared=[];"+
  "for(let i=0;i<1;i++){"+mergeCode+"usedIds.add(id);prepared.push({id,name,createdAt});}"+
  "return prepared;})()";
const execMerge=new Function('old','same','blobHash','crypto',mergeSource);
(async()=>{
  const old={id:'same-id',blob:{size:7,data:'equal'},size:7,createdAt:'earlier',deleted:false};
  const hash=async blob=>blob.data;
  const unchanged=await execMerge(old,true,hash,{randomUUID:()=> 'new-id'});
  assert.equal(unchanged.length,0,'Already restored matching item must remain untouched and not pending');
  const conflict=await execMerge(old,false,hash,{randomUUID:()=> 'new-id'});
  assert.equal(conflict.length,1);
  assert.equal(conflict[0].id,'new-id','Different content with same ID must preserve both documents');
  assert.ok(conflict[0].name.includes('نسخة مستعادة'));
  console.log('Vault restore dedup checks passed: duplicate ZIP IDs/paths rejected, unsafe archives blocked, identical merges idempotent and differing copies preserved.');
})().catch(error=>{console.error(error);process.exitCode=1});
