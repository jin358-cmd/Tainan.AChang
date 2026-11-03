-- A single authenticated administrator request commits the complete allocation draft.
create table public.route_assignment_batches (
 id uuid primary key,
 actor_user_id uuid not null references auth.users(id),
 request jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.route_assignment_batches enable row level security;
create policy route_assignment_batches_admin_select on public.route_assignment_batches for select to authenticated using ((select app_private.is_admin()));
create policy route_assignment_batches_admin_insert on public.route_assignment_batches for insert to authenticated with check ((select app_private.is_admin()) and actor_user_id=(select auth.uid()));
revoke all on public.route_assignment_batches from anon,authenticated;
grant select,insert on public.route_assignment_batches to authenticated;

create function public.achang_assign_route_batch(p_batch_id uuid,p_items jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 item jsonb; mid uuid; day date; sh text; v_village text; route text; ord integer;
 start_time time; end_time time; scheduled timestamptz; existing_area text; assignment public.assignments%rowtype; task public.visit_tasks%rowtype;
 previous public.route_assignment_batches%rowtype; result jsonb; ids jsonb:='[]'::jsonb; added integer:=0; reused integer:=0; allocated integer:=0;
begin
 if auth.uid() is null or not app_private.is_admin() then raise exception using errcode='42501',message='只有管理員可以確認分配'; end if;
 if p_batch_id is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 300 then raise exception using errcode='22023',message='分配草稿須為1至300筆'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_batch_id::text,0));
 select * into previous from public.route_assignment_batches where id=p_batch_id;
 if found then
  if previous.actor_user_id<>auth.uid() or previous.request<>p_items then raise exception using errcode='23505',message='確認編號已使用，請重新確認草稿'; end if;
  return previous.result;
 end if;
 -- Acquire member locks in a stable order, serializing concurrent allocation batches.
 perform m.id from public.members m where m.id in (select (x->>'member_id')::uuid from jsonb_array_elements(p_items)x) order by m.id for update;
 for item in select value from jsonb_array_elements(p_items) loop
  mid:=(item->>'member_id')::uuid;day:=(item->>'service_date')::date;sh:=item->>'shift';v_village:=item->>'village';route:=item->>'route_id';ord:=(item->>'stop_order')::integer;
  if not exists(select 1 from public.members m where m.id=mid and m.deleted_at is null and coalesce(m.source_member_id,'') not like 'ADMIN-%' and coalesce(m.source_member_id,'') not like 'ARCHIVED-%' and btrim(m.display_name) !~ '^[@＠]' and btrim(m.display_name) not in ('陳中原','陳中新','露西','PMOS管理員')) then raise exception using errcode='22023',message='人員已停用或不在可分配名冊'; end if;
  if sh is null or sh not in ('day','night') or v_village is null or length(v_village) not between 1 and 30 or route is null or length(route) not between 1 and 80 or ord is null or ord not between 1 and 9999 or day is null or length(coalesce(item->>'address','')) not between 1 and 240 or coalesce(item->>'time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(item->>'end_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception using errcode='22023',message='分配資料格式不正確'; end if;
  start_time:=(item->>'time')::time;end_time:=(item->>'end_time')::time;
  if end_time<start_time then raise exception using errcode='22023',message='站點結束時間早於到站時間'; end if;
  select s.village into existing_area from public.service_allocations s where s.member_id=mid;
  if found and existing_area<>v_village then raise exception using errcode='23505',message='服務里已變更，請重新載入人員清單'; end if;
  -- Service-area changes remain in the existing personnel allocation module.
  if exists(select 1 from public.assignments a where a.member_id=mid and a.service_date=day and a.shift=sh and (a.village<>v_village or coalesce(a.route_id,a.truck_number,'')<>route)) then raise exception using errcode='23505',message='同日同時段此志工已安排其他車次，整批未儲存'; end if;
  insert into public.assignments(member_id,service_date,shift,village,route_id,truck_number,starts_at,ends_at) values(mid,day,sh,v_village,route,nullif(item->>'truck',''),start_time,end_time) on conflict(member_id,service_date,shift,village,route_id) do nothing;
  select * into assignment from public.assignments a where a.member_id=mid and a.service_date=day and a.shift=sh and a.village=v_village and a.route_id=route for update;
  if assignment.id is null then raise exception using errcode='42501',message='無法建立排班'; end if;
  scheduled:=(day+start_time) at time zone 'Asia/Taipei';
  select * into task from public.visit_tasks t where t.assignment_id=assignment.id and t.stop_order=ord;
  if found then
   if task.member_id<>mid or task.visit_address<>item->>'address' or task.scheduled_at is distinct from scheduled then raise exception using errcode='23505',message='巡點順序與現有任務不同，整批未儲存'; end if;
   reused:=reused+1;
  else
   insert into public.visit_tasks(assignment_id,member_id,visit_address,stop_order,scheduled_at,status) values(assignment.id,mid,item->>'address',ord,scheduled,'incomplete') returning * into task;
   added:=added+1;
  end if;
  update public.assignments a set starts_at=least(coalesce(a.starts_at,start_time),start_time),ends_at=greatest(coalesce(a.ends_at,end_time),end_time) where a.id=assignment.id;
  ids:=ids||jsonb_build_array(task.id);
 end loop;
 result:=jsonb_build_object('ok',true,'batchId',p_batch_id,'taskIds',ids,'createdCount',added,'reusedCount',reused,'allocationCount',allocated);
 insert into public.route_assignment_batches(id,actor_user_id,request,result) values(p_batch_id,auth.uid(),p_items,result);
 return result;
end $$;
revoke all on function public.achang_assign_route_batch(uuid,jsonb) from public,anon;
grant execute on function public.achang_assign_route_batch(uuid,jsonb) to authenticated;
