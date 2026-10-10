# Stage 63 — Archive sync, tombstone, and capacity integration (2026-10-10)

## Provenance
- Base: `integration/stage62-archive-file-management-20261010` — PR #63, itself descended from the security-preserving main reconciliation root.
- Source: cumulative implementation of PRs #44–#48, tip `fix/vault-cross-device-trash-conflicts-20261009`.
- Confirmed unchanged archive source before transfer: Stage 62 `web/document-vault-runtime.js` and `web/document-vault-hardening-runtime.js` were exact Git-blob matches to the original PR #43 parent of PR #44. Therefore the source changes in these two files can be applied directly without losing Stage 61 security and scheduling fixes.

## Integrated source features
1. Local revision compare before server-backed sync results; delayed downloads or deletion confirmations cannot overwrite a newer local modification.
2. Snapshot ZIP restore retains deletion tombstones and refuses stale/concurrent restores, preventing silent cloud resurrection.
3. Transaction-level 1,000-active-file quota for imports, OCR-created items, preserved originals, remote downloads and conflict copies.
4. Incoming remote deletion preserves a 30-day local trash copy; local deleted-versus-remote-edited conflicts preserve the remote file in trash without reviving the local active row.
5. Archive-specific regression scripts from the original source are copied unmodified. The five new checks are four source tests plus an integration guard, keeping all 60 Stage62 tests: 65 unique `check:web` commands.

## Security and deployment boundaries
- **Do not** replace `web/branch-vault-runtime.js`: it preserves the main-hotfix metadata-first deletion, audit logging, scoped revision paths and new user-selected archive permissions.
- **Do not** replace any of the three security-sensitive Supabase Edge Functions in main, or change migrations, devices, credentials, or user documents.
- No backup restore, cloud synchronization, database cleanup, live Edge deployment or phone operation was performed in this change.
- Stage 63 is a draft. Native `npm ci && npm run check:web`, real IndexedDB browser behavior, real multi-device Supabase and Android storage/trash behavior are NOT verified.
- PR #49's atomic server-side compare-and-swap SQL migration is **not included**. The client still issues separate network get/upsert calls, leaving a server lost-update race until a staged migration and coordinated client rollout.
- PRs #50–#59 are likewise not integrated. Never merge this branch directly into main until required reviews, native tests and subsequent deployment safety gates.

## Validation performed
- Compared actual content SHA for both modified archive runtimes between Stage62 and PR43: exact baseline match.
- Inspected the cumulative PR43→PR48 diff: only nine file paths changed, with no Edge Function or SQL migration changes.
- Parsed both source runtime JavaScript files with V8 `new Function` in a nonexecuting syntax-only check before writing.
- Integration gate is committed for future execution but no native Node test-suite claim is made.
