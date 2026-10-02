create extension if not exists pgcrypto;

create table if not exists public.abu_bassam_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  device_name text not null default '',
  model text not null default '',
  platform text not null default '',
  role text not null default 'secondary' check (role in ('owner','secondary')),
  active boolean not null default true,
  permissions jsonb not null default '{}'::jsonb,
  secret_hash bytea not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  app_version text not null default '',
  primary key (user_id, device_id)
);

alter table public.abu_bassam_devices enable row level security;

drop policy if exists abu_bassam_devices_select_own on public.abu_bassam_devices;
create policy abu_bassam_devices_select_own
on public.abu_bassam_devices
for select
to authenticated
using (auth.uid() = user_id);

revoke insert, update, delete on public.abu_bassam_devices from anon, authenticated;
grant select on public.abu_bassam_devices to authenticated;

create or replace function public.abu_bassam_register_device(
  p_device_id text,
  p_secret text,
  p_device_name text,
  p_model text,
  p_platform text,
  p_app_version text
) returns public.abu_bassam_devices
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  row_count integer;
  existing public.abu_bassam_devices;
  result public.abu_bassam_devices;
  initial_role text;
  initial_permissions jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if coalesce(length(trim(p_device_id)),0) < 8 then raise exception 'INVALID_DEVICE_ID'; end if;
  if coalesce(length(p_secret),0) < 24 then raise exception 'INVALID_DEVICE_SECRET'; end if;

  select * into existing from public.abu_bassam_devices where user_id = uid and device_id = p_device_id;
  if found then
    if existing.secret_hash <> digest(p_secret, 'sha256') then raise exception 'DEVICE_SECRET_MISMATCH'; end if;
    if not existing.active then raise exception 'DEVICE_DISABLED'; end if;
    update public.abu_bassam_devices
      set device_name = coalesce(nullif(trim(p_device_name),''), device_name),
          model = coalesce(nullif(trim(p_model),''), model),
          platform = coalesce(nullif(trim(p_platform),''), platform),
          app_version = coalesce(nullif(trim(p_app_version),''), app_version),
          last_seen = now()
      where user_id = uid and device_id = p_device_id
      returning * into result;
    return result;
  end if;

  select count(*) into row_count from public.abu_bassam_devices where user_id = uid;
  if row_count >= 5 then raise exception 'DEVICE_LIMIT_REACHED'; end if;

  if row_count = 0 then
    initial_role := 'owner';
    initial_permissions := '{"edit":true,"print":true,"export":true,"appearance":true,"sync":true,"security":true,"devices":true,"reset":true}'::jsonb;
  else
    initial_role := 'secondary';
    initial_permissions := '{"edit":true,"print":true,"export":true,"appearance":true,"sync":true,"security":false,"devices":false,"reset":false}'::jsonb;
  end if;

  insert into public.abu_bassam_devices(user_id,device_id,device_name,model,platform,role,active,permissions,secret_hash,app_version)
  values(uid,p_device_id,coalesce(nullif(trim(p_device_name),''),p_model,'جهاز جديد'),coalesce(p_model,''),coalesce(p_platform,''),initial_role,true,initial_permissions,digest(p_secret,'sha256'),coalesce(p_app_version,''))
  returning * into result;
  return result;
end;
$$;

create or replace function public.abu_bassam_touch_device(
  p_device_id text,
  p_secret text,
  p_device_name text,
  p_model text,
  p_platform text,
  p_app_version text
) returns public.abu_bassam_devices
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  result public.abu_bassam_devices;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.abu_bassam_devices
  set device_name = coalesce(nullif(trim(p_device_name),''),device_name),
      model = coalesce(nullif(trim(p_model),''),model),
      platform = coalesce(nullif(trim(p_platform),''),platform),
      app_version = coalesce(nullif(trim(p_app_version),''),app_version),
      last_seen = now()
  where user_id = uid and device_id = p_device_id and active = true and secret_hash = digest(p_secret,'sha256')
  returning * into result;
  if result.device_id is null then raise exception 'DEVICE_NOT_AUTHORIZED'; end if;
  return result;
end;
$$;

create or replace function public.abu_bassam_manage_device(
  p_actor_device_id text,
  p_actor_secret text,
  p_target_device_id text,
  p_device_name text default null,
  p_active boolean default null,
  p_permissions jsonb default null
) returns public.abu_bassam_devices
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  actor public.abu_bassam_devices;
  target public.abu_bassam_devices;
  result public.abu_bassam_devices;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into actor from public.abu_bassam_devices where user_id=uid and device_id=p_actor_device_id and active=true and role='owner' and secret_hash=digest(p_actor_secret,'sha256');
  if actor.device_id is null then raise exception 'OWNER_AUTH_REQUIRED'; end if;
  select * into target from public.abu_bassam_devices where user_id=uid and device_id=p_target_device_id;
  if target.device_id is null then raise exception 'DEVICE_NOT_FOUND'; end if;
  if target.role='owner' and p_active is false then raise exception 'OWNER_CANNOT_BE_DISABLED'; end if;
  update public.abu_bassam_devices
  set device_name = case when p_device_name is null then device_name else coalesce(nullif(trim(p_device_name),''),device_name) end,
      active = case when p_active is null then active else p_active end,
      permissions = case when p_permissions is null then permissions else p_permissions end,
      last_seen = case when device_id=p_actor_device_id then now() else last_seen end
  where user_id=uid and device_id=p_target_device_id
  returning * into result;
  return result;
end;
$$;

create or replace function public.abu_bassam_remove_device(
  p_actor_device_id text,
  p_actor_secret text,
  p_target_device_id text
) returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  actor public.abu_bassam_devices;
  target public.abu_bassam_devices;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into actor from public.abu_bassam_devices where user_id=uid and device_id=p_actor_device_id and active=true and role='owner' and secret_hash=digest(p_actor_secret,'sha256');
  if actor.device_id is null then raise exception 'OWNER_AUTH_REQUIRED'; end if;
  select * into target from public.abu_bassam_devices where user_id=uid and device_id=p_target_device_id;
  if target.device_id is null then return true; end if;
  if target.role='owner' then raise exception 'OWNER_CANNOT_BE_REMOVED'; end if;
  delete from public.abu_bassam_devices where user_id=uid and device_id=p_target_device_id;
  return true;
end;
$$;

grant execute on function public.abu_bassam_register_device(text,text,text,text,text,text) to authenticated;
grant execute on function public.abu_bassam_touch_device(text,text,text,text,text,text) to authenticated;
grant execute on function public.abu_bassam_manage_device(text,text,text,text,boolean,jsonb) to authenticated;
grant execute on function public.abu_bassam_remove_device(text,text,text) to authenticated;
