'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const sql=fs.readFileSync('supabase/migrations/20261012102100_vault_optimistic_cas.sql','utf8');
const branch=fs.readFileSync('web/branch-vault-runtime.js','utf8');
const cloud=fs.readFileSync('web/secure-sync-runtime.js','utf8');
const vault=fs.readFileSync('web/document-vault-runtime.js','utf8');

for(const [marker,label] of [
 ['create or replace function public.abu_bassam_vault_upsert_cas(', 'new CAS RPC'],
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
const rpc=async(name,payload)=>{captured.push({name,payload});return answer};
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
 const throwCas=async()=>{throw Error('VAULT_VERSION_CONFLICT')};
 const rejectedFn=new Function('allowed','credentials','rpc','recordPaths',line+';return vaultUpsert')(
  ()=>true,async()=>({deviceId:'device',secret:'test-secret'}),throwCas,()=>{}
 );
 await assert.rejects(()=>rejectedFn('a',{id:'a'},unchanged),/VAULT_VERSION_CONFLICT/,
  'Conflicting update must fail, not silently revert to last-write-wins');
 console.log('Vault server CAS contract checks passed: SQL locking/permissions and 4 client RPC scenarios. Database migration NOT deployed or SQL-executed.');
}
run().catch(e=>{console.error(e);process.exitCode=1});
