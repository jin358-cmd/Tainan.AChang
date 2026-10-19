alter table public.member_accounts
  add column if not exists can_edit_profile boolean not null default false,
  add column if not exists profile_edit_granted_at timestamptz,
  add column if not exists profile_edit_granted_by uuid references auth.users(id);

comment on column public.member_accounts.can_edit_profile is
  'Admin-managed scope allowing an active volunteer account to edit only its own non-identity profile fields.';

create or replace function app_private.update_own_profile(
  p_display_name text,
  p_address text,
  p_resident_area text
)
returns table(id uuid, display_name text, phone_e164 text, address text, resident_area text, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_member_id uuid;
begin
  select ma.member_id into v_member_id
  from public.member_accounts ma
  join public.members m on m.id = ma.member_id
  where ma.auth_user_id = auth.uid()
    and ma.role = 'volunteer'
    and ma.status = 'active'
    and ma.can_edit_profile = true
    and m.source_member_id not like 'ADMIN-%';

  if v_member_id is null then
    raise exception using errcode = '42501', message = 'profile edit grant required';
  end if;
  if p_display_name is null or btrim(p_display_name) = '' or length(p_display_name) > 80
     or length(coalesce(p_address, '')) > 300
     or length(coalesce(p_resident_area, '')) > 40 then
    raise exception using errcode = '22023', message = 'invalid profile fields';
  end if;

  return query
  update public.members m
  set display_name = btrim(p_display_name),
      address = nullif(btrim(coalesce(p_address, '')), ''),
      resident_area = nullif(btrim(coalesce(p_resident_area, '')), '')
  where m.id = v_member_id
  returning m.id, m.display_name, m.phone_e164, m.address, m.resident_area, m.updated_at;
end;
$$;

revoke all on function app_private.update_own_profile(text,text,text) from public;
grant execute on function app_private.update_own_profile(text,text,text) to authenticated;
