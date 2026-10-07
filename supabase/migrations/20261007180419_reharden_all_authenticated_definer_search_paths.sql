-- Supabase live migration: 20261007180419_reharden_all_authenticated_definer_search_paths
-- Re-apply search_path hardening to SECURITY DEFINER RPCs created or replaced
-- after the earlier hardening migration. Client-callable definer functions
-- must never resolve objects through the mutable public schema.

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
      and has_function_privilege('authenticated',p.oid,'EXECUTE')
      and coalesce(array_to_string(p.proconfig,','),'') like '%search_path=%public%'
  loop
    execute format('alter function %s set search_path to pg_catalog, extensions', r.signature);
    execute format('revoke execute on function %s from public, anon', r.signature);
  end loop;
end
$$;
