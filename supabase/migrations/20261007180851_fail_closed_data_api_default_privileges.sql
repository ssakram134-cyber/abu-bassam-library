-- Supabase live migration: 20261007180851_fail_closed_data_api_default_privileges
-- RLS does not cover TRUNCATE. Remove non-CRUD structural privileges from API
-- roles on existing tables and make future public objects fail closed by default.

revoke truncate, references, trigger
on all tables in schema public
from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;
