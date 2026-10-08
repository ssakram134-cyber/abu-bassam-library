-- Supabase live migration: 20261007181713_delegate_legacy_notification_refresh_to_v2
-- Remove duplicated legacy notification-refresh logic. Keep the old RPC name as
-- a compatibility wrapper while delegating all behavior and authorization to v2.

create or replace function public.refresh_in_app_notifications()
returns integer
language plpgsql
security invoker
set search_path to pg_catalog
as $function$
begin
  return public.refresh_in_app_notifications_v2();
end
$function$;

revoke all on function public.refresh_in_app_notifications() from public, anon;
grant execute on function public.refresh_in_app_notifications() to authenticated, service_role;
