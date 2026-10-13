-- Align the backup metadata CHECK constraint with the established
-- 2,000 record ceiling in web/backup-center-runtime.js and the backup Edge function.
-- Includes active archive files plus retained recycle-bin entries.
-- Safe for existing rows: the accepted interval only increases from 1000 to 2000.
-- Deploy to a matching TEST Supabase project before production.
alter table public.abu_bassam_backups
  drop constraint if exists abu_bassam_backups_item_count_check;

alter table public.abu_bassam_backups
  add constraint abu_bassam_backups_item_count_check
  check (item_count between 0 and 2000);
