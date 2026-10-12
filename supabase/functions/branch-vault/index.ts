import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'abu-bassam-private';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-id, x-device-secret',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
};
function json(body: unknown, status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
function userClient(req:Request){const authorization=req.headers.get('Authorization')||'';return createClient(SUPABASE_URL,ANON_KEY,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}})}
function adminClient(){return createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false}})}
function safePart(v:string){return String(v||'').replace(/[^A-Za-z0-9_.-]/g,'_').slice(0,180)}
async function sha256Hex(value:string){const bytes=new TextEncoder().encode(value),hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function permissionEnabled(device:{role?:string;permissions?:Record<string,unknown>},key:string){
  if(device?.role==='owner')return true;
  const permissions=device?.permissions&&typeof device.permissions==='object'?device.permissions:{};
  return permissions[key]===true;
}
async function context(req:Request,permission:string){
  const deviceId=req.headers.get('x-device-id')||'',secret=req.headers.get('x-device-secret')||'';
  if(!deviceId||!secret)throw new Error('DEVICE_REQUIRED');
  const userApi=userClient(req),{data:{user},error:userError}=await userApi.auth.getUser();
  if(userError||!user)throw new Error('NOT_AUTHENTICATED');
  const admin=adminClient(),{data:device,error}=await admin.from('abu_bassam_devices').select('device_id,role,active,permissions,secret_hash').eq('user_id',user.id).eq('device_id',deviceId).maybeSingle();
  if(error||!device||device.active===false||!device.secret_hash||device.secret_hash!==await sha256Hex(secret))throw new Error('DEVICE_NOT_AUTHORIZED');
  if(!permissionEnabled(device,permission))throw new Error(permission.toUpperCase()+'_NOT_ALLOWED');
  return{user,userApi,admin,deviceId,device};
}
function scopedPath(userId:string,deviceId:string,itemId:string,revision=''){const base=`${userId}/branch-vault/${safePart(deviceId)}/${safePart(itemId)}`;return revision?`${base}/${safePart(revision)}`:base}
function isScoped(path:string,userId:string,deviceId:string){return String(path||'').startsWith(`${userId}/branch-vault/${safePart(deviceId)}/`)}
function validItemId(value:string){return /^[A-Za-z0-9_.-]{1,180}$/.test(value)&&value!=='.'&&value!=='..'}
function isItemRevision(path:string,userId:string,deviceId:string,itemId:string){
  const prefix=scopedPath(userId,deviceId,itemId)+'/';
  const text=String(path||'');
  const suffix=text.startsWith(prefix)?text.slice(prefix.length):'';
  return suffix.length>0&&suffix!=='.'&&suffix!=='..'&&!suffix.includes('/');
}


Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  try{
    const url=new URL(req.url),action=url.searchParams.get('action')||'';
    if(action==='upload-url'&&req.method==='POST'){
      const body=await req.json().catch(()=>({})),itemId=String(body?.item_id||''),mime=String(body?.mime||'application/octet-stream').split(';',1)[0].trim().toLowerCase();
      if(!validItemId(itemId))return json({error:'ITEM_ID_REQUIRED'},400);
      const base=await context(req,'vaultSync');
      const {data:existing,error:existingError}=await base.admin.from('abu_bassam_branch_vault').select('client_id').eq('user_id',base.user.id).eq('branch_device_id',base.deviceId).eq('client_id',itemId).maybeSingle();
      // A failed metadata lookup is not proof the item does not exist.
      // Do not issue a signed upload URL using vaultAdd rights on a read error.
      if(existingError)return json({error:'VAULT_METADATA_UNAVAILABLE'},503);
      const permission=existing?'vaultEdit':'vaultAdd';
      if(!permissionEnabled(base.device,permission))return json({error:permission.toUpperCase()+'_NOT_ALLOWED'},403);
      const path=scopedPath(base.user.id,base.deviceId,itemId,crypto.randomUUID()),{data,error}=await base.admin.storage.from(BUCKET).createSignedUploadUrl(path,{upsert:false});
      if(error||!data)return json({error:error?.message||'SIGNED_UPLOAD_FAILED'},500);
      return json({ok:true,path,token:data.token,mime:mime||'application/octet-stream'});
    }
    if(action==='download-url'&&req.method==='GET'){
      const itemId=String(url.searchParams.get('item_id')||'');if(!validItemId(itemId))return json({error:'ITEM_ID_REQUIRED'},400);
      const base=await context(req,'vaultView');
      if(!permissionEnabled(base.device,'vaultSync'))return json({error:'VAULT_SYNC_NOT_ALLOWED'},403);
      const {data:row,error:rowError}=await base.admin.from('abu_bassam_branch_vault').select('data').eq('user_id',base.user.id).eq('branch_device_id',base.deviceId).eq('client_id',itemId).maybeSingle();
      if(rowError)return json({error:'VAULT_METADATA_UNAVAILABLE'},503);
      if(!row)return json({error:'VAULT_ITEM_NOT_FOUND'},404);
      const path=String(row.data?.storagePath||'');
      if(!path||row.data?.deleted===true||!isItemRevision(path,base.user.id,base.deviceId,itemId))return json({error:'VAULT_PATH_INVALID'},403);
      const {data,error}=await base.admin.storage.from(BUCKET).createSignedUrl(path,900,{download:false});if(error||!data?.signedUrl)return json({error:error?.message||'SIGNED_DOWNLOAD_FAILED'},500);
      return json({ok:true,path,url:data.signedUrl,expiresIn:900});
    }
    if(action==='delete'&&req.method==='DELETE'){
      const body=await req.json().catch(()=>({})),itemId=String(body?.item_id||''),requested=String(body?.path||'');
      if(!validItemId(itemId))return json({error:'VAULT_ID_REQUIRED'},400);
      const base=await context(req,'vaultDelete');
      if(!permissionEnabled(base.device,'vaultSync'))return json({error:'VAULT_SYNC_NOT_ALLOWED'},403);
      const {data:row,error:rowError}=await base.admin.from('abu_bassam_branch_vault').select('data').eq('user_id',base.user.id).eq('branch_device_id',base.deviceId).eq('client_id',itemId).maybeSingle();
      if(rowError)return json({error:'VAULT_METADATA_UNAVAILABLE'},500);
      const currentPath=String(row?.data?.storagePath||'');
      const path=requested||currentPath;
      if(path&&!isItemRevision(path,base.user.id,base.deviceId,itemId))return json({error:'VAULT_PATH_INVALID'},403);
      // Do not remove a revision referenced by active server metadata.
      if(path&&path===currentPath&&row?.data?.deleted!==true)return json({error:'VAULT_ACTIVE_REVISION'},409);
      if(path){
        // The initial metadata read can become stale while this request awaits.
        // Recheck immediately before the irreversible Storage operation.
        // This narrows the race window but does not make Storage and Postgres atomic.
        const {data:latest,error:latestError}=await base.admin.from('abu_bassam_branch_vault')
          .select('data').eq('user_id',base.user.id).eq('branch_device_id',base.deviceId)
          .eq('client_id',itemId).maybeSingle();
        if(latestError)return json({error:'VAULT_METADATA_UNAVAILABLE'},503);
        if(String(latest?.data?.storagePath||'')===path&&latest?.data?.deleted!==true)
          return json({error:'VAULT_ACTIVE_REVISION'},409);
        const {error}=await base.admin.storage.from(BUCKET).remove([path]);
        if(error)return json({error:error.message},500);
      }
      return json({ok:true});
    }
    return json({error:'UNSUPPORTED_ACTION'},400);
  }catch(error){const message=String((error as Error)?.message||error||'SERVER_ERROR'),status=message==='NOT_AUTHENTICATED'?401:/NOT_ALLOWED|DEVICE/.test(message)?403:500;return json({error:message},status)}
});
