-- Require a server-validated expected revision for every branch-vault metadata write.
-- The pre-CAS RPC is revoked so older clients cannot bypass concurrency detection.
-- Revisions are exact PostgreSQL timestamptz values from vault_get/list responses.
create or replace function public.abu_bassam_vault_upsert_cas(
  p_device_id text,
  p_device_secret text,
  p_client_id text,
  p_data jsonb,
  p_expected_updated_at timestamptz
) returns table(kind text,client_id text,data jsonb,updated_at timestamptz)
language plpgsql
security definer
set search_path to 'public','extensions'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_exists boolean:=false;
  v_current_updated_at timestamptz;
  v_new_updated_at timestamptz;
  v_deleted boolean;
  v_data jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if coalesce(trim(p_client_id),'')='' or length(p_client_id)>180 or
     p_client_id !~ '^[A-Za-z0-9_.-]+$' or p_client_id in ('.','..') then
    raise exception 'VAULT_ID_REQUIRED';
  end if;
  if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'VAULT_DATA_INVALID'; end if;
  if not public._abu_bassam_vault_authorized(p_device_id,p_device_secret,'vaultSync') then
    raise exception 'VAULT_SYNC_NOT_ALLOWED';
  end if;
  v_deleted:=coalesce((p_data->>'deleted')::boolean,false);

  -- Lock existing metadata before checking its server revision, and retain
  -- that lock until COMMIT. Concurrent writers re-check after the first commits.
  select v.updated_at into v_current_updated_at
  from public.abu_bassam_branch_vault v
  where v.user_id=v_uid and v.branch_device_id=p_device_id and v.client_id=p_client_id
  for update;
  v_exists:=found;
  if v_exists then
    if p_expected_updated_at is null or v_current_updated_at<>p_expected_updated_at then
      raise exception 'VAULT_VERSION_CONFLICT';
    end if;
  elsif p_expected_updated_at is not null then
    raise exception 'VAULT_VERSION_CONFLICT';
  end if;

  if v_deleted then
    if not public._abu_bassam_vault_authorized(p_device_id,p_device_secret,'vaultDelete') then
      raise exception 'VAULT_DELETE_NOT_ALLOWED';
    end if;
  elsif v_exists then
    if not public._abu_bassam_vault_authorized(p_device_id,p_device_secret,'vaultEdit') then
      raise exception 'VAULT_EDIT_NOT_ALLOWED';
    end if;
  else
    if not public._abu_bassam_vault_authorized(p_device_id,p_device_secret,'vaultAdd') then
      raise exception 'VAULT_ADD_NOT_ALLOWED';
    end if;
  end if;

  v_data:=p_data||jsonb_build_object('branchDeviceId',p_device_id);
  if v_exists then
    -- Guarantee unique ordering even for two writes inside the same microsecond.
    v_new_updated_at:=greatest(clock_timestamp(),v_current_updated_at+interval '1 microsecond');
    update public.abu_bassam_branch_vault v
    set data=v_data,updated_at=v_new_updated_at
    where v.user_id=v_uid and v.branch_device_id=p_device_id and v.client_id=p_client_id
      and v.updated_at=p_expected_updated_at;
    if not found then raise exception 'VAULT_VERSION_CONFLICT'; end if;
  else
    insert into public.abu_bassam_branch_vault
      (user_id,branch_device_id,client_id,data,created_at,updated_at)
    values(v_uid,p_device_id,p_client_id,v_data,clock_timestamp(),clock_timestamp())
    on conflict (user_id,branch_device_id,client_id) do nothing
    returning updated_at into v_new_updated_at;
    if not found then raise exception 'VAULT_VERSION_CONFLICT'; end if;
  end if;

  return query
  select 'vault'::text,v.client_id,v.data,v.updated_at
  from public.abu_bassam_branch_vault v
  where v.user_id=v_uid and v.branch_device_id=p_device_id and v.client_id=p_client_id;
end $function$;

-- Deny legacy last-writer-wins writes, including the implicit PUBLIC grant.
revoke all on function public.abu_bassam_vault_upsert(text,text,text,jsonb)
  from PUBLIC, anon, authenticated;
revoke all on function public.abu_bassam_vault_upsert_cas(text,text,text,jsonb,timestamptz)
  from PUBLIC, anon;
grant execute on function public.abu_bassam_vault_upsert_cas(text,text,text,jsonb,timestamptz)
  to authenticated;
