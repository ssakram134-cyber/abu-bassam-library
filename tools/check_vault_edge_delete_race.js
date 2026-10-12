'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('supabase/functions/branch-vault/index.ts','utf8');
const start = source.indexOf("if(action==='delete'&&req.method==='DELETE'){");
const end = source.indexOf("    return json({error:'UNSUPPORTED_ACTION'},400);",start);
assert.ok(start>=0&&end>start,'Canonical delete Edge handler not found');
const handler=source.slice(start,end);
assert.match(handler,/if\(latestError\)return json\(\{error:'VAULT_METADATA_UNAVAILABLE'\},503\)/);
assert.match(handler,/latest\?\.data\?\.storagePath/);
assert.ok(handler.indexOf('if(latestError)')<handler.indexOf('.remove([path])'),
  'Never delete storage until the second metadata read succeeds');
const user='user1',device='device1',item='doc1';
const revision=rev=>user+'/branch-vault/'+device+'/'+item+'/'+rev;
function simulate(options={}){
 const operations=[];
 const current=Object.prototype.hasOwnProperty.call(options,'initial')?options.initial:{storagePath:revision('old'),deleted:false};
 const latest=options.latest===undefined?current:options.latest;
 let readCount=0;
 const metadata=()=>({
  select:()=>({
   eq:function(){return this},
   maybeSingle:async()=>{
    readCount+=1;operations.push('read:'+readCount);
    if((readCount===1&&options.initialError)||(readCount===2&&options.latestError))
      return {data:null,error:{message:'database read failed'}};
    return {data:(readCount===1?current:latest)?{data:readCount===1?current:latest}:null,error:null};
   }
  })
 });
 const admin={
  from:metadata,
  storage:{from:()=>({remove:async(paths)=>{operations.push('remove:'+paths[0]);return {error:null}}})}
 };
 const context=async()=>({user:{id:user},deviceId:device,device:{role:'owner'},admin});
 const req={method:'DELETE',json:async()=>({item_id:item,path:options.path||revision('old')})};
 const validItemId=id=>id===item;
 const isItemRevision=(path,u,d,i)=>new RegExp('^'+u+'/branch-vault/'+d+'/'+i+'/[^/]+$').test(path);
 const respond=(body,status=200)=>({body,status});
 const execute=new Function('action','req','validItemId','context','permissionEnabled',
  'json','isItemRevision','BUCKET',"return (async()=>{"+handler+"})();");
 return {run:()=>execute('delete',req,validItemId,context,()=>true,respond,isItemRevision,'bucket'),operations};
}
(async()=>{
 const stable=simulate({initial:{storagePath:revision('new'),deleted:false}});
 assert.equal((await stable.run()).status,200);
 assert.deepEqual(stable.operations,['read:1','read:2','remove:'+revision('old')]);

 const activeFromFirstRead=simulate();
 assert.equal((await activeFromFirstRead.run()).status,409);
 assert.deepEqual(activeFromFirstRead.operations,['read:1']);

 const restored=simulate({initial:{storagePath:revision('old'),deleted:true},
   latest:{storagePath:revision('old'),deleted:false}});
 assert.equal((await restored.run()).status,409);
 assert.deepEqual(restored.operations,['read:1','read:2']);

 const switchedToRequested=simulate({initial:{storagePath:revision('new'),deleted:false},
   latest:{storagePath:revision('old'),deleted:false}});
 assert.equal((await switchedToRequested.run()).status,409);
 assert.deepEqual(switchedToRequested.operations,['read:1','read:2']);

 const brokenSecondRead=simulate({initial:{storagePath:revision('new'),deleted:false},latestError:true});
 assert.equal((await brokenSecondRead.run()).status,503);
 assert.deepEqual(brokenSecondRead.operations,['read:1','read:2']);

 const brokenFirstRead=simulate({initialError:true});
 assert.equal((await brokenFirstRead.run()).status,500);
 assert.deepEqual(brokenFirstRead.operations,['read:1']);

 const wrongItem=simulate({path:user+'/branch-vault/'+device+'/other/rev'});
 assert.equal((await wrongItem.run()).status,403);
 assert.deepEqual(wrongItem.operations,['read:1']);

 const absent=simulate({initial:null,latest:null});
 assert.equal((await absent.run()).status,200);
 assert.deepEqual(absent.operations,['read:1','read:2','remove:'+revision('old')]);

 console.log('Vault Storage delete revalidation passed: 8 scenarios including restored active blobs, metadata errors and obsolete revisions.');
})().catch(error=>{console.error(error);process.exitCode=1});
