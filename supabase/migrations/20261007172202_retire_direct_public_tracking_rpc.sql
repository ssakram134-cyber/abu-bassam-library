-- Supabase live migration: 20261007172202_retire_direct_public_tracking_rpc
-- Public tracking is served by the dedicated Edge Function. The legacy
-- SECURITY DEFINER RPC is retained for service maintenance only.

revoke all on function public.get_public_repair_tracking(uuid) from public, anon, authenticated;
grant execute on function public.get_public_repair_tracking(uuid) to service_role;
