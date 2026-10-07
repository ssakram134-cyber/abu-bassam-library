const fs=require('fs');
function read(p){if(!fs.existsSync(p))throw new Error(`missing ${p}`);return fs.readFileSync(p,'utf8')}
function need(src,token,label){if(!src.includes(token))throw new Error(`server security migration check failed: ${label}`)}
function forbid(src,token,label){if(src.includes(token))throw new Error(`server security migration check failed: ${label}`)}
function count(src,token){return src.split(token).length-1}

const restoredVaultPaging=read('supabase/migrations/20261002005258_fix_branch_vault_fail_closed_and_paging.sql');
need(restoredVaultPaging,'public._abu_bassam_vault_authorized','restored branch-vault migration source must remain versioned');
need(restoredVaultPaging,'VAULT_VIEW_NOT_ALLOWED','restored branch-vault migration must remain fail closed');
need(restoredVaultPaging,'p_offset integer default 0','restored branch-vault migration must preserve paging');

const restoredGranular=read('supabase/migrations/20261002005405_fix_granular_permissions_fail_closed.sql');
need(restoredGranular,'public._abu_bassam_device_permission','restored granular permission migration source must remain versioned');
need(restoredGranular,"return false;\nexception when others then",'granular permission helper must remain fail closed');
need(restoredGranular,'from public,anon,authenticated','internal permission helper must remain client-inaccessible');

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
  need(syncHard,`drop policy if exists ${old}`,`retire split secure-sync restriction ${old}`);
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
  need(storageHard,`drop policy if exists ${old}`,`retire split storage vault restriction ${old}`);
}
forbid(storageHard,"bucket_id <> 'abu-bassam-private'",'consolidated storage policy must never grant access merely by being outside the library bucket');
if(count(storageHard,"bucket_id = 'abu-bassam-private'")<4)throw new Error('server security migration check failed: every direct storage operation must stay inside abu-bassam-private');
if(count(storageHard,"(storage.foldername(name))[1] = (select auth.uid())::text")<4)throw new Error('server security migration check failed: every direct storage operation must bind the first path segment to auth.uid()');
need(storageHard,"array['vault'::text,'branch-vault'::text,'backup-vault'::text]",'vault storage paths must remain Edge/RPC-only');



const repairEventsHard=read('supabase/migrations/20261007165448_harden_repair_events_and_internal_rpcs.sql');
need(repairEventsHard,'create policy repair_events_role_select','repair events must be read-only to authorized app roles');
need(repairEventsHard,'revoke all on table public.repair_events from anon, authenticated','repair events direct writes must remain closed');
need(repairEventsHard,'create policy purchase_payment_requests_no_direct_access','purchase payment request table must fail closed for clients');
need(repairEventsHard,'revoke execute on function public.migrate_legacy_dismantling_device(uuid) from public, anon, authenticated','legacy dismantling migration must remain service-only');

const publicTrackingHard=read('supabase/migrations/20261007170001_sanitize_public_repair_tracking_rpc.sql');
need(publicTrackingHard,'null::text as customer_name','public tracking must redact customer name');
need(publicTrackingHard,'null::text as primary_fault','public tracking must redact fault details');
need(publicTrackingHard,'null::numeric as total_cost','public tracking must redact total cost');
need(publicTrackingHard,'null::numeric as deposit','public tracking must redact deposit');
need(publicTrackingHard,'null::numeric as deposit','public tracking sanitization migration must redact deposit before direct RPC retirement');

const dismantlingPolicyHard=read('supabase/migrations/20261007170201_split_dismantling_read_write_policies.sql');
need(dismantlingPolicyHard,'create policy dismantled_parts_read','dismantled parts read policy must be separate');
need(dismantlingPolicyHard,'create policy dismantled_parts_delete_management','dismantled parts delete policy must be management-only');
need(dismantlingPolicyHard,'create policy dismantling_devices_read','dismantling devices read policy must be separate');
need(dismantlingPolicyHard,'create policy dismantling_devices_delete_management','dismantling devices delete policy must be management-only');
if(count(dismantlingPolicyHard,"using (public.has_app_role(array['owner','manager']))")<4)throw new Error('server security migration check failed: dismantling write/delete paths must be owner/manager only');

const legacyWrapperHard=read('supabase/migrations/20261007170306_make_legacy_rpc_wrappers_invoker.sql');
for(const sig of [
  'public.add_repair_part(uuid,uuid,integer,text)',
  'public.pay_purchase_order(uuid,numeric)',
  'public.remove_repair_part(uuid)',
  'public.return_purchase_item(uuid,integer)',
]) need(legacyWrapperHard,`alter function ${sig} security invoker`,`${sig} compatibility wrapper must remain SECURITY INVOKER`);

const anonymousSurfaceHard=read('supabase/migrations/20261007170725_close_anonymous_internal_function_surface.sql');
for(const sig of [
  'public.enforce_atomic_debt_payment_ledger()',
  'public.guard_repair_status_transition()',
  'public.set_compatibility_catalog_updated_at()',
  'public.stamp_repair_status_times()',
  'public.sync_dismantled_part_aliases()',
  'public.sync_repair_warranty_record()',
]) need(anonymousSurfaceHard,`revoke execute on function ${sig} from public, anon, authenticated`,`${sig} must not be directly client callable`);
need(anonymousSurfaceHard,'revoke execute on function public.refresh_in_app_notifications() from public, anon','legacy notification refresh must not be anonymously callable');

const retirePublicTracking=read('supabase/migrations/20261007172202_retire_direct_public_tracking_rpc.sql');
need(retirePublicTracking,'revoke all on function public.get_public_repair_tracking(uuid) from public, anon, authenticated','legacy public tracking RPC must not remain client-callable');
need(retirePublicTracking,'grant execute on function public.get_public_repair_tracking(uuid) to service_role','legacy public tracking RPC must remain service-maintainable');

const integrityHard=read('supabase/migrations/20261007172053_add_financial_inventory_integrity_constraints.sql');
for(const token of [
  'customers_total_debt_nonnegative',
  'repairs_money_and_warranty_nonnegative',
  'spare_parts_inventory_nonnegative',
  'purchase_order_items_received_not_over_quantity',
  'purchase_orders_money_nonnegative',
]) need(integrityHard,token,`database integrity constraint ${token} must remain present`);
need(integrityHard,'coalesce(reserved_quantity,0) <= coalesce(quantity,0)','reserved spare-part quantity must not exceed stock');
need(integrityHard,'coalesce(received_quantity,0) <= coalesce(quantity,0)','received purchase quantity must not exceed ordered quantity');

const customerCompat=read('supabase/migrations/20261007181851_delegate_legacy_customer_rpcs_to_v2.sql');
for(const legacy of ['abu_bassam_customer_document_access','abu_bassam_customer_list']) need(customerCompat,`public.${legacy}`,`legacy customer RPC ${legacy} must remain versioned`);
need(customerCompat,'security invoker','legacy customer RPCs must not duplicate SECURITY DEFINER privilege');
need(customerCompat,'public.abu_bassam_customer_document_access_v2','legacy document access must delegate to v2');
need(customerCompat,'public.abu_bassam_customer_list_v2','legacy customer list must delegate to v2');

const notificationCompat=read('supabase/migrations/20261007181713_delegate_legacy_notification_refresh_to_v2.sql');
need(notificationCompat,'security invoker','legacy notification refresh must not regain definer privileges');
need(notificationCompat,'set search_path to pg_catalog','legacy notification refresh must keep hardened search_path');
need(notificationCompat,'return public.refresh_in_app_notifications_v2();','legacy notification refresh must delegate to the authorized v2 implementation');
need(notificationCompat,'from public, anon','legacy notification refresh must remain unavailable anonymously');

const anonDataClosed=read('supabase/migrations/20261007181256_remove_anonymous_public_schema_data_privileges.sql');
need(anonDataClosed,'revoke all privileges','anonymous public data migration must revoke privileges');
need(anonDataClosed,'on all tables in schema public','anonymous users must not retain direct public table access');
need(anonDataClosed,'on all sequences in schema public','anonymous users must not retain public sequence access');
if(count(anonDataClosed,'from anon')<2)throw new Error('server security migration check failed: anonymous table and sequence privileges must both remain revoked');

const legacyRolePolicies=read('supabase/migrations/20261007181143_require_app_role_for_legacy_authenticated_policies.sql');
need(legacyRolePolicies,"cmd='ALL'",'legacy authenticated policy hardening must target ALL policies');
need(legacyRolePolicies,"roles = array['authenticated']::name[]",'legacy policy hardening must target authenticated-only policies');
need(legacyRolePolicies,'public.current_app_role() is not null','legacy policies must require an assigned application role');
forbid(legacyRolePolicies,"using ((select auth.uid()) is not null)",'legacy policy hardening must not preserve authentication-only authorization');

const dataApiDefaults=read('supabase/migrations/20261007180851_fail_closed_data_api_default_privileges.sql');
need(dataApiDefaults,'revoke truncate, references, trigger','client roles must never retain RLS-bypassing or structural table privileges');
need(dataApiDefaults,'on all tables in schema public','dangerous table privilege cleanup must cover the full public schema');
for(const kind of ['tables','sequences','functions']) need(dataApiDefaults,`revoke all on ${kind} from anon, authenticated`,`future public ${kind} must fail closed for API roles`);

const definerReharden=read('supabase/migrations/20261007180419_reharden_all_authenticated_definer_search_paths.sql');
need(definerReharden,"p.prosecdef",'definer reharden migration must target SECURITY DEFINER functions');
need(definerReharden,"has_function_privilege('authenticated',p.oid,'EXECUTE')",'definer reharden migration must cover authenticated-callable functions');
need(definerReharden,"like '%search_path=%public%'",'definer reharden migration must detect mutable public search paths');
need(definerReharden,"alter function %s set search_path to pg_catalog, extensions",'definer reharden migration must pin search_path');
need(definerReharden,"revoke execute on function %s from public, anon",'definer reharden migration must keep anonymous execution closed');

const ownerRoleGuard=read('supabase/migrations/20261007173256_harden_last_owner_role_guard.sql');
need(ownerRoleGuard,"where role='owner'","last-owner guard must count active owners");
need(ownerRoleGuard,"and (p_role <> 'owner' or not coalesce(p_active,true))",'last-owner guard must cover both demotion and deactivation');
need(ownerRoleGuard,"raise exception 'لا يمكن تعطيل أو إزالة آخر مالك للنظام'",'last active owner must never be removable');
need(ownerRoleGuard,'set search_path to pg_catalog','role-management SECURITY DEFINER functions must use a hardened search_path');

const firstDeviceLabel=read('supabase/migrations/20261007172803_fix_first_device_default_label.sql');
need(firstDeviceLabel,"v_role:=case when v_count=0 then 'owner' else 'secondary' end",'first registered device must remain owner');
need(firstDeviceLabel,"case when v_count=0 then 'نسختي الأولى باسم (أكرم)' else 'جهاز المكتبة' end",'first registered device must keep the requested default label');
need(firstDeviceLabel,"if v_count>=v_limit then raise exception 'DEVICE_LIMIT_REACHED'",'device registration must enforce the configured device cap');
need(firstDeviceLabel,"coalesce(v_row.secret_hash,'')='' or v_row.secret_hash<>v_hash",'existing device registration must require the stored secret');

const publicTrackingEdge=read('supabase/functions/track-repair/index.ts');
need(publicTrackingEdge,"waiting: 'بانتظار المتابعة'",'public tracking must localize waiting status');
need(publicTrackingEdge,"waiting_parts: 'بانتظار قطعة'",'public tracking must localize waiting_parts status');
need(publicTrackingEdge,"completed: 'تم إكمال الصيانة'",'public tracking must localize completed status');
need(publicTrackingEdge,".select('repair_number,brand,model,status,expected_delivery,received_date,created_at,updated_at')",'public tracking query must stay on the minimal safe repair field set');
for(const sensitive of ['customer_name','primary_fault','total_cost','deposit','lock_code','imei']) forbid(publicTrackingEdge,sensitive,`public tracking Edge Function must not expose ${sensitive}`);
need(publicTrackingEdge,"Cache-Control': 'no-store'",'public tracking responses must not be cached');
need(publicTrackingEdge,"tracking_token', token",'public tracking must stay scoped to the opaque tracking token');

console.log('server security migration checks passed: device secrets, ownership/RLS isolation, private storage, repair-event write lockdown, public-tracking redaction, dismantling least privilege, invoker compatibility wrappers, anonymous RPC minimization, and financial/inventory integrity constraints are regression-guarded.');
