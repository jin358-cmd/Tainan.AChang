'use strict';
const official=require('../official-routes');
const day=require('../data-official-day-20261030.source.json'),night=require('../data-official-night-20261030.source.json');
const AREAS=['復興里','建國里','成功里','光復里','神洲里','勝利里','中興里','復國里','中華里','復華里'];
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
 if(!Array.isArray(items)||items.length<1||items.length>300)L.problem(400,'分配草稿須為1至300筆');
 const overlays=await L.rest('route_stop_overlays?status=eq.active&select=id,shift,route_token,vehicle,area,stop_name,start_time,end_time,display_order,status,created_at',actor.token),stops=catalog(L.need(overlays,'站點資料查核失敗'));
 const cleaned=items.map(item=>{
  const row=stops.get(item.stopId);if(!row||row.來源刪除線)L.problem(400,'選定站點已不存在或不開放分配');
  const mid=L.uuid(item.volunteerId),date=L.validDate(item.date),area=L.checkText(item.area,'服務里',30);if(!AREAS.includes(area))L.problem(400,'請選擇有效服務里');
  if(new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)L.problem(400,'日期不合法');
  const time=L.time(row.到達),end=/^([01]\d|2[0-3]):[0-5]\d$/.test(row.離開||'')&&row.離開>=time?row.離開:time;
  return {member_id:mid,source_id:row.站點ID,service_date:date,village:area,shift:row.時段==='日間'?'day':'night',route_id:row.路線ID,truck:row.車牌,address:row.停靠點原文,stop_order:row._taskOrder,time,end_time:end};
 });
 const result=await L.rest('rpc/achang_assign_route_batch',actor.token,{method:'POST',body:{p_batch_id:batchId,p_items:cleaned}});
 if(!result.ok){const message=result.data?.message||'批次分配未完成，草稿已保留';L.problem(result.data?.code==='42501'?403:result.data?.code==='23505'?409:result.data?.code==='22023'?400:502,message);}
 return result.data;
}
module.exports={catalog,saveBatch};
