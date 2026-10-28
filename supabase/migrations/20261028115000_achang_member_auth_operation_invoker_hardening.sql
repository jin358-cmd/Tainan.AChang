alter table app_private.achang_member_auth_operations enable row level security;

drop policy if exists achang_member_auth_operations_admin on app_private.achang_member_auth_operations;
create policy achang_member_auth_operations_admin
on app_private.achang_member_auth_operations
for all
to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

revoke all on table app_private.achang_member_auth_operations from public, anon, authenticated;
grant usage on schema app_private to authenticated;
grant select, insert on table app_private.achang_member_auth_operations to authenticated;

alter function public.achang_prepare_member_auth_identity(uuid,text) security invoker;
revoke all on function public.achang_prepare_member_auth_identity(uuid,text) from public, anon;
grant execute on function public.achang_prepare_member_auth_identity(uuid,text) to authenticated;

