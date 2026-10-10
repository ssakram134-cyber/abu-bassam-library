# Stage 68 — QR, badge and gallery barcode regression integration (2026-10-10)

## Source provenance
- Parent: `integration/stage67-vault-backup-content-order-20261010` (PR #68).
- Original reviewed implementation: `fix/cards-qr-scannability-20261010` (PR #54), originally stacked on PR #53.
- Verified Stage67 `index.js` (Git blob 2e3183396ff09dbf746920064433dc40cee3d46c) and `web/cards-studio-runtime.js` (e72f29f7a7f0cca3fc0779e769c3c581b7120827) match original PR #54 parent **exactly**. Therefore the source blobs for these two files can be transferred as-is without losing earlier Stage61–67 security/archive fixes.

## Integrated fixes in GitHub source
1. Badge QR/Code128 generation must be actually encodable before enqueue, CR80/A4 print, PDF/PNG export. Fail closed on overlong QR or non-ASCII Code128; do not claim an invalid QR is printable.
2. Child badge front/back retains approved institution, age, guardian and transport phone fields, child vCard fields, library branding and valid Iraqi WhatsApp / emergency dialing URLs. Reject invalid emergency dialing instead of generating a broken clickable QR.
3. Android Expo Camera `scanFromURLAsync` scans an image selected from the gallery; bridge limits base64 image input, checks mime and invalid bytes, and deletes the temporary cache image in a finally cleanup.
4. Late native barcode results still require `cardsBarcode` permission. Fix gallery input capture restoration and concurrent camera scan locking.
5. Added original `tools/check_badge_qr_output_integrity.js` and `tools/check_card_gallery_native_scan.js`, plus `tools/check_stage68_cards_scannability_merge_regression.js`. All 74 prior checks preserved: 77 distinct registered `check:web` commands.

## Release limits
- This verifies source logic and mock fixtures, **not physical barcode scannability at real CR80/A4 dimensions**. Print and scan on an actual scanner/phone, including Arabic vCards and quiet zones, front/back alignment and low-density QR output.
- Android camera and Expo gallery scanning have NOT run on a device. No APK, GitHub Actions, `main` merge, database migration, Supabase Edge deployment or production file mutation in this stage.
- The archival sync CAS and owner-only SQL changes remain source-only with coordinated cutover requirements.
- Existing local 30-day trash is not yet restored by cloud ZIP backups. No claim of total-device loss recovery for trash.
- The subsequent original PR #55 targets mixed-size front/back A4/CR80 print geometry and duplex registration.
