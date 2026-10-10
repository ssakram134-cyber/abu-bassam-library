# Stage 52 — Offline archiving and Arabic/English OCR

## Verified source defect

The source tree already contained `web/document-vault-offline-ocr-runtime.js` and an Android asset preparation script to bundle Tesseract.js, its worker, four WASM-core glue variants, and the Arabic/English trained-language data. However, `device-name-runtime.js` never loaded that offline runtime. The canonical vault OCR implementation instead downloaded a Tesseract script from an external CDN. Thus the application's advertised OCR offline mode was not wired into its main execution path.

## Implemented fixes

1. The approved startup loader now deterministically loads the **offline OCR runtime** after the vault security and hardening components.
2. Canonical `recognizeText` delegates exclusively to `window.AbuDocumentVaultOfflineOcr.recognize`; the CDN fallback and remote-engine consent path were removed. No image upload to an OCR endpoint is added. Missing local assets are reported clearly rather than silently fetching remote code.
3. Removed the offline runtime's continuous DOM `MutationObserver`/100ms polling and duplicate camera/image-input rebindings. Core vault UI now owns image-file/native-camera events; a single worker owns recognition.
4. OCR jobs run serially on one local worker. Stale results from an earlier image, cancelled job or switched account cannot overwrite new text. After an account switch, OCR text/image in the UI are cleared; inactive workers are terminated.
5. Added the missing `vaultOcr` permission key to the branch permission adapter. Staff with explicit OCR permission can use the capability, while unauthorized devices fail closed.
6. OCR text saving into the vault now requires `vaultAdd` (not merely `vaultExport`) and reports local IndexedDB failures.
7. Unreadable image input errors are caught and displayed instead of becoming unhandled asynchronous rejections.

## Source-backed verification

The new `tools/check_vault_offline_ocr_runtime.js` asserts that the runtime is loaded, local worker/core/language paths are configured, the former CDN route is absent, no duplicate event observers remain, disabled permissions block OCR, and late recognition results are discarded. It is now part of `npm run check:web`.

Six relevant scripts passed inside a JavaScript mock harness, with 304 assertion calls (including offline/atomic IndexedDB imports, quota, sync timing, cross-branch access, synchronization races and trash recovery). **These are source/mocked tests, not device or Android WebView execution.**

## Remaining acceptance gates

- The `web/` source tree intentionally does **not** contain the large OCR language/core binaries; `scripts/prepare-android-assets.mjs` is responsible for downloading and embedding them in the Android assets during a future build.
- The first actual Android APK must be checked **with Wi-Fi and cellular disconnected**, verifying local worker, Arabic/English recognition, memory usage, camera/gallery entry points and `file:///android_asset` Web Worker support on the target device.
- Test app restart, account changes, offline authentication policy, data persistence and upload after network restoration. Never equate mocked OCR success to a verified working Android package.

No Android build, GitHub Actions, production Supabase changes, or merges to the default branch were performed during this stage.
