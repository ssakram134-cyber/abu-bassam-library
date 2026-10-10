# Stage 72 — A4/CR80 print and PDF dispatch audit

Date: 2026-10-10. Parent: `integration/stage71-cross-stage-readiness-rollback-20261010` (PR #72). Reviewed source: original PR #58 (`fix/a4-print-dispatch-audit-20261010`), stacked on PR #57.

## Verified integration
- Compared Git blob SHA of `web/a4-card-sheet-editor-v2-runtime.js`, `web/cards-studio-runtime.js`, and `tools/check_final_release_readiness.js`: the current Stage71 branch matches PR #58's parent **exactly**. Safe to transfer those result blobs without clobbering Stage64–71 security and feature fixes.
- Added `tools/check_card_print_dispatch_audit.js` from PR #58 and new `tools/check_stage72_print_dispatch_integration.js` to protect cross-stage invariants. Retained 84 earlier `check:web` commands, now **86 distinct registered commands**. Updated original release readiness gate from PR #58.
- The A4 editor callback runs only **after print/PDF request dispatch** to a native bridge or browser print handler; merely opening, canceling, failing a permission check or encountering a native error cannot write a success history entry.
- `clean(doc)` now uses a **deep clone**. Editor gizmos, live styles and manual alignment data remain present when a PDF/print dispatch fails. On accepted requests, history records **“request submitted”** rather than asserting paper output or confirmed PDF persistence.
- CR80 native dispatch and PDF logs follow the same request-submitted rule; the original QR, CR80 dimensions, A4 duplex alignment, account permissions and archive/offline features remain intact.

## Verification and explicit limits
- Test `check_card_print_dispatch_audit.js` uses executable JavaScript source extracts and mocks for cancel, denied permission, unsupported native PDF, native bridge exception, valid submit, CR80 and non-mutating clone. It cannot prove actual device printing or saved files.
- Test `check_stage72_print_dispatch_integration.js` is a static cross-module source/tree security gate. Existing printer geometry tests remain registered.
- Source-only draft; no APK build, GitHub Actions invocation, Supabase changes, live-file mutation or merge into `main`.
- Synchronous native dispatch acceptance **is not proof** that the system printer finished or the file was durably saved. Asynchronous bridge failures or user-canceled print dialogs can still occur after submission.
- After real deployment, validate callback timing and history for cancellation, permission revocation, WebView fallback and native printer/PDF errors on Android. Check CR80 85.6×54 mm and A4 duplex print geometry physically. The 30-day trash store is still excluded from ZIP backups.
- Stage64/65 CAS and owner migration/Edge source are still only integrated in GitHub; coordinated Supabase staging/rollout remains required. Full native `npm ci && npm run check:web` and device tests are outstanding.
