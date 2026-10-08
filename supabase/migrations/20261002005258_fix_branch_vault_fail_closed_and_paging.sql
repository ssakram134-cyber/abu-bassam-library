create or replace function public._abu_bassam_vault_authorized(
  p_device_id text,p_device_secret text,p_permission text
) returns boolean
language plpgsql security definer set search_path to 'public','extensions'
as $function$
declare v_uid uuid:=auth.uid(); v public.abu_bassam_devices%rowtype; v_hash text; v_allowed boolean;
begin
  if v_uid is null or coalesce(trim(p_device_id),'')='' or coalesce(p_device_secret,'')='' then return false; end if;
  v_hash:=encode(digest(p_device_secret,'sha256'),'hex');
  select * into v from public.abu_bassam_devices where user_id=v_uid and device_id=p_device_id limit 1;
  if not found or v.active=false or coalesce(v.secret_hash,'')='' or v.secret_hash<>v_hash then return false; end if;
  if v.role='owner' then return true; end if;
  begin v_allowed:=coalesce((v.permissions->>p_permission)::boolean,false);
  exception when others then v_allowed:=false; end;
  return v_allowed;
end $function$;

drop function if exists public.abu_bassam_vault_list(text,text,integer);
create function public.abu_bassam_vault_list(
  p_device_id text,p_device_secret text,p_limit integer default 500,p_offset integer default 0
) returns table(kind text,client_id text,data jsonb,updated_at timestamptz)
language plpgsql security definer set search_path to 'public','extensions'
as $function$
begin
  if not public._abu_bassam_vault_authorized(p_device_id,p_device_secret,'vaultView') then raise exception 'VAULT_VIEW_NOT_ALLOWED'; end if;
  return query
  select 'vault'::text,v.client_id,v.data,v.updated_at
  from public.abu_bassam_branch_vault v
  where v.user_id=auth.uid() and v.branch_device_id=p_device_id
  order by v.updated_at asc,v.client_id asc
  limit greatest(1,least(coalesce(p_limit,500),1000))
  offset greatest(0,coalesce(p_offset,0));
end $function$;
revoke all on function public.abu_bassam_vault_list(text,text,integer,integer) from public,anon;
grant execute on function public.abu_bassam_vault_list(text,text,integer,integer) to authenticated;
