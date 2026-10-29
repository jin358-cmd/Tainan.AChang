(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.AChangDayRoutes=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const WEEKDAYS=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
 const ALLOWED=new Set(['星期三','星期五']);
 const timeValue=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||''))?String(value):'';
 function weekdayForDate(value){
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));if(!match)return'';
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),parsed=new Date(Date.UTC(year,month-1,day));
  if(parsed.getUTCFullYear()!==year||parsed.getUTCMonth()!==month-1||parsed.getUTCDate()!==day)return'';
  return WEEKDAYS[parsed.getUTCDay()];
 }
 function normalize(document){
  const routes=Array.isArray(document?.routes)?document.routes:[];
  return routes.map((source,index)=>{
   const weekday=String(source?.weekday||'').trim(),start=timeValue(source?.start),end=timeValue(source?.end);
   const name=String(source?.name||'').trim(),route=String(source?.route||'').trim();
   const id=String(source?.id||`DAY-${weekday}-${route}-${index+1}`).trim(),reasons=[];
   if(!ALLOWED.has(weekday))reasons.push('星期待確認');
   if(!start)reasons.push('開始時間待確認');
   if(!name)reasons.push('站名待確認');
   if(!route)reasons.push('路線待確認');
   if(source?.review_required===true)reasons.push('來源衝突待核');
   return {id,weekday,route,name,start,end,sourceOrder:index+1,enabled:reasons.length===0,pendingReasons:reasons,reviewNote:String(source?.review_note||'').trim()};
  });
 }
 function stopsForDate(document,date){
  const weekday=weekdayForDate(date),catalog=normalize(document);
  const serviceNotice=String(document?.service_notice||'').trim();
  const exception=Array.isArray(document?.service_exceptions)?document.service_exceptions.find(row=>row?.date===date&&row?.closed===true):null;
  const pending=catalog.filter(row=>!row.enabled&&(!ALLOWED.has(weekday)||row.weekday===weekday));
  if(!ALLOWED.has(weekday)||exception)return {weekday,stops:[],pending,serviceNotice,closedReason:exception?String(exception.reason||'當日停收').trim():''};
  const active=catalog.filter(row=>row.enabled&&row.weekday===weekday).sort((a,b)=>a.start.localeCompare(b.start)||a.sourceOrder-b.sourceOrder);
  const routeOrder=new Map();
  const stops=active.map(row=>{
   const order=(routeOrder.get(row.route)||0)+1;routeOrder.set(row.route,order);
   return {'時段':'日間','車次':`日間 ${row.route}線`,'車牌':'','路線ID':`DAY:${row.weekday}:${row.route}`,'站點ID':row.id,
    '里別':'','固定日間':true,'清運次序':order,'停靠點原文':row.name,'Google地圖定位地址':'','到達':row.start,'離開':row.end,
    '適用星期':row.weekday,'來源順序':row.sourceOrder,'定位狀態':'未提供座標，不顯示地圖站點','備註':'週三／週五固定日間來源'};
  });
  return {weekday,stops,pending,serviceNotice,closedReason:''};
 }
 return {weekdayForDate,normalize,stopsForDate};
});
