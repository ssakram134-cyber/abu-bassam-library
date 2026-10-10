# Stage 62 — Archive source integration on the secure Stage 61 root (2026-10-10)

## Baseline and scope
Parent: `integration/stage61-auth-perf-permissions-20261010` / PR #62, which descends from draft PR #60 based on the security-hotfixed `main`.
Source: cumulative archive PRs #37–#40, ending at `feat/vault-bulk-select-numbering-20261009`.
This is a **draft integration branch**, not a production release, build, or database rollout.

## Source-level changes
- Ported the exact source blobs for the archive file editor, indexedDB hardening, advanced image editing, local trash, folder operations, manual sorting, archive check scripts and archive feature plan.
- Because `web/document-vault-runtime.js`, `web/document-vault-hardening-runtime.js`, and `web/document-vault-advanced-runtime.js` matched the PR #36 baseline on PR #62, the archive changes to these files can be applied without overwriting the earlier account-switch and scheduler fixes.
- **Did not copy** `web/branch-vault-runtime.js` from PR #40. Copied only its four new archive permission labels into PR #62's authoritative main-hotfix implementation, keeping item-path authorization and metadata-first deletion/audit.
- **Did not copy** older `backup-center`, `customer-documents` or `branch-vault` Edge Functions from the stacked repair branch. They remain the independently merged and security-hardened versions from `main`.
- Retained all 53 Stage61 test commands and registered five archive regression scripts and `check_stage62_archive_merge_regression.js`: **59 distinct commands**.

## User-visible archive scope included
- Preserve original versus replace on editing, external updated Word/Excel/PDF re-import, advanced image editing, text editing and file detail views.
- Move/copy/cut/paste between folders, manual positions and touch drag ordering, preserved `manualOrder` during sync and backups.
- Local device-scoped 30-day trash with restoration/deletion permissions.
- Automatic folder numbering with conflict checking, recovery checkpoint, and basic multi-selection interface.
- The approved archive feature #18 (folder QR) is **excluded**.
- Bulk copy/move/delete/print and other approved roadmap features remain unfinished.

## Verification and release limitations
- Prior original archive PRs report isolated mocked source tests. Stage62 adds an integration gate but **this commit does not prove native `npm ci && npm run check:web` has executed**.
- Android camera/print/storage/offline behavior, 30-day expiry and folder drag on real devices remain untested.
- `indexedDB` archive schema is now at version **3** across the three copied archive modules. PR #43's Backup Center compatibility fix **has not been ported** and must be done before production integration to avoid version conflicts.
- Cloud synchronization conflict and 30-day tombstone logic added later in PRs #43–#59 is **not yet integrated**.
- Do not merge any draft chain or deploy Supabase migrations or Edge Functions before reconciling subsequent stages, passing native full tests, and validating actual device behavior.
- No APK, GitHub Actions, merge into `main`, Supabase mutation, or user-data deletion.
