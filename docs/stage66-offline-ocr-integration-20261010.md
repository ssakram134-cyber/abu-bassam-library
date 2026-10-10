# Stage 66 — Local-only document OCR source integration (2026-10-10)

## Changes and provenance
- Parent: `integration/stage65-owner-archive-signed-download-20261010` — PR #66 (preserves main security reconciliations, earlier 65/64/63).
- Source: existing original PR #52 `fix/vault-offline-ocr-runtime-20261010`.
- Verified exact Git blobs of `web/branch-vault-runtime.js`, `web/device-name-runtime.js`, `web/document-vault-offline-ocr-runtime.js`, and `web/document-vault-runtime.js` are **identical in parent and PR #51**, so four exact PR #52 result blobs can be safely adopted with no conflicting changes.
- Original OCR regression test `tools/check_vault_offline_ocr_runtime.js` and new `tools/check_stage66_offline_ocr_merge_regression.js` registered: prior 70 + 2 = **72 unique `check:web` commands**, no dropped tests.

## Behavior in source
1. The existing packaged local OCR runtime is loaded deterministically from `device-name-runtime.js`, after security and vault permission initialization.
2. OCR recognizes `ara+eng` using local Tesseract worker, four WASM core variants and language files intended to be bundled under `android/app/src/main/assets/library/vendor/tesseract` when the Android asset-preparation script runs.
3. Removed jsDelivr network OCR loading in the vault itself; missing local asset is an explicit failure, not an internet fallback. No recurring MutationObserver/100-ms polling or redundant native-camera hooks in the offline module.
4. The OCR queue is serialized; changing accounts, selecting another image, or closing the modal invalidates stale recognition results. Account events terminate stale workers and clear the image/text through the vault UI.
5. Branch user must have explicit `vaultOcr` permission to recognize and `vaultAdd` permission to save OCR text locally; OCR inserts use atomic local archive quota checks and retain local data if cloud sync cannot proceed.
6. Any image decoding or IndexedDB failures report an error rather than claiming saved state.

## Honest limits
- Android runtime binaries are fetched at **build preparation time**, not checked in to the canonical `web/` source; no binary download or APK build was performed in this integration.
- This code has not run inside a real Android WebView, with a real Tesseract worker, on an actual photo, or in airplane mode. Test both Arabic and English text, camera/gallery permissions, memory pressure, frequent account changes and app restarts before release.
- Do not deploy production Supabase SQL or Edge code, auto-merge into `main`, or run GitHub Actions.
- Stage65 CAS, owner browsing, exact-version signed links, offline branch scope checks, and the main security hotfix remain unchanged; no production or local customer files were touched.
- The next independent stage is PR #53 cloud backup fingerprint/order integrity. Prior staged CAS/owner migrations remain unapplied; they require an explicit coordinated rollout and real PostgreSQL testing.
