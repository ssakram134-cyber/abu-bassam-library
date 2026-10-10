-- Owner-controlled read-only cross-branch archive listing.
-- This deliberately does NOT merge branch namespaces or grant write access to another branch.
create or replace function public.abu_bassam_vault_owner_list(
 p_device_id text,
 p_device_secret text,
 p_limit integer default 200,
 p_offset integer default 0
) returns table(
 branch_device_id text,
 branch_name text,
 client_id text,
 data jsonb,
 updated_at timestamptz
)
language plpgsql security definer
set search_path to 'public','extensions'
as $function$
declare
 v_uid uuid:=auth.uid();
 v_owner boolean:=false;
begin
 if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
 if not public._abu_bassam_vault_authorized(p_device_id,p_device_secret,'vaultView') then
  raise exception 'VAULT_VIEW_NOT_ALLOWED';
 end if;
 -- Explicit role check: no secondary device may enumerate sibling archives,
 -- even if a stale or manually supplied permissions map claims admin privileges.
 select (d.role='owner') into v_owner
 from public.abu_bassam_devices d
 where d.user_id=v_uid and d.device_id=p_device_id and d.active=true
 limit 1;
 if not coalesce(v_owner,false) then raise exception 'VAULT_OWNER_REQUIRED'; end if;
 return query
 select v.branch_device_id,
        coalesce(nullif(d.device_name,''),v.branch_device_id) as branch_name,
        v.client_id, v.data, v.updated_at
 from public.abu_bassam_branch_vault v
 left join public.abu_bassam_devices d
   on d.user_id=v.user_id and d.device_id=v.branch_device_id
 where v.user_id=v_uid
   and coalesce(v.data->>'deleted','false') <> 'true'
 order by v.branch_device_id asc, v.client_id asc
 limit greatest(1,least(coalesce(p_limit,200),500))
 offset greatest(0,coalesce(p_offset,0));
end $function$;

revoke all on function public.abu_bassam_vault_owner_list(text,text,integer,integer)
 from PUBLIC, anon, authenticated;
grant execute on function public.abu_bassam_vault_owner_list(text,text,integer,integer)
 to authenticated;
