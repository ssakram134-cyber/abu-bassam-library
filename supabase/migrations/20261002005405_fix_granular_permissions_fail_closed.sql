create or replace function public._abu_bassam_device_permission(
  p_device_id text,p_device_secret text,p_permission text,p_default boolean default false
) returns boolean
language plpgsql security definer stable set search_path='public','extensions'
as $$
declare
  v_uid uuid:=auth.uid();
  v public.abu_bassam_devices%rowtype;
  v_hash text;
begin
  if v_uid is null or coalesce(trim(p_device_id),'')='' or coalesce(p_device_secret,'')='' then return false; end if;
  v_hash:=encode(digest(p_device_secret,'sha256'),'hex');
  select * into v from public.abu_bassam_devices where user_id=v_uid and device_id=p_device_id limit 1;
  if not found or v.active=false or coalesce(v.secret_hash,'')='' or v.secret_hash<>v_hash then return false; end if;
  if v.role='owner' then return true; end if;
  if v.permissions ? p_permission then return coalesce((v.permissions->>p_permission)::boolean,false); end if;
  return false;
exception when others then
  return false;
end $$;
revoke all on function public._abu_bassam_device_permission(text,text,text,boolean) from public,anon,authenticated;
