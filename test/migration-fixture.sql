create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema app_private;

create table auth.users (id uuid primary key default gen_random_uuid());
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function app_private.is_admin() returns boolean language sql stable as $$ select true $$;

create table public.members (
  id uuid primary key default gen_random_uuid(),
  source_member_id text unique,
  display_name text not null,
  phone_e164 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.member_accounts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references public.members(id),
  auth_user_id uuid not null unique references auth.users(id),
  role text not null check (role in ('admin','volunteer')),
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  device_approval_required boolean not null default true,
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.member_devices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.member_accounts(id),
  device_id_hash text not null,
  status text not null default 'pending' check (status in ('pending','approved','revoked')),
  approved_at timestamptz,
  approved_by uuid,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint member_devices_account_id_device_id_hash_key unique(account_id,device_id_hash)
);

insert into auth.users(id) values
 ('10000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002');
insert into public.members(id,source_member_id,display_name,phone_e164) values
 ('20000000-0000-4000-8000-000000000001','MEMBER-A','Shared phone A','+886912345678'),
 ('20000000-0000-4000-8000-000000000002','MEMBER-B','Shared phone B','+886912345678');
insert into public.member_accounts(id,member_id,auth_user_id,role,status) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','volunteer','active'),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','volunteer','active');
insert into public.member_devices(id,account_id,device_id_hash,status,revoked_at) values
 ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',repeat('a',64),'revoked',now());
