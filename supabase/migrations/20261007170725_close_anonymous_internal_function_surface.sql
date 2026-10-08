-- Supabase live migration: 20261007170725_close_anonymous_internal_function_surface
-- Keep anonymous RPC exposure limited to the intentional token-based repair
-- tracking endpoint. Trigger functions are not client RPC endpoints.

revoke execute on function public.enforce_atomic_debt_payment_ledger() from public, anon, authenticated;
revoke execute on function public.guard_repair_status_transition() from public, anon, authenticated;
revoke execute on function public.set_compatibility_catalog_updated_at() from public, anon, authenticated;
revoke execute on function public.stamp_repair_status_times() from public, anon, authenticated;
revoke execute on function public.sync_dismantled_part_aliases() from public, anon, authenticated;
revoke execute on function public.sync_repair_warranty_record() from public, anon, authenticated;

grant execute on function public.enforce_atomic_debt_payment_ledger() to service_role;
grant execute on function public.guard_repair_status_transition() to service_role;
grant execute on function public.set_compatibility_catalog_updated_at() to service_role;
grant execute on function public.stamp_repair_status_times() to service_role;
grant execute on function public.sync_dismantled_part_aliases() to service_role;
grant execute on function public.sync_repair_warranty_record() to service_role;

revoke execute on function public.notification_visible_to_role(text,text) from public, anon;
grant execute on function public.notification_visible_to_role(text,text) to authenticated, service_role;

revoke execute on function public.repair_status_transition_allowed(text,text) from public, anon;
grant execute on function public.repair_status_transition_allowed(text,text) to authenticated, service_role;

revoke execute on function public.refresh_in_app_notifications() from public, anon;
grant execute on function public.refresh_in_app_notifications() to authenticated, service_role;
