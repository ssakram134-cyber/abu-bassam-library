# Stage 60 — Independent main-based PR #27 conflict-resolution candidate

Date: 2026-10-10. Repository: `ssakram134-cyber/abu-bassam-library`.

## Confirmed conflict source

GitHub reports PR #27 `fix/integrated-six-sections-20261009` **mergeable=false** with current `main`. Its common ancestor with main is `252459101d6ecdba285f5619f39315e1831dc0a2`. Independent security PR #42 was merged into main as commit `f9e3e9fb57352cd429a219b0f3c431b764294254`, after PR #27 branched. Two files touched by both: `package.json` and `supabase/functions/backup-center/index.ts`.

## Actual 3-way reconciliation, not a blind overwrite

- **Backup Edge:** PR #27 introduced union of `backupCreate` and `backupRestore` access for commit routes, and exact backup-kind authorization. Current main **already contains these changes**, and additionally restricts stale-upload and retention cleanup to `backupDelete`, pins the audited Supabase client runtime and protects backup/restore flows. **Retain main's backup-center file byte-for-byte**. Do not replace it with PR #27's older version.
- **package.json:** ancestor has 33 `check:web` checks. PR #27 added six feature checks (39). Independently merged PR #42 added four security checks to main (37). This candidate registers **all ten** additions and one new reconciliation regression, giving **44 unique checks**, retaining main's other package values.
- **Other PR #27 changes:** copy all **16 nonconflicting PR #27 file blobs exactly** into an **independent branch based on current main**, preserving the unchanged main hotfix files and `.github/workflows`.
- **Security preservation:** `supabase/functions/customer-documents/index.ts`, `supabase/functions/branch-vault/index.ts`, `web/branch-vault-runtime.js`, and original main security tests are unchanged by this integration candidate.

## Resulting branch and scope

`integration/pr27-main-security-reconcile-20261010` originates at main's security-hotfix commit. This is a root-only integration candidate for **PR #27**, not a rebase or integration of the entire following #28–#59 stack. The previous stacked branch is deliberately unchanged. Do not merge PR #27 or the candidate to main until a full local Node regression suite, security review and an explicit merge decision. A GitHub mergeable flag is necessary but not sufficient.

## Verifications required before release

Run `npm ci`, `npm run check:web` (no Android build) in an authorized local checkout, then compare and migrate follow-up PR #28 and later one by one onto the reconciled root. Staging Supabase schema/Edge parity and a physical Android/printing/backup test are separate blockers. **Do not trigger GitHub Actions builds or deploy SQL automatically.**


## Confirmed execution and source parity in the candidate

- The new main-based candidate branch is **ahead of main and not behind it**; `compare_commits` reported one commit ahead immediately after assembling the root candidate. (The later test-fixture correction adds a second commit.)
- Exact Git blob SHA parity was verified for **four security-sensitive main files**: `backup-center`, `branch-vault`, `customer-documents` Edge sources and `web/branch-vault-runtime.js`. All four remain byte-identical to current `main`.
- The new integration gate was executed against the source using a JS mock runner: **116 assertions PASS**, including 44 unique registered checks, critical permissions and disabled Android Actions builds.
- Four inherited merged-main security tests PASS: archive metadata-first cleanup **16**, edge role/path checks **40**, server security release gate **18**, and backup delete role/retention checks **37** = **111 assertions**.
- Five PR27 feature tests PASS in source-backed isolated JS execution: startup/offline readiness **26**, camera/QR/PDF **44**, A4/CR80 print registration **2,909**, offline atomic archive sync **40**, and restore/deduplication **15** = **3,034 assertions**.
- **Grand total 3,261 assertions in 10 targeted groups passed.** This is not an execution of all 44 scripts under native Node or Android, and no APK, GitHub Actions workflow, database migration, server deploy, merge, or production operation was executed.
- The six PR27-added check files and four main-security check files all exist on the candidate branch.
