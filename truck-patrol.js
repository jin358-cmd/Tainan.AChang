(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.AChangTruckPatrol=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const areas=['復華里','勝利里','中華里','復國里','中興里'];
const catalog=[
 {shift:'日間',route:'日間1',capacity:7,dbid:'6611032668'},
 {shift:'日間',route:'日間4',capacity:7,dbid:'6731144554'},
 {shift:'夜間',route:'夜間11',capacity:4,dbid:'6351489598'},
 {shift:'夜間',route:'夜間1',capacity:4,dbid:'6231338909'},
 {shift:'夜間',route:'夜間8',capacity:4,dbid:'6971391937'},
 {shift:'夜間',route:'夜間35',capacity:4,dbid:null},
 {shift:'夜間',route:'夜間22',capacity:5,dbid:'6971338935'}
];
const text=value=>String(value??'').trim();
function eligible(people){const seen=new Set();return (people||[]).filter(p=>{const id=text(p.id),name=text(p.name);if(!id||!name||/^[@＠]/u.test(name)||seen.has(id))return false;seen.add(id);return true;});}
function links(item){if(!item.dbid)return null;const base='https://hwms.moenv.gov.tw/dispPageBox/route/routeCP.aspx?dbid='+item.dbid+'&ddsPageID=';return {info:base+'LINEINFO',map:base+'LINEPIC'};}
function build(rows,people){
 const volunteers=eligible(people),used=new Set();
 const groups=catalog.map(item=>{
  const full=(rows||[]).filter(r=>r['時段']===item.shift&&r['車次']===item.route&&!r['固定日間']);
  const stops=full.filter(r=>areas.includes(text(r['里別']))&&!r['來源刪除線']);
  const plates=[...new Set(full.map(r=>text(r['車牌'])).filter(Boolean))];
  const villages=[...new Set(stops.map(r=>text(r['里別'])))];
  const chosen=volunteers.filter(p=>!used.has(p.id)).slice(0,item.capacity);chosen.forEach(p=>used.add(p.id));
  return {...item,stops,plates,villages,people:chosen,links:links(item)};
 });
 return {groups,total:volunteers.length,excluded:(people||[]).filter(p=>/^[@＠]/u.test(text(p.name))).length,waiting:volunteers.filter(p=>!used.has(p.id))};
}
return {areas,catalog,eligible,links,build};
});
