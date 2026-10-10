# Stage 58 — Stacked Merge Readiness and Truthful Card Print Dispatch

## Verified repository/merge baseline (2026-10-10)

- Canonical repository: `ssakram134-cyber/abu-bassam-library`.
- Stage 57 PR #57 remains **open, draft, not merged**, based on the stage-56 branch. The sampled PRs #49, #53, #55, #56, and #57 each reported `mergeable=true` relative to their **immediate stacked base**. This does **not** certify conflict-free merging all stages into `main`, production compatibility, or hardware success.
- Previous final audit proved that `main` had **37** registered `check:web` checks while the latest stacked source had **71**. This stage adds check **72**.
- The `android.yml` build job remains explicitly disabled; do not run or enable Actions to build an APK.
- Production Supabase deployment still requires separate approval and staging verification, including pending stage-49/50 SQL migrations and corresponding Edge/client compatibility.

## Two source defects corrected

### 1. False print/PDF audit records on canceled A4 previews

Before this stage, `web/cards-studio-runtime.js` called `recordHistory('طباعة')` or `recordHistory('حفظ PDF')` **before** opening the A4 layout editor. A user could cancel without dispatching a job, but the history and operations log would still claim a print/save had occurred.

**Fix:** Add an optional `onDispatched` callback to `AbuA4CardSheetEditorV2.openPrint` and `openPdf`. The A4 editor invokes this callback **only after a print/PDF request is successfully handed to an available bridge or print dialog**. Cancelling the editor, losing permission or lacking a PDF bridge never reports a dispatched job. CR80 branches also record only after the request is submitted to the native method. Operation wording was changed to *request sent*, not *printing completed* or *file saved*, because a native asynchronous return does not confirm completion.

### 2. Destructive A4 cleanup before bridge availability

The editor's `clean(doc)` previously removed handles and editor CSS **from the live iframe DOM** before checking whether a print or PDF bridge was usable. Failed PDF dispatch left the editor on screen but without its editing controls, often requiring a reset and losing manual positioning.

**Fix:** Clone `doc.documentElement` and sanitize **only the clone** when preparing standalone print HTML. The original editor remains editable and its geometry is preserved. Synchronous errors from native PDF or print operations now return a clear error while keeping the editing session available. Failed submissions never create a false success entry.

## Verification actually performed

Source-backed JavaScript simulations using the repository's real functions and the revised test file:

| Test | Assertions | Status |
|---|---:|---|
| `tools/check_card_print_registration.js` | 2,909 | PASS |
| `tools/check_print_duplex_geometry_guards.js` | 36 | PASS |
| `tools/check_card_print_dispatch_audit.js` (new) | 63 | PASS |
| **Total** | **3,008** | **3 passed groups** |

New regression covers A4 editor open/cancel, permission loss, missing bridge, native exception, CR80 dispatch, accurate event timing, and non-mutating cloned print DOM. `tools/check_final_release_readiness.js` also now asserts that A4 dispatch acknowledgement and clone-based cleanup remain present.

**72** scripts are registered under `npm run check:web` in the stage-58 source. This audit **did not run all 72 through native Node** or on an Android device.

## Merge/production gates — still NOT cleared

1. Review the complete stacked PR sequence against `main`, including source changes predating #49; PR mergeability flags against immediate branch parents are insufficient for a complete production merge. Preserve order and validate test suite on one integrated branch **without triggering Actions builds**.
2. A **production SQL migration must never be deployed merely because a GitHub PR is ready**. Test database migrations and Edge compatibility on staging before any separate approved production deployment.
3. Install a new Android build only in a separately authorized release workflow. Measure native crash logs, offline OCR model packaging, camera scanning and printed duplex alignment on real devices. Do not assert those pass today.
4. Confirm local/remote recovery of active archives and explicitly decide how to export/restore the 30-day trash store; current ZIP backups exclude that store.
5. Follow up security lints for authenticated `SECURITY DEFINER` RPCs and leaked-password protection without bulk revoking legitimate application permissions.
6. Do not claim a print, PDF save or gallery write **completed** based on a bridge dispatch. A future native completion/error handshake would be required for such claims.

## Work performed this stage

Created a new branch and a **draft stacked pull request based on PR #57**. Only source code, source-backed JS regression checks, and documentation were changed. No merge, GitHub Actions run, APK build, live database write or production deployment.
