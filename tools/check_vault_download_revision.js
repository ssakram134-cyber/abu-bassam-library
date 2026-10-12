'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const code=fs.readFileSync('web/branch-vault-runtime.js','utf8');
const start=code.indexOf('async function downloadVault(path){');
const end=code.indexOf('\nasync function removeVault(',start);
assert.ok(start>=0&&end>start,'Cannot isolate canonical vault download');
const body=code.slice(start,end);
assert.ok(body.includes("String(plan.path||'')!==String(path||'')"),
  'Signed URL must identify exactly the expected storage revision');

const oldPath='user/branch-vault/device/doc/old';
const newPath='user/branch-vault/device/doc/new';
function setup({responsePath=oldPath,url='https://download.invalid/signed',permission=true,status=true}={}){
 const calls=[];
 const fn=new Function('allowed','vaultItemId','edge','fetch',
  body+';return downloadVault')(
  ()=>permission,
  path=>path===oldPath?'doc':'',
  async(action,options)=>{calls.push(['edge',action,options?.query]);return {path:responsePath,url};},
  async address=>{calls.push(['fetch',address]);return {ok:status,blob:async()=>({type:'application/pdf',size:24})};}
 );
 return {fn,calls};
}
(async()=>{
 const current=setup();
 const blob=await current.fn(oldPath);
 assert.equal(blob.size,24,'Exact requested revision should download');
 assert.deepEqual(current.calls.map(c=>c[0]),['edge','fetch']);

 const changed=setup({responsePath:newPath});
 await assert.rejects(changed.fn(oldPath),/VAULT_VERSION_CONFLICT/);
 assert.deepEqual(changed.calls.map(c=>c[0]),['edge'],
  'Stale signed URL must be rejected before fetching incorrect file bytes');

 const absent=setup({responsePath:''});
 await assert.rejects(absent.fn(oldPath),/VAULT_VERSION_CONFLICT/);
 assert.deepEqual(absent.calls.map(c=>c[0]),['edge']);

 const noUrl=setup({url:''});
 await assert.rejects(noUrl.fn(oldPath),/VAULT_VERSION_CONFLICT/);
 assert.deepEqual(noUrl.calls.map(c=>c[0]),['edge']);

 const denied=setup({permission:false});
 await assert.rejects(denied.fn(oldPath),/VAULT_VIEW_NOT_ALLOWED/);
 assert.deepEqual(denied.calls,[],'Permission denial must happen before requesting signed URL');

 const unknown=setup();
 await assert.rejects(unknown.fn('invalid-other-id'),/VAULT_ID_REQUIRED/);
 assert.deepEqual(unknown.calls,[],'Unknown revision must never obtain a signed URL');

 const network=setup({status:false});
 await assert.rejects(network.fn(oldPath),/تعذر تنزيل/);
 assert.deepEqual(network.calls.map(c=>c[0]),['edge','fetch']);
 console.log('Vault revision-safe download passed: 7 cases; stale signed URLs, missing URLs, access denial and failed fetch are handled without substituting file contents.');
})().catch(e=>{console.error(e);process.exitCode=1});
