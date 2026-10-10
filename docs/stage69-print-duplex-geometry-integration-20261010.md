# Stage 69 — CR80 and A4 duplex print geometry integration (2026-10-10)

## Provenance
- Integration base: `integration/stage68-cards-qr-gallery-scan-20261010` (PR #69).
- Existing original implementation: PR #55 `fix/cards-print-geometry-accuracy-20261010` based on original PR #54.
- Verified exact Git blob equality for parent files `web/cards-studio-runtime.js`, `web/a4-card-sheet-editor-v2-runtime.js` and `tools/check_card_print_registration.js` against source PR #55's parent. Their original PR #55 result blobs are safe to import, with no unrelated branch code overwritten.
- Registered original `tools/check_print_duplex_geometry_guards.js` and new `tools/check_stage69_print_duplex_integration.js`. Previous 77 scripts retained for **79 unique registered `check:web` commands**.

## Integrated source improvements
1. Validate the **physical dimensions recorded for each queued card**. Reject mixed physical sizes with a clear Arabic explanation rather than silently resizing everything to the current badge. Mixing *different card types* at the same physical dimensions remains supported.
2. For CR80 jobs, use validated actual queued width/height in the `@page` CSS; for A4 use validated sheet row count and dimensions.
3. Add duplex side and horizontal/vertical flip metadata to A4 markup. The free A4 editor checks the mirrored physical slots, including blank card slots, dimensions, placement and counter-rotation before print or PDF.
4. Re-check owner/branch permissions `cardsA4Layout`, `printA4` and task-specific print/PDF grants immediately before finalizing. Revoked permissions prevent delayed jobs.
5. Preserve PR #54's QR data validation, native gallery scanner and print path; prior OCR, backup integrity and archive security changes remain intact.

## Limitations and release testing
- Mixed **sizes** are rejected within a single batch, not automatically separated onto new sheets. Users must separate print groups by dimensions. A4 manual editor rejects face misalignment rather than automatically synchronizing front/back movements.
- The software geometry tests do not prove **physical** front/back registration, actual printer-feed tolerances, trim/border measurements, printer flip driver settings, printed QR readability or actual Android-exported PDF size. Validate with measured print samples at CR80 85.6 × 54 mm and A4 210 × 297 mm, both flip axes, portrait/landscape, fronts and backs, long Arabic text, crop/bleed and 1–25 copies.
- Supabase CAS and owner-list migrations in earlier draft branches remain unapplied to production. No Android APK build, Actions, production SQL or Edge deployment, merge to `main` or user-file modifications in this stage.
- Focused JS fixture tests are not the complete native `npm ci && npm run check:web` nor printer acceptance. Keep the integration PR in DRAFT.
