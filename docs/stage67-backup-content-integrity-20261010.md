# Stage 67 — Archive backup content, order and ZIP-collision integration

Date: 2026-10-10. Parent branch: `integration/stage66-offline-ocr-security-20261010`, PR #67. Source: original PR #53 (`fix/vault-backup-content-fingerprint-order-20261010`) stacked on OCR PR #52.

## Exact source relationship
The Stage66 integration branch's `web/backup-center-runtime.js` SHA 7ff72b3e88982a0906059cf3bb91cbc5187ccaae and `web/document-vault-hardening-runtime.js` SHA 34ac0915c40e117d9ba86e97fe062d033c1b4489 exactly matched PR #53's parent. Thus the two original PR #53 result blobs can be copied without replacing the prior security, OCR, CAS, owner browsing and branch isolation fixes.

## Actual changes
- Use SHA-256 of the real Blob bytes (and metadata, manualOrder, mime, folder and relevant local settings) to determine if a cloud backup checkpoint is still valid. Equal-size edits are therefore not skipped.
- Preserve manualOrder in cloud and local ZIP metadata and restore it with the preexisting restore parser.
- Build collision-free ordinal ZIP entries `files/000001/name`, retaining original item IDs in the manifest, instead of sanitized IDs that may collide.
- Apply individual and total archive size constraints to actual Blob bytes, not cached item.size.
- Abort backup capture **before** requesting cloud upload if the full source fingerprint changed while producing ZIP bytes. Do not claim a changed/inconsistent backup was uploaded.
- Register the original `tools/check_vault_backup_content_integrity.js` and the additional `tools/check_stage67_backup_merge_regression.js`. Preserve the existing 72 `check:web` commands: 74 unique registered checks.

## Scope, caveats and release acceptance
- The ZIP backups do **not** currently include deleted-file recovery records in the separate IndexedDB `trash` store. Recovering from total phone loss cannot be described as restoring the 30-day trash.
- Private authenticated Supabase backup storage is **not equivalent to user-passphrase end-to-end encryption**. An independent encrypted `.abuvault` manual export exists.
- SHA-256 rehashes full local files and may be expensive for 1,000 images / large archives on Android. Require memory, throughput and low-storage tests, a real restore order inspection, same-size-content modification test, renamed/similar IDs and a real device cloud backup rehearsal.
- Prior CAS and owner-only archive SQL migrations / Edge deployments are not deployed. No mutation of production Supabase, deletion of customer files, application icon change, APK build, GitHub Actions or `main` merge in this stage.
- The original source test uses deterministic toy hashing for its fixture, not a cryptographic assertion; production code invokes the browser SHA-256 API. Full native Node `npm ci && npm run check:web` and real Android tests remain outstanding.
