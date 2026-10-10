# Stage 56 — Question Draft Safety, Touch/Mutation Scheduling, Image Import and Compressor Bridge

## Verified source defects and changes

### 1. Arabic question drafts could show false success and lose legacy recovery
Before this change, `saveDurableDraft()` updated successful-save timestamp markers and removed the legacy draft even if `idbPut()` failed (quota error, denied IndexedDB, storage contention, etc.). This could lose the only valid older draft and make a failed new draft appear safely recorded.

**Fix:** Only update timestamps/remove the legacy fallback after a committed successful IndexedDB write. Serialize writes using an in-memory `draftQueue` so asynchronous older transactions cannot overtake newer drafts. Capture the HTML at request time. On reset, stop accepting new writes, await the queued transactions, require the database delete to succeed, then remove legacy keys and reload. Failed delete or legacy-key cleanup reports an error and keeps the current page open. Close IndexedDB connections in `finally` on both success and exception.

### 2. English draft save/reset race
`durableSave()` wrote localStorage before IndexedDB but asynchronous requests could complete out of order, while `reset()` removed localStorage before confirming that IndexedDB deletion succeeded.

**Fix:** Queue saves, take a consistent HTML snapshot for local and IDB destinations, wait for pending saves before reset, and preserve the fallback/refrain from reload when IDB deletion fails. Close IDB connections even after transaction errors.

### 3. Question editor touch/mutation workload
Both language runtimes used a `MutationObserver` with whole-page rescans/rebinding for every child mutation. Header normalization and draggable rebinding can themselves mutate the DOM and cause additional work, competing with touch events.

**Fix:** Coalesce bursty observer events into one maintenance pass approximately 75ms later, retaining the existing pointer-only drag/resize implementation. Add a best-effort immediate draft flush when the question iframe is hidden. This is **not** a claim that every Android touch/crash cause has been eliminated.

### 4. Inconsistent image imports
The question-editor image helpers permitted any `image/*` MIME, including formats not supported or preserved by its JPEG/PNG canvas output path. Unsupported image types, invalid decoded image dimensions or unavailable canvas could fail late.

**Fix:** Accept JPEG, PNG and WebP only, reject invalid dimensions, and explicitly report canvas-context failure before drawing. Keep original file size cap, max dimension, and image smoothing.

### 5. Oversized image-compressor Android transfer
The compressor accepted up to 80 MB input and passed all resulting base64 Data URLs as a **single** `postMessage` to its parent and then to the native Android bridge. One enormous message can cause UI stalls/memory pressure.

**Fix:** Refuse a single encoded bridge payload over 12 MiB, with an Arabic explanation to split into smaller batches. The original selected files and already-produced results are retained; small batches can still save normally. Add the **same validation on the parent host** so bypassing the iframe guard cannot forward oversized payloads. The total input cap (80 MB) and 20-photo selection limit remain unchanged.

## Source-backed regression verification

- `tools/check_questions_draft_race_and_image_safety.js`: **67 passed assertions**, including failed IndexedDB save not destroying Arabic legacy data or checkpoint markers; sequential writes; in-flight save vs reset; failed DB deletion; recovery; image MIME, size, invalid canvas; coalesced observers.
- `tools/check_compressor_bridge_payload_safety.js`: **13 passed assertions**, including safe small-batch export, over-limit refusal, no removal of compression results, and retry with a smaller batch.
- Existing `tools/check_questions_compressor_lifecycle.js`: **36 passed assertions**, exercising existing image MIME filtering, active-batch immutability, cancellation, control restoration and iframe load-scope checks using a JS mock.
- Existing `tools/check_runtime_scheduler_safety.js`: **30 passed assertions**, checking notification wrapper uniqueness and vault sync debounce and visibility.
- Existing `tools/check_questions_final_fixes.js`, `tools/check_questions_section.js`, `tools/check_image_compressor.js`: **three successful source/syntax test groups**.

**Seven** targeted test groups passed; **146 assertion calls** in four JS assertion groups, plus the three source/syntax marker groups. `npm run check:web` now registers **70** check commands; the entire Node suite was **not executed**.

## Critical limitations and release requirements

- This stage did **not** install/test the Android app, reproduce a reported crash, run React Native/Expo hardware tests, or capture a device crash log. The tests show specific corrected source defects and mocked behavior, **not** proof that the entire application now has no touch lag or runtime crashes.
- A browser can still suspend an iframe before the best-effort visibility-triggered IndexedDB save finishes; a storage quota error can still prevent new drafts being saved. Users must receive accurate failure messages and use explicit backup before destructive changes.
- 12 MiB is a safety cap for a **single encoded image transfer**, not a limit on local compression itself; to export larger results users must split into batches. A future Android bridge should support streaming/chunked saving with one granted folder permission.
- Saving drafts in IndexedDB/localStorage is device-local, not a cloud recovery guarantee. Do not clear app data or uninstall until backups/recovery are tested.
- No production database/Edge change, no merge into `main`, no GitHub Actions run, and no APK built. Source changes are in a draft stacked on stage-55 PR #55.

## Follow-up phase
Stage 57 remains: integrated repository/PR dependency review, full check registration and actual deployment checklist. Outstanding earlier issues (e.g. cloud ZIP excludes recycle-bin contents, staged migrations not applied, printed barcode and offline OCR need physical Android testing) must remain open until explicitly verified.
