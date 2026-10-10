# Stage 65 — Owner-only branch archive and exact-version signed download integration

Date: 2026-10-10. Base: PR #65 `integration/stage64-vault-cloud-cas-20261010`. Source: PRs #50–#51 ending at `fix/vault-strict-signed-download-auth-20261010`.

## Source integration
- Ported owner-only read-only branch browser, including the existing PR #50 migration `202610090002_vault_owner_readonly_branch_browser.sql` (following PR #49 CAS migration `202610090001`).
- Ported the exact PR #51 Edge function, the normal and owner archive signed download safeguards, archive UI, and source tests. Current integration `web/document-vault-runtime.js`, Edge Function and `tools/check_archive_edge_permissions.js` matched PR #49 before transfer by exact Git SHA.
- For `web/branch-vault-runtime.js`, PR #51 uses expanded formatting of `vaultItemId` but its semantics, permission labels and metadata-first audit logging match the hotfix-preserving integration branch. Source-level checks also preserve the CAS RPC and scope guards.
- Owner browse uses authenticated account + current device secret + database role **owner**; cannot show other users' data; no cross-branch editing, move, or automatic sync.
- Normal downloads require path, exact item and server revision; reject stale or wrong-path requests **before** signing. Both signed endpoints use a 60-second URL expiration, checked on the server with exact item/revision and per-device authorization. Signed URLs already issued may remain usable until expiration even after a role or device is revoked.
- App compares account/device and permissions after async responses and avoids using stale file previews. Owner modal escapes file metadata and revokes temporary Blob URLs.
- Registered prior 67 tests plus original owner-browser/signed-download tests and one new Stage65 gate: 70 registered distinct `check:web` commands.

## Release and security boundaries
- No production Supabase migrations, Edge deployments, Auth/Storage configuration changes, user file mutations, APK, GitHub Actions or `main` merge were performed.
- Migration `202610090002` depends on prior schema and CAS migration. Keep PRs #49, #50 and #51 ordered with a **coordinated server/client rollout**; the legacy vault writer is revoked by PR #49.
- This feature does **not** implement a unified cross-device archive namespace. Every file's authoritative scope remains `(user_id,branch_device_id,client_id)`. Server owner browsing is read-only.
- Test denied secondary-device browse and forged owner role, account switches, inactive/revoked devices, stale metadata, wrong item IDs, signed URL reuse after access revocation (until expiration), and actual Android network/offline behavior in a test project.
- Source/unit fixture checks cannot certify live Edge routing, Postgres grant behavior, real Storage access, `npm run check:web` or Android usage.
- The historical PR #51 Supabase security-review notes are not evidence of current deployed status. Confirm migrations and deployed Edge versions separately before production.
- PRs #52–#59 (offline OCR, backup dedup/order, QR, A4 printing, question drafts, integration audits) remain outside this stage.
