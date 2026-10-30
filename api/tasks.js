'use strict';
const crypto=require('node:crypto'),L=require('../lib/server');
const AREAS=['復興里','建國里','成功里','光復里','神洲里','勝利里','中興里','復國里','中華里','復華里'];
const statusMap={incomplete:'待訪',in_progress:'進行中',completed:'完成'},eventMap={'待訪':'reopened','進行中':'started','完成':'completed'};
const shiftMap={'日間':'day','夜間':'night'};
const hhmm=value=>String(value||'').slice(0,5);
const earlier=(left,right)=>!left?right:!right?left:left<right?left:right;
const later=(left,right)=>!left?right:!right?left:left>right?left:right;
async function loadAll(token){const [a,t]=await Promise.all([L.rest('assignments?select=*&limit=2000&order=service_date.asc',token),L.rest('visit_tasks?select=*&limit=3000&order=stop_order.asc',token)]);const asign=L.need(a,'跟巡任務讀取失敗'),tasks=L.need(t,'站點狀態讀取失敗'),byId=new Map(asign.map(x=>[x.id,x]));return tasks.map(x=>{
 const p=byId.get(x.assignment_id);if(!p)return null;
 return {id:x.id,volunteer_id:x.member_id,visit_date:p.service_date,shift:p.shift==='day'?'日間':'夜間',area:p.village,route_id:p.route_id||p.truck_number||'',truck:p.truck_number||'',stop_address:x.visit_address,eta:x.scheduled_at?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(x.scheduled_at)):String(p.starts_at||'').slice(0,5),stop_order:x.stop_order,status:statusMap[x.status]||'待訪',server_version:x.server_version,updated_at:x.updated_at,completed_at:x.completed_at}
 }).filter(Boolean)}
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET','POST','PATCH','DELETE']);const p=await L.authorized(req,res,['admin','volunteer']);
 if(req.method==='GET'){
  if(req.query?.groupArea){
    const area=String(req.query.groupArea).trim();
    if(!AREAS.includes(area))L.problem(400,'里別無效');
    if(p.role!=='volunteer')L.problem(403,'僅供志工查看自己所屬小組');
    const r=await L.rest('rpc/achang_group_contacts',p.token,{method:'POST',body:{requested_village:area}});
    return L.json(res,200,{people:L.need(r,'小組成員讀取失敗')});
  }
  return L.json(res,200,{tasks:await loadAll(p.token)});
 }
 const b=L.body(req);
 if(req.method==='POST'){
  if(p.role!=='admin')L.problem(403,'志工不能指定排班');
  const mid=L.uuid(b.volunteerId),village=L.checkText(b.area,'里別',30),d=L.validDate(b.date),sh=shiftMap[b.shift];
  const truck=String(b.truck||'').trim();if(truck.length>30)L.problem(400,'車號過長');
  const routeId=L.checkText(b.routeId||truck,'路線 ID',80),routeEnd=b.routeEnd?L.time(b.routeEnd):null;
  const source=Array.isArray(b.stops)?b.stops:[{address:b.address,time:b.time,stopOrder:b.stopOrder}];
  if(source.length<1||source.length>30)L.problem(400,'每組需含 1 至 30 個巡點');
  const cleaned=source.map(x=>({visit_address:L.checkText(x.address,'巡點地址',240),time:L.time(x.time),stop_order:Math.max(1,Math.min(9999,Math.floor(Number(x.stopOrder)||1)))}));
  if(new Set(cleaned.map(x=>x.stop_order)).size!==cleaned.length)L.problem(400,'同班次巡點順序不得重複');
  const arrival=cleaned[0].time;
  if(!AREAS.includes(village)||!sh)L.problem(400,'里別或時段無效');
  const alloc=await L.rest('service_allocations?member_id=eq.'+mid+'&village=eq.'+encodeURIComponent(village)+'&select=member_id&limit=1',p.token);if(!L.need(alloc,'分派里別查核失敗').length)L.problem(400,'請先分派志工到對應服務里');
  const existingResult=await L.rest('assignments?member_id=eq.'+mid+'&service_date=eq.'+d+'&shift=eq.'+sh+'&select=*&limit=2',p.token),existing=L.need(existingResult,'既有排班查核失敗')[0];
  if(existing){
   if(existing.village!==village||String(existing.route_id||existing.truck_number||'')!==routeId)L.problem(409,'同日同時段此志工已有其他跟巡排班');
   const taskResult=await L.rest('visit_tasks?assignment_id=eq.'+existing.id+'&select=id,visit_address,stop_order,scheduled_at&order=stop_order.asc',p.token),current=L.need(taskResult,'既有巡點查核失敗');
   const byOrder=new Map(current.map(row=>[Number(row.stop_order),row])),add=[];
   for(const row of cleaned){const found=byOrder.get(row.stop_order);if(found){if(found.visit_address!==row.visit_address)L.problem(409,'同一路線巡點次序與既有資料衝突');continue}add.push(row)}
   if(!add.length)return L.json(res,200,{ok:true,taskIds:current.filter(row=>cleaned.some(item=>item.stop_order===Number(row.stop_order)&&item.visit_address===row.visit_address)).map(row=>row.id),reused:true});
   const records=add.map(x=>({assignment_id:existing.id,member_id:mid,visit_address:x.visit_address,stop_order:x.stop_order,scheduled_at:`${d}T${x.time}:00+08:00`,status:'incomplete'}));
   const oldStart=hhmm(existing.starts_at),oldEnd=hhmm(existing.ends_at),newEnd=routeEnd||cleaned.at(-1).time;
   const update=await L.rest('assignments?id=eq.'+existing.id,p.token,{method:'PATCH',body:{starts_at:earlier(oldStart,arrival),ends_at:later(oldEnd,newEnd),updated_at:new Date().toISOString()}});
   L.need(update,'排班時間更新失敗');
   const visit=await L.rest('visit_tasks?select=id',p.token,{method:'POST',headers:{Prefer:'return=representation'},body:records});
   if(!visit.ok){await L.rest('assignments?id=eq.'+existing.id,p.token,{method:'PATCH',body:{starts_at:oldStart||null,ends_at:oldEnd||null,updated_at:new Date().toISOString()}});if(visit.status===409)L.problem(409,'巡點已由其他操作加入，請重新讀取');L.problem(502,'巡點建立失敗，已回復排班時間')}
   return L.json(res,201,{ok:true,taskIds:(visit.data||[]).map(x=>x.id),reused:true});
  }
  const ass=await L.rest('assignments?select=id',p.token,{method:'POST',headers:{Prefer:'return=representation'},body:{member_id:mid,service_date:d,shift:sh,village,route_id:routeId,truck_number:truck||null,starts_at:arrival,ends_at:routeEnd}});
  if(!ass.ok){if(ass.status===409)L.problem(409,'同日同時段此志工已有跟巡排班');L.problem(502,'新建排班失敗')}
  const id=ass.data?.[0]?.id;if(!id)L.problem(502,'排班資料未取得 ID');
  const records=cleaned.map(x=>({assignment_id:id,member_id:mid,visit_address:x.visit_address,stop_order:x.stop_order,scheduled_at:`${d}T${x.time}:00+08:00`,status:'incomplete'}));
  const visit=await L.rest('visit_tasks?select=id',p.token,{method:'POST',headers:{Prefer:'return=representation'},body:records});
  if(!visit.ok){await L.rest('assignments?id=eq.'+id,p.token,{method:'DELETE'});L.problem(502,'巡點建立失敗，已回復排班')}
  return L.json(res,201,{ok:true,taskIds:(visit.data||[]).map(x=>x.id)});
 }
 const id=L.uuid(b.id),task=await L.getOne('visit_tasks',id,p.token);if(!task)L.problem(404,'找不到站點或無權存取');
 if(req.method==='DELETE'){
  if(p.role!=='admin')L.problem(403,'只有管理員能取消排班');
  if(b.scope==='stop'){
   if(task.status!=='incomplete')L.problem(409,'已開始或完成的站點不可直接解除，請保留任務紀錄');
   const rows=L.need(await L.rest('visit_tasks?assignment_id=eq.'+task.assignment_id+'&select=id,status&order=stop_order.asc',p.token),'同路線站點查核失敗');
   if(!rows.some(row=>row.id===id))L.problem(409,'站點資料已變更，請重新整理');
   if(rows.length===1){const removed=await L.rest('assignments?id=eq.'+task.assignment_id,p.token,{method:'DELETE'});L.need(removed,'解除最後一個站點失敗');return L.json(res,200,{ok:true,scope:'stop',assignmentRetained:false})}
   const removed=await L.rest('visit_tasks?id=eq.'+id,p.token,{method:'DELETE'});L.need(removed,'解除站點指派失敗');return L.json(res,200,{ok:true,scope:'stop',assignmentRetained:true});
  }
  const r=await L.rest('assignments?id=eq.'+task.assignment_id,p.token,{method:'DELETE'});L.need(r,'取消排班失敗');return L.json(res,200,{ok:true,scope:'route'});
 }
 if(p.role==='volunteer'&&p.member_id!==task.member_id)L.problem(403,'不可回報其他人的任務');
 const ev=eventMap[b.status];if(!ev)L.problem(400,'站點狀態不合法');if(p.role==='volunteer'&&ev!=='completed')L.problem(403,'志工只可以回報已完成');
 const payload={id:crypto.randomUUID(),task_id:id,member_id:task.member_id,event_type:ev,base_version:task.server_version,server_version:task.server_version+1,client_created_at:new Date().toISOString()};
 const r=await L.rest('task_events?select=id,server_version',p.token,{method:'POST',headers:{Prefer:'return=representation'},body:payload});if(!r.ok)L.problem(r.status===409?409:502,'更新未成功，請重新讀取任務後再試');return L.json(res,200,{ok:true,serverVersion:r.data?.[0]?.server_version})
});
