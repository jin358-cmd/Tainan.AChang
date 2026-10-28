create or replace function public.achang_member_admin_v2_promote_admin(
  p_account_id uuid,
  p_expected_role text default 'volunteer',
  p_expected_status text default 'active'
)
returns public.member_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_account public.member_accounts%rowtype;
  v_target public.member_accounts%rowtype;
  v_member public.members%rowtype;
  v_updated public.member_accounts%rowtype;
  v_now timestamptz := now();
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  if not app_private.is_admin() then raise exception using errcode = '42501', message = 'active administrator required'; end if;
  select * into v_actor_account from public.member_accounts where auth_user_id = v_actor and role = 'admin' and status = 'active' limit 1;
  if not found then raise exception using errcode = '42501', message = 'active administrator required'; end if;

  select * into v_target from public.member_accounts where id = p_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'member account not found'; end if;
  select * into v_member from public.members where id = v_target.member_id for update;
  if not found or v_member.deleted_at is not null then raise exception using errcode = 'P0002', message = 'member not found or archived'; end if;
  if v_target.auth_user_id = v_actor then raise exception using errcode = '23514', message = 'administrator cannot promote own account'; end if;
  if v_target.role is distinct from p_expected_role or v_target.status is distinct from p_expected_status then
    raise exception using errcode = '40001', message = 'member promotion state changed';
  end if;
  if v_target.role <> 'volunteer' or v_target.status <> 'active' then
    raise exception using errcode = '23514', message = 'only active volunteers can be promoted';
  end if;

  update public.member_accounts
  set role = 'admin', device_approval_required = false,
      approved_at = coalesce(approved_at,v_now), approved_by = coalesce(approved_by,v_actor)
  where id = v_target.id and role = p_expected_role and status = p_expected_status
  returning * into v_updated;
  if not found then raise exception using errcode = '40001', message = 'member promotion state changed'; end if;
  insert into public.member_authorization_events(member_id,account_id,event_type,reason,actor_user_id,created_at)
  values(v_target.member_id,v_target.id,'member_promoted_admin','管理員由會員授權介面設為管理員',v_actor,v_now);
  return v_updated;
end;
$$;

revoke all on function public.achang_member_admin_v2_promote_admin(uuid,text,text) from public, anon;
grant execute on function public.achang_member_admin_v2_promote_admin(uuid,text,text) to authenticated;
