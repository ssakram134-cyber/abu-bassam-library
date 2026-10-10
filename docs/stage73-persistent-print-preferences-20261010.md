# Stage 73 — Remember print preferences across app restarts (2026-10-10)

Parent: Stage72 PR #73, branch `integration/stage72-print-dispatch-audit-20261010`.

## Audit findings and code changes
1. Photo printing in `web/index.html` **already** persisted paperSize, photoSize, mediaType, dpiInput, margins, gap, count and borders in `abuBassamPrintSettingsV1`; the separate DPI-enabled switch persisted as `abuBassamDpiEnabledV1`. This stage adds that boolean to the settings JSON for consistent export/import, restores it, and performs a defensive settings snapshot before each photo printing request.
2. Cards Studio **did not persist** `state.output`, dimensions, copy count, orientation, bleed, flip axis or margins. This stage adds a versioned device-local preference key `abuBassamCardsPrintPreferencesV1` and a validated allowlisted localStorage reader. All card print controls autosave changes immediately, including rotation and the duplicate/reset-copy actions. Reopen/reload restores preferences without affecting card designs, file archives or account credentials.
3. Added **preferred** paper media (plain/matte/glossy/photo) and printer DPI (72–600) options to the badge print panel and saved them alongside format, page layout, width/height, copies, margins, bleed, watermark and duplex flip. Invalid or corrupted values fall back to safe defaults. No external network or login required.
4. Both the safe Settings reset and original fallback Settings reset now clear the new cards preference key and photo DPI-enabled key when the user explicitly chooses to restore print defaults. User content/archived files are not touched.
5. Tests: `tools/check_print_preferences_persistence.js` validates actual extracted preference logic and mock UI input/roundtrip with corrupted storage. `tools/check_stage73_print_preferences_integration.js` checks previous security, print, owner, OCR, backup and release gates. The original 86 `check:web` commands remain; now 88 unique.

## Crucial Android printer-driver limitation
The current Expo Print API calls `Print.printAsync({html})`, which invokes Android's native print dialog. It does not expose an Android `mediaType`, hardware `dpi` or printer-selection override. The stored paper media and DPI on card printing are **preferences/displayed reminders**, not settings silently forced into the actual printer. A4 vs CR80 paper geometry is encoded in print CSS; actual printer quality/media selection must be confirmed in Android's print dialog. Do not claim automatic printer-driver preference restoration; a different native Android print adapter is necessary for that capability.

## Acceptance and limitations
- Run actual Android app offline, adjust photo paper/media/DPI, reopen and confirm persistence; adjust Cards Studio width, mode, copies, paper type and DPI, reopen and confirm; print, cancel print, repeat and inspect state.
- Test user-selected reset defaults, corrupt preferences and storage quota exceptions, and verify files/other user settings untouched.
- No APK build, Actions, production Supabase changes, archive files deletion, or merge into `main`. Full native `npm run check:web` and actual printer tests still required before release.
