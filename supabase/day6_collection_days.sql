-- Owner correction: 日間6 第2站 大橋一街228號, 06:52.
alter table public.route_stop_overlays
 add column if not exists collection_days text not null default '';

do $$
begin
 if not exists(select 1 from public.route_stop_overlays where id='d6000000-0000-4000-8000-000000000001' and shift='日間' and route_token='日間6' and stop_name='大橋一街228號') then
  raise exception 'Expected day6 second stop was not found';
 end if;
 update public.route_stop_overlays set collection_days='一、二、四、五、六',updated_at=now()
 where id='d6000000-0000-4000-8000-000000000001';
end $$;
notify pgrst,'reload schema';
