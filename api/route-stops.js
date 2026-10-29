'use strict';
const L=require('../lib/server');

const allowedActions=new Set(['create','archive','restore']);

module.exports=L.run(async(req,res)=>{
 L.method(req,['GET','POST','PATCH']);
 const actor=await L.authorized(req,res,['admin']);
 if(req.method==='GET'){
  const result=await L.rest('route_stop_overlays?select=id,shift,route_token,vehicle,area,stop_name,start_time,end_time,display_order,status,position_before_source_id,created_at,archived_at&order=shift.asc,route_token.asc,display_order.asc,created_at.asc',actor.token);
  return L.json(res,200,{stops:L.need(result,'自訂站點讀取失敗')});
 }
 const body=L.body(req),action=String(body.action||'');
 if(!allowedActions.has(action))L.problem(400,'不支援的站點操作');
 const payload={
  p_action:action,
  p_id:body.id?L.uuid(body.id):null,
  p_shift:body.shift===undefined?null:L.checkText(body.shift,'時段',10),
  p_route_token:body.routeToken===undefined?null:L.checkText(body.routeToken,'車次',80),
  p_vehicle:body.vehicle===undefined?null:L.checkText(String(body.vehicle||''),'車牌',40,true),
  p_area:body.area===undefined?null:L.checkText(body.area,'里別',30),
  p_stop_name:body.stopName===undefined?null:L.checkText(body.stopName,'站點名稱',240),
  p_start_time:body.startTime===undefined?null:L.time(body.startTime),
  p_end_time:body.endTime===undefined?null:L.time(body.endTime),
  p_display_order:body.displayOrder===undefined?null:Math.floor(Number(body.displayOrder)),
  p_position_before_source_id:body.positionBeforeSourceId===undefined?null:L.checkText(String(body.positionBeforeSourceId||''),'來源站點 ID',100,true)
 };
 if(action==='create'&&(!Number.isInteger(payload.p_display_order)||payload.p_display_order<1||payload.p_display_order>9999))L.problem(400,'站點順序須為 1 至 9999');
 const result=await L.rest('rpc/achang_route_stop_overlay_mutate',actor.token,{method:'POST',body:payload});
 const rows=L.need(result,'站點資料未能儲存');
 return L.json(res,action==='create'?201:200,{stop:Array.isArray(rows)?rows[0]:rows});
});
