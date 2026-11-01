(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.AChangDispatchView=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const AREA_ORDER=['復華里','勝利里','中華里','中興里','復國里','神洲里','復興里','建國里','光復里','成功里'];
 const area=value=>String(value||'').trim().replace('神州里','神洲里');
 function sortPeople(people){return [...people].map((p,i)=>({p,i})).sort((a,b)=>{
  const ai=AREA_ORDER.indexOf(area(a.p.assignment)),bi=AREA_ORDER.indexOf(area(b.p.assignment));return (ai<0?999:ai)-(bi<0?999:bi)||a.i-b.i;
 }).map(x=>x.p);}
 function routeRank(value){const v=String(value||'').replace(/\s/g,''),m=/^(日間|夜間)0*(\d+)/.exec(v);if(m)return (m[1]==='夜間'?10000:0)+Number(m[2]);return v.includes('A線')?100:v.includes('B線')?101:20000;}
 function compareRoutes(a,b){return routeRank(a)-routeRank(b)||String(a).localeCompare(String(b),'zh-Hant');}
 function clock(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));const day=`${p.year}-${p.month}-${p.day}`;
  return {day,hhmm:`${p.hour}:${p.minute}`,minutes:Number(p.hour)*60+Number(p.minute),weekday:'日一二三四五六'[new Date(day+'T12:00:00+08:00').getUTCDay()]};
 }
 function minutes(value){const m=/^(\d{2}):(\d{2})$/.exec(String(value||''));return m&&Number(m[1])<24&&Number(m[2])<60?Number(m[1])*60+Number(m[2]):null;}
 function runsToday(row,now=new Date()){
  if(row._assignedToday)return true;
  const days=String(row['垃圾日']||row._serviceDays||row['適用星期']||'');return /每日|每天/.test(days)||days.includes(clock(now).weekday);
 }
 function sortStops(rows){return [...rows].map((r,i)=>({r,i})).sort((a,b)=>compareRoutes(a.r['車次'],b.r['車次'])||
  Number(a.r._displayIndex??a.r['來源順序']??a.r['清運次序']??a.i)-Number(b.r._displayIndex??b.r['來源順序']??b.r['清運次序']??b.i)||a.i-b.i).map(x=>x.r);}
 function nextStops(rows,now=new Date(),limit=4){const current=clock(now).minutes;return sortStops(rows).filter(r=>{
  if(r['來源刪除線']||!runsToday(r,now))return false;const start=minutes(r['到達']??r.time),end=minutes(r['離開']);
  return start!==null&&(start>=current||(end!==null&&end>=start&&end>=current));
 }).slice(0,limit);}
 function routeProgress(rows,now=new Date()){
  const current=clock(now),times=rows.map(r=>r._extras?.['刪除線']?null:minutes(r['到達時間']));
  let nextIndex=-1;
  times.forEach((time,i)=>{if(time!==null&&time>=current.minutes&&(nextIndex<0||time<times[nextIndex]))nextIndex=i;});
  return {...current,nextIndex,states:times.map((time,i)=>time===null?'unverified':time<current.minutes?'past':i===nextIndex?'next':'upcoming')};
 }
 function taskMatchesStop(task,row,serviceDate){
  if(task.visit_date!==serviceDate||task.shift!==row['時段']||(task.route_id||task.truck||'')!==(row['路線ID']||row['車牌']||'')||task.stop_address!==row['停靠點原文'])return false;
  return task.stop_order===undefined||task.stop_order===null||row['清運次序']===''||Number(task.stop_order)===Number(row._taskOrder??row['清運次序']);
 }
 return {AREA_ORDER,area,sortPeople,compareRoutes,clock,runsToday,sortStops,nextStops,routeProgress,taskMatchesStop};
});
