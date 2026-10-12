'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const sql=fs.readFileSync('supabase/migrations/20261012102100_vault_optimistic_cas.sql','utf8');
const branch=fs.readFileSync('web/branch-vault-runtime.js','utf8');
const cloud=fs.readFileSync('web/secure-sync-runtime.js','utf8');
const vault=fs.readFileSync('web/document-vault-runtime.js','utf8');

for(const [marker,label] of [
 ['create or replace function public.abu_bassam_vault_upsert_cas(', 'new CAS RPC'],
 ['create or replace function public.abu_bassam_vault_cas_ready(', 'read-only capability preflight'],
 ['grant execute on function public.abu_bassam_vault_cas_ready(text,text)', 'readiness RPC granted only to authenticated'],
 ['p_expected_updated_at timestamptz', 'required remote revision parameter'],
 ["p_data->>'id' is distinct from p_client_id", 'matching document identity'],
 ["public._abu_bassam_vault_authorized(p_device_id, p_device_secret, 'vaultSync')", 'device-secret authentication'],
 ["public._abu_bassam_vault_authorized(p_device_id, p_device_secret, 'vaultEdit')", 'write/edit authorization'],
 ["public._abu_bassam_vault_authorized(p_device_id, p_device_secret, 'vaultAdd')", 'create authorization'],
 ["public._abu_bassam_vault_authorized(p_device_id, p_device_secret, 'vaultDelete')", 'deletion authorization'],
 ['for update;', 'row lock when updating existing revisions'],
 ["set search_path to 'pg_catalog', 'extensions'", 'SECURITY DEFINER search path omits writable public'],
 ['v_current.updated_at is distinct from p_expected_updated_at', 'required existing-row version match'],
 ['p_expected_updated_at is not null then', 'create must expect absence'],
 ['on conflict (user_id, branch_device_id, client_id) do nothing', 'concurrent first insert must not overwrite'],
 ['greatest(clock_timestamp(), v_current.updated_at + interval', 'every committed update gets a unique monotonically increasing timestamp'],
 ["raise exception 'VAULT_VERSION_CONFLICT'", 'fail closed on revision mismatch'],
 ["from public, anon, authenticated;", 'secure default RPC execute privileges'],
 ['revoke execute on function public.abu_bassam_vault_upsert(text,text,text,jsonb)', 'legacy last-write-wins RPC disabled']
])assert.ok(sql.toLowerCase().includes(marker.toLowerCase()),'Server CAS missing '+label);
assert.ok(!/on conflict[^;]+do update/is.test(sql),'CAS migration must not add unconditional updates');
assert.ok(!sql.includes('grant execute on function public.abu_bassam_vault_upsert(text,text,text,jsonb)'),'Old unsafe RPC must remain restricted');
assert.ok(branch.includes("rpc('abu_bassam_vault_upsert_cas'"),'Branch runtime must use CAS-only RPC');
assert.ok(!branch.includes("rpc('abu_bassam_vault_upsert'"),'No legacy vault RPC fallback');
assert.ok(cloud.includes('return vaultAdapter.upsert(clientId, data, expectedUpdatedAt);'),'Cloud adapter must forward base revision');
const calls=(vault.match(/service\.upsert\('vault',item\.id,data,row\?remoteVersion:null\)/g)||[]);
assert.equal(calls.length,2,'Both live-file and tombstone updates must carry expected timestamp');

const line=branch.split(/\r?\n/).find(x=>x.startsWith('async function vaultUpsert('));
assert.ok(line,'CAS branch-vault adapter function must exist');
const captured=[];
let answer={client_id:'a',data:{id:'a',storagePath:'rev-path'},updated_at:'2026-10-12T10:21:00.123456+00:00'};
const rpc=async(name,payload)=>{captured.push({name,payload});return {...answer,client_id:payload.p_client_id,data:{...payload.p_data,storagePath:'rev-path'}}};
const branchFn=new Function('allowed','credentials','rpc','recordPaths',line+';return vaultUpsert')(
 ()=>true,async()=>({deviceId:'device',secret:'test-secret'}),rpc,()=>{}
);
const unchanged='2026-10-12T10:19:00.123456+00:00';
async function run(){
 await branchFn('a',{id:'a',deleted:false},unchanged);
 assert.equal(captured[0].name,'abu_bassam_vault_upsert_cas');
 assert.equal(captured[0].payload.p_expected_updated_at,unchanged,'Preserve microseconds exactly; do not round timestamps through Date');
 assert.equal(captured[0].payload.p_client_id,'a');
 await branchFn('new',{id:'new',deleted:false},null);
 assert.equal(captured[1].payload.p_expected_updated_at,null,'Create must carry a NULL precondition');
 const cStart=cloud.indexOf('async function upsert(kind, clientId, data, expectedUpdatedAt = null)');
 const cEnd=cloud.indexOf('async function list(',cStart);
 assert.ok(cStart>=0&&cEnd>cStart,'Cannot isolate canonical cloud upsert');
 const cloudFn=new Function('vaultAdapter','ready','requireUser','client','TABLE',cloud.slice(cStart,cEnd)+';return upsert')(
  {upsert:(id,data,version)=>branchFn(id,data,version)},async()=>null,()=>({id:'user'}),{},'sync'
 );
 await cloudFn('vault','a',{id:'a'},unchanged);
 assert.equal(captured[2].payload.p_expected_updated_at,unchanged,'The secure-sync intermediary must preserve remote version');
 const upStart=branch.indexOf('async function requireCasReady(){');
 const upEnd=branch.indexOf('\nfunction vaultItemId(',upStart);
 assert.ok(upStart>=0&&upEnd>upStart,'Safe cloud upload preflight must exist');
 const uploadSrc=branch.slice(upStart,upEnd);
 assert.ok(uploadSrc.includes('await requireCasReady();const c=client(),plan=await edge('),
   'Capability RPC must finish BEFORE requesting signed upload URLs');
 function buildUpload(mode,can=true){
  const actions={rpc:[],edge:[],storage:[]},pathToId=new Map();
  const probe=async(name,payload)=>{
   actions.rpc.push({name,payload});
   if(mode==='missing')throw Error('PGRST202 FUNCTION_NOT_FOUND');
   return mode==='ready'
  };
  const gateway=async(action)=>{actions.edge.push(action);return {path:'uid/branch-vault/dev/item/rev',token:'test-token'}};
  const storage={from:()=>({uploadToSignedUrl:async(path,token,blob,opts)=>{
   actions.storage.push({path,token,blob,opts});
   return {data:{path},error:null}
  }})};
  const api=new Function('allowed','credentials','rpc','client','edge','BUCKET','pathToId',
    uploadSrc+';return uploadVault')(
   ()=>can,async()=>({deviceId:'dev',secret:'not-a-real-secret'}),probe,()=>({storage}),
   gateway,'test-bucket',pathToId
  );
  return {actions,upload:()=>api('item',{size:4,type:'image/png'},'image/png')}
 }
 const missing=buildUpload('missing');
 await assert.rejects(missing.upload(),/VAULT_CAS_NOT_READY/,'Old server must not produce orphan Storage uploads');
 assert.equal(missing.actions.edge.length,0,'Missing CAS RPC must reject before requesting any signed URL');
 assert.equal(missing.actions.storage.length,0,'Missing CAS RPC must reject before uploading bytes');
 const denied=buildUpload('denied');
 await assert.rejects(denied.upload(),/VAULT_CAS_NOT_READY/,'False capability must reject');
 assert.equal(denied.actions.edge.length,0);
 const allowedUpload=buildUpload('ready');
 const uploadPath=await allowedUpload.upload();
 assert.equal(uploadPath,'uid/branch-vault/dev/item/rev');
 assert.deepEqual(allowedUpload.actions.rpc.map(x=>x.name),['abu_bassam_vault_cas_ready']);
 assert.equal(allowedUpload.actions.edge.length,1,'Signed upload is requested only after a valid capability check');
 assert.equal(allowedUpload.actions.storage.length,1);
 const blocked=buildUpload('ready',false);
 await assert.rejects(blocked.upload(),/VAULT_SYNC_NOT_ALLOWED/,'Missing user permission must block upload early');
 assert.equal(blocked.actions.rpc.length,0);

 const throwCas=async()=>{throw Error('VAULT_VERSION_CONFLICT')};
 const rejectedFn=new Function('allowed','credentials','rpc','recordPaths',line+';return vaultUpsert')(
  ()=>true,async()=>({deviceId:'device',secret:'test-secret'}),throwCas,()=>{}
 );
 await assert.rejects(()=>rejectedFn('a',{id:'a'},unchanged),/VAULT_VERSION_CONFLICT/,
  'Conflicting update must fail, not silently revert to last-write-wins');

 const ack={client_id:'test',data:{id:'test',storagePath:'file',updatedAt:'2026-10-12T20:00:00Z',deleted:false},updated_at:'2026-10-12T20:00:00.123456+00:00'};
 const local={id:'test',storagePath:'file',updatedAt:'2026-10-12T20:00:00Z',deleted:false};
 const faults=[null,[],[ack,ack],{...ack,client_id:'wrong'},{...ack,data:{...ack.data,id:'wrong'}},{...ack,updated_at:''},{...ack,updated_at:null},{...ack,data:{...ack.data,storagePath:'wrong'}},{...ack,data:{...ack.data,deleted:true}},{...ack,data:{...ack.data,updatedAt:'older'}}];
 for(const receipt of faults){
  let recorded=0;
  const guarded=new Function('allowed','credentials','rpc','recordPaths',line+';return vaultUpsert')(
   ()=>true,async()=>({deviceId:'dev',secret:'test-secret'}),async()=>receipt,()=>{recorded++});
  await assert.rejects(()=>guarded('test',local,null),/VAULT_CAS_INVALID_ACK/);
  assert.equal(recorded,0,'Invalid acknowledgement must never record cloud paths');
 }
 let recorded=0;
 const guarded=new Function('allowed','credentials','rpc','recordPaths',line+';return vaultUpsert')(
  ()=>true,async()=>({deviceId:'dev',secret:'test-secret'}),async()=>[ack],()=>{recorded++});
 assert.equal((await guarded('test',local,null)).updated_at,ack.updated_at);
 assert.equal(recorded,1,'Valid server CAS receipt may be recorded');
 console.log('CAS acknowledgement guard passed: ten invalid receipts rejected and one valid receipt accepted.');

 function uploadResponseScenario(mode){
  const actions=[],paths=new Map(),uploadPath='uid/branch-vault/dev/item/rev';
  const gate=async name=>{actions.push('rpc:'+name);return true};
  const signed=async()=>{actions.push('edge');return {path:mode==='empty-path'?'':uploadPath,token:mode==='empty-token'?'':'valid-token'}};
  const store=()=>({storage:{from:()=>({uploadToSignedUrl:async(path,token,blob,opts)=>{
   actions.push('storage');if(opts.upsert!==undefined)throw Error('Signed upload must not claim an upsert override');
   if(mode==='no-receipt')return {data:null,error:null};
   if(mode==='wrong-path')return {data:{path:uploadPath+'/wrong'},error:null};
   if(mode==='storage-failed')return {data:null,error:new Error('STORAGE_FAILED')};
   return {data:{path:uploadPath},error:null}
  }})}});
  const fn=new Function('allowed','credentials','rpc','client','edge','BUCKET','pathToId',
   uploadSrc+';return uploadVault')(
   ()=>true,async()=>({deviceId:'dev',secret:'example'}),gate,store,signed,'bucket',paths
  );
  return {actions,paths,run:()=>fn('item',{size:4,type:'image/png'},'image/png')};
 }
 const confirmedUpload=uploadResponseScenario('ok');
 assert.equal(await confirmedUpload.run(),'uid/branch-vault/dev/item/rev','Only actual Storage receipt confirms file path');
 assert.equal(confirmedUpload.paths.size,1,'Confirmed upload can be added to Storage path map');
 for(const mode of ['empty-path','empty-token']){
  const result=uploadResponseScenario(mode);
  await assert.rejects(result.run(),/VAULT_UPLOAD_PLAN_INVALID/,mode+' must be rejected before upload');
  assert.equal(result.actions.includes('storage'),false);
  assert.equal(result.paths.size,0);
 }
 for(const mode of ['no-receipt','wrong-path']){
  const result=uploadResponseScenario(mode);
  await assert.rejects(result.run(),/VAULT_UPLOAD_UNCONFIRMED/,mode+' must keep archive pending');
  assert.equal(result.actions.includes('storage'),true);
  assert.equal(result.paths.size,0);
 }
 const uploadFailure=uploadResponseScenario('storage-failed');
 await assert.rejects(uploadFailure.run(),/STORAGE_FAILED/,'Storage error must not be disguised as a successful upload');
 assert.equal(uploadFailure.paths.size,0);
 console.log('Signed Storage uploads: 6 receipt/plan scenarios verified; no false saved paths.');
 console.log('Vault server CAS contract checks passed: SQL locking/permissions, 4 CAS calls and 4 upload-preflight scenarios. Database migration NOT deployed or SQL-executed.');
}
run().catch(e=>{console.error(e);process.exitCode=1});
