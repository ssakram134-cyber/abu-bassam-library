-- Supabase live migration: 20261007074108_harden_abu_bassam_rls_and_definer_paths
-- Consolidates ownership and restricted-kind predicates into one explicit policy
-- per operation so protection does not depend on split permissive/restrictive
-- policy composition. Also hardens SECURITY DEFINER search paths and converts
-- the read-only device-limit RPC to SECURITY INVOKER.

drop policy if exists abu_bassam_secure_select_own on public.abu_bassam_sync_secure;
drop policy if exists abu_bassam_secure_insert_own on public.abu_bassam_sync_secure;
drop policy if exists abu_bassam_secure_update_own on public.abu_bassam_sync_secure;
drop policy if exists abu_bassam_secure_delete_own on public.abu_bassam_sync_secure;
drop policy if exists abu_bassam_sync_no_direct_vault_select on public.abu_bassam_sync_secure;
drop policy if exists abu_bassam_sync_no_direct_vault_insert on public.abu_bassam_sync_secure;
drop policy if exists abu_bassam_sync_no_direct_vault_update on public.abu_bassam_sync_secure;
drop policy if exists abu_bassam_sync_no_direct_vault_delete on public.abu_bassam_sync_secure;

create policy abu_bassam_secure_select_own
on public.abu_bassam_sync_secure
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and kind <> all (array['operation'::text,'device'::text,'vault'::text])
);

create policy abu_bassam_secure_insert_own
on public.abu_bassam_sync_secure
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and kind <> all (array['operation'::text,'device'::text,'vault'::text])
);

create policy abu_bassam_secure_update_own
on public.abu_bassam_sync_secure
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and kind <> all (array['operation'::text,'device'::text,'vault'::text])
)
with check (
  (select auth.uid()) = user_id
  and kind <> all (array['operation'::text,'device'::text,'vault'::text])
);

create policy abu_bassam_secure_delete_own
on public.abu_bassam_sync_secure
for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and kind <> all (array['operation'::text,'device'::text,'vault'::text])
);

revoke all on table public.abu_bassam_sync_secure from anon;
grant select, insert, update, delete on table public.abu_bassam_sync_secure to authenticated;

alter function public.abu_bassam_get_device_limit() security invoker;
alter function public.abu_bassam_get_device_limit() set search_path to pg_catalog;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prosecdef
      and (p.proname like 'abu_bassam_%' or p.proname like '_abu_bassam_%')
  loop
    execute format('alter function %s set search_path to pg_catalog, extensions', r.signature);
    execute format('revoke execute on function %s from public, anon', r.signature);
  end loop;
end
$$;

revoke execute on function public.abu_bassam_get_device_limit() from public, anon;
grant execute on function public.abu_bassam_get_device_limit() to authenticated, service_role;
