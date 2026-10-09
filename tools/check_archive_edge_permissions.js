'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const customer=read('supabase/functions/customer-documents/index.ts');
const branch=read('supabase/functions/branch-vault/index.ts');
const client=read('web/branch-vault-runtime.js');
function body(source,start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Missing source '+start);
 const chunk=source.slice(a,b),begin=chunk.indexOf('{');
 assert.ok(begin>0);
 return chunk.slice(begin+1)
}
assert.doesNotMatch(customer,/DEFAULT_ALLOWED|legacyFallback\(/);
const cStart="  if(data.role==='owner')return true;";
const cIndex=customer.indexOf(cStart,customer.indexOf('async function allowed('));
assert.ok(cIndex>0);
const allowed=new Function('data','key',customer.slice(cIndex,customer.indexOf('\n}',cIndex)));
assert.equal(allowed({role:'owner',permissions:{}},'customerDocumentsDelete'),true);
for(const permissions of [{},{edit:true},{customerDocumentsView:false},{customerDocumentsView:'true'}]){
 assert.equal(allowed({role:'secondary',permissions},'customerDocumentsView'),false,'Missing/legacy/string permission denies');
}
assert.equal(allowed({role:'secondary',permissions:{customerDocumentsView:true}},'customerDocumentsView'),true);
assert.equal(allowed({role:'secondary',permissions:{customerDocumentsView:true}},'customerDocumentsDelete'),false);
const validItemId=new Function('value',body(branch,'function validItemId(','\nfunction isItemRevision('));
for(const id of ['doc-1','A_bc.123','abc'])assert.equal(validItemId(id),true);
for(const id of ['','.', '..','../file','a/b','a'.repeat(181),'emoji-📁'])assert.equal(validItemId(id),false);
const safePart=v=>String(v||'').replace(/[^A-Za-z0-9_.-]/g,'_').slice(0,180);
const scopedPath=(u,d,id,revision='')=>{const prefix=`${u}/branch-vault/${safePart(d)}/${safePart(id)}`;return revision?`${prefix}/${safePart(revision)}`:prefix};
const isItemRevision=new Function('path','userId','deviceId','itemId','scopedPath',
 body(branch,'function isItemRevision(','\n\nDeno.serve('));
const valid=p=>isItemRevision(p,'user','device','item1',scopedPath);
assert.equal(valid('user/branch-vault/device/item1/rev1'),true);
for(const p of [
 'user/branch-vault/device/item2/rev1',
 'user/branch-vault/other/item1/rev1',
 'else/branch-vault/device/item1/rev1',
 'user/branch-vault/device/item1',
 'user/branch-vault/device/item1/../item2/rev1',
 'user/branch-vault/device/item1/..',
 'user/branch-vault/device/item1/.'
])assert.equal(valid(p),false,'Wrong item/path must fail: '+p);
const idFn=new Function('pathToId',body(client,'function vaultItemId(','\nasync function downloadVault(')+';return vaultItemId')(new Map());
assert.equal(idFn('user/branch-vault/device/item1/rev1'),'item1','Use item id not revision');
assert.equal(idFn('user/branch-vault/device/item1'),'');
assert.match(branch,/if\(path&&!isItemRevision\(path,base\.user\.id,base\.deviceId,itemId\)\)/);
assert.match(branch,/if\(path&&path===currentPath&&row\?\.data\?\.deleted!==true\)/);
assert.equal((branch.match(/if\(!validItemId\(itemId\)\)return json/g)||[]).length,3);
const start=client.indexOf('async function removeAllVault()'),end=client.indexOf('\nfunction registerCloudAdapter()',start);
assert.ok(start>=0&&end>start);
const clear=client.slice(start,end);
assert.ok(clear.indexOf("await rpc('abu_bassam_vault_remove_all'")<clear.indexOf('await removeVault(path)'),
 'Clear metadata before removing still-referenced content');
console.log('Archive server permissions passed: explicit grants, per-item paths, active revision protection and client item identity');
