-- Read-only CAS deployment gate. Inspect PostgreSQL catalog only; never modifies user data.
WITH functions AS (
  SELECT
    to_regclass('public.abu_bassam_branch_vault') AS vault_table,
    to_regprocedure('public._abu_bassam_vault_authorized(text,text,text)') AS device_authorizer,
    to_regprocedure('public.abu_bassam_vault_upsert(text,text,text,jsonb)') AS legacy_rpc,
    to_regprocedure('public.abu_bassam_vault_upsert_cas(text,text,text,jsonb,timestamptz)') AS cas_rpc,
    to_regprocedure('public.abu_bassam_vault_cas_ready(text,text)') AS readiness_rpc
),
checks AS (
  SELECT f.*,
    coalesce((SELECT c.relrowsecurity FROM pg_catalog.pg_class c WHERE c.oid=f.vault_table),false) AS vault_rls_enabled,
    exists(SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid=f.vault_table AND c.contype='p'
      AND pg_catalog.pg_get_constraintdef(c.oid)='PRIMARY KEY (user_id, branch_device_id, client_id)') AS vault_identity_pk,
    (SELECT count(*) FROM pg_catalog.pg_attribute a WHERE a.attrelid=f.vault_table AND a.attnum>0
      AND NOT a.attisdropped AND a.attname IN
      ('user_id','branch_device_id','client_id','data','created_at','updated_at'))=6 AS vault_columns_present,
    coalesce(pg_catalog.has_function_privilege('authenticated',f.legacy_rpc,'EXECUTE'),false) AS legacy_writer_executable,
    coalesce(pg_catalog.has_function_privilege('authenticated',f.cas_rpc,'EXECUTE'),false) AS cas_writer_executable,
    coalesce(pg_catalog.has_function_privilege('authenticated',f.readiness_rpc,'EXECUTE'),false) AS readiness_executable,
    coalesce(pg_catalog.has_function_privilege('anon',f.cas_rpc,'EXECUTE'),false) AS cas_anonymous_executable,
    coalesce(pg_catalog.has_function_privilege('anon',f.readiness_rpc,'EXECUTE'),false) AS readiness_anonymous_executable
  FROM functions f
)
SELECT
  current_setting('server_version_num')::integer AS postgres_version_num,
  (vault_table IS NOT NULL AND vault_rls_enabled AND vault_identity_pk AND vault_columns_present
    AND device_authorizer IS NOT NULL AND legacy_rpc IS NOT NULL) AS baseline_schema_ready,
  cas_rpc IS NOT NULL AS cas_writer_exists,
  readiness_rpc IS NOT NULL AS cas_readiness_exists,
  legacy_writer_executable, cas_writer_executable, readiness_executable,
  cas_anonymous_executable, readiness_anonymous_executable,
  CASE
    WHEN NOT (vault_table IS NOT NULL AND vault_rls_enabled AND vault_identity_pk AND vault_columns_present
      AND device_authorizer IS NOT NULL AND legacy_rpc IS NOT NULL) THEN 'BLOCKED_SCHEMA_MISMATCH'
    WHEN cas_rpc IS NOT NULL AND readiness_rpc IS NOT NULL
      AND NOT legacy_writer_executable AND cas_writer_executable AND readiness_executable
      AND NOT cas_anonymous_executable AND NOT readiness_anonymous_executable THEN 'CAS_DEPLOYED_PERMISSIONS_OK'
    WHEN cas_rpc IS NULL AND readiness_rpc IS NULL AND legacy_writer_executable THEN 'TEST_MIGRATION_REQUIRED'
    ELSE 'BLOCKED_PARTIAL_OR_UNSAFE_PRIVILEGES'
  END AS deployment_status
FROM checks;
