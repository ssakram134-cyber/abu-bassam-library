# Stage 71 — Cross-stage readiness audit and durable question reset rollback

**Date:** 2026-10-10. **Branch:** `integration/stage71-cross-stage-readiness-rollback-20261010`. **Parent:** Stage70 PR #71. **Source:** original PR #57 `fix/final-integration-audit-20261010` (based on PR #56).

## Actual integrated source
- Verified exact Git SHA parity for the Stage70 parent and the original PR #57 base of `web/questions-completion-runtime.js`, `web/questions-en-fixes-runtime.js`, and `tools/check_questions_draft_race_and_image_safety.js` prior to importing their vetted PR #57 result blobs. No concurrent source changes lost.
- The prior reset deleted IndexedDB draft first, then removed localStorage data; a localStorage cleanup failure could strand the user with an erased durable draft but an open editor. Revised reset captures the active question document, awaits all queued writes, deletes the old record, then attempts rollback to IndexedDB on localStorage cleanup failure. Success message only after committed restoration; failure instructs manual export before closing. Both Arabic and English protected.
- Original `tools/check_final_release_readiness.js` imported as a source-level release guard. Additional `tools/check_stage71_release_readiness_integration.js` checks all prior stacked stages and reset rollback. All prior 82 `check:web` scripts preserved, now 84 unique registered script commands.
- Existing source assertions verify QR/Code128 validation, CR80/A4 duplex guards, offline OCR boot, blob-content backup fingerprinting, cloud-version CAS/owner auth, signed downloads, local compressor base64 caps, and workflow build/manual-import safety.

## Status must not be confused with production readiness
- Source branch and PR are **draft / unmerged**; does not change `main` or an installed APK.
- Repo presence of Supabase migrations and Edge source is **not** evidence they are deployed or serving production users. Production migration state and security-advisor details from PR #57 are historical and must be re-queried before deployment; they are **not newly verified in Stage71**.
- Offline OCR Android Tesseract asset bundling has not been executed in this stage; no real offline Android camera test.
- Physical CR80/A4 duplex alignment and readable QR at printed dimensions require real print/scan measurements. No native printer tests were executed.
- Crash/touch responsiveness, failed IndexedDB recovery after sudden force kill, camera/gallery, hundreds of archived documents, low-memory file hashing, or app startup without internet require real-device tests.
- A separate IndexedDB `trash` store is **not included in current backup ZIP**; 30-day recycle-bin items cannot be guaranteed after total handset loss.
- The stage 57 source audit does not prove all test scripts passed natively; full `npm ci && npm run check:web` on an isolated checkout is required. GitHub Actions, APK builds, Supabase migrations/Edge deployments and file deletion are explicitly outside this stage.
- Next source PR #58 addresses false printing/PDF history before actual dispatch, and a live A4 editor DOM cleanup problem after failed printing. Integrate only after compatibility review.
