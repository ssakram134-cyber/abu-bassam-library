# Stage 78 — Safe print preferences in local/cloud archive backups (2026-10-10)

## Verified gap
The shared `safeSettingKey` whitelist rejected `abuBassamCardsPrintPreferencesV1` (CR80/A4 layout, preferred paper type, DPI, copies) and `abuBassamDpiEnabledV1` (photo manual DPI toggle), although both persist locally. Consequently neither local ZIP/`.abuvault` nor cloud ZIP snapshots included those settings, and the cloud content fingerprint ignored changes to them.

## Code repair
- Admit **only the exact two print keys** into the existing safe settings whitelist; never include passwords, auth, session or device credentials.
- Preserve these two keys when restoring an **older ZIP that never contained them**, instead of silently resetting modern print choices during a same-device snapshot. When present, restore values on the same device as the existing app-settings restore flow.
- Keep the Stage75 owner-only **replacement-device restore** restriction: `settingsEntry && !recovery`, so the new device's print profiles and DPI remain unchanged.
- Local exports, encrypted exports, cloud backups and fingerprinting share the same safe settings allowlist; no need to change ZIP manifests or Supabase schema.
- Add behavioral test `check_stage78_print_backup_roundtrip.js` and integration gate `check_stage78_archive_supabase_print_integration.js`; 93 prior registered scripts preserved; **95** total.

## Verification scope and release controls
This stage uses focused mocked JavaScript/source tests. It is **not** proof that all 95 native Node tests passed or that Android printer driver selected actual media/DPI. Expo Print's system print dialog still controls hardware behavior. No GitHub Actions, APK build, server migration/Edge deployment, main merge or real customer-data mutation. Keep the pull request a **draft** until full CI-free Node validation and Android/Supabase device acceptance.
