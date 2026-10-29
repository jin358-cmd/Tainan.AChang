create table if not exists public.route_stop_overlays (
  id uuid primary key default gen_random_uuid(),
  shift text not null check (shift in ('日間','夜間')),
  route_token text not null check (char_length(route_token) between 1 and 80),
  vehicle text not null default '' check (char_length(vehicle) <= 40),
  area text not null check (char_length(area) between 1 and 30),
  stop_name text not null check (char_length(stop_name) between 1 and 240),
  start_time time not null,
  end_time time not null,
  display_order integer not null check (display_order between 1 and 9999),
  position_before_source_id text,
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  archived_by uuid references auth.users(id),
  archived_at timestamptz,
  check (end_time >= start_time)
);

create index if not exists route_stop_overlays_route_idx
  on public.route_stop_overlays (shift,route_token,status,display_order,created_at);

create unique index if not exists route_stop_overlays_active_identity_idx
  on public.route_stop_overlays (shift,route_token,stop_name,start_time)
  where status='active';

create table if not exists public.route_stop_overlay_events (
  id uuid primary key default gen_random_uuid(),
  overlay_id uuid not null references public.route_stop_overlays(id),
  event_type text not null check (event_type in ('created','archived','restored')),
  actor_user_id uuid references auth.users(id),
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.route_stop_overlays enable row level security;
alter table public.route_stop_overlay_events enable row level security;

create policy route_stop_overlays_admin_select on public.route_stop_overlays
 for select to authenticated using ((select app_private.is_admin()));
create policy route_stop_overlay_events_admin_select on public.route_stop_overlay_events
 for select to authenticated using ((select app_private.is_admin()));

revoke all on public.route_stop_overlays from anon,authenticated;
revoke all on public.route_stop_overlay_events from anon,authenticated;
grant select on public.route_stop_overlays to authenticated;
grant select on public.route_stop_overlay_events to authenticated;

create or replace function public.achang_route_stop_overlay_mutate(
 p_action text,
 p_id uuid default null,
 p_shift text default null,
 p_route_token text default null,
 p_vehicle text default null,
 p_area text default null,
 p_stop_name text default null,
 p_start_time time default null,
 p_end_time time default null,
 p_display_order integer default null,
 p_position_before_source_id text default null
) returns setof public.route_stop_overlays
language plpgsql security definer
set search_path = public,pg_temp
as $$
declare
 v_actor uuid := auth.uid();
 v_row public.route_stop_overlays%rowtype;
begin
 if v_actor is null or not app_private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_action = 'create' then
  if p_shift not in ('日間','夜間') or p_route_token is null or char_length(trim(p_route_token)) not between 1 and 80
   or p_area is null or char_length(trim(p_area)) not between 1 and 30
   or p_stop_name is null or char_length(trim(p_stop_name)) not between 1 and 240
   or p_start_time is null or p_end_time is null or p_end_time < p_start_time
   or p_display_order not between 1 and 9999 then
   raise exception 'INVALID_STOP' using errcode='22023';
  end if;
  insert into public.route_stop_overlays(shift,route_token,vehicle,area,stop_name,start_time,end_time,display_order,position_before_source_id,created_by,updated_by)
  values(p_shift,trim(p_route_token),left(trim(coalesce(p_vehicle,'')),40),p_area,trim(p_stop_name),p_start_time,p_end_time,p_display_order,nullif(trim(coalesce(p_position_before_source_id,'')),''),v_actor,v_actor)
  returning * into v_row;
 elsif p_action in ('archive','restore') then
  select * into v_row from public.route_stop_overlays where id=p_id for update;
  if not found then raise exception 'STOP_NOT_FOUND' using errcode='P0002'; end if;
  if p_action='archive' and v_row.status='active' then
   update public.route_stop_overlays set status='archived',archived_by=v_actor,archived_at=now(),updated_by=v_actor,updated_at=now() where id=p_id returning * into v_row;
  elsif p_action='restore' and v_row.status='archived' then
   update public.route_stop_overlays set status='active',archived_by=null,archived_at=null,updated_by=v_actor,updated_at=now() where id=p_id returning * into v_row;
  else
   raise exception 'INVALID_TRANSITION' using errcode='40001';
  end if;
 else
  raise exception 'INVALID_ACTION' using errcode='22023';
 end if;
 insert into public.route_stop_overlay_events(overlay_id,event_type,actor_user_id,snapshot)
 values(v_row.id,case p_action when 'create' then 'created' when 'archive' then 'archived' else 'restored' end,v_actor,to_jsonb(v_row));
 return next v_row;
end;
$$;

revoke all on function public.achang_route_stop_overlay_mutate(text,uuid,text,text,text,text,text,time,time,integer,text) from public,anon;
grant execute on function public.achang_route_stop_overlay_mutate(text,uuid,text,text,text,text,text,time,time,integer,text) to authenticated;

insert into public.route_stop_overlays(id,shift,route_token,vehicle,area,stop_name,start_time,end_time,display_order,position_before_source_id,status)
values('d4000000-0000-4000-8000-000000000001','日間','日間4','KER-3760','勝利里','二王廟前','06:30','06:45',1,'PDF:DAY:0149','active')
on conflict (id) do nothing;

insert into public.route_stop_overlay_events(overlay_id,event_type,actor_user_id,snapshot)
select id,'created',null,to_jsonb(route_stop_overlays) from public.route_stop_overlays
where id='d4000000-0000-4000-8000-000000000001'
and not exists(select 1 from public.route_stop_overlay_events where overlay_id='d4000000-0000-4000-8000-000000000001' and event_type='created');

insert into public.route_stop_overlays(id,shift,route_token,vehicle,area,stop_name,start_time,end_time,display_order,position_before_source_id,status)
values('d6000000-0000-4000-8000-000000000001','日間','日間6','AAQ-059','大橋里','大橋一街103巷口','06:52','06:54',1,'PDF:DAY:0158','active')
on conflict (id) do nothing;

insert into public.route_stop_overlay_events(overlay_id,event_type,actor_user_id,snapshot)
select id,'created',null,to_jsonb(route_stop_overlays) from public.route_stop_overlays
where id='d6000000-0000-4000-8000-000000000001'
and not exists(select 1 from public.route_stop_overlay_events where overlay_id='d6000000-0000-4000-8000-000000000001' and event_type='created');
