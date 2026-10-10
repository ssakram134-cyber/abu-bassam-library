# Stage 74 — Archive 30-day trash in local and cloud backups

Date: 2026-10-10. Parent: `integration/stage73-persistent-print-preferences-20261010` (PR #74). Integration branch: `integration/stage74-trash-backup-restore-integrity-20261010`.

## Confirmed gap and implemented change
Before this stage, `web/backup-center-runtime.js` read only IndexedDB `items`, and `web/document-vault-hardening-runtime.js` created/restored ZIPs containing only `manifest.items`. The recycle bin is a **separate** IndexedDB `trash` store and was therefore lost when restoring a full backup to a fresh device.

- Both cloud ZIP snapshots and local unencrypted ZIP / encrypted `.abuvault` exports now include a **separate `manifest.trash` list**, independent of `items`. Each entry retains original `id`, `sourceId`, name, `folder`, `manualOrder`, MIME, actual Blob content, deletion timestamp and original expiry timestamp, plus a SHA-256 digest of the trash file bytes. Collision-free paths use `trash/000001/...`; source identifiers remain in metadata.
- Only trash scoped to the **current authenticated user and branch device** and **not yet expired** is exported. A snapshot includes an explicit `trashScope` to reject restored data from a different user or branch. Cloud fingerprints now cover trash content bytes and expiry/folder metadata, so changes to the recycle bin trigger a fresh automatic backup and a mid-capture change aborts upload.
- Local ZIP and encrypted exports use the same trash semantics. Both local and cloud restore use the original `safeRestore` parser, with optional trash metadata (legacy ZIPs without `manifest.trash` remain accepted).
- Manifest validation rejects duplicate IDs/paths, unsafe ZIP paths, invalid timestamps, expiry longer than 30 days, missing SHA-256, oversized files, and incorrect account/branch scope. Restoring unexpired trash requires `vaultRestoreDeleted` permission in addition to the existing backup-restore permission.
- Records **already expired at restore time are skipped**, even if a historical backup still contains them. The original `expiresAt` is never extended.
- New entries are inserted in one IndexedDB transaction alongside the active snapshot/merge, with optimistic comparison of the expected active and trash state. Existing current trash is **not cleared or overwritten**, and cross-scope ID collisions fail closed. The ordinary on-screen Restore Deleted action continues to place the item in its original folder with a new active ID.
- The server API's `item_count` still counts active files only; client backup audit logs now distinguish active and trash counts. Older backup files remain compatible. The 120-MiB compressed and 500-MiB combined uncompressed limits remain in force.

## Explicit limitations
- Old snapshots already created without `manifest.trash` cannot retrospectively recover deleted items absent from the ZIP. New backups capture trash present when taken; a **permanent deletion made after a backup may still be represented inside an older backup** until the original 30-day expiration passes. Archive backup retention should be reviewed alongside privacy requirements.
- These are source changes and isolated JS mocked tests, **not** a verified restore on a real Android device or a live Supabase upload/download. Snapshot creation/restore and quota behavior require hardware/storage stress tests.
- Cloud ZIP snapshots remain authenticated private storage, **not E2EE**. Encrypted `.abuvault` exports are a separate passphrase-protected path.
- A full native `npm ci && npm run check:web`, large archive/memory profile, corrupted ZIP tests and account-switch race tests are release prerequisites.
- No user data changed, no Supabase migration/Edge deploy, no Android build, no GitHub Actions, and no merge to `main`. Earlier cloud CAS and owner-reader migrations are still staged only; coordinate deployment separately.
