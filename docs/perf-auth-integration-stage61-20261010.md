# Stage 61 — Integrating performance, authentication, and granular permissions

Date 2026-10-10. This source-only branch `integration/perf-auth-stage61-20261010` is based on main-compatible root PR #60.

Cumulative source from PRs #28–#36 (`fix/vault-permissions-20261009`) was reviewed. 19 non-security-hotfix paths have been copied using exact original Git blob IDs, including performance/observer/notification and audit race controls, native auth deep-link callback, account identity and PKCE storage isolation, offline session locking, source regression tests and password recovery. Those nine PRs modify 27 unique paths in total; the others consist of the test registry and independent-main security paths.

**Security conflict policy:** Keep the following four files **byte-for-byte identical to PR #60 / main**: `supabase/functions/backup-center/index.ts`, `supabase/functions/branch-vault/index.ts`, `supabase/functions/customer-documents/index.ts`, `web/branch-vault-runtime.js`. The newer main Edge version retains source-level authorization changes from PRs #35–#36 and pins the updated audited Supabase runtime. The merged main tests `check_backup_delete_permission`, `check_archive_edge_permissions`, `check_archive_server_release_gate`, and `check_archive_reset_cleanup` remain registered; do not overwrite them with older branch versions.

The `check:web` command retains all 44 root-stage tests and adds eight regression checks from PRs #28–#34, plus a new integration-specific test `check_stage61_perf_auth_integration.js` = **53 unique checks**. The stage60 gate now accepts test growth while still verifying its original required security invariants.

**Before any release:** run complete `npm ci && npm run check:web` locally, verify biometric/passcode and foreground auth redirect on real Android, prove different accounts never share cached offline identity, review rebase of PR #37 onward, then test any SQL/Edge changes on staging. No production deployments, `main` merges, Actions builds, or APK compilation are authorized by this stage.


## Verified after staging — source-backed execution

- Stage61 cross-module integration gate: **40 assertions PASS** (Supabase session/PKCE storage separation, native callback notification with no code payload, account switch, offline gate, hidden timer guards, existing main security).
- Eight newly ported PR #28–#34 regressions: **156 assertions PASS**:
  - PKCE isolation 21; recovery owner identity 24; Android library recovery deep links 19; account callback/profile outage 9; auth session/offline gate 25; operation log timer scoping 10; scheduler/wrapper guards 30; audit/vault concurrent write race 18.
- Preserved PR #60 root/security integration gate after test-list growth: **134 assertions PASS**.
- **Ten tests, 330 counted source-backed assertions passed**. Tests were executed in isolated JavaScript mocks against GitHub-fetched repository sources, not a complete native Node `npm run check:web`, Android build, instrumented test, or production deployment.
- The final Git tree has **53 unique `check:web` scripts, all with existing test files**. The four protected main-security files (`backup-center`, `branch-vault`, `customer-documents` Edge source, and client `web/branch-vault-runtime.js`) have matching Git blob SHA hashes against live `main`.
- GitHub comparison: the stage61 branch is **2 commits ahead, 0 behind** the PR #60 integration branch (23 changed files); relative to current `main` it is **5 commits ahead, 0 behind**.
- Android OAuth recovery was tested using an isolated simulated deep-link handler, not physical app lifecycle. All Supabase auth/password mutations were mocked; no real credentials, stored files or accounts were affected.

## Deferred

PR #37 onward is **not integrated** into this branch. First review and test the root + stage61 candidate; then continue the full chain in staged batches. All commits remain on separate unmerged draft branches until reviewed.
