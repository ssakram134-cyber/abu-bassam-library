# Stage 53 — Backup Integrity, Recovery and Archive Trash

## Evidence-backed defects fixed

1. The automatic cloud backup checkpoint in `web/backup-center-runtime.js` previously hashed **only selected metadata** (name, size, update time, folder and favorite). A same-size replacement with unchanged metadata could be mistaken for an unchanged archive and the backup skipped. New checkpoint hashes every actual Blob with SHA-256, together with backup-relevant metadata, `manualOrder` and permitted settings.
2. `packageBytes()` cloud snapshot manifest omitted `manualOrder`, so a restored cloud archive could lose the user-selected ordering in folders. The value is now preserved. Preexisting archives without this field cannot reconstruct the old ordering.
3. ZIP paths were constructed from sanitized IDs. Two distinct legacy IDs (such as `a/b` and `a_b`) could produce the **same internal ZIP path** and overwrite an entry without warning. Both cloud and locally exported ZIPs now use distinct six-digit ordinal ZIP folder names while retaining original IDs in manifest metadata for restore.
4. Cloud and local backup ZIP limits relied on potentially stale `item.size` rather than the actual Blob size, allowing underreported size values in malformed local metadata. Both now count actual `item.blob.size`.
5. Backups can be modified locally between the initial fingerprint and ZIP generation. Before requesting a server upload plan, the client now **re-fingerprints local data** and rejects inconsistent captures as `BACKUP_CHANGED_DURING_CAPTURE`, preserving the original archive and avoiding an incorrectly reported complete backup.

## Verification (source-backed JavaScript simulations, not phone tests)

- `tools/check_vault_backup_content_integrity.js`: **32 assertion calls passed**. Exercises byte changes with identical file size, unchanged snapshots, manual ordering and settings, actual Blob size enforcement, cloud and local ZIP ID collision prevention, and abort-before-upload on capture changes.
- `tools/check_backup_center.js`: passed its existing markers/checks for branch-local backup status, secure device secrets, server hash verification and safe pre-restore sequencing.
- `tools/check_backup_delete_permission.js`: **37 assertions passed**.
- `tools/check_vault_restore_dedup.js`: **15 assertions passed**.
- `tools/check_vault_backup_db_version.js`: **30 assertions passed**.
- `tools/check_vault_snapshot_tombstones.js`: **43 assertions passed**.
- `tools/check_vault_trash_drag.js`: **99 assertions passed** (30-day trash retention/expiry, atomic restore, permissions and local quota).

The seven scripts above passed **256 counted assertions** plus nonassertion source checks. Registered regression checks: **65** in `npm run check:web`.

## Important remaining limitations

- The ZIP snapshot currently exports **active items** in the `items` IndexedDB store. The 30-day deleted-file recycle bin is a *separate* `trash` store and is **not included** in either ordinary cloud or local ZIP backups. The trash works locally for 30 days, but deleted-file contents cannot be assumed recoverable from a cloud ZIP after losing the device. A future version must design a versioned trash export/import with branch-scoped identity, expiry and atomic restore rather than silently changing retention semantics.
- Automatic full-content SHA-256 checks can read up to the configured **500 MB** of archive payload (and currently do so before and after capture); actual low-memory Android CPU/RAM performance has not been profiled. It is a correctness improvement but needs device validation.
- The cloud backup ZIP is stored through a private, authenticated server API but **not itself encrypted end-to-end**. The separate manual `.abuvault` export uses AES-GCM and a user passphrase. Security assurances must distinguish these modes.
- This does not prove that Android can restore after app reinstall, clear-data, or device change; those require hands-on release testing and an explicit branch recovery process.
- The new changes are GitHub-only. No cloud storage objects were uploaded, no production Supabase migration or function was changed, no APK was built, and no GitHub Actions were run.

## Release dependencies

This PR stacks on #52 (and on earlier open PRs back to #49). Do **not** represent the source fixes as active in the user's installed Android version before branch integration, review, release and real-device acceptance.
