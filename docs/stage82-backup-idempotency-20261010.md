# Stage 82 — Safe cloud backup multipart uploads and idempotent commit (2026-10-10)

Verified risk: Cloud backup uploads checked device permission at entry but did not recheck account/device scope between capture, plan, chunk uploads or commit. A user/account switch during a slow upload could continue remote requests and write a success/failure checkpoint into another account's localStorage namespace. A lost reply to a **committed** backup could cause an unnecessary new upload on later restart.

Corrections:
- Capture `originalScope` and permission in `backupNow`. Recheck after every asynchronous capture/network phase and before signed-upload retries or committing.
- Require a valid plan ID and exact chunk count.
- Retry the **same backup_id** when a commit response is lost, relying on the existing server `row.ready` idempotence; do not create a new upload plan within a retry.
- After a confirmed server commit, UI refresh and localStorage failures no longer turn a successful backup into a reported upload failure; preserve the acknowledged backup receipt. On scope switch do not write checkpoint/error keys for a different account.
- Retain chunk SHA-256 verified server commit, old `backupDelete` privilege checks, 30-day recycle bin, print settings backup and independent pre-restore snapshot.

Caveats: This avoids duplicates from lost *commit acknowledgments during the same running session*, not across a hard Android process kill before an upload plan was durably recorded. No distributed idempotency token across app restarts, and an already-accepted server request cannot be undone by changing session. Focused mocked source/V8 tests only, not a full native Node suite, mobile airplane-mode acceptance, APK, GitHub Actions, deployed Edge/Supabase, or main merge.
