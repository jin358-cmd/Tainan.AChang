(()=>{'use strict';
if(new URLSearchParams(location.search).has('embedded'))document.body.classList.add('embedded');
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const codes={'日間2':'D71010001','日間5':'D71010002','日間6':'D71010003','日間4':'D71010004','日間3':'D71020005','夜間2':'D71020006','夜間6':'D71020007','夜間10':'D71020008','夜間9':'D71020009','夜間11':'D71020010','夜間15':'D71020011','夜間19':'D71020012','夜間26':'D71020013','夜間28':'D71020014','夜間30':'D71020015','夜間31':'D71020016','夜間32':'D71020017','夜間35':'D71020018','夜間37':'D71020019','夜間38':'D71020020','夜間40':'D71020021','夜間42':'D71020022','夜間23':'D71020023','夜間1':'D71020024','夜間8':'D71020025','夜間18':'D71020026','夜間22':'D71020027','夜間25':'D71020028','夜間33':'D71020029','日間1':'D71020030'};
let groups=[],active=null;
function updateProgress(){
 if(!active||$('detail').hidden)return;
 const progress=window.AChangDispatchView.routeProgress(active.rows),labels={past:'已過表定時間',next:'下一站',upcoming:'尚未到站',unverified:'原表刪除線或時間待核'};
 $('routeDiagram').querySelectorAll('.stop-number').forEach((number,i)=>{const state=progress.states[i];number.dataset.progress=state;number.title=`第${i+1}站：${labels[state]}`;number.setAttribute('aria-label',number.title);});
 $('routeProgressClock').textContent=`臺灣時間 ${progress.day} ${progress.hhmm}｜依表定到站時間，每30秒更新`;
}
function renderDirectoryTimeOptions(rows){
 const legal=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||''));
 const source=rows||groups.filter(g=>!$('shift').value||g.shift===$('shift').value).flatMap(g=>g.rows);
 const times=[...new Set(source.filter(r=>!r._extras?.['刪除線']).map(r=>String(r['到達時間']||'').trim()).filter(legal))].sort();
 for(const id of ['directoryStartTime','directoryEndTime']){const select=$(id),selected=select.value||'',options=[...new Set([...times,...($('shift').value==='夜間'?['16:30','18:30']:[]),...(legal(selected)?[selected]:[])])].sort();select.innerHTML='<option value="">全部時段</option>'+options.map(value=>`<option value="${value}">${value}${value===times[0]?'（最早）':value===times.at(-1)?'（最晚）':''}</option>`).join('');select.value=selected;}
}
function matchesDirectoryTime(row,start,end){
 if(!start&&!end)return true;
 if(row._extras?.['刪除線'])return false;
 const time=String(row['到達時間']||'').trim();
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return false;
 return start&&end&&start>end?time>=start||time<=end:(!start||time>=start)&&(!end||time<=end);
}
function filteredDirectoryRows(g){return g.rows.filter(r=>matchesDirectoryTime(r,$('directoryStartTime').value,$('directoryEndTime').value))}
function filterDirectory(){renderList();if(active)openRoute(active.route,{keepWindow:true,syncMap:false});}
function renderList(){const q=$('search').value.trim().toLowerCase(),s=$('shift').value,start=$('directoryStartTime').value,end=$('directoryEndTime').value,shown=groups.filter(g=>(!s||g.shift===s)&&(!q||[g.route,g.plate,g.code,...g.villages,...g.rows.map(r=>r['站點名稱／地址'])].join(' ').toLowerCase().includes(q))&&g.rows.some(r=>matchesDirectoryTime(r,start,end)));$('vehicles').innerHTML=shown.map(g=>`<tr data-open="${esc(g.route)}" tabindex="0" aria-label="查看${esc(g.route)}完整路線"><td><strong class="route-name ${g.shift==='日間'?'day-route':'night-route'}"><span aria-hidden="true">${g.shift==='日間'?'☀':'☾'}</span>${esc(g.route)}</strong></td><td>${esc(g.plate||'未提供')}</td><td>${esc(g.code)}</td><td>${g.code.startsWith('D7101')?'定點清運':'沿線清運（不落地）'}</td><td>${filteredDirectoryRows(g).length}</td><td><button class="route-open" data-open="${esc(g.route)}">查看完整路線</button></td></tr>`).join('')||'<tr><td colspan="6">沒有符合的車次</td></tr>';$('resultCount').textContent=`${shown.length}／${groups.length} 車次${start||end?`｜到站時間 ${start||'不限'}～${end||'不限'}`:''}`;}
function connectors(){const root=$('routeDiagram');if(root.hidden||!active)return;root.querySelector('.connector')?.remove();const bounds=root.getBoundingClientRect(),nodes=[...root.querySelectorAll('.stop-number')],points=nodes.map(n=>{const b=n.getBoundingClientRect();return {x:b.left-bounds.left+b.width/2,y:b.top-bounds.top+b.height/2};}),arrows=points.slice(1).map((point,i)=>{const from=points[i],dx=point.x-from.x,dy=point.y-from.y,distance=Math.hypot(dx,dy),length=Math.min(90,Math.max(48,distance-150)),midX=(from.x+point.x)/2,midY=(from.y+point.y)/2,left=midX-length/2*dx/distance,top=midY-length/2*dy/distance,angle=Math.atan2(dy,dx)*180/Math.PI;return `<span class="route-direction" style="left:${left}px;top:${top}px;width:${length}px;transform:rotate(${angle}deg)"></span>`;}).join('');root.insertAdjacentHTML('afterbegin',`<div class="connector" aria-hidden="true">${arrows}</div>`);}
function openRoute(name,options={}){
 const source=groups.find(g=>g.route===name);if(!source)return;
 renderDirectoryTimeOptions(source.rows);
 if(source.shift==='日間'&&!options.keepWindow&&!$('directoryStartTime').value&&!$('directoryEndTime').value){
  const times=source.rows.filter(r=>!r._extras?.['刪除線']).map(r=>String(r['到達時間']||'').trim()).filter(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t)).sort();
  $('directoryStartTime').value=times[0]||'';$('directoryEndTime').value=times.at(-1)||'';
 }
 const selected=new Set(filteredDirectoryRows(source));
 const g={...source,rows:source.rows.map((r,i)=>({...r,_directoryOrder:i+1})).filter((r,i)=>selected.has(source.rows[i]))};active=g;
 $('directory').hidden=!(document.body.classList.contains('map-route-desktop'));$('detail').hidden=false;
 $('routeTitle').textContent=`${g.route}｜${g.plate||'車牌未提供'}｜區間 ${g.rows.length}／${source.rows.length} 站`;
 renderList();
let html='';for(let i=0;i<g.rows.length;i+=3){html+=`<div class="route-row ${Math.floor(i/3)%2?'reverse':''}">`+g.rows.slice(i,i+3).map((r,j)=>{const address=r['站點名稱／地址']||'未提供站名';return `<article class="route-stop ${r._extras?.['刪除線']?'struck':''}"><time>${esc(r['到達時間']||'時間待核')}</time><span class="stop-number">${r._directoryOrder}</span><a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('臺南市永康區'+address)}">${esc(address)}</a><small>${esc(r['里別'])}｜原表序號 ${esc(r['站點序號'])}<br>清運：${esc(r['清運星期']||'未提供')}</small></article>`}).join('')+'</div>';}$('routeDiagram').innerHTML=html||'<p class="empty" role="status">此車次在選定時段內沒有站點。</p>';
$('routeTable').innerHTML='<table><thead><tr><th>順序／原表序號</th><th>時間</th><th>里別</th><th>站點</th><th>清運／回收</th></tr></thead><tbody>'+g.rows.map((r,i)=>`<tr><td>${r._directoryOrder}／${esc(r['站點序號'])}</td><td>${esc(r['到達時間'])}</td><td>${esc(r['里別'])}</td><td>${esc(r['站點名稱／地址'])}${r._extras?.['刪除線']?'（原表刪除線）':''}</td><td>${esc(r['清運星期'])}／${esc(r['資源回收星期'])}</td></tr>`).join('')+'</tbody></table>';updateProgress();setTab('diagram');document.dispatchEvent(new CustomEvent('achang:directory-route',{detail:{route:name,syncMap:options.syncMap!==false}}));history.replaceState(null,'','#'+encodeURIComponent(name));window.scrollTo(0,0);}
function setTab(tab){const both=document.body.classList.contains('map-route-desktop');$('routeDiagram').hidden=!both&&tab!=='diagram';$('routeTable').hidden=!both&&tab!=='list';$('diagramTab').setAttribute('aria-pressed',String(tab==='diagram'));$('listTab').setAttribute('aria-pressed',String(tab==='list'));requestAnimationFrame(connectors);}
$('shift').onchange=()=>{active=null;$('detail').hidden=true;$('directory').hidden=false;renderDirectoryTimeOptions();const night=$('shift').value==='夜間';$('directoryStartTime').value=night?'16:30':'';$('directoryEndTime').value=night?'18:30':'';filterDirectory()};$('search').oninput=filterDirectory;$('directoryStartTime').onchange=filterDirectory;$('directoryEndTime').onchange=filterDirectory;$('vehicles').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){const row=e.target.closest('tr[data-open]');if(row){e.preventDefault();openRoute(row.dataset.open)}}};$('vehicles').onclick=e=>{const b=e.target.closest('[data-open]');if(b)openRoute(b.dataset.open)};$('back').onclick=()=>{$('detail').hidden=true;$('directory').hidden=false;history.replaceState(null,'',location.pathname);window.scrollTo(0,0)};$('diagramTab').onclick=()=>setTab('diagram');$('listTab').onclick=()=>setTab('list');$('print').onclick=()=>window.print();window.addEventListener('resize',connectors);
window.AChangRouteDirectory={openRoute,activeRoute:()=>active?.route||''};setInterval(updateProgress,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateProgress();});window.addEventListener('focus',updateProgress);
(async()=>{try{for(const [file,shift] of [['data-official-day-20261030.source.json','日間'],['data-official-night-20261030.source.json','夜間']]){const response=await fetch(file);if(!response.ok)throw Error('HTTP '+response.status);const rows=await response.json(),map=new Map();for(const r of rows){const route=String(r['車次']||'');if(!map.has(route))map.set(route,{route,shift,plate:r['車牌']||'',code:codes[route]||'未提供',rows:[],villages:[]});map.get(route).rows.push(r);}for(const g of map.values()){g.villages=[...new Set(g.rows.map(r=>r['里別']).filter(Boolean))];groups.push(g);}}groups.sort((a,b)=>window.AChangDispatchView.compareRoutes(a.route,b.route));if(groups.length!==30)throw Error('來源車次數與30車不符');renderDirectoryTimeOptions();renderList();$('loadStatus').textContent='已載入30車完整來源站序。';const name=decodeURIComponent(location.hash.slice(1));if(name)openRoute(name);}catch(e){$('loadStatus').textContent='路線載入失敗：'+e.message;}})();
})();


