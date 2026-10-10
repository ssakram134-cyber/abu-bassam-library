# Stage87 — Selected image-compression features, first functional slice

Part of the user's **all 20 compression features** selection. Newly implemented in `web/image-compressor.html`:

- **#1** Target size in KB (0 for no limit, 30–10000KB input). JPEG and WebP are iteratively encoded at decreasing quality while respecting a conservative quality floor; if the limit cannot be reached, the result explicitly warns instead of claiming success.
- **#2 and #3, partial presets** — user-selectable WhatsApp/document and email delivery presets configure dimensions, quality and approximate KB targets. These are not platform APIs and do not guarantee acceptance by a provider.
- **#5** Output type chooser original/JPEG/WebP/PNG with actual browser MIME verification and an appropriately named extension. PNG compression quality is not arbitrarily reduced.
- **#9, best-effort** explicit opt-in re-encode to strip usual EXIF metadata. Canvas re-encoding generally omits metadata; it is not an audited forensic eraser. When chosen, the original file is never returned unchanged.
- Prior image before/after, true native save dispatch, cancellation, limited memory decode, size reporting, restoration, 10-preset image upscaler remain unchanged.

Not claimed: all 20 compression requests finished. Work remains for image EXIF orientation, strict metadata retention controls, true lossless compression, batch pause/resume across process death, stable memory tests, targeted quality metrics and more.

Native Android 1000-image, JPEG/PNG/WEBP, WebView low RAM, QR/pixel fidelity, and integration tests still required. No APK, GH Actions, Supabase deployment or main merge.
