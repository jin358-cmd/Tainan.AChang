(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.AChangCandidatePlan=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const address=r=>String(r['停靠點原文']||'').trim();
const minute=s=>{const m=String(s||'').match(/^(\d{1,2}):(\d{2})/);return m&&+m[1]<24&&+m[2]<60?+m[1]*60+(+m[2]):null;};
function build(rows,{area,count=5,workers=2,objective='population_households',position=()=>null,excluded=()=>false}={}){
if(!area||!Number.isInteger(workers)||workers<1||workers>50)throw Error('請選服務里，志工人數須為 1～50 的整數');
const pool=[],seen=new Set();let skipped=0;
for(const r of rows){if(r['里別']!==area||r['固定日間'])continue;const a=address(r),key=[r['時段'],r['車次'],a,r['到達']].join('|');if(excluded(r)||!a||!/[路街巷廟市場]/.test(a)){skipped++;continue;}if(seen.has(key))continue;seen.add(key);pool.push({row:r,address:a,position:position(r),time:minute(r['到達']),route:r['路線ID']||r['車次']||'',id:'C'+pool.length});}
if(objective==='safety')pool.sort((a,b)=>Number(!!b.position)-Number(!!a.position)||Number(/號/.test(b.address))-Number(/號/.test(a.address)));
if(objective==='coverage'){const groups=new Map();pool.forEach(s=>{if(!groups.has(s.route))groups.set(s.route,[]);groups.get(s.route).push(s)});pool.length=0;while([...groups.values()].some(g=>g.length))for(const g of groups.values())if(g.length)pool.push(g.shift());}
const chosen=pool.slice(0,Math.min(10,Math.max(1,Number(count)||5)));const slots=Array.from({length:workers},()=>[]);
chosen.forEach((s,index)=>{let slot=slots.findIndex(items=>items.every(x=>x.row['時段']!==s.row['時段']||(s.time!==null&&x.time!==null&&Math.abs(x.time-s.time)>=15)));s.conflict=slot<0;if(slot<0)slot=index%workers;s.worker=slot+1;slots[slot].push(s);s.reason=objective==='coverage'?'按不同車次輪替，增加路線覆蓋':objective==='safety'?'優先座標與門牌完整度；現場安全仍須確認':'同里共用人口／戶數背景，依來源站序列候選；不推算各站人潮';});
return {area,workers,objective,pool,chosen,skipped,total:pool.length};
}
return {build,minute};});
