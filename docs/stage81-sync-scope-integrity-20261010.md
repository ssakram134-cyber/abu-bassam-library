# Stage 81: account/device-bound archive sync (2026-10-10)

Fixed two source-level race conditions. Archive sync previously checked device permissions at entry but did not recheck the original authenticated account/device scope after long network operations. A session switch could continue against stale local state. Archive sync also set the last-success checkpoint even when an upload's compare-and-swap could not mark a concurrently edited local record as synced.

Stage81 captures the identity scope and verifies it after remote metadata reads, uploads, CAS and remote list fetches, before downloading into the local database, and before writing the success checkpoint. It refuses a full checkpoint if any local entry is still pending or a rerun was flagged.

This does not undo already in-flight remote work or provide a distributed lock; it fails closed on further client actions. Existing ZIP backup snapshot checks, owner recovery, Supabase CAS and 30-day trash are preserved. Test commands 99 -> 101 with focused simulated account-switch/pending-edit and source guards. No APK, Actions, main merge, server deployment or production data write. All 101 tests and live Android/cloud fault tests remain unexecuted.
