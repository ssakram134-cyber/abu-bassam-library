# Stage 52 — Offline Archive and OCR Runtime Review

## Proven defects
- `web/document-vault-offline-ocr-runtime.js` existed and Android asset preparation declared bundled Tesseract OCR models, but the deterministic startup loader in `web/device-name-runtime.js` never loaded that runtime.
- The canonical `web/document-vault-runtime.js` still downloaded Tesseract.js from a public CDN on first use. This could not guarantee offline OCR.
- The previous offline OCR overlay independently reassigned the file input and camera callback already owned by the main vault, installed a recurring DOM polling interval and mutation observer, potentially double-handling images and causing performance problems.
- OCR permission was missing from the branch-vault adapter's explicit permission labels, preventing certain otherwise-authorized secondary devices from using it.
- Saving OCR text to the archive checked export permission rather than archive-add permission.
- OCR results from a previous session/image could appear after a user navigated away; the lifecycle has been updated to cancel them.

## Source changes
1. Load the local OCR runtime during the existing ordered, fail-closed startup sequence, after the security and vault hardening runtime.
2. Call a **single packaged Arabic + English OCR worker** from the main OCR actions. Remove the internet/CDN fallback and the redundant input/camera/DOM observer hooks.
3. Serialize worker recognition jobs, ignore stale results when the image changes or account/permissions change, cancel on modal close and account switch, and avoid overwriting the previous OCR text when recognition fails.
4. Require explicit `vaultOcr` permission; require `vaultAdd` for saving extracted text into IndexedDB. Archive modifications remain local and `syncState:'pending'` until a permitted network sync.
5. Preserve the build pipeline for including the Tesseract JS, WASM core, and Arabic/English trained-data assets into the **generated Android asset folder** (not the canonical `web/` tree).

## Verification performed
- Executed `tools/check_vault_offline_ocr_runtime.js` in a GitHub-source-backed JavaScript simulation, including actual extracted worker queue behaviour: **46 assertions passed** after the final change.
- Existing source-backed mock tests also passed for `check_vault_offline_atomic_sync.js` (**41 assertions**), `check_vault_sync_concurrency.js` (**77 assertions**), `check_vault_cross_device_delete_restore.js` (**62 assertions**), and `check_vault_server_cas.js` (**46 assertions**).
- Registered the offline OCR test as check **64** under `npm run check:web`.

## Critical limitations
This is **not** a real offline Android run, not a complete `npm run check:web` execution, and not an APK build. The generated Android asset pipeline obtains OCR engine/model files during build, but they have **not** been downloaded, validated on the device, or compiled as part of this task. Its build environment needs network access for preparing the dependencies, even though the resulting packaged runtime is designed to operate without network.

Real-device acceptance should test: first launch without connectivity; Arabic and English recognition; camera and gallery import; runtime permissions after logout; worker memory use on lower-end Android; 30-day trash, 1000-file quota, local add/edit/restart; airplane-mode edits and later reconnect; and absence of data loss.

## Deployment
Draft stacked PR. No edits to live Supabase, no merge into `main`, no Actions run, no APK built. Preserve the app icon and existing document archive on future release.