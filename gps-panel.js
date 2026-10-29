(()=>{
'use strict';
const panel=document.getElementById('achangGpsPanel');
if(!panel)return;
const status=panel.querySelector('[data-gps-status]');
const list=panel.querySelector('[data-gps-vehicles]');
const clean=v=>String(v??'');
let vehicleMarkers=[];
function drawMap(items){
 for(const m of vehicleMarkers){try{m.remove()}catch{}}vehicleMarkers=[];
 const map=window.achangGpsMap?.();if(!map||!window.maplibregl)return;
 for(const v of items.filter(x=>x.live)){
  const el=document.createElement('div');el.textContent='🚛';el.title='垃圾車 '+(v.car||'')+'｜'+v.time;
  el.style.cssText='font-size:25px;filter:drop-shadow(0 1px 3px #444);cursor:pointer';
  const marker=new window.maplibregl.Marker({element:el}).setLngLat([v.longitude,v.latitude]).addTo(map);
  vehicleMarkers.push(marker);
 }
}
function draw(items){
  list.replaceChildren();drawMap(items);
  for(const v of items){
    const row=document.createElement('div');row.className='gps-vehicle-row';
    const a=document.createElement('a');a.target='_blank';a.rel='noopener noreferrer';
    a.href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(v.latitude+','+v.longitude);
    a.textContent=(v.car||'未提供車牌')+' · '+(v.location||'位置未知')+' · GPS '+(v.time||'未知')+' · '+(v.live?'近期回報':'過期資料');
    row.append(a);list.append(row);
  }
}
async function refresh(){
  try{
    const res=await fetch('/api/gps',{cache:'no-store'});
    const data=await res.json();
    if(!res.ok||data.status!=='ok')throw Error(clean(data.reason||'上游無法讀取'));
    draw(data.vehicles||[]);
    status.textContent='資料取得時間：'+new Date(data.retrievedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})+
      '｜永康區近期 GPS：'+data.liveCount+' 輛；非即時者不得當作行駛中。';
  }catch(error){
    draw([]);status.textContent='GPS 尚未連通官方有效 JSON：'+clean(error.message)+'。未顯示任何假位置。';
  }
}
panel.querySelector('[data-gps-refresh]').addEventListener('click',refresh);
refresh();
setInterval(()=>{if(!document.hidden)refresh()},30000);
})();