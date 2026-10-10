# Stage 75 — Secure replacement-device recovery without removing branch isolation

Date: 2026-10-10. Base: Stage74 PR #75 (`integration/stage74-trash-backup-restore-integrity-20261010`). New branch: `integration/stage75-owner-replacement-recovery-20261010`.

## Real bug and why it matters
Existing cloud restoration explicitly refused any snapshot whose `branch_device_id` differs from the current device. This protected branch isolation but prevented an owner from restoring a previous branch's data after losing/replacing its phone, even though the backup-center server already allows the **authenticated owner** to list and download other branches' backup files.

## New owner-only, explicit replacement workflow
- In the Backup Center, the owner may select **عرض نسخ جميع الفروع** and view `استعادة على هاتف جديد` for a backup associated with an older/different branch device. Subusers do **not** receive this UI or transfer rights.
- The server continues to authorize downloaded backups by authenticated `user_id`, active device secret, owner role and `backupRestore`. The downloaded ZIP's SHA-256 is verified against the server backup metadata before any import.
- A second deliberate confirmation requires the owner to type **استعادة**, seeing the source branch name and its device ID. No automatic cross-branch copy is performed.
- The archive's `safeRestore` separately checks that the source device ID matches the verified backup row, the destination is a **different** device registered to the same authenticated account, permissions and local scope are valid, and both **active items (including tombstones) and current scoped trash are empty**. It refuses recovery into an occupied archive instead of merging unrelated records or deleting recent local data.
- Requires a successfully **committed pre-restore backup** before starting the import. Source protection checks are repeated after download, after the safety backup, and inside the atomic IndexedDB transaction to reject changed account, device, role, nonempty target or concurrent writes.
- Existing `manifest.trashScope` is validated against the exact original `user_id:source_device_id`, not accepted blindly. Only for explicitly owner-approved replacement recovery, recovered unexpired trash is written under **`user_id:new_device_id`** while its original folder, sourceId, deletion timestamp, order and 30-day expiry remain unchanged. The same transaction imports the active items/tombstones. The old user's/branch's data is never silently exposed to a different account.
- Existing normal same-device restores, legacy ZIPs, merge collision policies, QR, print, OCR and backup integrity remain untouched. This feature is **cloud-verified owner transfer only**; local ZIP import does not bypass branch permissions.
- Added behavioral test `tools/check_vault_device_recovery.js` and stacked source gate `tools/check_stage75_device_recovery_integration.js`. Existing Stage74 trash behavioral test fixture updated to recognize the additional optional recovery context. All 90 previous `check:web` checks retained; total 92 distinct.

## Limitations / risk management
- A replacement phone must first be authenticated and authorized as a new **owner device on the same Supabase account**. This stage does not implement remote device onboarding, reset old device secrets, or increase device limits. If account/old branch data is no longer available in cloud storage, it cannot be recovered automatically.
- The old branch's copies may still exist on the server. Restoring to a new owner device can create duplicates if both devices subsequently sync. It is a **copy to an initially empty owner device**, not a server-side transfer/revoke of the lost branch's identity. Revoke/retire the lost phone separately through authorized device-management controls before production use.
- Only app preferences currently allowlisted in the ZIP settings snapshot are restored. Cloud auth tokens, passwords, old device secrets and user roles **must not** be copied to the replacement phone.
- Prior 30-day trash entries that have expired are never revived. Backups created before Stage74 do not contain trash files at all.
- This is source-level draft code. Full `npm ci && npm run check:web`, actual Android owner login, recovery on a second physical phone, offline verification, screenshot/QR/duplex checking, restored folder sorting and real Supabase backup transfer must be tested before deployment.
- No APK build, GitHub Actions, `main` merge, Supabase SQL/Edge deploy or production data mutation. Existing CAS/owner-list SQL migrations are staged only. The original root PR-vs-`main` conflict must also be reconciled independently.
