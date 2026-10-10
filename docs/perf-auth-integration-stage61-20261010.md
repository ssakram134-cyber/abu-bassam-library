# Stage 61 — Integrating performance, authentication, and granular permissions

Date 2026-10-10. This source-only branch `integration/perf-auth-stage61-20261010` is based on main-compatible root PR #60.

Cumulative source from PRs #28–#36 (`fix/vault-permissions-20261009`) was reviewed. 19 non-security-hotfix paths have been copied using exact original Git blob IDs, including performance/observer/notification and audit race controls, native auth deep-link callback, account identity and PKCE storage isolation, offline session locking, source regression tests and password recovery. Those nine PRs modify 27 unique paths in total; the others consist of the test registry and independent-main security paths.

**Security conflict policy:** Keep the following four files **byte-for-byte identical to PR #60 / main**: `supabase/functions/backup-center/index.ts`, `supabase/functions/branch-vault/index.ts`, `supabase/functions/customer-documents/index.ts`, `web/branch-vault-runtime.js`. The newer main Edge version retains source-level authorization changes from PRs #35–#36 and pins the updated audited Supabase runtime. The merged main tests `check_backup_delete_permission`, `check_archive_edge_permissions`, `check_archive_server_release_gate`, and `check_archive_reset_cleanup` remain registered; do not overwrite them with older branch versions.

The `check:web` command retains all 44 root-stage tests and adds eight regression checks from PRs #28–#34, plus a new integration-specific test `check_stage61_perf_auth_integration.js` = **53 unique checks**. The stage60 gate now accepts test growth while still verifying its original required security invariants.

**Before any release:** run complete `npm ci && npm run check:web` locally, verify biometric/passcode and foreground auth redirect on real Android, prove different accounts never share cached offline identity, review rebase of PR #37 onward, then test any SQL/Edge changes on staging. No production deployments, `main` merges, Actions builds, or APK compilation are authorized by this stage.
