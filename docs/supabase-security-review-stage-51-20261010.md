# Supabase Security Review — Stage 51 (2026-10-10)

## Scope and evidence
Read-only review of the Supabase project associated with the library application's Edge Function endpoint, plus a source audit of the GitHub feature branch. **No SQL executed on production, no Edge deployment, and no runtime user data modified.**

### Live project checks
- Project reference: `dlbxcqkbmvnrcrbhuttv`. Status at inspection: `ACTIVE_HEALTHY`.
- Migration history does **not** list proposed `202610090001_vault_atomic_compare_and_swap.sql` (PR #49) or `202610090002_vault_owner_readonly_branch_browser.sql` (PR #50); neither should be advertised as active. The security hardening proposed in PR #51 also requires deploying its new Edge Function and client code.
- Supabase security advisors reported **two warning categories**:
  1. `authenticated_security_definer_function_executable`: **95 function findings**. These are potentially deliberate authentication/device-protected RPCs, **not** 95 confirmed vulnerabilities. Audit individual function permissions, device-secret checks, `SECURITY DEFINER` necessity and `search_path` before revoking widely; broad revocation would break the application. Guide: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
  2. `auth_leaked_password_protection`: **1 finding**. Leaked-password protection is disabled in Supabase Auth. Configure in Auth security settings and confirm password-recovery/login compatibility. Guide: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Confirmed source-level issue and fix
Previously, the regular archive `download-url` Edge action used only `item_id` and selected the **latest** `storagePath`, while the caller attempted to download an older path and attach an older server `updated_at`. A racing file edit could cause downloaded bytes and saved metadata revision to disagree. The Edge check used only a *branch-wide* path prefix, not an item-specific revision path.

The stage-51 fix:
1. Requires `item_id`, `expected_path` and `expected_updated_at` for regular signed downloads.
2. Uses the already authenticated user, active authorized device, `vaultView` and `vaultSync` checks and fetches the current server metadata.
3. Requires an exact path belonging to **the same user/device/item**, and an exact server timestamp. Any stale path or timestamp returns `VAULT_VERSION_CONFLICT` (HTTP 409) without issuing a Storage URL.
4. Forwards the metadata's server revision from both outbound-conflict and inbound-sync branches in `document-vault-runtime.js`.
5. Re-checks account, current device and permission after retrieving the signed URL and after downloading the Blob. Revoked/switching contexts cannot commit the downloaded bytes via that workflow.
6. Reduces normal and owner-view signed download link lifetime from 900/300 seconds to **60 seconds**, respectively. A URL that was already issued remains valid until its expiration; immediate revocation requires additional Storage access controls.

## Regression scope
Registered `tools/check_vault_signed_download_security.js` in `npm run check:web`. It validates true/false outcomes of the source-extracted Edge download branch in a JS mock, plus the actual client download function. It does **not** execute the remote Supabase service or PostgreSQL.

## Additional security observations / unresolved risks
- `localScopeOk` can attach a previously unbound local archive (e.g. `local:device-id`) to the currently authenticated account on the same device. This offline-onboarding behavior needs an explicitly consented and security-reviewed migration flow; changing it blindly could strand old offline data.
- The Supabase branch vault remains isolated by `(user_id,branch_device_id,client_id)`. The PR #50 owner viewer is a separate read-only feature, not automatic interbranch synchronization.
- Server compare-and-swap migration from PR #49 must be applied before updated clients. Without it, claims of production protection against concurrent writers are premature.
- Before production release: stage migrations in dependency order, deploy the matching Edge Function, run two-device signed URL and stale revision tests with actual Storage, verify session/device revocation and password recovery, inspect advisors again, then promote through a reviewed release. Do not run the native APK builder merely to perform this security review.
