-- Supabase live migration: 20261007170001_sanitize_public_repair_tracking_rpc
-- Preserve token-based public repair tracking without exposing customer PII,
-- fault details, or financial values through the public RPC.

create or replace function public.get_public_repair_tracking(p_token uuid)
returns table(
  repair_number text,
  customer_name text,
  brand text,
  model text,
  status text,
  primary_fault text,
  received_date timestamptz,
  expected_delivery timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  warranty_days integer,
  total_cost numeric,
  deposit numeric
)
language sql
stable
security definer
set search_path to pg_catalog
as $function$
  select
    r.repair_number,
    null::text as customer_name,
    r.brand,
    r.model,
    r.status,
    null::text as primary_fault,
    r.received_date,
    r.expected_delivery,
    r.ready_at,
    r.delivered_at,
    r.warranty_days,
    null::numeric as total_cost,
    null::numeric as deposit
  from public.repairs r
  where r.tracking_token = p_token
    and r.cancelled_at is null
  limit 1
$function$;

revoke all on function public.get_public_repair_tracking(uuid) from public;
revoke execute on function public.get_public_repair_tracking(uuid) from authenticated;
grant execute on function public.get_public_repair_tracking(uuid) to anon, service_role;
