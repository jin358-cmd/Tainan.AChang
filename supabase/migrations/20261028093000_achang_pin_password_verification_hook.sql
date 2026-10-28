create table if not exists app_private.achang_password_attempt_buckets(
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default statement_timestamp(),
  failed_count integer not null default 0 check (failed_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default statement_timestamp()
);

revoke all on table app_private.achang_password_attempt_buckets from public, anon, authenticated;
grant usage on schema app_private to supabase_auth_admin;
grant select, insert, update, delete on table app_private.achang_password_attempt_buckets to supabase_auth_admin;

create or replace function public.achang_password_verification_hook(event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (event->>'user_id')::uuid;
  v_valid boolean := coalesce((event->>'valid')::boolean,false);
  v_email text;
  v_count integer;
  v_window_started timestamptz;
  v_blocked_until timestamptz;
  v_now timestamptz := statement_timestamp();
begin
  select lower(email) into v_email from auth.users where id=v_user_id;
  if v_email is null or v_email not like '%@auth.achang.invalid' then
    return jsonb_build_object('decision','continue');
  end if;

  select failed_count,window_started_at,blocked_until
    into v_count,v_window_started,v_blocked_until
  from app_private.achang_password_attempt_buckets
  where user_id=v_user_id
  for update;

  if v_blocked_until is not null and v_blocked_until > v_now then
    return jsonb_build_object('error',jsonb_build_object(
      'http_code',429,
      'message','登入嘗試過於頻繁，請稍後再試'
    ));
  end if;
  if v_window_started is not null and v_window_started < v_now-interval '15 minutes' then
    delete from app_private.achang_password_attempt_buckets where user_id=v_user_id;
    v_count:=null;v_window_started:=null;v_blocked_until:=null;
  end if;

  if v_valid then
    delete from app_private.achang_password_attempt_buckets where user_id=v_user_id;
    return jsonb_build_object('decision','continue');
  end if;

  insert into app_private.achang_password_attempt_buckets(user_id,window_started_at,failed_count,blocked_until,updated_at)
  values(v_user_id,v_now,1,null,v_now)
  on conflict(user_id) do update set
    window_started_at=case
      when app_private.achang_password_attempt_buckets.window_started_at < v_now-interval '15 minutes'
      then v_now else app_private.achang_password_attempt_buckets.window_started_at end,
    failed_count=case
      when app_private.achang_password_attempt_buckets.window_started_at < v_now-interval '15 minutes'
      then 1 else app_private.achang_password_attempt_buckets.failed_count+1 end,
    blocked_until=case
      when app_private.achang_password_attempt_buckets.window_started_at < v_now-interval '15 minutes' then null
      when app_private.achang_password_attempt_buckets.failed_count+1 >= 5 then v_now+interval '15 minutes'
      else app_private.achang_password_attempt_buckets.blocked_until end,
    updated_at=v_now
  returning failed_count,blocked_until into v_count,v_blocked_until;

  if v_blocked_until is not null and v_blocked_until > v_now then
    return jsonb_build_object('error',jsonb_build_object(
      'http_code',429,
      'message','登入嘗試過於頻繁，請稍後再試'
    ));
  end if;
  return jsonb_build_object('decision','continue');
end;
$$;

revoke all on function public.achang_password_verification_hook(jsonb) from public, anon, authenticated;
grant execute on function public.achang_password_verification_hook(jsonb) to supabase_auth_admin;
