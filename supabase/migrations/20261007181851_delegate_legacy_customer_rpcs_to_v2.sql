-- Supabase live migration: 20261007181851_delegate_legacy_customer_rpcs_to_v2
-- Keep legacy customer RPC signatures for compatibility while delegating
-- authorization and data shaping to the current v2 implementations.

create or replace function public.abu_bassam_customer_document_access(
  p_device_id text,
  p_device_secret text,
  p_document_id uuid
)
returns table(
  storage_path text,
  file_name text,
  mime text,
  customer_id uuid,
  owner_device_id text
)
language sql
security invoker
set search_path to pg_catalog
as $function$
  select v.storage_path,v.file_name,v.mime,v.customer_id,v.owner_device_id
  from public.abu_bassam_customer_document_access_v2(
    p_device_id,p_device_secret,p_document_id
  ) as v
$function$;

revoke all on function public.abu_bassam_customer_document_access(text,text,uuid) from public, anon;
grant execute on function public.abu_bassam_customer_document_access(text,text,uuid) to authenticated, service_role;

create or replace function public.abu_bassam_customer_list(
  p_device_id text,
  p_device_secret text,
  p_search text default '',
  p_limit integer default 500
)
returns table(
  customer_id uuid,
  sequence_no bigint,
  owner_device_id text,
  owner_device_name text,
  full_name text,
  phone text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  document_count bigint,
  profile_document_id uuid
)
language sql
security invoker
set search_path to pg_catalog
as $function$
  select
    v.customer_id,v.sequence_no,v.owner_device_id,v.owner_device_name,
    v.full_name,v.phone,v.notes,v.created_at,v.updated_at,
    v.document_count,v.profile_document_id
  from public.abu_bassam_customer_list_v2(
    p_device_id,p_device_secret,p_search,p_limit
  ) as v
$function$;

revoke all on function public.abu_bassam_customer_list(text,text,text,integer) from public, anon;
grant execute on function public.abu_bassam_customer_list(text,text,text,integer) to authenticated, service_role;
