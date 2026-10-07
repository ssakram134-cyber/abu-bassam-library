const fs=require('fs');
function read(p){if(!fs.existsSync(p))throw new Error(`missing ${p}`);return fs.readFileSync(p,'utf8')}
function need(src,token,label){if(!src.includes(token))throw new Error(`server security migration check failed: ${label}`)}
function forbid(src,token,label){if(src.includes(token))throw new Error(`server security migration check failed: ${label}`)}
function count(src,token){return src.split(token).length-1}

const limit=read('supabase/migrations/202609270004_strict_device_limit_owner_secret.sql');
const all=read('supabase/migrations/202609270005_strict_device_secret_checks_all_paths.sql');
need(limit,"coalesce(trim(p_actor_device_id),'') = ''",'device-limit actor id must be required');
need(limit,"coalesce(p_actor_secret,'') = ''",'device-limit owner secret must be required');
need(limit,"coalesce(v_actor.secret_hash,'') = ''",'device-limit stored owner secret must be non-empty');
need(limit,'v_actor.secret_hash <> v_hash','device-limit owner secret must match');
need(limit,'p_device_limit > 50','device-limit server maximum must stay 50');
need(limit,'DEVICE_LIMIT_BELOW_CURRENT_COUNT','device-limit cannot go below registered count');
need(limit,'from public, anon','device-limit RPC must be revoked from public/anon');

const expected=[
  ['abu_bassam_register_device','v_row','p_secret'],
  ['abu_bassam_touch_device','v_row','p_secret'],
  ['abu_bassam_remove_device','v_actor','p_actor_secret'],
  ['abu_bassam_owner_activity_devices','v_actor','p_actor_secret'],
  ['abu_bassam_customer_document_set_edit_meta','v_device','p_device_secret'],
  ['abu_bassam_customer_prepare_document','v_device','p_device_secret'],
];
for(const [name,row,secret] of expected){
  const start=all.indexOf(`function public.${name}(`);
  if(start<0)throw new Error(`server security migration check failed: missing ${name}`);
  const next=all.indexOf('create or replace function public.',start+20);
  const block=all.slice(start,next<0?all.length:next);
  need(block,`coalesce(${row}.secret_hash,'')=''`,`${name} must reject an empty stored secret hash`);
  need(block,`${row}.secret_hash<>v_hash`,`${name} must require a matching secret hash`);
  if(name!=='abu_bassam_register_device')need(block,`coalesce(${secret},'')=''`,`${name} must reject an empty presented secret`);
  else need(block,"coalesce(p_secret,'')=''",`${name} must reject an empty presented secret`);
}
need(all,'revoke all on function public.abu_bassam_customer_document_set_edit_meta','legacy edit-meta RPC privilege boundary');
need(all,'revoke all on function public.abu_bassam_customer_prepare_document','legacy prepare-document RPC privilege boundary');
need(all,'from public,anon,authenticated','service-only legacy document RPCs must stay unavailable to clients');
need(all,'to service_role','service-only legacy document RPCs must remain callable by the server gateway');

const syncHard=read('supabase/migrations/20261007074108_harden_abu_bassam_rls_and_definer_paths.sql');
for(const name of [
  'abu_bassam_secure_select_own',
  'abu_bassam_secure_insert_own',
  'abu_bassam_secure_update_own',
  'abu_bassam_secure_delete_own',
]){
  need(syncHard,`create policy ${name}`,`strict secure-sync policy ${name}`);
}
for(const old of [
  'abu_bassam_sync_no_direct_vault_select',
  'abu_bassam_sync_no_direct_vault_insert',
  'abu_bassam_sync_no_direct_vault_update',
  'abu_bassam_sync_no_direct_vault_delete',
]){
  need(syncHard,`drop policy if exists ${old}`,`remove permissive OR policy ${old}`);
}
if(count(syncHard,'(select auth.uid()) = user_id')<4)throw new Error('server security migration check failed: every direct secure-sync operation must bind rows to auth.uid()');
need(syncHard,"kind <> all (array['operation'::text,'device'::text,'vault'::text])",'direct secure-sync must exclude operation/device/vault');
need(syncHard,'alter function public.abu_bassam_get_device_limit() security invoker','read-only device-limit RPC must use invoker rights');
need(syncHard,"set search_path to pg_catalog, extensions",'SECURITY DEFINER functions must exclude public from search_path');
need(syncHard,'revoke execute on function %s from public, anon','SECURITY DEFINER functions must stay unavailable to public/anon');

const storageHard=read('supabase/migrations/20261007074602_harden_abu_bassam_storage_rls.sql');
for(const name of [
  'abu_bassam_storage_select_own',
  'abu_bassam_storage_insert_own',
  'abu_bassam_storage_update_own',
  'abu_bassam_storage_delete_own',
]){
  need(storageHard,`create policy ${name}`,`strict storage policy ${name}`);
}
for(const old of [
  'abu_bassam_storage_no_direct_vault_select',
  'abu_bassam_storage_no_direct_vault_insert',
  'abu_bassam_storage_no_direct_vault_update',
  'abu_bassam_storage_no_direct_vault_delete',
]){
  need(storageHard,`drop policy if exists ${old}`,`remove cross-bucket OR policy ${old}`);
}
forbid(storageHard,"bucket_id <> 'abu-bassam-private'",'storage hardening must never grant access by being outside the library bucket');
if(count(storageHard,"bucket_id = 'abu-bassam-private'")<4)throw new Error('server security migration check failed: every direct storage operation must stay inside abu-bassam-private');
if(count(storageHard,"(storage.foldername(name))[1] = (select auth.uid())::text")<4)throw new Error('server security migration check failed: every direct storage operation must bind the first path segment to auth.uid()');
need(storageHard,"array['vault'::text,'branch-vault'::text,'backup-vault'::text]",'vault storage paths must remain Edge/RPC-only');

console.log('server security migration checks passed: device secrets, device-limit ownership, secure-sync row isolation, restricted sync kinds, hardened SECURITY DEFINER paths, and storage bucket/path isolation are regression-guarded.');
