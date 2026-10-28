create table if not exists app_private.achang_member_auth_operations(
  member_id uuid primary key references public.members(id) on delete restrict,
  requested_role text not null check (requested_role in ('volunteer','admin')),
  auth_alias text not null unique check (auth_alias ~ '^[0-9a-f]{32}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

revoke all on table app_private.achang_member_auth_operations from public, anon, authenticated;

create or replace function public.achang_prepare_member_auth_identity(p_member_id uuid,p_role text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_operation app_private.achang_member_auth_operations%rowtype;
begin
  if v_actor is null or not app_private.is_admin() then
    raise exception using errcode='42501',message='active administrator required';
  end if;
  if p_role not in ('volunteer','admin') then
    raise exception using errcode='22023',message='unsupported member role';
  end if;

  insert into app_private.achang_member_auth_operations(member_id,requested_role,auth_alias,created_by)
  values(p_member_id,p_role,encode(extensions.gen_random_bytes(16),'hex'),v_actor)
  on conflict(member_id) do nothing;

  select * into v_operation
  from app_private.achang_member_auth_operations
  where member_id=p_member_id;
  if not found then
    raise exception using errcode='P0002',message='member auth operation not found';
  end if;
  if v_operation.requested_role<>p_role then
    raise exception using errcode='23514',message='member auth operation role conflict';
  end if;
  return v_operation.auth_alias;
end;
$$;

revoke all on function public.achang_prepare_member_auth_identity(uuid,text) from public, anon;
grant execute on function public.achang_prepare_member_auth_identity(uuid,text) to authenticated;

