-- Supabase live migration: 20261007074602_harden_abu_bassam_storage_rls
-- Prevents permissive-policy OR composition from bypassing user ownership or
-- leaking access into other buckets. Direct access is only for the current
-- user's non-vault paths in abu-bassam-private.

drop policy if exists abu_bassam_storage_select_own on storage.objects;
drop policy if exists abu_bassam_storage_insert_own on storage.objects;
drop policy if exists abu_bassam_storage_update_own on storage.objects;
drop policy if exists abu_bassam_storage_delete_own on storage.objects;
drop policy if exists abu_bassam_storage_no_direct_vault_select on storage.objects;
drop policy if exists abu_bassam_storage_no_direct_vault_insert on storage.objects;
drop policy if exists abu_bassam_storage_no_direct_vault_update on storage.objects;
drop policy if exists abu_bassam_storage_no_direct_vault_delete on storage.objects;

create policy abu_bassam_storage_select_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'abu-bassam-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and coalesce((storage.foldername(name))[2], '') <> all (
    array['vault'::text,'branch-vault'::text,'backup-vault'::text]
  )
);

create policy abu_bassam_storage_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'abu-bassam-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and coalesce((storage.foldername(name))[2], '') <> all (
    array['vault'::text,'branch-vault'::text,'backup-vault'::text]
  )
);

create policy abu_bassam_storage_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'abu-bassam-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and coalesce((storage.foldername(name))[2], '') <> all (
    array['vault'::text,'branch-vault'::text,'backup-vault'::text]
  )
)
with check (
  bucket_id = 'abu-bassam-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and coalesce((storage.foldername(name))[2], '') <> all (
    array['vault'::text,'branch-vault'::text,'backup-vault'::text]
  )
);

create policy abu_bassam_storage_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'abu-bassam-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and coalesce((storage.foldername(name))[2], '') <> all (
    array['vault'::text,'branch-vault'::text,'backup-vault'::text]
  )
);
