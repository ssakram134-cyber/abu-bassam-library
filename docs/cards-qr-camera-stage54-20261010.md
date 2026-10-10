# Stage 54 — Badges, QR Encoding and Android Gallery Scanner

## Confirmed source defects and fixes

1. **False-positive QR status:** `qrSvg()` returns a visual placeholder if an encoder is unavailable or the payload exceeds QR capacity, but the preview still reported a complete QR and print/export accepted the placeholder. Added `assertModelBarcodes` / `validatePrintBarcodes` to verify actual SVG encoding before queue insertion, printing (both CR80 and A4), PDF export, and front/back PNG export. Preview now displays a visible warning for unencodable data instead of claiming a valid symbol. Code128 cannot silently accept non-ASCII text.
2. **Incomplete child badge data:** Added an optional age field in the child badge editor, emitted it in the child vCard NOTE, and printed it on the back. The driver's phone is now also explicitly printed on the back. The vCard already carries kindergarten/school name, child name, address, guardian number, driver number, notes and brand details; these remain. Phone and WhatsApp actions retain their normal protocols.
3. **Emergency QR with malformed numbers:** The tiny dialing QR used the raw guardian/driver input. It now contains only a normalized, plausible dialing number. If the guardian number is absent/invalid, it falls back to a valid driver number; if neither is valid, it omits the dangerous non-dialable shortcut instead of creating a broken QR. Iraqi 07 and +964 phone representations are supported.
4. **Gallery scan not supported in Android WebView:** The existing browser-only `BarcodeDetector` fallback can be unavailable inside WebView. On Android, selected JPG/PNG/WebP images are now scanned through a specific bounded native bridge using Expo Camera's `Camera.scanFromURLAsync`. Image bytes are written to a temporary app cache file and deleted in `finally`, on both success and failure. There is no upload to cloud for decoding.
5. **Permission race:** Delayed camera result callbacks now re-check `cardsBarcode` permission, so a revoked branch cannot accept an old scan event. Gallery scan is restricted to the card barcode permission and 7.5MB selected-file limit, with base64 and MIME validation in native code as another defense.
6. **Scanner toggle:** The legacy browser camera-picker fallback now explicitly reapplies `capture=environment` after the user previously selected a gallery image.

## Verification performed (GitHub-source-backed JS tests)

- `tools/check_badge_qr_output_integrity.js`: **44 passing assertions**, running the repository's actual bundled qrcode.js UTF-8 encoder and representative Arabic badges, login, Wi-Fi, contact vCards, overcapacity and invalid Code128 cases, and checking that print/PDF/gallery export cannot silently include a broken symbol.
- `tools/check_card_gallery_native_scan.js`: **35 passing assertions** using the actual source-extracted native function against mocked filesystem/Expo scanner: success/error delivery, MIME and size restriction, temp file cleanup, gallery bridge and permission guards.
- `tools/check_camera_qr_pdf_integrity.js`: **44 passing assertions**, including existing camera duplicate event suppression and PDF/PNG temporary resource cleanup.
- Existing canonical card section and card-hardening marker checks also passed.
- **67 registered `check:web` checks**; the two new tests are registered in `package.json`.

## Important limitations

These are source/mocked checks, **not physical camera scans of printed cards**. The new static-image scanner uses Expo Camera's documented `scanFromURLAsync` (https://docs.expo.dev/versions/v54.0.0/sdk/camera/) but the Android standalone build must be verified on actual devices. Expo's documentation warns that barcodes should occupy most of the source image for better static-image scanning on Android.

QR generation success does not guarantee real-world optical readability after small-format printing, image scaling or A4 duplex alignment. Test long Arabic names, the precise approved child/personal layouts, CR80 85.6x53.98 mm, front/back print orientation, guardian WhatsApp and phone actions, and physical QR quiet-zone/contrast on a real scanner before release.

Existing approved template colors, font defaults and library footer remain unchanged except showing the age and driver phone in the back child detail grid. Other independent card designers are not altered in this stage.

No APK built, no Actions triggered, no Supabase migration/deployment performed, and no change merged into `main`. This draft is stacked on #53; integration and release require separate reviewed steps.
