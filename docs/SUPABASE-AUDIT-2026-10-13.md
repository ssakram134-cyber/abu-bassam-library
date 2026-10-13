# Supabase audit — 2026-10-13

Repository source: ssakram134-cyber/abu-bassam-library.
Review branch: fix/supabase-audit-20261013 (stacked on docs/tools/web).
Scope: 44 existing Supabase files (6 Edge functions, 38 SQL migrations), plus the new SQL migration.

## Confirmed issues corrected in review branch
1. BACKUP_ITEM_LIMIT_CONFLICT: the Edge gateway and client accept up to 2000 snapshot records including 30-day trash, but the SQL table constraint accepts only 1000. A follow-up migration widens the constraint without changing data or permissions.
2. BACKUP_PART_SIZE_UNBOUNDED: multipart commit materialized each downloaded Blob before enforcing the expected 5MiB per-part ceiling. The gateway now rejects oversize/missing parts before allocating an ArrayBuffer, and verifies actual bytes.
3. BACKUP_PART_COUNT_MISMATCH: plan requests could claim a part count inconsistent with the snapshot byte size; the gateway now requires the exact 5MiB-based part count.

## Existing protections inspected
- Device-id/secret plus Supabase JWT checks in customer-documents, backup-center and branch-vault functions.
- Grant/revoke clauses around SECURITY DEFINER RPCs, direct-table RLS denies and restrictions for vault storage.
- The October 12 vault CAS writer and its revoke of the older last-writer-wins RPC.
- Secrets remain server-side and are not added to client code.

## Verification status
- Done: Source comparison of client and Edge record ceilings with the new SQL constraint; new regression test tools/check_supabase_audit.js is wired into check:web.
- Needs verification: Applying the new SQL migration on a **matching test copy of the Library database**, selecting pg_constraint to verify its definition, then testing snapshot 1000, 1001, and 2000 counts with a real account.
- Needs verification: Running npm run check:web on a full checked-out repository; verifying Deno Edge function deploy, Storage bucket size/permission policies, RLS advisors and authenticated/unauthenticated edge cases.
- Not done: No connected live Library Supabase project could be positively identified. No production database changed, no Edge Function deployed, no Android APK built, no GitHub Actions run.
- Migration filename follows the existing project sequence because the Supabase CLI is not available in this environment; validate with `supabase migration list` on the real project before applying. Never edit historical migration history.

Reference: Supabase changelog 2026-10-13 and PostgreSQL RLS and storage hardening recommendations.
