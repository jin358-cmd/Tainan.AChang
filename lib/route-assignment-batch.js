'use strict';
const official=require('../official-routes');
const day=require('../data-official-day-20261030.source.json'),night=require('../data-official-night-20261030.source.json');
function catalog(overlays=[]){
 const rows=[...official.normalize(day,'日間'),...official.normalize(night,'夜間')],groups=new Map();
 for(const row of rows){const key=row.路線ID;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 for(const group of groups.values()){
  const first=group[0],additions=overlays.filter(x=>x.status==='active'&&x.shift===first.時段&&x.route_token===first.車次&&(x.vehicle||'')===first.車牌).sort((a,b)=>a.display_order-b.display_order||String(a.created_at).localeCompare(String(b.created_at)));
  for(const x of additions)group.splice(Math.min(Math.max(x.display_order-1,0),group.length),0,{時段:x.shift,車次:x.route_token,車牌:x.vehicle||'',路線ID:first.路線ID,站點ID:'OVERLAY:'+x.id,停靠點原文:x.stop_name,到達:String(x.start_time).slice(0,5),離開:String(x.end_time).slice(0,5),里別:x.area});
  group.forEach((row,index)=>row._taskOrder=index+1);
 }
 return new Map([...groups.values()].flat().map(row=>[row.站點ID,row]));
}
async function saveBatch(body,actor,L){
 const batchId=L.uuid(body.batchId),items=body.items;
 if(!Array.isArray(items)||items.length<1||items.length>1000)L.problem(400,'分配草稿須為1至1000筆');
 const overlays=await L.rest('route_stop_overlays?status=eq.active&select=id,shift,route_token,vehicle,area,stop_name,start_time,end_time,display_order,status,created_at',actor.token),stops=catalog(L.need(overlays,'站點資料查核失敗'));
 const allocations=await L.rest('service_allocations?select=member_id,village&limit=2000',actor.token),areas=new Map(L.need(allocations,'服務分區讀取失敗').map(x=>[x.member_id,x.village]));
 const existing=await L.rest('assignments?select=id,member_id,service_date,shift,route_id,village&limit=3000',actor.token),assignments=L.need(existing,'既有車次分配讀取失敗'),routeAreas=new Map(assignments.map(x=>[[x.member_id,x.service_date,x.shift,x.route_id].join('|'),x.village]));
 const removalIds=[...new Set(items.filter(x=>x.action==='remove').map(x=>L.uuid(x.taskId)))];
 const removals=removalIds.length?L.need(await L.rest('visit_tasks?id=in.('+removalIds.join(',')+')&select=id,assignment_id,member_id',actor.token),'移除配員查核失敗'):[];
 const cleaned=items.map(item=>{
  if(item.action==='remove'){
   const task=removals.find(x=>x.id===item.taskId),assignment=assignments.find(x=>x.id===task?.assignment_id);
   if(!task||!assignment||assignment.member_id!==task.member_id)L.problem(409,'配員紀錄已變更，請重新讀取');
   return {action:'remove',task_id:task.id,member_id:task.member_id,service_date:assignment.service_date,shift:assignment.shift,route_id:assignment.route_id};
  }
  const row=stops.get(item.stopId);if(!row||row.來源刪除線)L.problem(400,'選定站點已不存在或不開放分配');
  const mid=L.uuid(item.volunteerId),date=L.validDate(item.date),group=[mid,date,row.時段==='日間'?'day':'night',row.路線ID].join('|'),area=L.checkText(areas.get(mid)||routeAreas.get(group)||row.里別,'站點里別',30);routeAreas.set(group,area);
  if(new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)L.problem(400,'日期不合法');
  const time=L.time(row.到達),end=/^([01]\d|2[0-3]):[0-5]\d$/.test(row.離開||'')&&row.離開>=time?row.離開:time;
  return {member_id:mid,source_id:row.站點ID,service_date:date,village:area,shift:row.時段==='日間'?'day':'night',route_id:row.路線ID,truck:row.車牌,address:row.停靠點原文,stop_order:row._taskOrder,time,end_time:end,...(item.isRouteLeader===true?{is_route_leader:true}:{})};
 });
 const result=await L.rest('rpc/achang_assign_route_batch',actor.token,{method:'POST',body:{p_batch_id:batchId,p_items:cleaned}});
 if(!result.ok){const message=result.data?.message||'批次分配未完成，草稿已保留';L.problem(result.data?.code==='42501'?403:result.data?.code==='23505'?409:result.data?.code==='22023'?400:502,message);}
 return result.data;
}
module.exports={catalog,saveBatch};
