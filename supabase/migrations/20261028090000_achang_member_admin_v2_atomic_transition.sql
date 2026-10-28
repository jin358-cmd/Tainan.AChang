create or replace function public.achang_member_admin_v2_transition(
  p_account_id uuid,
  p_action text,
  p_expected_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_account public.member_accounts%rowtype;
  v_now timestamptz := statement_timestamp();
  v_principal_hash text;
begin
  if v_actor is null or not app_private.is_admin() then
    raise exception using errcode = '42501', message = 'active administrator required';
  end if;
  if p_action not in ('approve','suspend','reactivate') then
    raise exception using errcode = '22023', message = 'unsupported member transition';
  end if;

  select * into v_account
  from public.member_accounts
  where id = p_account_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'member account not found';
  end if;
  if v_account.status is distinct from p_expected_status then
    raise exception using errcode = '40001', message = 'member account status changed';
  end if;

  v_principal_hash := encode(extensions.digest(v_account.auth_user_id::text,'sha256'),'hex');
  if p_action = 'suspend' then
    if v_account.auth_user_id = v_actor then
      raise exception using errcode = '23514', message = 'administrator cannot suspend own account';
    end if;
    if v_principal_hash in (
      '0c547cdd53e62896571f12b7ed9e2aaa2f0bf5361aad782f1a2e9eb362202ee6',
      'aafea9485fd742b9c78d4eea26f9368c0b4800f1823075bee0f3bd8787f9cf45'
    ) then
      raise exception using errcode = '23514', message = 'protected principal cannot be suspended';
    end if;
  end if;

  if p_action = 'approve' then
    if v_account.status <> 'pending' then
      raise exception using errcode = '23514', message = 'only pending account can be approved';
    end if;
    update public.member_accounts set
      status='active', approved_at=v_now, approved_by=v_actor,
      rejected_at=null, rejection_reason=null, updated_at=v_now
    where id=v_account.id
    returning * into v_account;
  elsif p_action = 'suspend' then
    if v_account.status <> 'active' then
      raise exception using errcode = '23514', message = 'only active account can be suspended';
    end if;
    update public.member_devices set
      status='revoked', revoked_at=coalesce(revoked_at,v_now)
    where account_id=v_account.id and status<>'revoked';
    update public.member_accounts set
      status='suspended', suspended_at=v_now, suspended_by=v_actor,
      rejection_reason=nullif(left(coalesce(p_reason,''),500),''), updated_at=v_now
    where id=v_account.id
    returning * into v_account;
  else
    if v_account.status <> 'suspended' or v_account.approved_at is null then
      raise exception using errcode = '23514', message = 'unapproved account cannot be reactivated';
    end if;
    update public.member_accounts set
      status='active', reactivated_at=v_now, reactivated_by=v_actor,
      rejection_reason=null, updated_at=v_now
    where id=v_account.id
    returning * into v_account;
  end if;

  return to_jsonb(v_account);
end;
$$;

revoke all on function public.achang_member_admin_v2_transition(uuid,text,text,text) from public, anon;
grant execute on function public.achang_member_admin_v2_transition(uuid,text,text,text) to authenticated;
