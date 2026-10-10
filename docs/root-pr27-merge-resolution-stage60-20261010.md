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
