'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const vault=read('web/document-vault-runtime.js');
new vm.Script(vault);
const i=vault.indexOf('async function syncNow(manual=true){'),j=vault.indexOf('\nfunction onShow()',i);
assert.ok(i>=0&&j>i);
const code=vault.slice(i,j);
function mock(settings={}){
 let scope='owner:phone1',checkpoint=[],sent=[],messages=[],localUpdates=0;
 const row={id:'file-1',name:'file.pdf',category:'file',mime:'application/pdf',blob:{size:3},
 size:3,createdAt:'2026-10-10',updatedAt:'2026-10-10',deleted:false,syncState:'pending',remoteUpdatedAt:''};
 let rows=[row];
 const svc={
 get:async()=>{if(settings.switchAfterGet)scope='other:phone1';return null},
 uploadVault:async()=>{sent.push('upload');if(settings.switchAfterUpload)scope='other:phone1';return 'path'},
 upsert:async()=>({updated_at:'remote-1'}),removeVault:async()=>{},list:async()=>{if(settings.switchAfterList)scope='other:phone1';return []},
 downloadVault:async()=>({size:3})
 };
 const props={
 requireVault:()=>true,state:{syncing:false,items:rows},
 automaticDue:()=>true,syncPolicy:()=>({mode:'daily',wifiOnly:false}),
 wifiVerified:()=>true,navigator:{onLine:true},sessionOk:()=>true,
 window:{AbuBassamSecurity:{device:()=>({device_id:'phone1'})}},
 setSyncStatus:v=>messages.push(String(v)),alert:v=>messages.push(String(v)),
 cloud:()=>svc,syncScope:()=>scope,vaultScopeOk:()=>scope==='owner:phone1',vaultAllowed:()=>true,
 dbAll:async()=>rows,autoSyncRerunRequested:false,
 dbMarkSyncedIfUnchanged:async()=>{localUpdates++;if(settings.concurrentEdit)return false;rows=[{...row,syncState:'synced'}];return true},
 dbApplySyncIfUnchanged:async()=>true,dbReconcileRemoteDeletionToTrashIfUnchanged:async()=>true,
 remoteItem:()=>({}),syncSet:(k,v)=>checkpoint.push([k,v]),
 LAST_SYNC_KEY:'last',refresh:async()=>{},logOperation:()=>{},scheduleAutoSync:()=>{},
 niceName:s=>s,uuid:()=> 'copy'
 };
 const fn=new Function(...Object.keys(props),code+';return syncNow')(...Object.values(props));
 return{fn,checkpoint,sent,messages,get localUpdates(){return localUpdates}}
}
(async()=>{
 let p=mock({switchAfterGet:true});
 assert.equal(await p.fn(true),false,'Session switch after metadata fetch must abort');
 assert.equal(p.sent.length,0,'No cross-account upload of local bytes');
 assert.equal(p.checkpoint.length,0);
 p=mock({switchAfterUpload:true});
 assert.equal(await p.fn(true),false,'Session switch after upload must block server upsert');
 assert.equal(p.checkpoint.length,0);
 p=mock({concurrentEdit:true});
 assert.equal(await p.fn(true),false,'Concurrent local revision edit keeps pending queue');
 assert.equal(p.checkpoint.length,0);
 assert.ok(p.messages.some(v=>v.includes('بانتظار استكمال')));
 p=mock();
 assert.equal(await p.fn(true),true,'Stable run drains queue and records checkpoint');
 assert.equal(p.checkpoint.length,1);
 console.log('Stage81 scope and queue behavior passed: no switched account upload, no false success for pending edits.');
})().catch(e=>{console.error(e);process.exitCode=1});
