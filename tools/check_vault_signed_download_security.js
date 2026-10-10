'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const edge=read('supabase/functions/branch-vault/index.ts');
const branch=read('web/branch-vault-runtime.js');
const sync=read('web/document-vault-runtime.js');
new vm.Script(branch);new vm.Script(sync);
function section(src,start,end){
 const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'missing '+start);
 return src.slice(a,b)
}
const handler=section(edge,"    if(action==='download-url'&&req.method==='GET')","    if(action==='owner-download-url'&&req.method==='GET')");
assert.match(handler,/select\('data,updated_at'\)/);
assert.match(handler,/isItemRevision\(path,base.user.id,base.deviceId,itemId\)/);
assert.match(handler,/path!==expectedPath/);
assert.match(handler,/String\(row.updated_at\|\|''\)!==expectedVersion/);
assert.match(handler,/if\(!row\|\|row.data\?\.deleted===true\)/);
assert.match(handler,/createSignedUrl\(path,60,\{download:false\}\)/);
assert.match(edge,/createSignedUrl\(path,60,\{download:false\}\)/g);
assert.doesNotMatch(handler,/isScoped\(path/,'A sibling item in the same branch must not be considered a valid path');
for(const change of [
 "await service.downloadVault(remote.storagePath,remoteVersion)",
 "await service.downloadVault(data.storagePath,remoteVersion)"
])assert.ok(sync.includes(change),'expected metadata revision not forwarded');
assert.doesNotMatch(sync,/service\.downloadVault\((remote|data)\.storagePath\)/);
const itemPath=(id,revision='r1',user='account-A',device='device-A')=>user+'/branch-vault/'+device+'/'+id+'/'+revision;
const origItem=itemPath('item-1');
let row={data:{id:'item-1',storagePath:origItem,deleted:false},updated_at:'2026-10-10T06:00:00.111111+00:00'};
let calls=[],deny=false;
const admin={
 from(table){
  assert.equal(table,'abu_bassam_branch_vault');
  const filters={};
  const query={
   select(cols){assert.equal(cols,'data,updated_at');return query},
   eq(k,v){filters[k]=v;return query},
   async maybeSingle(){
    calls.push({type:'select',filters});
    return {data:row,error:null}
   }
  };
  return query
 },
 storage:{from(bucket){
  assert.equal(bucket,'abu-bassam-private');
  return{async createSignedUrl(p,ttl,opts){
   calls.push({type:'sign',path:p,ttl,opts});
   return{data:{signedUrl:'https://example.invalid/authorized'},error:null}
  }}
 }}
};
const base={user:{id:'account-A'},deviceId:'device-A',admin};
const context=async()=>{if(deny)throw Error('DEVICE_NOT_AUTHORIZED');return base};
const json=(data,status=200)=>({data,status});
const validItemId=x=>/^[A-Za-z0-9_.-]{1,180}$/.test(x)&&x!=='.'&&x!=='..';
const isItemRevision=(p,u,d,id)=>{
 const prefix=itemPath(id,'',u,d);
 return p.startsWith(prefix)&&p.slice(prefix.length).length>0&&!p.slice(prefix.length).includes('/');
};
const run=new Function('url','req','context','validItemId','json','isItemRevision','BUCKET','permissionEnabled',
 'return (async()=>{const action=url.searchParams.get("action");'+handler+'})()');
const makeUrl=(p=origItem,v=row.updated_at,id='item-1')=>new URL(
 'https://example.invalid/functions/v1/branch-vault?action=download-url&item_id='+encodeURIComponent(id)+
 '&expected_path='+encodeURIComponent(p)+'&expected_updated_at='+encodeURIComponent(v));
const invoke=u=>run(u,{method:'GET'},context,validItemId,json,isItemRevision,'abu-bassam-private',()=>true);
(async()=>{
 let out=await invoke(makeUrl());
 assert.equal(out.status,200);
 assert.equal(out.data.path,origItem);
 assert.equal(out.data.expiresIn,60);
 assert.equal(calls.filter(x=>x.type==='sign').length,1);
 assert.equal(calls.at(-1).ttl,60);

 calls=[];out=await invoke(makeUrl(origItem,'server-stale'));
 assert.equal(out.status,409);
 assert.equal(out.data.error,'VAULT_VERSION_CONFLICT');
 assert.equal(calls.filter(x=>x.type==='sign').length,0,'No signed URL on stale revision');

 calls=[];out=await invoke(makeUrl(itemPath('item-1','older')));
 assert.equal(out.status,409);
 assert.equal(calls.filter(x=>x.type==='sign').length,0,'No URL for wrong revision path');

 calls=[];out=await invoke(new URL('https://example.invalid/functions/v1/branch-vault?action=download-url&item_id=item-1'));
 assert.equal(out.status,400);
 assert.equal(calls.length,0,'Fail closed before database lookup');

 calls=[];row={...row,data:{...row.data,storagePath:itemPath('item-2')}};
 out=await invoke(makeUrl());
 assert.equal(out.status,403);
 assert.equal(calls.filter(x=>x.type==='sign').length,0,'No URL for a different item in the same branch');

 row={...row,data:{...row.data,storagePath:itemPath('item-1','r1','account-X')}};
 out=await invoke(makeUrl());
 assert.equal(out.status,403,'No cross-account signed URL');

 row={...row,data:{...row.data,storagePath:origItem,deleted:true}};
 out=await invoke(makeUrl());
 assert.equal(out.status,404,'Deleted files cannot be signed');

 row={...row,data:{...row.data,deleted:false}};
 deny=true;await assert.rejects(invoke(makeUrl()),/DEVICE_NOT_AUTHORIZED/);
 deny=false;

 const downloadSource=section(branch,'async function downloadVault(','async function removeVault(');
 let identity='account-A',currentDevice='device-A',permissions=true,localScope=true,changeAt='';
 const window={AbuBassamCloud:{session:()=>({user:{id:identity}})}};
 const device=()=>({id:currentDevice});
 const allowed=()=>permissions;
 const localScopeOk=()=>localScope;
 const vaultItemId=p=>p.split('/').length===5?p.split('/')[3]:'';
 const edgeFn=async(name,options)=>{
  assert.equal(name,'download-url');
  const u=new URL('https://example.invalid/?action=download-url'+options.query);
  assert.equal(u.searchParams.get('item_id'),'item-1');
  assert.equal(u.searchParams.get('expected_path'),origItem);
  assert.equal(u.searchParams.get('expected_updated_at'),'2026-10-10T06:00:00.111111+00:00');
  if(changeAt==='edge')identity='account-B';
  return{path:changeAt==='wrong-path'?itemPath('item-1','future'):origItem,url:'https://example.invalid/blob'}
 };
 let fetches=0;
 const fetchFn=async()=>{fetches++;if(changeAt==='fetch')permissions=false;
  return{ok:true,async blob(){return{size:10,type:'application/pdf'}}}};
 const download=new Function('allowed','localScopeOk','vaultItemId','window','device','edge','fetch',
  downloadSource+';return downloadVault')(allowed,localScopeOk,vaultItemId,window,device,edgeFn,fetchFn);
 let blob=await download(origItem,'2026-10-10T06:00:00.111111+00:00');
 assert.equal(blob.size,10);
 assert.equal(fetches,1);
 changeAt='wrong-path';await assert.rejects(download(origItem,'2026-10-10T06:00:00.111111+00:00'),/VAULT_VERSION_CONFLICT/);
 assert.equal(fetches,1);
 changeAt='edge';await assert.rejects(download(origItem,'2026-10-10T06:00:00.111111+00:00'),/VAULT_SCOPE_CHANGED/);
 assert.equal(fetches,1);
 identity='account-A';changeAt='fetch';await assert.rejects(download(origItem,'2026-10-10T06:00:00.111111+00:00'),/VAULT_SCOPE_CHANGED/);
 changeAt='';permissions=true;
 await assert.rejects(download(origItem,''),/VAULT_ITEM_PATH_VERSION_REQUIRED/);
 localScope=false;await assert.rejects(download(origItem,'2026-10-10T06:00:00.111111+00:00'),/VAULT_VIEW_NOT_ALLOWED/);
 console.log('Signed vault download security passed: exact path, revision, account and item binding, 60s token, scope switch, denied permissions and stale download prevention');
})().catch(e=>{console.error(e);process.exitCode=1});