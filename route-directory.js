(()=>{'use strict';
if(new URLSearchParams(location.search).has('embedded'))document.body.classList.add('embedded');
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const codes={'日間2':'D71010001','日間5':'D71010002','日間6':'D71010003','日間4':'D71010004','日間3':'D71020005','夜間2':'D71020006','夜間6':'D71020007','夜間10':'D71020008','夜間9':'D71020009','夜間11':'D71020010','夜間15':'D71020011','夜間19':'D71020012','夜間26':'D71020013','夜間28':'D71020014','夜間30':'D71020015','夜間31':'D71020016','夜間32':'D71020017','夜間35':'D71020018','夜間37':'D71020019','夜間38':'D71020020','夜間40':'D71020021','夜間42':'D71020022','夜間23':'D71020023','夜間1':'D71020024','夜間8':'D71020025','夜間18':'D71020026','夜間22':'D71020027','夜間25':'D71020028','夜間33':'D71020029','日間1':'D71020030'};
let groups=[],active=null,liveRows=null,expandedRoute=null;
function applyLiveRows(){if(!liveRows)return;for(const group of groups){const rows=liveRows.filter(row=>row.車次===group.route&&row.時段===group.shift);if(!rows.length)continue;group.rows=rows.map(row=>({...(row.來源原文||{}),車次:row.車次,車牌:row.車牌,站點序號:row.原始站點序號||row.清運次序,到達時間:row.到達,"站點名稱／地址":row.停靠點原文,里別:row.里別,清運星期:row.垃圾日,資源回收星期:row.回收日,_mapStopId:row.站點ID,_extras:{...(row.來源原文?._extras||{}),離開時間:row.離開,刪除線:row.來源刪除線===true}}));}}
function updateProgress(){
 if(!active||$('detail').hidden)return;
 const progress=window.AChangDispatchView.routeProgress(active.rows),labels={past:'已過表定時間',next:'下一站',upcoming:'尚未到站',unverified:'原表刪除線或時間待核'};
 $('routeDiagram').querySelectorAll('.stop-number').forEach((number,i)=>{const state=progress.states[i];number.dataset.progress=state;number.title=`第${number.textContent.trim()}站：${labels[state]}`;number.setAttribute('aria-label',number.title);});
 if(expandedRoute===active.route){const source=groups.find(g=>g.route===active.route),full=window.AChangDispatchView.routeProgress(source.rows);$('routeFullDiagram').querySelectorAll('.stop-number').forEach((number,i)=>{number.dataset.progress=full.states[i];});}
 $('routeProgressClock').textContent=`臺灣時間 ${progress.day} ${progress.hhmm}｜依表定到站時間，每30秒更新`;
}
function renderDirectoryTimeOptions(rows){
 const legal=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||''));
 const source=rows||groups.filter(g=>!$('shift').value||g.shift===$('shift').value).flatMap(g=>g.rows);
 const times=[...new Set(source.filter(r=>!r._extras?.['刪除線']).map(r=>String(r['到達時間']||'').trim()).filter(legal))].sort();
 const preset=defaultDirectoryTimeWindow($('shift').value);
 for(const id of ['directoryStartTime','directoryEndTime']){const select=$(id),selected=select.value||'',options=[...new Set([...times,...[preset.start,preset.end].filter(legal),...(legal(selected)?[selected]:[])])].sort();select.innerHTML='<option value="">全部時段</option>'+options.map(value=>`<option value="${value}">${directoryTimeOptionLabel(value,id,times)}</option>`).join('');select.value=selected;}
}
function defaultDirectoryTimeWindow(shift){return shift==='日間'?{start:'06:15',end:'07:50'}:shift==='夜間'?{start:'16:30',end:'18:30'}:{start:'',end:''};}
function directoryTimeOptionLabel(value,id,times){
 const shift=$('shift').value,preset=defaultDirectoryTimeWindow(shift),isStart=id==='directoryStartTime';
 if(shift==='日間'&&isStart&&value===preset.start)return value+'（預設）';
 if(value===(isStart?preset.start:preset.end))return value+'（預設）';
 return value+(value===times[0]?'（最早）':value===times.at(-1)?'（最晚）':'');
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
function renderList(){document.querySelectorAll?.('[data-directory-shift]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.directoryShift===$('shift').value)));document.dispatchEvent(new CustomEvent('achang:route-time-filter',{detail:{shift:$('shift').value,start:$('directoryStartTime').value,end:$('directoryEndTime').value}}));const q=$('search').value.trim().toLowerCase(),s=$('shift').value,start=$('directoryStartTime').value,end=$('directoryEndTime').value,shown=groups.filter(g=>(!s||g.shift===s)&&(!q||[g.route,g.plate,g.code,...g.villages,...g.rows.map(r=>r['站點名稱／地址'])].join(' ').toLowerCase().includes(q))&&g.rows.some(r=>matchesDirectoryTime(r,start,end)));$('vehicles').innerHTML=shown.map(g=>`<tr data-open="${esc(g.route)}" tabindex="0" aria-label="查看${esc(g.route)}完整路線"><td><strong class="route-name ${g.shift==='日間'?'day-route':'night-route'}"><span aria-hidden="true">${g.shift==='日間'?'☀':'☾'}</span>${esc(g.route)}</strong></td><td>${esc(g.plate||'未提供')}</td><td>${esc(g.code)}</td><td>${g.code.startsWith('D7101')?'定點清運':'沿線清運（不落地）'}</td><td>${filteredDirectoryRows(g).length}</td><td><button class="route-open" data-open="${esc(g.route)}">查看完整路線</button></td></tr>`).join('')||'<tr><td colspan="6">沒有符合的車次</td></tr>';$('resultCount').textContent=`${s?s+'：':''}第${String(shown.length).padStart(2,'0')}/${groups.length}車次${start||end?`｜到站 ${start||'不限'}～${end||'不限'}`:''}`;}
function connectors(){for(const id of ['routeDiagram','routeFullDiagram']){const root=$(id);if(root.hidden||id==='routeFullDiagram'&&$('routeFullContent').hidden||!active)continue;connectDiagram(root);}}
function connectDiagram(root){root.querySelector('.connector')?.remove();const bounds=root.getBoundingClientRect(),nodes=[...root.querySelectorAll('.stop-number')],points=nodes.map(n=>{const b=n.getBoundingClientRect();return {x:b.left-bounds.left+b.width/2,y:b.top-bounds.top+b.height/2};}),arrows=points.slice(1).map((point,i)=>{const from=points[i],dx=point.x-from.x,dy=point.y-from.y,distance=Math.hypot(dx,dy),length=Math.min(90,Math.max(48,distance-150)),midX=(from.x+point.x)/2,midY=(from.y+point.y)/2,left=midX-length/2*dx/distance,top=midY-length/2*dy/distance,angle=Math.atan2(dy,dx)*180/Math.PI;return `<span class="route-direction" style="left:${left}px;top:${top}px;width:${length}px;transform:rotate(${angle}deg)"></span>`;}).join('');root.insertAdjacentHTML('afterbegin',`<div class="connector" aria-hidden="true">${arrows}</div>`);}
function stationCards(rows,route){let html='';for(let i=0;i<rows.length;i+=3){html+=`<div class="route-row ${Math.floor(i/3)%2?'reverse':''}">`+rows.slice(i,i+3).map(r=>{const address=r['站點名稱／地址']||'未提供站名',disabled=r._extras?.['刪除線']||!/^([01]\d|2[0-3]):[0-5]\d$/.test(r['到達時間']||'');return `<article class="route-stop ${r._extras?.['刪除線']?'struck':''}" data-assign-stop="${esc(r._mapStopId||'')}" data-assign-route="${esc(route)}" role="button" tabindex="${disabled?'-1':'0'}" aria-disabled="${Boolean(disabled)}" aria-pressed="false" aria-label="${esc(route)}第${r._directoryOrder}站 ${esc(address)}，分配人員"><time>${esc(r['到達時間']||'時間待核')}</time><button type="button" class="stop-number" data-focus-stop="${esc(r._mapStopId||'')}" data-focus-route="${esc(route)}" aria-label="定位第${r._directoryOrder}站 ${esc(address)}">${r._directoryOrder}</button><a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('臺南市永康區'+address)}">${esc(address)}</a><small>${esc(r['里別'])}｜原表序號 ${esc(r['站點序號'])}<br>🗑️ 清運：${esc(r['清運星期']||'未提供')}<br>♻️ 回收：${esc(r['資源回收星期']||'未提供')}</small></article>`}).join('')+'</div>';}return html;}
function stationTable(rows){return '<table><thead><tr><th>順序</th><th>時間</th><th>里別</th><th>站點</th><th>🗑️ 清運／♻️ 回收</th></tr></thead><tbody>'+rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r['到達時間'])}</td><td>${esc(r['里別'])}</td><td>${esc(r['站點名稱／地址'])}${r._extras?.['刪除線']?'（原表刪除線）':''}</td><td><span class="service-day">🗑️ ${esc(r['清運星期']||'未提供')}</span><span class="service-day">♻️ ${esc(r['資源回收星期']||'未提供')}</span></td></tr>`).join('')+'</tbody></table>';}
function renderFullRoute(){
 const holder=$('routeFullContent'),button=$('routeFullToggle'),source=groups.find(g=>g.route===active?.route),open=!!source&&expandedRoute===source.route;
 holder.hidden=!open;button.setAttribute('aria-expanded',String(open));button.textContent=open?'▾ 收合全部完整路線':'▸ 查看全部完整路線';
 if(open){$('routeFullDiagram').innerHTML=stationCards(source.rows.map((r,i)=>({...r,_directoryOrder:i+1})),source.route);$('routeFullTable').innerHTML=stationTable(source.rows);}else{$('routeFullDiagram').innerHTML='';$('routeFullTable').innerHTML='';}
}
function assignRoute(){if(active)document.dispatchEvent(new CustomEvent('achang:assign-route',{detail:{route:active.route,stopIds:active.rows.filter(r=>!r._extras?.['刪除線']).map(r=>r._mapStopId)}}));}
function selectCard(event){const card=event.target.closest('[data-assign-stop]');if(!card||card.getAttribute('aria-disabled')==='true'||event.target.closest('.route-person-chip button'))return;if(event.type==='keydown'){if(event.target!==card||!['Enter',' '].includes(event.key))return;}event.preventDefault();const route=card.dataset.assignRoute,all=event.type==='dblclick',stopIds=all?groups.find(g=>g.route===route)?.rows.filter(r=>!r._extras?.['刪除線']&&/^([01]\d|2[0-3]):[0-5]\d$/.test(r['到達時間']||'')).map(r=>r._mapStopId):undefined;document.dispatchEvent(new CustomEvent('achang:focus-route-stop',{detail:{id:card.dataset.assignStop,route,all,stopIds}}));}
function openRoute(name,options={}){
 const source=groups.find(g=>g.route===name);if(!source)return;if(active&&active.route!==name)expandedRoute=null;
 renderDirectoryTimeOptions(source.rows);
 if(source.shift==='日間'&&!options.keepWindow&&!$('directoryStartTime').value&&!$('directoryEndTime').value){
  const times=source.rows.filter(r=>!r._extras?.['刪除線']).map(r=>String(r['到達時間']||'').trim()).filter(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t)).sort();
  $('directoryStartTime').value=times[0]||'';$('directoryEndTime').value=times.at(-1)||'';
 }
 const selected=new Set(filteredDirectoryRows(source));
 const g={...source,rows:source.rows.map((r,i)=>({...r,_directoryOrder:i+1})).filter((r,i)=>selected.has(source.rows[i]))};active=g;
 $('directory').hidden=false;$('detail').hidden=false;
 $('routeTitle').textContent=`${g.route}｜${g.plate||'車牌未提供'}｜區間 ${g.rows.length}／${source.rows.length} 站`;
 renderList();
$('routeDiagram').innerHTML=stationCards(g.rows,g.route)||'<p class="empty" role="status">此車次在選定時段內沒有站點。</p>';
$('routeTable').innerHTML=stationTable(g.rows);renderFullRoute();updateProgress();setTab('diagram');document.dispatchEvent(new CustomEvent('achang:directory-route',{detail:{route:name,syncMap:options.syncMap!==false}}));history.replaceState(null,'','#'+encodeURIComponent(name));if(options.reveal!==false&&!options.keepWindow&&!document.body.classList.contains('map-route-desktop'))$('detail').scrollIntoView?.({block:'start',behavior:'smooth'});}
async function printActiveRoute(){
 if(!active||$('print').disabled)return;
 const button=$('print'),buttonLabel=button.textContent,snapshot={...active,rows:[...active.rows]},start=$('directoryStartTime').value,end=$('directoryEndTime').value;
 const diagram=$('routeDiagram').cloneNode(true),table=$('routeTable').cloneNode(true),titleText=$('routeTitle').textContent;
 let status=$('routePrintStatus');if(!status){status=document.createElement('p');status.id='routePrintStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');$('detail').querySelector('.detail-head').after(status);}
 button.disabled=true;button.textContent='準備清晰地圖…';status.textContent='正在準備選定時段的列印地圖…';
 try{
 document.getElementById('routePrintSurface')?.remove();
 const sheet=document.createElement('article');sheet.id='routePrintSurface';sheet.className='route-print-surface route-print-preparing truck-directory-host';
 const title=document.createElement('h1');title.textContent=titleText;
 const stationCrew=[...diagram.querySelectorAll('.route-stop')].map(card=>[...card.querySelectorAll('.route-person-chip[data-member-id]')].map(chip=>({id:chip.dataset.memberId,name:chip.dataset.memberName,leader:chip.dataset.routeLeader==='true'})));
 const common=window.AChangRoutePrint?.commonCrew(stationCrew)||[];
 if(common.length){const names=document.createElement('p');names.className='route-print-crew';names.textContent='（'+common.map(person=>(person.leader?'👑 ':'')+person.name).join('，')+'）';sheet.append(title,names);diagram.querySelectorAll('.route-assigned-people').forEach(box=>box.remove());}else sheet.append(title);
 const windowLabel=document.createElement('p');windowLabel.textContent=`選定到站時段：${start||'不限'}～${end||'不限'}｜站點 ${snapshot.rows.length} 站`;
 sheet.append(windowLabel);
 const mapTitle=document.createElement('h2');mapTitle.textContent='選定時段地圖路徑';sheet.append(mapTitle);
 const svg=await window.AChangRouteMapPrint?.(snapshot.route,{start,end,stopIds:snapshot.rows.map(row=>row._mapStopId)});
 if(svg){
  sheet.append(svg);
 }else{const note=document.createElement('p');note.textContent='此車次尚無可列印的已核對地圖座標。';sheet.append(note);}
 const diagramTitle=document.createElement('h2');diagramTitle.textContent='選定時段路線圖';sheet.append(diagramTitle);
 diagram.removeAttribute('id');diagram.hidden=false;diagram.querySelector('.connector')?.remove();sheet.append(diagram);
 const tableTitle=document.createElement('h2');tableTitle.textContent='選定時段完整站點列表';sheet.append(tableTitle);
 table.removeAttribute('id');table.hidden=false;sheet.append(table);
 document.body.append(sheet);
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 connectDiagram(diagram);
 status.textContent=`已準備 ${snapshot.rows.length} 站的列印內容`;
 window.print();
 }catch(error){document.getElementById('routePrintSurface')?.remove();status.textContent=error.message||'列印地圖未能載入，請稍後重試。';}
 finally{button.disabled=false;button.textContent=buttonLabel;}
}
function setTab(tab){const both=document.body.classList.contains('map-route-desktop');$('routeDiagram').hidden=!both&&tab!=='diagram';$('routeTable').hidden=!both&&tab!=='list';$('diagramTab').setAttribute('aria-pressed',String(tab==='diagram'));$('listTab').setAttribute('aria-pressed',String(tab==='list'));requestAnimationFrame(connectors);}
document.addEventListener('click',event=>{const button=event.target.closest('[data-directory-shift]');if(button){$('shift').value=button.dataset.directoryShift;$('shift').onchange();}});
$('routeDiagram').onclick=selectCard;$('routeDiagram').onkeydown=selectCard;$('routeFullDiagram').onclick=selectCard;$('routeFullDiagram').onkeydown=selectCard;$('routeDiagram').ondblclick=selectCard;$('routeFullDiagram').ondblclick=selectCard;$('routeTitle').onclick=assignRoute;$('routeTitle').onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();assignRoute();}};$('routeFullToggle').onclick=()=>{if(!active)return;expandedRoute=expandedRoute===active.route?null:active.route;renderFullRoute();updateProgress();requestAnimationFrame(connectors);document.dispatchEvent(new CustomEvent('achang:route-view'));};$('shift').onchange=()=>{active=null;$('detail').hidden=true;$('directory').hidden=false;renderDirectoryTimeOptions();const preset=defaultDirectoryTimeWindow($('shift').value);$('directoryStartTime').value=preset.start;$('directoryEndTime').value=preset.end;filterDirectory()};$('search').oninput=filterDirectory;$('directoryStartTime').onchange=filterDirectory;$('directoryEndTime').onchange=filterDirectory;$('vehicles').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){const row=e.target.closest('tr[data-open]');if(row){e.preventDefault();openRoute(row.dataset.open)}}};$('vehicles').onclick=e=>{const b=e.target.closest('[data-open]');if(b)openRoute(b.dataset.open)};$('back').onclick=()=>{$('detail').hidden=true;$('directory').hidden=false;history.replaceState(null,'',location.pathname);$('directory').scrollIntoView?.({block:'start',behavior:'smooth'})};$('diagramTab').onclick=()=>setTab('diagram');$('listTab').onclick=()=>setTab('list');$('print').onclick=printActiveRoute;window.addEventListener('resize',connectors);
window.AChangRouteDirectory={openRoute,setLiveRows:rows=>{liveRows=rows;applyLiveRows();if(!groups.length)return;renderList();if(active)openRoute(active.route,{keepWindow:true,syncMap:false,reveal:false});},setShift:value=>{$('shift').value=value;$('shift').onchange();},activeStopIds:()=>active?.rows.map(r=>r._mapStopId)||[],activeRoute:()=>active?.route||''};setInterval(updateProgress,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateProgress();});window.addEventListener('focus',updateProgress);
(async()=>{try{for(const [file,shift] of [['data-official-day-20261030.source.json','日間'],['data-official-night-20261030.source.json','夜間']]){const response=await fetch(file);if(!response.ok)throw Error('HTTP '+response.status);const rows=await response.json(),map=new Map();for(const [sourceIndex,r] of rows.entries()){r._mapStopId=`PDF:${shift==='日間'?'DAY':'NIGHT'}:${String(sourceIndex+1).padStart(4,'0')}`;const route=String(r['車次']||'');if(!map.has(route))map.set(route,{route,shift,plate:r['車牌']||'',code:codes[route]||'未提供',rows:[],villages:[]});map.get(route).rows.push(r);}for(const g of map.values()){g.villages=[...new Set(g.rows.map(r=>r['里別']).filter(Boolean))];groups.push(g);}}groups.sort((a,b)=>window.AChangDispatchView.compareRoutes(a.route,b.route));if(groups.length!==30)throw Error('來源車次數與30車不符');applyLiveRows();renderDirectoryTimeOptions();const preset=defaultDirectoryTimeWindow($('shift').value);$('directoryStartTime').value=preset.start;$('directoryEndTime').value=preset.end;renderList();$('loadStatus').textContent='已載入30車完整來源站序。';const name=decodeURIComponent(location.hash.slice(1));if(name)openRoute(name);}catch(e){$('loadStatus').textContent='路線載入失敗：'+e.message;}})();
})();



