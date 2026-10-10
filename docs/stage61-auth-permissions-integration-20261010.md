# Stage 61 — Migrate PR #28–#36 onto main-based PR #60 integration branch

Date: 2026-10-10. Base: `integration/pr27-main-security-reconcile-20261010` (PR #60, **not merged**).

## Integration strategy
- Read GitHub comparison `fix/integrated-six-sections-20261009...fix/vault-permissions-20261009`: **35 commits, 27 files changed** across draft PRs #28–#36.
- Transplant **19 nonconflicting changed file blobs** verbatim from the verified PR #36 tip onto a new integration branch based on PR #60. Changes cover performance/notification timers, operation-log observers, audit races, PKCE & token storage isolation, password reset deep-link and owner validation, session switching/offline access, and associated native callback handling.
- **Preserve the four security-sensitive main hotfix files unchanged**, instead of overwriting them from old PR #36: `supabase/functions/{backup-center,branch-vault,customer-documents}/index.ts` and `web/branch-vault-runtime.js`.
- PR #36's three Edge files differ from current main by only minimal presentation/formatting, and the **main version has the authoritative merged PR #42 security hotfix**. An older PR #36 `removeAllVault` version did not log deferred Storage cleanup failure, so the main implementation is deliberately retained.
- Keep main's exact `tools/check_archive_edge_permissions.js`, `tools/check_backup_delete_permission.js`, and `tools/check_customer_documents.js`. These remain compatible and maintain the stricter merged security expectations.
- Combine **8 new check commands** from PRs #28–#36 with the existing 44 commands from PR #60 and one new Stage61 integration security test: **53 unique registered checks**. Adapt the original root gate so it supports additive registrations in future stages.

## Scope and acceptance

This does **not** merge PRs into `main`, deploy Supabase, run Actions or build an APK. The previously stacked PR #28–#59 series is unchanged and requires further staged porting for #37 onward.

Targeted regression checks to run:
- New `tools/check_stage61_auth_merge_regression.js` verifies the reconstructed branch retains all authentication/recovery/offline/security test registrations, native SecureStore, PKCE storage separation, backupDelete gates, and main's metadata-first auditable archive reset.
- Source-backed tests for recovery-owner identity, password reset deep-link, PKCE key separation, auth callback, cross-account offline signout, scheduler/notification and vault races.
- Existing main archive permissions and retention test groups and PR #60 integration gate.

### Real-device/production limitations

Passage of isolated JS/source tests is **not** proof of a runnable Android APK, actual biometric unlock, delivery of email recovery links, crash-free touch handling or Supabase production parity. Actual Android and staged database tests must precede any release. Leave PR #60 and the independent original PR #27–#59 drafts unmerged and maintain the original app icon.


## Completed source-backed verification (same branch)

The following checks were executed against source fetched from GitHub, using isolated JavaScript mocks (not an Android emulator, networked Supabase or full Node test suite).

| Test | Assertions | Result |
| --- | ---: | --- |
| Owner password-recovery identity | 24 | PASS |
| Android library-specific recovery deep link | 19 | PASS |
| Session and PKCE secret-key isolation | 21 | PASS |
| Recovery callback with profile outage | 9 | PASS |
| Cross-account session switch and offline logout | 25 | PASS |
| Operation log timer/observer lifecycle | 10 | PASS |
| Scheduler and notification deduplication | 30 | PASS |
| Concurrent audit and vault-write race | 18 | PASS |
| New Stage61 auth/merge integration guard | 47 | PASS |
| Adapted PR60 main-hotfix integration guard | 134 | PASS |
| Main archive metadata-first reset | 16 | PASS |
| Main archive server permissions | 40 | PASS |
| Main archive server release gate | 18 | PASS |
| Main backup deletion/retention permissions | 37 | PASS |
| **Total** | **448** | **14 groups passed** |

Exact branch comparison after the Stage61 integration commit: **one commit ahead of PR60, zero behind**; and **four commits ahead of main, zero behind**. **23 files changed relative to PR60** (19 imported file blobs plus `package.json`, original integration test adaptation, new test and this report). A direct check of the `check:web` registration list found **53 unique commands**, with no duplicate or missing check filename.

The attempted local full check via Git clone was blocked by the execution environment's lack of DNS/network access to GitHub. **No full native `npm run check:web` run took place.** Stage61 can be marked as source-integrated with passing targeted simulations, not as a production-ready APK, tested sign-in service or verified real-device performance.

## Subsequent work
Stage62: port PR #37 onward (vault originals management, folder copy/move/reorder, 30-day local trash) onto this integration line, avoiding any accidental overwrite of the main security hotfix, then recheck backup/trash restoration gaps.
