'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','supabase','functions','backup-center','index.ts'),'utf8');
const lines=source.split('\n');
function one(needle){const all=lines.filter(x=>x.includes(needle));assert.equal(all.length,1,'Unique backend statement '+needle);return all[0]}
const permissionLine=one('function permissionEnabled(');
const cleanupGuardLine=one('function mayCleanup(');
assert.match(permissionLine,/device\?\.role==='owner'/);
assert.match(permissionLine,/p\[key\]===true/);
assert.match(cleanupGuardLine,/permissionEnabled\(base.device,'backupDelete'\)/);
function getBody(line){
  const index=line.indexOf('){');
  assert.ok(index>=0,'Expected function body');
  return line.slice(index+2).replace(/\}$/, '');
}
const permissionEnabled=new Function('device','key',getBody(permissionLine));
const mayCleanup=new Function('permissionEnabled','return base=>{'+getBody(cleanupGuardLine)+'}')(permissionEnabled);
const allowed={device:{role:'secondary',permissions:{backupCreate:true,backupRestore:true,backupDelete:true}}};
const restoreOnly={device:{role:'secondary',permissions:{backupRestore:true}}};
const createOnly={device:{role:'secondary',permissions:{backupCreate:true}}};
const owner={device:{role:'owner',permissions:{}}};
assert.equal(mayCleanup(restoreOnly),false,'Restore-only device cannot delete');
assert.equal(mayCleanup(createOnly),false,'Create-only device cannot delete');
assert.equal(mayCleanup(allowed),true);
assert.equal(mayCleanup(owner),true);
assert.equal(mayCleanup({device:{role:'secondary',permissions:{backupDelete:'true'}}}),false,'String permission is not enough');
const plan=one("const base=await context(req,kind==='pre_restore'?");
assert.match(plan,/mayCleanup\(base\)\?await cleanupPending\(base\):0/,'Plan requires backupDelete for stale-item deletion');
const commit=one('const cleanupDeferred=row.backup_kind');
assert.match(commit,/!mayCleanup\(base\)\?0:await cleanupReady\(base,retention\)/,'Retention requires backupDelete');
const endpoint=one("if(action==='cleanup'&&req.method==='POST')");
assert.match(endpoint,/context\(req,'backupDelete'\)/,'Explicit cleanup requires Delete authorization');
assert.doesNotMatch(endpoint,/context\(req,'backupRestore'\)/);
(async()=>{
  let pendingCalls=0,readyCalls=0;
  async function planFor(kind,base){
    const line=plan.slice(plan.indexOf('const base='));
    const runner=new Function('req','context','mayCleanup','cleanupPending','kind',
      'return (async()=>{'+line+'return cleanupDeferred})()');
    return runner({},async()=>base,mayCleanup,async()=>{pendingCalls++;return 2},kind);
  }
  assert.equal(await planFor('pre_restore',restoreOnly),0);
  assert.equal(await planFor('manual',createOnly),0);
  assert.equal(pendingCalls,0,'Unauthorized backup plan cannot remove another backup');
  assert.equal(await planFor('manual',allowed),2);
  assert.equal(pendingCalls,1,'Authorized backup plan retains cleanup');
  const commitFn=new Function('row','base','mayCleanup','cleanupReady','retention','return (async()=>{'+commit+'return cleanupDeferred})()');
  assert.equal(await commitFn({backup_kind:'manual'},restoreOnly,mayCleanup,async()=>{readyCalls++;return 5},7),0);
  assert.equal(await commitFn({backup_kind:'manual'},createOnly,mayCleanup,async()=>{readyCalls++;return 5},7),0);
  assert.equal(readyCalls,0);
  assert.equal(await commitFn({backup_kind:'manual'},allowed,mayCleanup,async()=>{readyCalls++;return 5},7),5);
  assert.equal(readyCalls,1);
  const execute=new Function('action','req','context','cleanupPending','cleanupReady','json',
    'return (async()=>{'+endpoint+';return json({error:"NO_ROUTE"},404)})()');
  const request={method:'POST',json:async()=>({retention:7})};
  const blocked=await execute('cleanup',request,async(_req,required)=>{
    assert.equal(required,'backupDelete');throw Error('BACKUPDELETE_NOT_ALLOWED')
  },async()=>{pendingCalls++},async()=>{readyCalls++},(x,status)=>({status,body:x})).catch(e=>e);
  assert.match(String(blocked),/BACKUPDELETE_NOT_ALLOWED/);
  assert.equal(pendingCalls,1);
  assert.equal(readyCalls,1,'Explicit cleanup cannot delete before authorization');
  const passed=await execute('cleanup',request,async(_req,required)=>{
    assert.equal(required,'backupDelete');return allowed
  },async()=>{pendingCalls++;return 2},async()=>{readyCalls++;return 3},(x,status)=>({status:status||200,body:x}));
  assert.deepEqual(passed.body,{ok:true,cleanup_deferred:5});
  assert.equal(pendingCalls,2);assert.equal(readyCalls,2);
  console.log('Backup server delete permissions passed: plan, retention, cleanup, owner and branch roles');
})().catch(error=>{console.error(error);process.exitCode=1});
