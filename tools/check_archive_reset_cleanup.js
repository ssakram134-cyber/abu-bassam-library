'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'..','web/branch-vault-runtime.js'),'utf8');
new vm.Script(src,{filename:'branch-vault-runtime.js'});
function section(start,end){
 const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Missing '+start);
 return src.slice(a,b)
}
const code=section('async function removeAllVault(', '\nfunction registerCloudAdapter(');
const factory=new Function('allowed','vaultList','credentials','rpc','removeVault','window',code+';return removeAllVault');
const baseRows=[{data:{storagePath:'user/branch-vault/device/item1/rev1'}},{data:{storagePath:'user/branch-vault/device/item2/rev2'}}];
(async()=>{
 let sequence=[],metaRemoved=false;
 let removeAll=factory(()=>true,async()=>{sequence.push('list');return baseRows},async()=>{sequence.push('auth');return{deviceId:'device',secret:'secret'}},
  async(name,args)=>{sequence.push('delete-metadata');assert.equal(name,'abu_bassam_vault_remove_all');assert.equal(args.p_device_id,'device');metaRemoved=true;return{ok:true}},
  async path=>{assert.equal(metaRemoved,true,'Storage deletion must happen only after metadata is no longer active');sequence.push('delete:'+path)},
  {AbuBassamOps:{add:()=>{throw Error('No cleanup errors expected')}}});
 assert.deepEqual(await removeAll(),{ok:true});
 assert.deepEqual(sequence,['list','auth','delete-metadata','delete:user/branch-vault/device/item1/rev1','delete:user/branch-vault/device/item2/rev2']);
 let actions=0,reported=0;
 removeAll=factory(()=>true,async()=>baseRows,async()=>({deviceId:'device',secret:'secret'}),
  async()=>{actions++;return {ok:true}},
  async()=>{actions++;throw Error('Storage temporarily unavailable')},
  {AbuBassamOps:{add:entry=>{assert.equal(entry.type,'failure');reported++}}});
 assert.deepEqual(await removeAll(),{ok:true},'Storage cleanup can be deferred after successful metadata reset');
 assert.equal(reported,2,'Each failed cleanup is recorded');
 assert.equal(actions,3);
 let mutated=false;
 removeAll=factory(()=>true,async()=>baseRows,async()=>({deviceId:'device',secret:'secret'}),async()=>{throw Error('DB delete failed')},
   async()=>{mutated=true},{AbuBassamOps:{add:()=>{}}});
 await assert.rejects(removeAll(),/DB delete failed/);
 assert.equal(mutated,false,'Failed database reset must not delete any Storage object');
 let requested=false;
 removeAll=factory(key=>key!=='vaultDelete',async()=>{requested=true;return baseRows},async()=>({}),async()=>{},async()=>{},{});
 await assert.rejects(removeAll(),/VAULT_DELETE_NOT_ALLOWED/);
 assert.equal(requested,false,'Delete permission must be checked before listing private files');
 console.log('Branch vault reset passed: metadata-first cleanup, failed-RPC abort, deferred storage cleanup and denied unauthorized reset');
})().catch(e=>{console.error(e);process.exitCode=1});
