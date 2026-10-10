# Stage 79 — Honest restore completion after offline/crash/reload hazards
Date: 2026-10-10

## Confirmed defect
The archive writes an IndexedDB transaction, then processes untrusted `app-settings.json` and refreshes UI. A malformed settings file, quota failure, or UI refresh exception was reported as **restore failed** even if the transaction had already committed. Cloud restore could likewise report failure after a successful local restore when `refreshList` failed offline.

## Repairs
- Parse and validate allowable settings values **before** committing any IndexedDB file/trash changes (corrupt settings fail early with local archive unchanged).
- Apply localStorage preferences with best-effort rollback on an ordinary storage exception, preserving card/paper/DPI settings when possible.
- Track the moment the IndexedDB transaction commits. Errors after commit no longer claim the files were rolled back; separately warn of incomplete preferences/refresh.
- Cloud backup-list refresh is best effort after local restore; an offline refresh does not create a false restore-failure message.
- A cloud account change **after** local commit is reported as data saved to the initial account, with a request to sign in again; no cross-account transfer is claimed.
- Preserve all previous guards: strict user/device scope, backup SHA-256, 30-day scoped trash, atomic item/tombstone restore, server `backupDelete`, owner-only cross-device recovery, CR80/A4 and saved print preferences.

## Limits
This protects ordinary JavaScript exceptions and existing IndexedDB commit semantics; it does **not** guarantee recovery from sudden device power-off during every storage/Android operation, nor atomicity between IndexedDB and localStorage. Device interruption, low-storage, airplane-mode and actual cloud tests remain mandatory. No APK, GitHub Actions, live Supabase/Edge deployment or `main` merge.
