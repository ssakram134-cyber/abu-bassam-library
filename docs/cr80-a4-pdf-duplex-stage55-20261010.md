# Stage 55 — CR80 / A4 / PDF Print Geometry and Duplex Alignment

## Proven defects and source fixes

1. **Silent mixed-size distortion:** a queued badge stores its own `model.width` and `model.height`, but A4 sheets and the CR80 `@page` formerly used the **current** editor dimensions for *every* queued badge. For mixed-size queues this distorted the printed card without warning. The new `printGeometry(jobs)` takes actual dimensions from queued models, verifies each physical size and rejects mixed-size queues with an actionable Arabic message. Different card types with identical sizes remain compatible within one mixed queue. To print mixed physical sizes without distortion, create separate print groups by dimensions.
2. **Front/back A4 alignment after free editing:** the A4 editor offers independently movable/resizable/rotatable card faces, and could submit a duplex PDF after only one face moved. Added explicit `data-duplex-side` / `data-duplex-flip` metadata to canonical sheet HTML and checks in `checkDuplexAlignment` that paired front/back slots exist and mirror along the selected flip axis. It checks geometry, width/height and inverse rotations with sub-millimeter tolerance, including blank cells. An invalid sheet cannot proceed to print/PDF until users align both sides or reset the editor.
3. **Revoked printing permissions:** the A4 sheet editor's `run()` previously submitted print/PDF jobs without rechecking permissions that the Cards Studio validated **before** opening the editor. `canFinalize(kind)` now checks active `cardsA4Layout` and `printA4` rights and, depending on output, all required print or PDF rights immediately before submission.
4. **Transparent UI:** The editor now explicitly warns about the mirrored duplex requirement.

## Focused verification performed from GitHub branch source

- New `tools/check_print_duplex_geometry_guards.js`: **36 assertions passed**. Dynamically executes extracted canonical queue geometry, print layout, physical front/back validation and authorization logic; checks mixed size rejection, CR80 `@page`, horizontal/vertical flipping with blank slots, rotated/mispositioned duplex faces, single-face output and delayed permission changes.
- Existing `tools/check_card_print_registration.js`: **2,909 assertions passed**, including 60 combinations of duplex geometry and job counts, mirrored front/back blank slots, portrait/landscape formats, one-side modes, A4 page-counts and CR80 size.
- Existing `tools/check_camera_qr_pdf_integrity.js`: **44 assertions passed**, including QR/data, exported image resource cleanup and native PDF cache cleanup.
- Stage 54 `check_badge_qr_output_integrity.js`: **44 assertions passed**.
- Stage 54 `check_card_gallery_native_scan.js`: **35 assertions passed**.
- **Five** source-backed / JS mock groups passed with **3,068 counted assertion calls**; one new check registered in `npm run check:web`, total **68**. Adjusted the existing print layout fixture to supply the stage-54 QR validation dependency and to include the new geometry helper.

## Unverified or limited

- Tests were source-extracted JavaScript simulations, **not physical A4, CR80 or duplex printer tests** and not a full `npm run check:web` execution under Node/CI. No exported sample PDFs were rendered or measured with a calibrated printer.
- Front/back geometry must still be calibrated with **the exact printer, feed orientation, flip edge, driver margins, crop offset and cutting tolerance**. A perfect software alignment is not proof of exact physical print alignment.
- The A4 editor currently does not *automatically link* movements, resizing or copies on front and back; instead, it **prevents submitting a geometrically inconsistent duplex job**. Users must adjust both sides symmetrically or restore the original layout before printing. One-sided A4 jobs are unaffected.
- Mixed physical sizes are prevented in a single print submission rather than automatically split into multiple sheets. Different templates of equal physical dimensions can still be queued together.
- PDF/printing through Android requires native app runtime permissions and file-save workflow acceptance; the code-level regression does not prove file creation on a handset.
- No APK, GitHub Actions, production Supabase deploy, printer job, or merge to `main` has been performed. This draft PR builds on stage-54 PR #54.
