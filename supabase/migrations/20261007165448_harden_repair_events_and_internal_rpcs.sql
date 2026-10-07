-- Supabase live migration: 20261007165448_harden_repair_events_and_internal_rpcs
-- Lock direct repair-event writes behind privileged RPC/trigger paths, make the
-- purchase-payment idempotency table explicitly fail closed, and close direct
-- client execution of trigger-only / legacy maintenance helpers.

drop policy if exists authenticated_all on public.repair_events;
drop policy if exists repair_events_role_select on public.repair_events;

create policy repair_events_role_select
on public.repair_events
for select
to authenticated
using (
  public.current_app_role() in ('owner','manager','accountant','technician','reception')
);

revoke all on table public.repair_events from anon, authenticated;
grant select on table public.repair_events to authenticated;

drop policy if exists purchase_payment_requests_no_direct_access
on public.purchase_payment_requests;

create policy purchase_payment_requests_no_direct_access
on public.purchase_payment_requests
for all
to anon, authenticated
using (false)
with check (false);

revoke all on table public.purchase_payment_requests from anon, authenticated;

revoke execute on function public.assign_repair_number() from public, anon, authenticated;
revoke execute on function public.audit_row_change() from public, anon, authenticated;
revoke execute on function public.log_repair_status_event() from public, anon, authenticated;
grant execute on function public.assign_repair_number() to service_role;
grant execute on function public.audit_row_change() to service_role;
grant execute on function public.log_repair_status_event() to service_role;

revoke execute on function public.migrate_legacy_dismantling_device(uuid) from public, anon, authenticated;
grant execute on function public.migrate_legacy_dismantling_device(uuid) to service_role;

alter function public.current_app_role() set search_path to pg_catalog;
alter function public.has_app_role(text[]) set search_path to pg_catalog;
