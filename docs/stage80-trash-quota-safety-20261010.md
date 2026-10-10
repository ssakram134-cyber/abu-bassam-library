# Stage 80 — Idempotence and quota safety for archive trash (2026-10-10)

Two verified UI/coordination issues were fixed. Existing `restoreTrashRecord` moves the trash Blob to the active file store using a single IndexedDB transaction; quota errors abort the transaction and preserve the original. But the UI handler previously reported failure if only refresh failed *after* commit, and duplicate clicks could overlap. The same issue existed for permanent deletion. Local ZIP restoration had no single-flight guard.

The new trash action lock serializes restore vs permanent delete for each trash entry. A completed database transaction returns success even if display refresh fails. ZIP restores cannot overlap; all locks clear on exit. The existing IndexedDB atomic transaction, revision/scoping checks, trash expiry and maximum 1000 active files remain intact. Two regression checks increase registered scripts from 97 to 99.

Mocked storage faults and UI interruption tests are not proof of actual sudden-power or Android disk-full behavior. No main merge, Actions, APK build or live database deployment.