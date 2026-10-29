alter table public.route_stop_overlay_events
  drop constraint if exists route_stop_overlay_events_event_type_check;

alter table public.route_stop_overlay_events
  add constraint route_stop_overlay_events_event_type_check
  check (event_type in ('created','archived','restored','reordered'));

do $$
declare
  v_before public.route_stop_overlays%rowtype;
  v_after public.route_stop_overlays%rowtype;
begin
  select * into v_before
  from public.route_stop_overlays
  where id = 'd6000000-0000-4000-8000-000000000001'
  for update;

  if not found then
    raise exception 'DAY6_OWNER_OVERLAY_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_before.shift <> '日間'
     or v_before.route_token <> '日間6'
     or v_before.vehicle <> 'AAQ-059'
     or v_before.stop_name <> '大橋一街103巷口'
     or v_before.start_time <> time '06:52'
     or v_before.end_time <> time '06:54'
     or v_before.status <> 'active' then
    raise exception 'DAY6_OWNER_OVERLAY_MISMATCH' using errcode = '40001';
  end if;

  if v_before.display_order = 1
     and v_before.position_before_source_id = 'PDF:DAY:0158' then
    update public.route_stop_overlays
    set display_order = 2,
        position_before_source_id = 'PDF:DAY:0159',
        updated_at = now()
    where id = v_before.id
    returning * into v_after;

    insert into public.route_stop_overlay_events(
      overlay_id,event_type,actor_user_id,snapshot
    ) values (
      v_after.id,
      'reordered',
      null,
      jsonb_build_object(
        'reason','Owner requested original PDF day-6 first stop before the added overlay',
        'before',to_jsonb(v_before),
        'after',to_jsonb(v_after)
      )
    );
  elsif v_before.display_order <> 2
        or v_before.position_before_source_id <> 'PDF:DAY:0159' then
    raise exception 'DAY6_OWNER_OVERLAY_ORDER_UNEXPECTED' using errcode = '40001';
  end if;
end;
$$;
