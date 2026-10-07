-- Supabase live migration: 20261007170201_split_dismantling_read_write_policies
-- Accountant remains read-only; owner/manager retain all mutation rights.

drop policy if exists dismantled_parts_privileged on public.dismantled_parts;
drop policy if exists dismantled_parts_read on public.dismantled_parts;
drop policy if exists dismantled_parts_insert_management on public.dismantled_parts;
drop policy if exists dismantled_parts_update_management on public.dismantled_parts;
drop policy if exists dismantled_parts_delete_management on public.dismantled_parts;

create policy dismantled_parts_read
on public.dismantled_parts
for select
to authenticated
using (public.has_app_role(array['owner','manager','accountant']));

create policy dismantled_parts_insert_management
on public.dismantled_parts
for insert
to authenticated
with check (public.has_app_role(array['owner','manager']));

create policy dismantled_parts_update_management
on public.dismantled_parts
for update
to authenticated
using (public.has_app_role(array['owner','manager']))
with check (public.has_app_role(array['owner','manager']));

create policy dismantled_parts_delete_management
on public.dismantled_parts
for delete
to authenticated
using (public.has_app_role(array['owner','manager']));

drop policy if exists dismantling_devices_privileged on public.dismantling_devices;
drop policy if exists dismantling_devices_read on public.dismantling_devices;
drop policy if exists dismantling_devices_insert_management on public.dismantling_devices;
drop policy if exists dismantling_devices_update_management on public.dismantling_devices;
drop policy if exists dismantling_devices_delete_management on public.dismantling_devices;

create policy dismantling_devices_read
on public.dismantling_devices
for select
to authenticated
using (public.has_app_role(array['owner','manager','accountant']));

create policy dismantling_devices_insert_management
on public.dismantling_devices
for insert
to authenticated
with check (public.has_app_role(array['owner','manager']));

create policy dismantling_devices_update_management
on public.dismantling_devices
for update
to authenticated
using (public.has_app_role(array['owner','manager']))
with check (public.has_app_role(array['owner','manager']));

create policy dismantling_devices_delete_management
on public.dismantling_devices
for delete
to authenticated
using (public.has_app_role(array['owner','manager']));
