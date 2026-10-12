'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('supabase/functions/branch-vault/index.ts','utf8');

function branch(from,to){
 const start=source.indexOf(from),end=source.indexOf(to,start+from.length);
 assert.ok(start>=0&&end>start,'Cannot extract canonical Edge action '+from);
 return source.slice(start,end);
}
const upload=branch("if(action==='upload-url'&&req.method==='POST'){","    if(action==='download-url'&&req.method==='GET'){");
const download=branch("if(action==='download-url'&&req.method==='GET'){","    if(action==='delete'&&req.method==='DELETE'){");
for(const [token,label] of [
 ["if(existingError)return json({error:'VAULT_METADATA_UNAVAILABLE'},503);",'upload metadata errors fail closed'],
 ["if(rowError)return json({error:'VAULT_METADATA_UNAVAILABLE'},503);",'download metadata errors are not mislabeled 404'],
 ["!isItemRevision(path,base.user.id,base.deviceId,itemId)",'download path is item-bound'],
 ["row.data?.deleted===true",'deleted cloud revision cannot be downloaded']
])assert.ok(source.includes(token),label);

function environment(action,opts={}){
 const operations=[],itemId='item1';
 const user='user1',device='device1',file=user+'/branch-vault/'+device+'/'+itemId+'/rev';
 const req={method:action==='upload-url'?'POST':'GET',json:async()=>({item_id:itemId,mime:'application/pdf'})};
 const url=new URL('https://example.test/?item_id='+itemId);
 const json=(body,status=200)=>({body,status});
 const metadata=()=>({
   select:()=>({
     eq:function(){return this},
     maybeSingle:async()=>{
       operations.push('metadata');
       if(action==='upload-url')return {data:opts.existing?{client_id:itemId}:null,error:opts.metadataError?{message:'database offline'}:null};
       return {data:opts.missing?null:{data:{storagePath:opts.wrongItemPath?user+'/branch-vault/'+device+'/other/rev':file,deleted:!!opts.deleted}},
               error:opts.metadataError?{message:'database offline'}:null};
     }
   })
 });
 const storage=()=>({
  createSignedUploadUrl:async()=>{operations.push('signed-upload');return {data:{token:'token'},error:null}},
  createSignedUrl:async()=>{operations.push('signed-download');return {data:{signedUrl:'https://files.test/signed'},error:null}}
 });
 const admin={from:metadata,storage:{from:storage}};
 const ctx=async()=>({user:{id:user},deviceId:device,device:{role:'secondary',permissions:{vaultSync:true,vaultView:true,vaultAdd:opts.canAdd!==false,vaultEdit:opts.canEdit!==false}},admin});
 const perm=(dev,key)=>dev.permissions[key]===true;
 const scoped=(uid,did,id,rev='')=>[uid,'branch-vault',did,id,rev].filter(Boolean).join('/');
 const itemRevision=(path,uid,did,id)=>new RegExp('^'+uid+'/branch-vault/'+did+'/'+id+'/[^/]+$').test(path);
 const params=['action','req','url','validItemId','context','json','permissionEnabled','scopedPath','isItemRevision','BUCKET','crypto'];
 const run=new Function(...params,'return (async()=>{'+(action==='upload-url'?upload:download)+'})();');
 return {execute:()=>run(action,req,url,()=>true,ctx,json,perm,scoped,itemRevision,'bucket',{randomUUID:()=> 'rev'}),operations};
}
(async()=>{
 const badUpload=environment('upload-url',{metadataError:true});
 assert.deepEqual(await badUpload.execute(),{body:{error:'VAULT_METADATA_UNAVAILABLE'},status:503});
 assert.deepEqual(badUpload.operations,['metadata'],'Failed lookup must never issue signed upload URL');
 const deniedEdit=environment('upload-url',{existing:true,canEdit:false});
 assert.equal((await deniedEdit.execute()).status,403);
 assert.deepEqual(deniedEdit.operations,['metadata'],'Adding permission must not silently grant editing');
 const normalCreate=environment('upload-url');
 assert.equal((await normalCreate.execute()).status,200);
 assert.deepEqual(normalCreate.operations,['metadata','signed-upload']);
 const normalEdit=environment('upload-url',{existing:true});
 assert.equal((await normalEdit.execute()).status,200);
 assert.deepEqual(normalEdit.operations,['metadata','signed-upload']);
 const brokenDownload=environment('download-url',{metadataError:true});
 assert.deepEqual(await brokenDownload.execute(),{body:{error:'VAULT_METADATA_UNAVAILABLE'},status:503});
 assert.deepEqual(brokenDownload.operations,['metadata']);
 const missing=environment('download-url',{missing:true});
 assert.equal((await missing.execute()).status,404);
 assert.deepEqual(missing.operations,['metadata']);
 const crossed=environment('download-url',{wrongItemPath:true});
 assert.equal((await crossed.execute()).status,403);
 assert.deepEqual(crossed.operations,['metadata'],'Wrong item must never receive signed URL');
 const deleted=environment('download-url',{deleted:true});
 assert.equal((await deleted.execute()).status,403);
 assert.deepEqual(deleted.operations,['metadata']);
 const valid=environment('download-url');
 assert.equal((await valid.execute()).status,200);
 assert.deepEqual(valid.operations,['metadata','signed-download']);
 console.log('Vault Edge metadata safety passed: 9 scenarios, read errors block signed URLs, existing files require edit, downloads are item/revision bound.');
})().catch(error=>{console.error(error);process.exitCode=1});
