-- Supabase live migration: 20261007173256_harden_last_owner_role_guard
-- Prevent role management from disabling or demoting the final active owner.

create or replace function public.list_app_users()
returns table(
  user_id uuid,
  email text,
  role text,
  active boolean,
  last_sign_in_at timestamptz
)
language sql
stable
security definer
set search_path to pg_catalog
as $function$
  select
    u.id,
    u.email,
    r.role,
    coalesce(r.active,false),
    u.last_sign_in_at
  from auth.users u
  left join public.app_user_roles r on r.user_id=u.id
  where public.has_app_role(array['owner'])
  order by u.email
$function$;

create or replace function public.set_user_app_role(
  p_user_id uuid,
  p_role text,
  p_active boolean default true
)
returns public.app_user_roles
language plpgsql
security definer
set search_path to pg_catalog
as $function$
declare
  out_row public.app_user_roles;
  v_target_is_active_owner boolean:=false;
  v_active_owner_count integer:=0;
begin
  if not public.has_app_role(array['owner']) then
    raise exception 'غير مصرح بتغيير الأدوار' using errcode='42501';
  end if;

  if p_role not in ('owner','manager','technician','accountant','reception') then
    raise exception 'دور غير صالح' using errcode='22023';
  end if;

  select exists(
           select 1
           from public.app_user_roles
           where user_id=p_user_id
             and role='owner'
             and active
         ),
         (
           select count(*)
           from public.app_user_roles
           where role='owner'
             and active
         )
    into v_target_is_active_owner, v_active_owner_count;

  if v_target_is_active_owner
     and (p_role <> 'owner' or not coalesce(p_active,true))
     and v_active_owner_count <= 1 then
    raise exception 'لا يمكن تعطيل أو إزالة آخر مالك للنظام' using errcode='23514';
  end if;

  insert into public.app_user_roles(user_id,role,active)
  values(p_user_id,p_role,coalesce(p_active,true))
  on conflict(user_id) do update
    set role=excluded.role,
        active=excluded.active,
        updated_at=now()
  returning * into out_row;

  return out_row;
end
$function$;

revoke all on function public.list_app_users() from public, anon;
grant execute on function public.list_app_users() to authenticated, service_role;

revoke all on function public.set_user_app_role(uuid,text,boolean) from public, anon;
grant execute on function public.set_user_app_role(uuid,text,boolean) to authenticated, service_role;
