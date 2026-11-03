-- Disposable fixtures: all writes, including the audit rows, are rolled back.
begin;
select set_config('request.jwt.claims',(select json_build_object('sub',auth_user_id,'role','authenticated')::text from public.member_accounts where role='admin' and status='active' limit 1),true);
set local role authenticated;
do $$
declare one uuid;two uuid;three uuid;batch uuid:=gen_random_uuid();items jsonb;result jsonb;again jsonb;before_count bigint; task_id uuid; cancellation jsonb; cancellation_batch uuid:=gen_random_uuid(); large_items jsonb;
begin
 insert into public.members(display_name,source_member_id) values('__route_batch_fixture_one','TEST-ROUTE-BATCH-ONE') returning id into one;
 insert into public.members(display_name,source_member_id) values('__route_batch_fixture_two','TEST-ROUTE-BATCH-TWO') returning id into two;
 insert into public.members(display_name,source_member_id) values('__route_batch_fixture_three','TEST-ROUTE-BATCH-THREE') returning id into three;
 items:=jsonb_build_array(
 jsonb_build_object('member_id',one,'service_date','2099-11-02','shift','day','village','復華里','route_id','TEST-DAY-1','truck','TEST-1','source_id','TEST-1-A','address','測試站一','stop_order',1,'time','06:30','end_time','06:35'),
 jsonb_build_object('member_id',one,'service_date','2099-11-02','shift','day','village','復華里','route_id','TEST-DAY-1','truck','TEST-1','source_id','TEST-1-B','address','測試站二','stop_order',2,'time','06:50','end_time','06:55'),
 jsonb_build_object('member_id',two,'service_date','2099-11-02','shift','day','village','勝利里','route_id','TEST-DAY-2','truck','TEST-2','source_id','TEST-2-A','address','測試站三','stop_order',1,'time','07:00','end_time','07:05'));
 result:=public.achang_assign_route_batch(batch,items);
 if (result->>'createdCount')::int<>3 or (result->>'allocationCount')::int<>0 then raise exception 'batch creation assertion failed';end if;
 if (select count(*) from public.assignments where member_id in(one,two))<>2 then raise exception 'assignment grouping assertion failed';end if;
 if not exists(select 1 from public.visit_tasks where member_id=one and stop_order=1 and scheduled_at='2099-11-02T06:30:00+08:00') then raise exception 'Taiwan time assertion failed';end if;
 again:=public.achang_assign_route_batch(batch,items);
 if result<>again or (select count(*) from public.visit_tasks where member_id in(one,two))<>3 then raise exception 'same-batch idempotency assertion failed';end if;
 again:=public.achang_assign_route_batch(gen_random_uuid(),items);
 if (again->>'createdCount')::int<>0 or (again->>'reusedCount')::int<>3 then raise exception 'existing-task idempotency assertion failed';end if;
 if exists(select 1 from public.service_allocations where member_id in(one,two)) then raise exception 'service-area allocation must remain unchanged';end if;
 -- Cancellation hides only one station allocation and preserves the original task.
 select id into task_id from public.visit_tasks where member_id=one and stop_order=1;
 cancellation:=jsonb_build_array(jsonb_build_object('action','remove','task_id',task_id,'member_id',one,'service_date','2099-11-02','shift','day','route_id','TEST-DAY-1'));
 again:=public.achang_assign_route_batch(cancellation_batch,cancellation);
 if (again->>'removedCount')::int<>1 or not exists(select 1 from public.visit_tasks where id=task_id and cancelled_at is not null) or (select count(*) from public.visit_tasks where member_id=one)<>2 then raise exception 'station cancellation assertion failed';end if;
 result:=public.achang_assign_route_batch(cancellation_batch,cancellation);
 if result<>again then raise exception 'cancellation retry assertion failed';end if;
 begin
  perform public.achang_assign_route_batch(gen_random_uuid(),jsonb_build_array(cancellation->0,(items->0)||jsonb_build_object('route_id','CONFLICT-OTHER-ROUTE')));
  raise exception 'expected mixed cancellation conflict missing';
 exception when unique_violation then null;
 end;
 -- Re-adding restores the same task identity and original history.
 again:=public.achang_assign_route_batch(gen_random_uuid(),jsonb_build_array(items->0));
 if exists(select 1 from public.visit_tasks where id=task_id and cancelled_at is not null) or (select count(*) from public.visit_tasks where member_id=one)<>2 then raise exception 'restore task identity assertion failed';end if;
 -- Choosing or replacing a vehicle leader reuses existing tasks and leaves service areas alone.
 again:=public.achang_assign_route_batch(gen_random_uuid(),jsonb_build_array((items->0)||jsonb_build_object('is_route_leader',true)));
 if (again->>'createdCount')::int<>0 or not exists(select 1 from public.assignments where member_id=one and is_route_leader) then raise exception 'leader save assertion failed';end if;
 again:=public.achang_assign_route_batch(gen_random_uuid(),jsonb_build_array((items->0)||jsonb_build_object('member_id',three,'is_route_leader',true)));
 if exists(select 1 from public.assignments where member_id=one and is_route_leader) or not exists(select 1 from public.assignments where member_id=three and is_route_leader) then raise exception 'leader replacement assertion failed';end if;
 -- Remove this disposable third crew member so the rollback test below starts clean.
 delete from public.visit_tasks where member_id=three;
 delete from public.assignments where member_id=three;
 if exists(select 1 from public.service_allocations where member_id in(one,two,three)) then raise exception 'leader must not change service areas';end if;
 select count(*) into before_count from public.route_assignment_batches;
 begin
  perform public.achang_assign_route_batch(gen_random_uuid(),jsonb_build_array((items->0)||jsonb_build_object('member_id',three),(items->0)||jsonb_build_object('route_id','CONFLICT-OTHER-ROUTE')));
  raise exception 'expected route conflict missing';
 exception when unique_violation then null;
 end;
 if exists(select 1 from public.assignments where member_id=three) or exists(select 1 from public.service_allocations where member_id=three) or (select count(*) from public.route_assignment_batches)<>before_count then raise exception 'whole-batch rollback assertion failed';end if;
 begin
  perform public.achang_assign_route_batch(batch,items||jsonb_build_array(items->0));raise exception 'expected changed-payload rejection missing';
 exception when unique_violation then null;
 end;
 -- Three crew members across all 130 stations fit in one atomic confirmation.
 select jsonb_agg(jsonb_build_object('member_id',mid,'service_date','2099-11-02','shift','night','village','復華里','route_id','TEST-NIGHT-FULL','truck','TEST-FULL','source_id','FULL-'||n,'address','測試站'||n,'stop_order',n,'time','16:30','end_time','16:31')) into large_items from (values(one),(two),(three)) crew(mid) cross join generate_series(1,130)n;
 again:=public.achang_assign_route_batch(gen_random_uuid(),large_items);
 if (again->>'createdCount')::int<>390 then raise exception 'full-route capacity assertion failed';end if;
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
 begin
  perform public.achang_assign_route_batch(gen_random_uuid(),items);raise exception 'expected non-admin rejection missing';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
select 'PASS: multi-route commit, pending-member allocation without changing service areas, retry idempotency, source/time identity, full rollback, role denial, vehicle leader replacement, station cancellation and restoration; fixtures rolled back' as verification;
