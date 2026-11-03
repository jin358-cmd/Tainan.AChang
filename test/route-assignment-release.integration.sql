-- Reproduce the reported cancelled-route collision with disposable records only.
begin;
select set_config('request.jwt.claims',(select json_build_object('sub',auth_user_id,'role','authenticated')::text from public.member_accounts where role='admin' and status='active' limit 1),true);
set local role authenticated;
do $$
declare person uuid;old_assignment uuid;new_assignment uuid;first_task uuid;second_task uuid;new_task uuid;items jsonb;remove_one jsonb;remove_two jsonb;new_item jsonb;result jsonb;before_count bigint;
begin
 insert into public.members(display_name,source_member_id) values('__route_release_fixture','TEST-ROUTE-RELEASE') returning id into person;
 items:=jsonb_build_array(jsonb_build_object('member_id',person,'service_date','2099-11-07','shift','day','village','大橋里','route_id','TEST-OLD','truck','TEST-OLD','address','原站一','stop_order',1,'time','06:30','end_time','06:31'),jsonb_build_object('member_id',person,'service_date','2099-11-07','shift','day','village','大橋里','route_id','TEST-OLD','truck','TEST-OLD','address','原站二','stop_order',2,'time','06:40','end_time','06:41'));
 perform public.achang_assign_route_batch(gen_random_uuid(),items);
 select id into old_assignment from public.assignments where member_id=person and route_id='TEST-OLD';
 select id into first_task from public.visit_tasks where assignment_id=old_assignment and stop_order=1;
 select id into second_task from public.visit_tasks where assignment_id=old_assignment and stop_order=2;
 remove_one:=jsonb_build_object('action','remove','member_id',person,'service_date','2099-11-07','shift','day','route_id','TEST-OLD','task_id',first_task);
 remove_two:=remove_one||jsonb_build_object('task_id',second_task);
 perform public.achang_assign_route_batch(gen_random_uuid(),jsonb_build_array(remove_one));
 if exists(select 1 from public.assignments where id=old_assignment and released_at is not null) then raise exception 'partial cancellation released an occupied shift';end if;
 perform public.achang_assign_route_batch(gen_random_uuid(),jsonb_build_array(remove_two));
 if not exists(select 1 from public.assignments where id=old_assignment and released_at is not null) then raise exception 'last cancellation did not release the shift';end if;
 new_item:=(items->0)||jsonb_build_object('route_id','TEST-NEW','truck','TEST-NEW','address','新站一');
 result:=public.achang_assign_route_batch(gen_random_uuid(),jsonb_build_array(new_item));
 if (result->>'createdCount')::int<>1 then raise exception 'reassignment failed after releasing old route';end if;
 select id into new_assignment from public.assignments where member_id=person and route_id='TEST-NEW';
 select id into new_task from public.visit_tasks where assignment_id=new_assignment;
 select count(*) into before_count from public.route_assignment_batches;
 begin
  perform public.achang_assign_route_batch(gen_random_uuid(),jsonb_build_array(items->0));raise exception 'expected active-route conflict missing';
 exception when unique_violation then null;
 end;
 if (select count(*) from public.route_assignment_batches)<>before_count or not exists(select 1 from public.visit_tasks where id=first_task and cancelled_at is not null) then raise exception 'rejected restore changed saved history';end if;
 -- Remove the replacement and restore the original task in the same atomic batch.
 result:=public.achang_assign_route_batch(gen_random_uuid(),jsonb_build_array(remove_one||jsonb_build_object('route_id','TEST-NEW','task_id',new_task),items->0));
 if (result->>'removedCount')::int<>1 or (result->>'reusedCount')::int<>1 then raise exception 'atomic reassignment did not restore original task';end if;
 if not exists(select 1 from public.visit_tasks where id=first_task and cancelled_at is null) or not exists(select 1 from public.assignments where id=new_assignment and released_at is not null) then raise exception 'restoration identity or release mismatch';end if;
 if (select count(*) from public.assignments where member_id=person and released_at is null)<>1 then raise exception 'more than one active daytime reservation';end if;
 -- The database trigger also protects a direct task restoration outside the RPC.
 begin
  update public.visit_tasks set cancelled_at=null where id=new_task;raise exception 'direct duplicate reservation was allowed';
 exception when unique_violation then null;
 end;
 perform public.achang_assign_route_batch(gen_random_uuid(),jsonb_build_array(new_item||jsonb_build_object('shift','night')));
 if (select count(*) from public.assignments where member_id=person and released_at is null)<>2 then raise exception 'independent day/night reservations failed';end if;
end $$;
rollback;
select 'PASS: partial/full cancellation, released-route reassignment, active conflict, atomic switch, original task identity, direct-write duplicate guard and separate day/night; fixtures rolled back' as verification;
