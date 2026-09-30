begin;

update public.abu_bassam_app_releases
set active=false
where channel='stable' and active=true;

insert into public.abu_bassam_app_releases (
  version, version_code, channel, mandatory, min_supported_code, changelog,
  storage_bucket, storage_path, sha256, signing_cert_sha256, active
) values (
  '6.0.0', 600, 'stable', false, 600,
  'إصدار 6.0.0: تنظيف المصدر، حذف مسارات الهوية القديمة، عزل حزمة Android، وتثبيت مسار لمس الأسئلة على Pointer Events.',
  'abu-bassam-private', null, null, null, true
)
on conflict (version, channel) do update set
  version_code=excluded.version_code,
  mandatory=excluded.mandatory,
  min_supported_code=excluded.min_supported_code,
  changelog=excluded.changelog,
  storage_bucket=excluded.storage_bucket,
  active=true;

commit;
