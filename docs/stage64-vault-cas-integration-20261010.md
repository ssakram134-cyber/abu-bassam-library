# Stage 64 — Vault server CAS integration (2026-10-10)

## Verified source provenance
- Parent: PR #64 / `integration/stage63-vault-sync-delete-safety-20261010` (security-hotfix preserving, unmerged).
- Original implementation: PR #49 / `fix/vault-server-compare-and-swap-20261009`, stacked on original PR #48.
- Source SHAs of `web/document-vault-runtime.js`, `web/secure-sync-runtime.js` and `supabase/functions/branch-vault/index.ts` on our parent matched the PR #48 source baseline exactly. Porting the exact PR #49 resulting blobs therefore carries only the feature changes.
- `web/branch-vault-runtime.js` differed: the integration branch retains the merged-main security fix for metadata-first deletion and audit logging and the earlier added branch-permission labels. Only two targeted functions (`vaultUpsert`, `removeVault`) were ported from PR #49.
- Registered both the original `tools/check_vault_server_cas.js` (behavioral mock) and `tools/check_stage64_vault_cas_integration.js` (cross-stage source safeguards), preserving all 65 prior checks for 67 unique commands.

## Changes in source (not production)
1. Introduced `supabase/migrations/202610090001_vault_atomic_compare_and_swap.sql`, an existing migration filename from PR #49 (not an invented version).
2. Added `abu_bassam_vault_upsert_cas` requiring `p_expected_updated_at`; existing rows are locked with `FOR UPDATE`, new-row concurrent insertion uses `ON CONFLICT DO NOTHING`, and stale versions return `VAULT_VERSION_CONFLICT`.
3. Authenticated user and device secret checked; current `vaultSync`, `vaultAdd`, `vaultEdit`, and `vaultDelete` permissions enforced. Old unconditional upsert RPC loses PUBLIC, anon and authenticated EXECUTE, while the CAS RPC is granted to authenticated only.
4. Clients pass the exact server version to the CAS RPC for updates or tombstones, retain local pending content on rejection, retry appropriately and clean up unreferenced staged objects.
5. Scoped Edge `discard-upload` deletes only unreferenced revisions with explicit vault sync + add/edit permission. Existing per-device and per-item path validation and active-file guards remain.
6. Existing direct table access is denied by `202609240013_branch_private_document_vault.sql` via RLS and table privilege revocation. The migration still requires review of its actual production grant state.

## Mandatory release gates
- This change is NOT yet deployed to Supabase. Do not apply the migration directly to the shared production project.
- **Coordinated cutover required:** once the old RPC execute privilege is revoked, previous Android client versions cannot write branch-vault metadata. Migration-first breaks older clients; client-first breaks new CAS calls. Plan version enforcement/maintenance and a rollback strategy with the owner before touching live data.
- Apply and test in isolated Supabase staging with the same database schema, strict credentials, and archived sample files. Validate migration syntax, grants, permissions for denied branch roles, simulated concurrent inserts/updates, restore/cancel flows, and two authenticated devices using the same expected metadata row.
- Confirm `service_role` credentials never enter `web/`; only Edge Functions and server-held secrets may use those credentials.
- Check SQL execution errors, Postgres function owner and SQL advisor warnings; protect production data with verified backups and tested rollback.
- The current vault namespace includes `(user_id,branch_device_id,client_id)`. Synchronizing a shared namespace across independent branch device IDs requires its own tested design. These files alone do NOT establish true cross-branch sharing.
- Later fixes in PRs #50–#59 (remote browsing, strict signed-download authorization, offline OCR, backup accuracy, QR/printing and question drafts) remain outside this stage.
- No actual Android APK, GitHub Actions, `main` merge, Supabase migration or Edge deployment, production file mutation, or live two-writer test.
