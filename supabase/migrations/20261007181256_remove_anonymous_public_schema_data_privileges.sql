-- Supabase live migration: 20261007181256_remove_anonymous_public_schema_data_privileges
-- Anonymous users have no direct Data API access to public tables/sequences.
-- Intentional public behavior is served by dedicated Edge Functions instead.

revoke all privileges
on all tables in schema public
from anon;

revoke all privileges
on all sequences in schema public
from anon;
