revoke all on table public.abu_bassam_sync_secure from anon, authenticated;
grant select, insert, update, delete on table public.abu_bassam_sync_secure to authenticated;
revoke all on sequence public.abu_bassam_sync_secure_id_seq from anon, authenticated;
grant usage, select on sequence public.abu_bassam_sync_secure_id_seq to authenticated;
