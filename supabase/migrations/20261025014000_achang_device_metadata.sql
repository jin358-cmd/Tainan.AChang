-- ACHANG-AUTH-20261024-P0-001
-- Device metadata required by the authorization API. Apply to isolated Test first.

alter table public.member_devices
  add column if not exists device_type text,
  add column if not exists operating_system text,
  add column if not exists browser_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'member_devices_device_type_length'
      and conrelid = 'public.member_devices'::regclass
  ) then
    alter table public.member_devices
      add constraint member_devices_device_type_length
      check (device_type is null or char_length(device_type) between 1 and 100)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'member_devices_operating_system_length'
      and conrelid = 'public.member_devices'::regclass
  ) then
    alter table public.member_devices
      add constraint member_devices_operating_system_length
      check (operating_system is null or char_length(operating_system) between 1 and 100)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'member_devices_browser_name_length'
      and conrelid = 'public.member_devices'::regclass
  ) then
    alter table public.member_devices
      add constraint member_devices_browser_name_length
      check (browser_name is null or char_length(browser_name) between 1 and 100)
      not valid;
  end if;
end
$$;

alter table public.member_devices
  validate constraint member_devices_device_type_length,
  validate constraint member_devices_operating_system_length,
  validate constraint member_devices_browser_name_length;
