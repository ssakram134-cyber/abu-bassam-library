'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const sql=read('supabase/migrations/202610090002_vault_owner_readonly_branch_browser.sql');
const edge=read('supabase/functions/branch-vault/index.ts');
const gateway=read('web/branch-vault-runtime.js');
const vault=read('web/document-vault-runtime.js');
for(const text of [gateway,vault])new vm.Script(text);
function between(text,start,end){
 const a=text.indexOf(start),b=text.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Missing '+start);
 return text.slice(a,b)
}
// The list RPC must not grant branch reads to ordinary staff or guests.
assert.match(sql,/v_uid uuid:=auth\.uid\(\)/);
assert.match(sql,/_abu_bassam_vault_authorized\(p_device_id,p_device_secret,'vaultView'\)/);
assert.match(sql,/select \(d\.role='owner'\) into v_owner/);
assert.match(sql,/d\.user_id=v_uid and d\.device_id=p_device_id and d\.active=true/);
assert.match(sql,/if not coalesce\(v_owner,false\) then raise exception 'VAULT_OWNER_REQUIRED'/);
assert.match(sql,/where v\.user_id=v_uid/);
assert.match(sql,/coalesce\(v\.data->>'deleted','false'\) <> 'true'/);
assert.match(sql,/order by v\.branch_device_id asc, v\.client_id asc/);
assert.match(sql,/revoke all on function public\.abu_bassam_vault_owner_list\([\s\S]*?from PUBLIC, anon, authenticated/);
assert.match(sql,/grant execute on function public\.abu_bassam_vault_owner_list\([\s\S]*?to authenticated/);
assert.doesNotMatch(sql,/delete from public|update public|insert into public/i);
const downloadHandler=between(edge,"    if(action==='owner-download-url'&&req.method==='GET')","    const discardUpload=");
assert.match(downloadHandler,/context\(req,'vaultView'\)/);
assert.match(downloadHandler,/base\.device\.role!=='owner'/);
assert.match(downloadHandler,/\.eq\('user_id',base\.user\.id\)/);
assert.match(downloadHandler,/\.eq\('branch_device_id',targetDevice\)/);
assert.match(downloadHandler,/\.eq\('client_id',itemId\)/);
assert.match(downloadHandler,/isItemRevision\(path,base\.user\.id,targetDevice,itemId\)/);
assert.match(downloadHandler,/row\.updated_at\|\|''\)!==expected/);
assert.doesNotMatch(downloadHandler,/upload|remove\(\[|\.update\(/);
assert.match(vault,/id="vOtherBranchButton" style="display:none"/);
assert.match(vault,/vaultOwner\(\)\?'':'none'/);
assert.match(vault,/DocumentVault\.openOtherBranches/);
assert.match(vault,/DocumentVault\.closeOtherBranches/);
assert.match(vault,/otherBranchRequest\+\+/);
assert.match(vault,/request!==otherBranchRequest/);
assert.match(vault,/otherBranchScope!==syncScope\(\)/);
assert.match(vault,/esc\(row\.data\?\.name\|\|row\.client_id\)/);
assert.match(vault,/const safeBlob=new Blob/);
assert.match(vault,/if\(!vaultOwner\(\)\|\|!vaultScopeOk\(false\)\|\|!vaultAllowed\('vaultViewOtherBranches'\)\|\|!vaultAllowed\('vaultExport'\)/);
const listSource=between(gateway,'async function ownerList(','async function ownerDownload(');
const downloadSource=between(gateway,'async function ownerDownload(','async function vaultUpsert(');
let currentUid='account-A',owner=true,canView=true,local=true,changes=0;
const device=()=>({id:'owner-device'});
const window={AbuBassamCloud:{session:()=>({user:{id:currentUid}})}};
const role=()=>owner?'owner':'secondary';
const allowed=key=>key==='vaultView'?canView:true;
const localScopeOk=()=>local;
const credentials=async()=>({deviceId:'owner-device',secret:'fixture-secret'});
const rows=[
 {branch_device_id:'branch-A',branch_name:'فرع أ',client_id:'1',data:{id:'1',name:'كتاب.pdf',deleted:false},updated_at:'2026-10-09T13:00:00Z'},
 {branch_device_id:'branch-B',branch_name:'فرع ب',client_id:'2',data:{id:'2',name:'صورة.jpg'},updated_at:'2026-10-09T13:01:00Z'},
 {branch_device_id:'branch-B',branch_name:'فرع ب',client_id:'3',data:{id:'3',deleted:true},updated_at:'2026-10-09T13:02:00Z'}
];
let rpcArgs=[],alterOnList=false;
const rpc=async(name,args)=>{
 rpcArgs.push({name,args});
 if(alterOnList)currentUid='account-B';
 return rows
};
const ownerList=new Function('role','allowed','localScopeOk','window','device','credentials','rpc',listSource+';return ownerList')(
 role,allowed,localScopeOk,window,device,credentials,rpc
);
(async()=>{
 assert.equal((await ownerList()).length,2,'Other branches visible to owner, tombstones hidden');
 assert.equal(rpcArgs[0].name,'abu_bassam_vault_owner_list');
 assert.equal(rpcArgs[0].args.p_device_id,'owner-device');
 assert.equal(rpcArgs[0].args.p_limit,250);
 owner=false;
 await assert.rejects(ownerList(),/VAULT_OWNER_REQUIRED/);
 owner=true;
 canView=false;
 await assert.rejects(ownerList(),/VAULT_OWNER_REQUIRED/);
 canView=true;
 alterOnList=true;
 await assert.rejects(ownerList(),/VAULT_SCOPE_CHANGED/,'Old account rows never appear after switching users');
 currentUid='account-A';alterOnList=false;
 let targetUrl='',alterOnDownload=false,reads=0;
 const edgeCall=async(name,options)=>{assert.equal(name,'owner-download-url');targetUrl=options.query;return{url:'https://example.invalid/signed'}};
 const fetch=async()=>{reads++;if(alterOnDownload)currentUid='account-B';return{ok:true,async blob(){return{size:9,type:'application/pdf'}}}};
 const ownerDownload=new Function('role','allowed','localScopeOk','window','device','edge','fetch',downloadSource+';return ownerDownload')(
 role,allowed,localScopeOk,window,device,edgeCall,fetch
 );
 let file=await ownerDownload(rows[0]);
 assert.equal(file.name,'كتاب.pdf');
 assert.match(targetUrl,/branch_device_id=branch-A/);
 assert.match(targetUrl,/item_id=1/);
 assert.match(targetUrl,/updated_at=2026-10-09T13%3A00%3A00Z/);
 assert.equal(reads,1);
 alterOnDownload=true;
 await assert.rejects(ownerDownload(rows[1]),/VAULT_SCOPE_CHANGED/);
 currentUid='account-A';alterOnDownload=false;owner=false;
 await assert.rejects(ownerDownload(rows[0]),/VAULT_OWNER_REQUIRED/);
 assert.equal(reads,2,'Unauthorized callers cannot request download');
 console.log('Owner-only branch browser checks passed: branch isolation, RPC access boundaries, scoped signed reads, deletion filtering, account-switch rejection');
})().catch(e=>{console.error(e);process.exitCode=1});