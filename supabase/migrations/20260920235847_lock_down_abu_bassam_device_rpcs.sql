revoke all on function public.abu_bassam_register_device(text,text,text,text,text,text) from public, anon;
revoke all on function public.abu_bassam_touch_device(text,text,text,text,text,text) from public, anon;
revoke all on function public.abu_bassam_manage_device(text,text,text,text,boolean,jsonb) from public, anon;
revoke all on function public.abu_bassam_remove_device(text,text,text) from public, anon;

grant execute on function public.abu_bassam_register_device(text,text,text,text,text,text) to authenticated;
grant execute on function public.abu_bassam_touch_device(text,text,text,text,text,text) to authenticated;
grant execute on function public.abu_bassam_manage_device(text,text,text,text,boolean,jsonb) to authenticated;
grant execute on function public.abu_bassam_remove_device(text,text,text) to authenticated;
