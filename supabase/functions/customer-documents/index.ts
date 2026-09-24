import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'abu-bassam-customers-private';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-id, x-device-secret',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
};
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } }); }
function userClient(req: Request) { const authorization=req.headers.get('Authorization')||''; return createClient(SUPABASE_URL,ANON_KEY,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}}); }
function adminClient(){ return createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false}}); }
function creds(req: Request){ return {deviceId:req.headers.get('x-device-id')||'',secret:req.headers.get('x-device-secret')||''}; }
function safeName(value:string){ return String(value||'document').replace(/[\\/:*?"<>|\r\n]/g,'_').slice(0,180)||'document'; }

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  try{
    const url=new URL(req.url);
    const action=url.searchParams.get('action')||(req.method==='DELETE'?'delete':req.method==='GET'?'download':'upload');
    const {deviceId,secret}=creds(req);
    if(!deviceId||!secret)return json({error:'DEVICE_REQUIRED'},403);
    const user=userClient(req),admin=adminClient();

    if(action==='upload'&&req.method==='POST'){
      const form=await req.formData();
      const file=form.get('file');
      const originalFile=form.get('original_file');
      if(!(file instanceof File))return json({error:'FILE_REQUIRED'},400);
      if(file.size>25*1024*1024)return json({error:'FILE_TOO_LARGE'},413);
      if(originalFile instanceof File&&originalFile.size>25*1024*1024)return json({error:'ORIGINAL_TOO_LARGE'},413);
      const customerId=String(form.get('customer_id')||''),documentId=String(form.get('document_id')||crypto.randomUUID());
      const personScope=String(form.get('person_scope')||'customer'),personName=String(form.get('person_name')||''),documentType=String(form.get('document_type')||'other'),documentLabel=String(form.get('document_label')||''),side=String(form.get('side')||'single');
      const fileName=safeName(String(form.get('file_name')||file.name||'document')),mime=String(file.type||form.get('mime')||'application/octet-stream'),sortOrder=Number(form.get('sort_order')||0)||0;
      let editMeta:{}|Record<string,unknown>={}; try{editMeta=JSON.parse(String(form.get('edit_meta')||'{}'))}catch{}

      // Detect whether this is an edit of an existing record. Rollback must never
      // delete a customer's pre-existing document just because a replacement failed.
      const {data:existingAccess}=await user.rpc('abu_bassam_customer_document_access_v2',{p_device_id:deviceId,p_device_secret:secret,p_document_id:documentId});
      const existing=Array.isArray(existingAccess)?existingAccess[0]:existingAccess;
      const hadExisting=!!existing?.storage_path;

      const {data:prepared,error:prepareError}=await user.rpc('abu_bassam_customer_prepare_document',{p_device_id:deviceId,p_device_secret:secret,p_customer_id:customerId,p_document_id:documentId,p_person_scope:personScope,p_person_name:personName,p_document_type:documentType,p_document_label:documentLabel,p_side:side,p_file_name:fileName,p_mime:mime,p_size_bytes:file.size,p_sort_order:sortOrder});
      if(prepareError)return json({error:prepareError.message},403);
      const row=Array.isArray(prepared)?prepared[0]:prepared;
      if(!row?.storage_path)return json({error:'PREPARE_FAILED'},500);

      const rollbackNew=async(paths:string[])=>{
        if(hadExisting)return;
        const clean=[...new Set(paths.filter(Boolean))];
        if(clean.length)await admin.storage.from(BUCKET).remove(clean).catch(()=>null);
        await user.rpc('abu_bassam_customer_document_delete',{p_device_id:deviceId,p_device_secret:secret,p_document_id:documentId}).catch(()=>null);
      };

      // Preserve the source image before replacing/creating the edited rendition.
      // This prevents an original-upload failure from destroying an existing edited file.
      let originalPath:string|null=null,originalMime:string|null=null,originalSize=0,originalUploaded=false;
      if(originalFile instanceof File){
        originalPath=`${row.storage_path}.original`; originalMime=String(originalFile.type||'image/jpeg'); originalSize=originalFile.size;
        const {error:originalError}=await admin.storage.from(BUCKET).upload(originalPath,originalFile,{upsert:false,contentType:originalMime,cacheControl:'3600'});
        if(originalError&&!/already exists/i.test(originalError.message||'')){
          await rollbackNew([]);
          return json({error:originalError.message},500);
        }
        originalUploaded=!originalError;
      }

      const {error:uploadError}=await admin.storage.from(BUCKET).upload(row.storage_path,file,{upsert:true,contentType:mime,cacheControl:'3600'});
      if(uploadError){
        await rollbackNew(originalUploaded&&originalPath?[originalPath]:[]);
        if(hadExisting&&originalUploaded&&originalPath&&!existing?.original_storage_path)await admin.storage.from(BUCKET).remove([originalPath]).catch(()=>null);
        return json({error:uploadError.message},500);
      }

      const metaArgs={p_device_id:deviceId,p_device_secret:secret,p_document_id:documentId,p_original_storage_path:originalPath,p_original_mime:originalMime,p_original_size_bytes:originalSize,p_edit_meta:editMeta};
      let {error:metaError}=await user.rpc('abu_bassam_customer_document_set_edit_meta',metaArgs);
      if(metaError){
        // One retry handles a transient database/network failure without leaving a half-saved new record.
        ({error:metaError}=await user.rpc('abu_bassam_customer_document_set_edit_meta',metaArgs));
      }
      if(metaError){
        await rollbackNew([row.storage_path,...(originalUploaded&&originalPath?[originalPath]:[])]);
        return json({error:metaError.message},500);
      }
      return json({ok:true,document_id:row.document_id||documentId,owner_device_id:row.owner_device_id,file_name:fileName,mime,original_saved:!!(originalPath||existing?.original_storage_path)});
    }

    if(action==='download'&&req.method==='GET'){
      const documentId=String(url.searchParams.get('document_id')||''),version=String(url.searchParams.get('version')||'edited');
      const {data:access,error:accessError}=await user.rpc('abu_bassam_customer_document_access_v2',{p_device_id:deviceId,p_device_secret:secret,p_document_id:documentId});
      if(accessError)return json({error:accessError.message},403);
      const row=Array.isArray(access)?access[0]:access;
      if(!row?.storage_path)return json({error:'DOCUMENT_NOT_FOUND'},404);
      const useOriginal=version==='original'&&row.original_storage_path;
      const path=useOriginal?row.original_storage_path:row.storage_path;
      const mime=useOriginal?(row.original_mime||row.mime):row.mime;
      const {data:blob,error:downloadError}=await admin.storage.from(BUCKET).download(path);
      if(downloadError||!blob)return json({error:downloadError?.message||'DOWNLOAD_FAILED'},404);
      const headers=new Headers(cors);headers.set('Content-Type',mime||blob.type||'application/octet-stream');headers.set('Content-Disposition',`inline; filename="${safeName(row.file_name||'document')}"`);headers.set('Cache-Control','private, no-store');
      return new Response(blob,{status:200,headers});
    }

    if(action==='delete'&&req.method==='DELETE'){
      const body=await req.json().catch(()=>({})),documentId=String(body?.document_id||url.searchParams.get('document_id')||'');
      const {data:access}=await user.rpc('abu_bassam_customer_document_access_v2',{p_device_id:deviceId,p_device_secret:secret,p_document_id:documentId});
      const before=Array.isArray(access)?access[0]:access;
      const {data:path,error:deleteError}=await user.rpc('abu_bassam_customer_document_delete',{p_device_id:deviceId,p_device_secret:secret,p_document_id:documentId});
      if(deleteError)return json({error:deleteError.message},403);
      const paths=[String(path||before?.storage_path||'')]; if(before?.original_storage_path)paths.push(String(before.original_storage_path));
      const clean=paths.filter(Boolean); if(clean.length)await admin.storage.from(BUCKET).remove(clean);
      return json({ok:true});
    }
    return json({error:'UNSUPPORTED_ACTION'},400);
  }catch(error){return json({error:String(error?.message||error||'SERVER_ERROR')},500)}
});
