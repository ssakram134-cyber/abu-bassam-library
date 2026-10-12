-- Optimistic concurrency control for the private document vault.
-- Create a separate CAS RPC rather than overloading the legacy four-argument API.
-- IMPORTANT: deploy to a TEST project first; coordinate deployment before the updated Android/Web client.
-- Legacy writes are intentionally disabled because they could overwrite a newer revision.
create or replace function public.abu_bassam_vault_upsert_cas(
  p_device_id text,
  p_device_secret text,
  p_client_id text,
  p_data jsonb,
  p_expected_updated_at timestamptz
) returns table(kind text, client_id text, data jsonb, updated_at timestamptz)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_current public.abu_bassam_branch_vault%rowtype;
  v_data jsonb;
  v_deleted boolean;
  v_new_updated_at timestamptz;
begin
  if v_uid is null then raise exception 'VAULT_LOGIN_REQUIRED'; end if;
  if coalesce(trim(p_device_id), '') = '' or coalesce(trim(p_client_id), '') = '' then
    raise exception 'VAULT_ID_REQUIRED';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'VAULT_DATA_REQUIRED';
  end if;
  if p_data->>'id' is distinct from p_client_id then
    raise exception 'VAULT_ID_MISMATCH';
  end if;
  if not public._abu_bassam_vault_authorized(p_device_id, p_device_secret, 'vaultSync') then
    raise exception 'VAULT_SYNC_NOT_ALLOWED';
  end if;

  v_deleted := coalesce((p_data->>'deleted')::boolean, false);
  v_data := p_data || jsonb_build_object('branchDeviceId', p_device_id);

  -- The row lock serializes updates to an existing record at READ COMMITTED.
  -- INSERT ... ON CONFLICT DO NOTHING rejects a concurrent first insert.
  select * into v_current
    from public.abu_bassam_branch_vault v
   where v.user_id = v_uid
     and v.branch_device_id = p_device_id
     and v.client_id = p_client_id
   for update;

  if found then
    if p_expected_updated_at is null
       or v_current.updated_at is distinct from p_expected_updated_at then
      raise exception 'VAULT_VERSION_CONFLICT';
    end if;
    if v_deleted then
      if not public._abu_bassam_vault_authorized(p_device_id, p_device_secret, 'vaultDelete') then
        raise exception 'VAULT_DELETE_NOT_ALLOWED';
      end if;
    elsif not public._abu_bassam_vault_authorized(p_device_id, p_device_secret, 'vaultEdit') then
      raise exception 'VAULT_EDIT_NOT_ALLOWED';
    end if;

    -- Ensure a new revision even for two writes in the same clock microsecond.
    v_new_updated_at := greatest(clock_timestamp(), v_current.updated_at + interval '1 microsecond');
    update public.abu_bassam_branch_vault v
       set data = v_data,
           updated_at = v_new_updated_at
     where v.user_id = v_uid
       and v.branch_device_id = p_device_id
       and v.client_id = p_client_id;
  else
    if p_expected_updated_at is not null then
      raise exception 'VAULT_VERSION_CONFLICT';
    end if;
    if v_deleted then
      if not public._abu_bassam_vault_authorized(p_device_id, p_device_secret, 'vaultDelete')
         or not public._abu_bassam_vault_authorized(p_device_id, p_device_secret, 'vaultAdd') then
        raise exception 'VAULT_DELETE_NOT_ALLOWED';
      end if;
    elsif not public._abu_bassam_vault_authorized(p_device_id, p_device_secret, 'vaultAdd') then
      raise exception 'VAULT_ADD_NOT_ALLOWED';
    end if;

    insert into public.abu_bassam_branch_vault
      (user_id, branch_device_id, client_id, data, created_at, updated_at)
    values
      (v_uid, p_device_id, p_client_id, v_data, clock_timestamp(), clock_timestamp())
    on conflict (user_id, branch_device_id, client_id) do nothing
    returning updated_at into v_new_updated_at;

    if not found then
      raise exception 'VAULT_VERSION_CONFLICT';
    end if;
  end if;

  return query
    select 'vault'::text, v.client_id, v.data, v.updated_at
      from public.abu_bassam_branch_vault v
     where v.user_id = v_uid
       and v.branch_device_id = p_device_id
       and v.client_id = p_client_id
     limit 1;
end
$function$;

-- SECURITY DEFINER functions must not be granted to PUBLIC or anon.
revoke all on function public.abu_bassam_vault_upsert_cas(text,text,text,jsonb,timestamptz)
  from public, anon, authenticated;
grant execute on function public.abu_bassam_vault_upsert_cas(text,text,text,jsonb,timestamptz)
  to authenticated;

-- Fail closed for older clients that do not transmit a base revision.
-- Deployment must be coordinated with a client update; no silent fallback to last-writer-wins.
revoke execute on function public.abu_bassam_vault_upsert(text,text,text,jsonb)
  from public, anon, authenticated;
