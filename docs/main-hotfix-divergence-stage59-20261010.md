# Stage 59 — GitHub ancestry divergence and main security hotfix reconciliation
Audit: 2026-10-10 — repository `ssakram134-cyber/abu-bassam-library`.

## Release blocker: real branch conflict at the root of the draft chain

- **PR #42** (`hotfix/archive-edge-permissions-main-20261009`) was **merged into `main`** as independent security hotfix commit `f9e3e9fb57352cd429a219b0f3c431b764294254`.
- The stacked audit chain runs **PR #27 → #28 → … → #41 → #43 → … → #58**, skipping #42 because it was merged independently into main. PR #27 originally started from the pre-hotfix main commit; this explains why the stacked tip does not include the hotfix in ancestry.
- `compare main...fix/main-security-hotfix-reconcile-20261010` reported **diverged**, staged head **236 commits ahead** and **1 commit behind** main on the read performed. Commit counts reflect repository history, **not issue counts or verified fixes**.
- **PR #27 reported `mergeable=false` against current main**. This is an actual integration blocker; every later PR reporting `mergeable=true` against its **immediate stacked base** does not remove that root conflict.
- Changed-file overlap between PR #27 and merged security hotfix #42 includes `package.json` and `supabase/functions/backup-center/index.ts`. These are conflict *candidates*; overlap alone does not identify the exact textual conflict marker. No merge or rebase was attempted.

## Security parity: what was compared with main (not inferred)

1. `supabase/functions/backup-center/index.ts` in the latest stacked branch is **byte-identical** to `main` (Git blob SHA `d6132ed99cf9235c652b372d624180db723ea202`). Backup retention and stale-upload deletion remain guarded by `backupDelete`.
2. `supabase/functions/customer-documents/index.ts` is **byte-identical** (Git blob SHA `ce9fdc1a97c2e93b8c3c84fc92ab6a5d3e7e6dac`). Device permissions retain explicit deny-by-default grants.
3. `web/branch-vault-runtime.js` differs because the staged branch adds owner access, OCR and sync features, but the **metadata-first `removeAllVault()` function is text-identical** to main. Storage cleanup happens only after archive metadata RPC deletion succeeds. Cleaning Storage failures are logged and deferred rather than misleadingly aborting metadata deletion.
4. `supabase/functions/branch-vault/index.ts` differs by design, retaining per-item revision validation and active-revision protection while adding version-bound download and owner-only branch preview. These require migration and Edge deployment reviews; source presence is not proof of production deployment.

## Concrete regression repaired in Stage 59

The independently merged PR #42 supplied `tools/check_archive_reset_cleanup.js`, testing metadata-first delete, failure-abort, deferred cleanup, and permission denial. **This regression test was missing entirely from the latest stacked source** and therefore was not registered in `check:web`.

- Restored that exact test source from `main` into this stage's GitHub branch.
- Registered `node tools/check_archive_reset_cleanup.js` as part of the canonical `check:web` chain.
- Updated `tools/check_archive_server_release_gate.js`: the previous assertion counted exactly **3** occurrences of a certain syntactic validation string and failed after adding a fourth security-relevant action plus combined identity/version guards. The improved regression checks four *individual routes* by their semantics: upload ID, signed download item/path/version, owner-only item/branch/version, and delete ID + live revision protection.
- Updated `tools/check_final_release_readiness.js` to **require** all four main security hotfix test gates and assert security-critical source invariants, so future staged changes cannot silently remove them.

## Verification performed — source-backed JS simulation, not entire Node suite

| Existing / repaired test | Verified assertions | Result |
| --- | ---: | --- |
| `check_archive_reset_cleanup.js` — copied from main | 16 | PASS |
| `check_archive_edge_permissions.js` | 42 | PASS |
| `check_archive_server_release_gate.js` — revised route guard expectations | 29 | PASS |
| `check_backup_delete_permission.js` | 37 | PASS |
| **Total source-backed assertions** | **124** | **4 PASS** |

The source registration scan additionally confirmed **73 unique, present check scripts** and successful JS syntax parsing of the updated release readiness script. These are *not* a complete `npm run check:web`, TypeScript compilation, production edge or Android tests.

## Mandatory next decision for a real integration

The root of the draft chain, **PR #27**, must first be reconciled with main and the merged PR #42 security fixes **without overwriting the hotfix**. Do this on an independent integration branch with clear conflict resolution and a complete local test run; obtain explicit approval before any direct merge or production deployment. The legacy independent PRs #21–#26 also remain open and should be audited for unique commits/features rather than blindly applied atop the now-integrated feature chain.

**No merge into main, no GitHub Actions or APK build, no changes to production Supabase and no staging migration applied.** Current installed Android behavior remains unverified.
