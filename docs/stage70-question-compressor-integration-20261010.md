# Stage 70 — Questions, image compressor and input responsiveness (2026-10-10)

## Provenance and exact integration
- Parent: `integration/stage69-print-duplex-geometry-20261010`, PR #70. Reviewed original source: PR #56 `fix/questions-drafts-image-touch-20261010` stacked directly upon PR #55.
- Four original source files in the parent — `web/questions-completion-runtime.js`, `web/questions-en-fixes-runtime.js`, `web/image-compressor.html`, and `web/productivity-tools-runtime.js` — matched PR #56's original base byte-for-byte by Git blob SHA. Safely transfer their PR #56 result blobs without overwriting QR/print or repository security work.
- Register original `tools/check_questions_draft_race_and_image_safety.js`, `tools/check_compressor_bridge_payload_safety.js`, and `tools/check_stage70_question_compressor_integration.js`. Preserve 79 previous `check:web` commands for 82 unique tests.

## Source behavior
- Arabic and English question draft writes are serialized. Reset waits for pending writes and will not reload if IndexedDB deletion fails. Both close IndexedDB even after errors. Arabic checkpoint and legacy deletion occur only after successful IDB commit; English retains localStorage fallback.
- DOM MutationObserver maintenance is throttled into approximately 75 ms passes, reducing repeated rebind and touch pressure. Hidden-iframe draft flush is best effort, not protection from a forced process kill.
- Explicit JPEG/PNG/WebP verification; avoid invalid image dimensions/canvas errors and maintain existing 40 MiB source input cap with print-friendly resampling.
- Image compressor rejects combined base64 transfers above 12 MiB at sender and receiver; displays split-into-batches guidance and retains user results rather than erasing images.
- Earlier Stage69 CR80/A4 duplex guard, Stage68 QR validation/gallery scanning, OCR/backup content checks, owner-only archive and CAS/security protections are preserved.

## Release blockers and limits
- These are code/source changes, not proof that Android WebView touch crashes are resolved. Real-device field tests and diagnostics remain required on the questions and image compressor screens, camera/gallery imports, repeated modal interaction, sleeping/waking, low memory, app suspend and restart.
- 12 MiB is a per-message cap, not a strict overall heap or image-decoding memory bound. Large exports require splitting; no network fallback should replace local behavior without permission.
- Visibility-triggered autosaves cannot guarantee persistence during process force-kill or sudden power loss. Test IndexedDB interrupted commits and restore on device.
- No APK, GitHub Actions, `main` merge, Supabase SQL or Edge deployment, or production user-data mutation. Server CAS + owner listing migrations in preceding branches are not live.
- Full `npm ci && npm run check:web` and measured performance/security/device acceptance remain pending.
