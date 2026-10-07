-- Supabase live migration: 20261007181143_require_app_role_for_legacy_authenticated_policies
-- Authentication alone is not authorization. Legacy ALL policies that allowed
-- any signed-in Supabase user now require a real application role.

do $$
declare
  r record;
begin
  for r in
    select tablename,policyname
    from pg_policies
    where schemaname='public'
      and cmd='ALL'
      and roles = array['authenticated']::name[]
      and (
        lower(coalesce(qual,'')) like '%auth.uid()%is not null%'
        or lower(coalesce(qual,'')) like '%select auth.uid()%is not null%'
      )
      and (
        lower(coalesce(with_check,'')) like '%auth.uid()%is not null%'
        or lower(coalesce(with_check,'')) like '%select auth.uid()%is not null%'
      )
  loop
    execute format(
      'alter policy %I on public.%I using (public.current_app_role() is not null) with check (public.current_app_role() is not null)',
      r.policyname,
      r.tablename
    );
  end loop;
end
$$;
