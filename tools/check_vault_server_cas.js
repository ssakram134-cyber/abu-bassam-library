'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const sql=read('supabase/migrations/202610090001_vault_atomic_compare_and_swap.sql');
const vault=read('web/document-vault-runtime.js');
const adapter=read('web/branch-vault-runtime.js');
const cloudSource=read('web/secure-sync-runtime.js');
for(const src of [vault,adapter,cloudSource])new vm.Script(src);
function slice(s,a,b){
 const start=s.indexOf(a),end=s.indexOf(b,start+a.length);
 assert.ok(start>=0&&end>start,'Missing '+a);
 return s.slice(start,end)
}
assert.match(sql,/create or replace function public\.abu_bassam_vault_upsert_cas\(/i);
assert.match(sql,/p_expected_updated_at timestamptz/i);
assert.match(sql,/for update;/i,'Existing rows must be locked for a revision check');
assert.match(sql,/v_current_updated_at<>p_expected_updated_at/);
assert.match(sql,/on conflict \(user_id,branch_device_id,client_id\) do nothing/);
assert.match(sql,/if not found then raise exception 'VAULT_VERSION_CONFLICT'/);
assert.match(sql,/v\.updated_at=p_expected_updated_at/);
assert.match(sql,/greatest\(clock_timestamp\(\),v_current_updated_at\+interval '1 microsecond'\)/);
assert.match(sql,/revoke all on function public\.abu_bassam_vault_upsert\(text,text,text,jsonb\)\s+from PUBLIC, anon, authenticated/);
assert.match(sql,/grant execute on function public\.abu_bassam_vault_upsert_cas\(text,text,text,jsonb,timestamptz\)\s+to authenticated/);
assert.match(sql,/_abu_bassam_vault_authorized\(p_device_id,p_device_secret,'vaultSync'\)/);
for(const perm of ['vaultDelete','vaultEdit','vaultAdd'])assert.ok(sql.includes("'"+perm+"'"));
assert.doesNotMatch(sql,/on conflict[^;]*do update/i,'No last-writer-wins SQL fallback');
const adapterFunc=slice(adapter,'async function vaultUpsert(','async function edge(');
const cloudFunc=slice(cloudSource,'  async function upsert(','  async function list(');
assert.match(adapterFunc,/abu_bassam_vault_upsert_cas/);
assert.doesNotMatch(adapterFunc,/rpc\('abu_bassam_vault_upsert'/);
const logs=[];
const rpc=async(name,args)=>{logs.push({name,args});return [{client_id:args.p_client_id,updated_at:'server-2'}]};
const vaultUpsert=new Function('allowed','credentials','rpc','recordPaths',adapterFunc+';return vaultUpsert')(
 ()=>true,async()=>({deviceId:'device-1',secret:'test-secret'}),rpc,()=>{}
);
const cloudUpsert=new Function('vaultAdapter','TABLE','client','uuid','cloud','globalThis',cloudFunc+';return upsert')(
 {upsert:vaultUpsert},'',null,()=>'',null,{}
);
(async()=>{
 await cloudUpsert('vault','file-1',{name:'updated'},'2026-10-09T20:00:00.123456+00:00');
 assert.equal(logs[0].name,'abu_bassam_vault_upsert_cas');
 assert.equal(logs[0].args.p_expected_updated_at,'2026-10-09T20:00:00.123456+00:00');
 assert.equal(logs[0].args.p_device_id,'device-1');
 await cloudUpsert('vault','new-file',{name:'new'});
 assert.equal(logs[1].args.p_expected_updated_at,null,'Create must check that row does not already exist');

 assert.match(vault,/const remoteChanged=!!row&&\(!knownVersion\|\|remoteVersion!==knownVersion\)/);
 assert.match(vault,/await service\.upsert\('vault',item\.id,data,remoteVersion\|\|null\)/);
 assert.match(vault,/saved=await service\.upsert\('vault',item\.id,data,remoteVersion\|\|null\)/);
 assert.doesNotMatch(vault,/if\(!row\)\{if\(!await dbApplySyncIfUnchanged\(item\.id,item,null\)\)/);
 assert.match(vault,/includes\('VAULT_VERSION_CONFLICT'\)\)autoSyncRerunRequested=true/);

 // Exercise the upload branch with an actual async rejection. The local pending
 // entry must survive; an orphaned staged storage revision is cleaned up.
 const syncCode=slice(vault,'async function syncNow(manual=true){','\nfunction onShow()');
 const pending={id:'book-1',name:'Book.pdf',category:'file',mime:'application/pdf',
  size:4,blob:{size:4,type:'application/pdf'},folder:'',createdAt:'2026-10-01',updatedAt:'2026-10-09',
  syncRevision:'local-1',syncState:'pending',remoteUpdatedAt:'',deleted:false};
 const serverWrites=[],removed=[],statuses=[],schedules=[];
 let local={...pending},serverRow=null;
 const service={
  async get(){return serverRow},
  async list(){return []},
  async uploadVault(){return 'staged/unique-revision'},
  async upsert(kind,id,data,expected){serverWrites.push({kind,id,data,expected});throw new Error('VAULT_VERSION_CONFLICT')},
  async removeVault(path){removed.push(path)}
 };
 const deps={
  state:{syncing:false,items:[local]},requireVault:()=>true,automaticDue:()=>true,
  syncPolicy:()=>({mode:'daily',wifiOnly:false}),wifiVerified:()=>true,
  navigator:{onLine:true},sessionOk:()=>true,
  window:{AbuBassamSecurity:{device:()=>({device_id:'device-1'})}},
  setSyncStatus:x=>statuses.push(x),setAutoSync:()=>{},
  cloud:()=>service,dbAll:async()=>[local],
  dbApplySyncIfUnchanged:async()=>{throw Error('Should not apply on CAS failure')},
  dbMarkSyncedIfUnchanged:async()=>{throw Error('Should not mark synced')},
  dbReconcileRemoteDeletionToTrashIfUnchanged:async()=>{throw Error('Unexpected delete path')},
  remoteItem:()=>{},uuid:()=>{},niceName:x=>x,
  refresh:async()=>{},syncSet:()=>{},LAST_SYNC_KEY:'sync',
  scheduleAutoSync:x=>schedules.push(x),logOperation:()=>{},alert:()=>{}
 };
 const run=new Function(...Object.keys(deps),
  'let autoSyncRerunRequested=false;'+syncCode+';return syncNow')(...Object.values(deps));
 assert.equal(await run(true),false,'Conflict must not report a successful sync');
 assert.equal(local.syncState,'pending','Local file must stay pending on server rejection');
 assert.equal(local.blob,pending.blob,'CAS failure must preserve local Blob');
 assert.equal(deps.state.syncing,false,'Sync lock must release');
 assert.equal(serverWrites.length,1);
 assert.equal(serverWrites[0].expected,null);
 assert.deepEqual(removed,['staged/unique-revision']);
 assert.ok(schedules.includes(100),'A retry must be scheduled after version conflicts');
 assert.ok(statuses.some(x=>x.includes('التغييرات المحلية محفوظة')));

 // Delete conflicts with a missing remote row are protected by a tombstone CAS.
 const deletion={...pending,id:'deleted-book',deleted:true,blob:null,size:0};
 const deleteWrites=[];
 const deleteService={...service,
  async upsert(kind,id,data,expected){deleteWrites.push({kind,id,data,expected});return {updated_at:'server-delete-v1'}},
  async removeVault(){},
  async list(){return []}
 };
 const deleteDeps={...deps,state:{syncing:false,items:[deletion]},cloud:()=>deleteService,
  dbAll:async()=>[deletion],dbApplySyncIfUnchanged:async()=>true,
  scheduleAutoSync:()=>{},setSyncStatus:()=>{},refresh:async()=>{}};
 const deleteRun=new Function(...Object.keys(deleteDeps),
   'let autoSyncRerunRequested=false;'+syncCode+';return syncNow')(...Object.values(deleteDeps));
 assert.equal(await deleteRun(true),true);
 assert.equal(deleteWrites.length,1,'Deletion must write a server tombstone even when remote row is missing');
 assert.equal(deleteWrites[0].data.deleted,true);
 assert.equal(deleteWrites[0].expected,null);
 console.log('Vault server CAS tests passed: SQL guard, locked revisions, adapter forwarding, denied stale upload, staged cleanup and deletion tombstones');
})().catch(e=>{console.error(e);process.exitCode=1});