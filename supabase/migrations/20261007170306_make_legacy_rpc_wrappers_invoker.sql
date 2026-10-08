-- Supabase live migration: 20261007170306_make_legacy_rpc_wrappers_invoker
-- These compatibility wrappers perform no privileged table access themselves;
-- their v2 targets retain explicit role checks and SECURITY DEFINER as needed.

alter function public.add_repair_part(uuid,uuid,integer,text) security invoker;
alter function public.add_repair_part(uuid,uuid,integer,text) set search_path to pg_catalog;

alter function public.pay_purchase_order(uuid,numeric) security invoker;
alter function public.pay_purchase_order(uuid,numeric) set search_path to pg_catalog;

alter function public.remove_repair_part(uuid) security invoker;
alter function public.remove_repair_part(uuid) set search_path to pg_catalog;

alter function public.return_purchase_item(uuid,integer) security invoker;
alter function public.return_purchase_item(uuid,integer) set search_path to pg_catalog;
