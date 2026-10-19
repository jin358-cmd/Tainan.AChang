'use strict';
const crypto=require('node:crypto'),L=require('../lib/server');
const AREAS=['復興里','建國里','成功里','光復里','神洲里','勝利里','中興里','復國里','中華里','復華里'];
const statusMap={incomplete:'待訪',in_progress:'進行中',completed:'完成'},eventMap={'待訪':'reopened','進行中':'started','完成':'completed'};
const shiftMap={'日間':'day','夜間':'night'};
async function loadAll(token){const [a,t]=await Promise.all([L.rest('assignments?select=*&limit=2000&order=service_date.asc',token),L.rest('visit_tasks?select=*&limit=3000&order=stop_order.asc',token)]);const asign=L.need(a,'跟巡任務讀取失敗'),tasks=L.need(t,'站點狀態讀取失敗'),byId=new Map(asign.map(x=>[x.id,x]));return tasks.map(x=>{
 const p=byId.get(x.assignment_id);if(!p)return null;
 return {id:x.id,volunteer_id:x.member_id,visit_date:p.service_date,shift:p.shift==='day'?'日間':'夜間',area:p.village,truck:p.truck_number||'',stop_address:x.visit_address,eta:x.scheduled_at?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(x.scheduled_at)):String(p.starts_at||'').slice(0,5),stop_order:x.stop_order,status:statusMap[x.status]||'待訪',server_version:x.server_version,updated_at:x.updated_at,completed_at:x.completed_at}
 }).filter(Boolean)}
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET','POST','PATCH','DELETE']);const p=await L.authorized(req,res,['admin','volunteer']);
 if(req.method==='GET')return L.json(res,200,{tasks:await loadAll(p.token)});
 const b=L.body(req);
 if(req.method==='POST'){
  if(p.role!=='admin')L.problem(403,'志工不能指定排班');
  const mid=L.uuid(b.volunteerId),village=L.checkText(b.area,'里別',30),d=L.validDate(b.date),sh=shiftMap[b.shift],truck=L.checkText(b.truck,'車號',30),address=L.checkText(b.address,'巡點地址',240),arrival=L.time(b.time),order=Math.max(1,Math.min(9999,Math.floor(Number(b.stopOrder)||1)));
  if(!AREAS.includes(village)||!sh)L.problem(400,'里別或時段無效');
  const member=await L.getOne('members',mid,p.token);if(!member||L.internalMember(member))L.problem(400,'管理員內部身分不得作為跟巡志工');
  const alloc=await L.rest('service_allocations?member_id=eq.'+mid+'&village=eq.'+encodeURIComponent(village)+'&select=member_id&limit=1',p.token);if(!L.need(alloc,'分派里別查核失敗').length)L.problem(400,'請先分派志工到對應服務里');
  const ass=await L.rest('assignments?select=id',p.token,{method:'POST',headers:{Prefer:'return=representation'},body:{member_id:mid,service_date:d,shift:sh,village,route_id:truck,truck_number:truck,starts_at:arrival}});
  if(!ass.ok){if(ass.status===409)L.problem(409,'同日同時段此志工已有跟巡排班');L.problem(502,'新建排班失敗')}
  const id=ass.data?.[0]?.id;if(!id)L.problem(502,'排班資料未取得 ID');
  const visit=await L.rest('visit_tasks?select=id',p.token,{method:'POST',headers:{Prefer:'return=representation'},body:{assignment_id:id,member_id:mid,visit_address:address,stop_order:order,scheduled_at:`${d}T${arrival}:00+08:00`,status:'incomplete'}});
  if(!visit.ok){await L.rest('assignments?id=eq.'+id,p.token,{method:'DELETE'});L.problem(502,'站點建立失敗，已回復排班')}
  return L.json(res,201,{ok:true,taskId:visit.data?.[0]?.id});
 }
 const id=L.uuid(b.id),task=await L.getOne('visit_tasks',id,p.token);if(!task)L.problem(404,'找不到站點或無權存取');
 if(req.method==='DELETE'){if(p.role!=='admin')L.problem(403,'只有管理員能取消排班');const r=await L.rest('assignments?id=eq.'+task.assignment_id,p.token,{method:'DELETE'});L.need(r,'取消排班失敗');return L.json(res,200,{ok:true})}
 if(p.role==='volunteer'&&p.member_id!==task.member_id)L.problem(403,'不可回報其他人的任務');
 const ev=eventMap[b.status];if(!ev)L.problem(400,'站點狀態不合法');if(p.role==='volunteer'&&ev!=='completed')L.problem(403,'志工只可以回報已完成');
 const eventId=b.eventId?L.uuid(b.eventId):crypto.randomUUID(),baseVersion=Number.isSafeInteger(Number(b.baseVersion))&&Number(b.baseVersion)>=0?Number(b.baseVersion):Number(task.server_version)||0,clientCreatedAt=b.clientCreatedAt&&Number.isFinite(Date.parse(b.clientCreatedAt))?new Date(b.clientCreatedAt).toISOString():new Date().toISOString();
 const payload={id:eventId,task_id:id,member_id:task.member_id,event_type:ev,base_version:baseVersion,server_version:baseVersion+1,client_created_at:clientCreatedAt};
 const r=await L.rest('task_events?select=id,task_id,member_id,event_type,server_version',p.token,{method:'POST',headers:{Prefer:'return=representation'},body:payload});
 if(!r.ok){const prior=await L.rest('task_events?id=eq.'+eventId+'&select=id,task_id,member_id,event_type,server_version&limit=1',p.token),seen=prior.ok?prior.data?.[0]:null;if(seen&&seen.task_id===id&&seen.member_id===task.member_id&&seen.event_type===ev)return L.json(res,200,{ok:true,idempotent:true,serverVersion:seen.server_version});if(r.status===409||r.data?.code==='40001')L.problem(409,'任務已在其他裝置更新，請重新讀取後再試');L.problem(502,'更新未成功，請稍後重試')}
 return L.json(res,200,{ok:true,idempotent:false,serverVersion:r.data?.[0]?.server_version})
});
