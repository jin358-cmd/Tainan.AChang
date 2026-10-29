(() => {
'use strict';
const KEY = 'achang-pwa-local-v3'; // preserve existing local plans across interface revisions
const PRIOR_KEY = 'achang-pwa-local-v2';
const LEGACY_KEY = 'achang-pwa-local-v1';
const DEMO = [
 {id:'DEMO-01',name:'示範志工 A',phone:'0999000001',assignment:'復華里'},
 {id:'DEMO-02',name:'示範志工 B',phone:'0999000002',assignment:'勝利里'},
 {id:'DEMO-03',name:'示範志工 C',phone:'0999000003',assignment:'中興里'},
 {id:'DEMO-04',name:'示範志工 D',phone:'0999000004',assignment:''},
 {id:'DEMO-05',name:'示範志工 E',phone:'0999000005',assignment:''},
 {id:'DEMO-06',name:'示範志工 F',phone:'0999000006',assignment:''}
];
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-');
const stopKey=r=>r['站點ID']||[r['時段'],r['車次'],r['車牌'],r['清運次序'],r['里別'],r['停靠點原文']].join('|');
const routeKey=r=>[r['時段'],r['路線ID']||r['車次'],r['車牌']||''].join('|');
const routeLabel=r=>[r['車次'],r['車牌']].filter(Boolean).join(' · ')||'日間固定站';
const rowArea=r=>r?.['固定日間']?(plannerArea==='all'?'':plannerArea):r?.['里別'];
const taskRouteToken=t=>t?.route_id||t?.truck||'';
const taskRouteDisplay=t=>t?.truck||(String(t?.route_id||'').startsWith('DAY:')?`日間 ${String(t.route_id).split(':').at(-1)}線`:'車牌未提供');
const uniq=arr=>[...new Set(arr)];
const coord=n=>typeof n==='number'&&Number.isFinite(n);
const makeState=(seed=[])=>({schema:1,people:seed,plans:{},pins:{},leaders:{},demo:false,homePreassigned:true,updated:Date.now()});
function loadState(){for(const k of [KEY,PRIOR_KEY,LEGACY_KEY]){try{const raw=localStorage.getItem(k);if(!raw)continue;const x=JSON.parse(raw);if(x&&x.schema===1&&Array.isArray(x.people)&&x.plans&&x.pins)return x}catch(e){}}return null}
const MAP_LOAD_TIMEOUT_MS=8000;
const MAPLIBRE_JS='https://cdn.jsdelivr.net/npm/maplibre-gl@5.15.0/dist/maplibre-gl.js';
const MAPLIBRE_CSS='https://cdn.jsdelivr.net/npm/maplibre-gl@5.15.0/dist/maplibre-gl.css';
let state=loadState(),data=null,baseStops=[],dayRouteDocument=null,dayShiftWindows=null,officialRouteDocument=null,routeStopOverlays=[],dayRouteCategory='six',dayCatalogStatus={weekday:'',active:0,pending:0,notice:'',closedReason:''},areas=[],routes=[],page='areas',selectedArea='復興里',shift='夜間',date=today(),chosenRoute='',plannerArea='all',visitTimeStart='',visitTimeEnd='',visitTimeCustomized=false,areaPage=0,teamArea='',toastTimer=null,installPrompt=null,map=null,markers=[],mapFailed=false,mapLoaded=false,mapLoadTimer=null,mapAttempt=0,mapInitPromise=null,mapFailureMessage='',pinTarget=null,layerState={volunteer:true,day:false,night:false,gps:false},pickerKind='',volunteerId='',volunteerPhone='';
const personNorm=p=>({id:String(p.id||`P${Date.now()}`),name:String(p.name||'').trim().slice(0,80),phone:String(p.phone||'').slice(0,80),address:String(p.address||'').slice(0,300),residentArea:String(p.residentArea||'待確認'),assignment:areas.includes(p.assignment)?p.assignment:'',serviceLat:coord(p.serviceLat)?p.serviceLat:null,serviceLon:coord(p.serviceLon)?p.serviceLon:null});
const residentLabel=p=>{const s=String(p?.residentArea||'').trim().replace(/里里$/,'里');return /十里以外|十里外|待確認/.test(s)?'十里外':s&&s!=='未填寫'?s:''};
const residentHtml=p=>residentLabel(p)?`原里：${esc(residentLabel(p))} · `:'';
const residentBadge=p=>residentLabel(p)?`<span class="original-area">原里：${esc(residentLabel(p))}</span>`:'';
const canDial=p=>String(p.phone||'').replace(/[^+\d]/g,'');
const prettyPhone=v=>{let digits=String(v||'').replace(/\D/g,'');if(digits.length===12&&digits.startsWith('8869'))digits='0'+digits.slice(3);return digits.length===10&&digits.startsWith('09')?`${digits.slice(0,4)}-${digits.slice(4,7)}-${digits.slice(7)}`:String(v||'')};
const telLink=(p,cls='phone-link')=>{const v=canDial(p);return v?`<a class="${cls}" href="tel:${esc(v)}" aria-label="撥打 ${esc(p.name)} 的電話">☎ ${esc(prettyPhone(p.phone))}</a>`:'<span class="phone-missing">未留電話</span>'};
function save(){state.updated=Date.now();try{localStorage.setItem(KEY,JSON.stringify(state));const pill=$('#savedPill');if(pill){pill.textContent='';pill.hidden=true}}catch(e){toast('裝置儲存空間無法寫入，請先匯出 JSON 備份')}renderSummary()}
function toast(s){const el=$('#toast');el.textContent=s;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true},3600)}
function assignedPeople(a){return state.people.filter(p=>p.assignment===a)}
function eligible(a){return state.people.filter(p=>p.assignment===a)}
function assignedCount(){return state.people.filter(p=>areas.includes(p.assignment)).length}
function planId(){return date+'|'+chosenRoute}
function plan(){if(!state.plans[planId()])state.plans[planId()]={teams:{},stops:{}};return state.plans[planId()]}
function stopPlan(r){const k=stopKey(r),pl=plan();if(!pl.stops[k])pl.stops[k]={chosen:false,status:'待訪',people:[],note:''};return pl.stops[k]}
function sourceRouteRows(){return data.stops.filter(x=>routeKey(x)===chosenRoute)}
function sourceOrderForTask(row){const index=sourceRouteRows().indexOf(row);return index<0?1:index+1}
function routeRows(){const rows=sourceRouteRows(),adapter=window.AChangRouteTime;if(!adapter)return rows;return rows.some(row=>row['固定日間'])?adapter.filterIntervals(rows,visitTimeStart,visitTimeEnd):adapter.filter(rows,visitTimeStart,visitTimeEnd)}
function sourceExcluded(row){return window.AChangRouteTime?.struck(row)===true}
function schedulableRouteRows(){return routeRows().filter(row=>!sourceExcluded(row))}
function resetVisitTime(){visitTimeStart='';visitTimeEnd='';visitTimeCustomized=false}
function dayShiftWindow(){return shift==='日間'&&dayRouteCategory==='six'?{start:'',end:'08:05'}:null}
function timeOptionsWithEndpoint(options,value){const result=[...options];if(value&&!result.includes(value))result.push(value);return result.sort((a,b)=>a.localeCompare(b))}
function renderVisitTimeFilter(rows){
 const start=$('#visitStartTime'),end=$('#visitEndTime'),hint=$('#visitTimeHint'),adapter=window.AChangRouteTime;
 if(!start||!end||!hint||!adapter)return;
 const fixedDay=rows.some(row=>row['固定日間']),windowPreset=dayShiftWindow(),sourceOptions=adapter.times(rows);
 const startOptions=fixedDay?adapter.startTimes(rows):timeOptionsWithEndpoint(sourceOptions,windowPreset?.start),endOptions=fixedDay?adapter.endTimes(rows):timeOptionsWithEndpoint(sourceOptions,windowPreset?.end);
 const allowedStart=new Set(startOptions),allowedEnd=new Set(endOptions);
 if(!visitTimeCustomized&&(fixedDay||windowPreset)){visitTimeStart=windowPreset?windowPreset.start:(startOptions[0]||'');visitTimeEnd=windowPreset?.end||endOptions.at(-1)||''}
 if(visitTimeStart&&!allowedStart.has(visitTimeStart))visitTimeStart='';
 if(visitTimeEnd&&!allowedEnd.has(visitTimeEnd))visitTimeEnd='';
 const optionHtml=options=>'<option value="">全部時段</option>'+options.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');
 start.innerHTML=optionHtml(startOptions);end.innerHTML=optionHtml(endOptions);start.value=visitTimeStart;end.value=visitTimeEnd;
 const disabled=!chosenRoute||startOptions.length===0||endOptions.length===0;start.disabled=disabled;end.disabled=disabled;
 hint.textContent=disabled?(chosenRoute?'此車次沒有可供篩選的合法原表時間。':'請先選擇車次。'):'';
}
function applyDayRoutes(){
 const adapter=window.AChangDayRoutes;
 const official=window.AChangOfficialRoutes;
 if(!data||!adapter||!dayRouteDocument||!officialRouteDocument||!official){if(data)data.stops=[];return}
 const result=adapter.stopsForDate(dayRouteDocument,date);
 const verified=official.validate(officialRouteDocument.day,officialRouteDocument.night);
 if(!verified.valid||verified.dayRoutes!==6||verified.nightRoutes!==24){data.stops=[];dayCatalogStatus={weekday:result.weekday,active:0,pending:0,notice:'官方 PDF 站點資料驗證失敗，已停止載入。',closedReason:''};return}
 const withOverlays=(source,sourceShift)=>{const output=[],seen=new Set();for(const row of source){const token=`${sourceShift}|${row['車次']}|${row['車牌']||''}`;if(seen.has(token))continue;seen.add(token);const originals=source.filter(item=>item['車次']===row['車次']&&(item['車牌']||'')===(row['車牌']||''));const additions=routeStopOverlays.filter(item=>item.status==='active'&&item.shift===sourceShift&&item.route_token===row['車次']&&(item.vehicle||'')===(row['車牌']||'')).sort((a,b)=>a.display_order-b.display_order||String(a.created_at).localeCompare(String(b.created_at)));const merged=originals.slice();for(const item of additions){const normalized={'時段':sourceShift,'車次':item.route_token,'車牌':item.vehicle||'','路線ID':row['路線ID'],'站點ID':`OVERLAY:${item.id}`,'里別':item.area,'清運次序':item.display_order,'原始站點序號':'','停靠點原文':item.stop_name,'Google地圖定位地址':'','到達':String(item.start_time||'').slice(0,5),'離開':String(item.end_time||'').slice(0,5),'垃圾日':'','回收日':'','PDF頁碼':'','PDF列序':'','PDF檔名':'管理員新增站點','來源順序':'','來源刪除線':false,'定位狀態':'未提供座標，不放置假站點','備註':'可恢復封存的管理員站點','管理員站點':true,'overlayId':item.id};merged.splice(Math.min(Math.max(item.display_order-1,0),merged.length),0,normalized)}output.push(...merged)}return output};
 data.stops=[...withOverlays(verified.day,'日間').map(x=>({...x,'日間分類':'six'})),...withOverlays(verified.night,'夜間'),...result.stops.map(x=>({...x,'日間分類':'ab'}))];
 dayCatalogStatus={weekday:result.weekday,active:result.stops.length,pending:result.pending.length,notice:result.serviceNotice||'',closedReason:result.closedReason||''};
}
function hasSchedule(r){const p=state.plans[planId()];const record=p?.stops?.[stopKey(r)];return !!record?.chosen||!!record?.people?.length||!!p?.teams?.[r['里別']]?.length}

function leaderId(a){return state.leaders?.[a]||''}
function leaderOf(a){return assignedPeople(a).find(p=>p.id===leaderId(a))||null}
function sortedMembers(a){return [...assignedPeople(a)].sort((x,y)=> (x.id===leaderId(a)?-1:0)-(y.id===leaderId(a)?-1:0) || x.name.localeCompare(y.name,'zh-Hant'))}
function assignLeader(id,a){const p=state.people.find(x=>x.id===id);if(!p||p.assignment!==a)return toast('請先將人員分配至此里');if(state.leaders?.[a]===id)return toast(`${p.name} 已是 ${a} 組長`);if(!confirm(`確定將 ${p.name} 設為 ${a} 組長？原組長將改為一般志工。`))return;state.leaders||={};state.leaders[a]=id;save();render();toast(`👑 已將 ${p.name} 設為 ${a} 組長`)}
function cleanLeader(id,areaName=''){if(!state.leaders)return;for(const [a,who] of Object.entries(state.leaders))if(who===id||a===areaName&&who===id)delete state.leaders[a]}
const validStatuses=['待訪','進行中','完成'];
const CARD_PAGE_SIZE=4;
function bookingFor(id){const prefix=date+'|'+shift+'|';for(const [key,entry] of Object.entries(state.plans||{})){if(!key.startsWith(prefix))continue;for(const [a,members] of Object.entries(entry.teams||{})){if((members||[]).includes(id))return {route:key.split('|')[2],label:`${key.split('|')[2]} · ${a} 跟巡小組`,type:'team'}}for(const [sid,rec] of Object.entries(entry.stops||{})){if((rec.people||[]).includes(id)){const r=data?.stops?.find(x=>stopKey(x)===sid);return {route:key.split('|')[2],label:`${key.split('|')[2]} · ${r?.['到達']||''} ${r?.['停靠點原文']||'拜訪站點'}`,type:'stop'}}}}return null}
function rosterAvailable(a){return eligible(a).filter(p=>!bookingFor(p.id))}
function normalizeSchedules(){state.leaders||={};state.plans||={};state.pins||={};for(const [a,id] of Object.entries(state.leaders))if(!state.people.some(p=>p.id===id&&p.assignment===a))delete state.leaders[a];const seen=new Map();for(const [key,p] of Object.entries(state.plans).sort((a,b)=>a[0].localeCompare(b[0]))){const parts=key.split('|'),group=parts[0]+'|'+parts[1];p.teams||={};p.stops||={};for(const [sid,rec] of Object.entries(p.stops)){const r=data?.stops?.find(x=>stopKey(x)===sid);rec.status=validStatuses.includes(rec.status)?rec.status:'待訪';rec.people=uniq(rec.people||[]).filter(id=>{const vol=state.people.find(v=>v.id===id);if(!vol||!r||vol.assignment!==r['里別']||seen.has(group+'|'+id))return false;seen.set(group+'|'+id,true);return true})}for(const [a,members] of Object.entries(p.teams)){p.teams[a]=uniq(members||[]).filter(id=>{const vol=state.people.find(v=>v.id===id);if(!vol||vol.assignment!==a||seen.has(group+'|'+id))return false;seen.set(group+'|'+id,true);return true})}}}
function visibleMapAreas(){return liveRole==='volunteer'?[...new Set(liveTasks.filter(t=>t.volunteer_id===liveMemberId&&t.visit_date===today()).map(t=>t.area))]:areas;}
function highlightMapSelection(){if(!map||!map.getLayer('village-fill'))return;const allowed=visibleMapAreas();map.setPaintProperty('village-fill','fill-opacity',['case',['in',['get','name'],['literal',allowed]],0.22,0]);map.setPaintProperty('village-lines','line-opacity',['case',['in',['get','name'],['literal',allowed]],1,0]);map.setPaintProperty('village-fill','fill-opacity',['case',['in',['get','name'],['literal',allowed]],['case',['==',['get','name'],selectedArea],0.46,0.22],0]);map.setPaintProperty('village-lines','line-width',['case',['==',['get','name'],selectedArea],7,2.6]);map.setPaintProperty('village-lines','line-color',['case',['==',['get','name'],selectedArea],'#d62436',['get','color']]);}

function renderSummary(){const planCurrent=state.plans[planId()];$('#statTotal').textContent=state.people.length;$('#statAssigned').textContent=assignedCount();$('#statPending').textContent=state.people.length-assignedCount();$('#statStops').textContent=Object.values(planCurrent?.stops||{}).filter(v=>v.chosen).length;const banner=$('#modeBanner');banner.hidden=true;banner.textContent=''}
function go(next){page=next;const mapPopup=$('#areaPopup');if(mapPopup)mapPopup.hidden=true;$$('.page').forEach(el=>el.classList.toggle('active',el.id==='page-'+next));$$('[data-page]').forEach(el=>{el.classList.toggle('on',el.dataset.page===next);el.setAttribute('aria-current',el.dataset.page===next?'page':'false')});render();window.scrollTo({top:0,behavior:'auto'});if(next==='map')requestAnimationFrame(()=>{initMap().then(()=>{map?.resize();try{updateMap();centerTodayVillage()}catch(e){console.warn('地圖顯示錯誤',e);drawFallback('地圖顯示發生問題，請重試')}}).catch(e=>drawFallback(e?.message||'地圖載入失敗'))})}
function render(){document.body.classList.toggle('read-only-visitor',!liveRole);document.body.classList.toggle('restored-admin-map',liveRole==='admin');renderSummary();if(page==='areas'){if(liveRole==='volunteer'){$('#areaMembers').innerHTML='';$('#pendingMembers').innerHTML='';$('#areaMembers').hidden=true;$('#pendingMembers').hidden=true;$('#areaAssignedCount').textContent='僅管理員可分派';}else renderAreas();}if(page==='planner'){if(liveRole==='volunteer'){$('#plannerContent').hidden=true;$('#plannerGate').hidden=false;$('#plannerGate').innerHTML='<strong>跟巡排班由管理員安排</strong><p>請至「任務」查看你的排班與完成回報。</p>';}else renderPlanner();}if(page==='people'){const ttl=$('#rosterTitle'),sub=$('#rosterSubtitle');if(ttl)ttl.textContent=liveRole==='volunteer'?'小組任務':'志工名冊';if(sub)sub.textContent=liveRole==='volunteer'?'僅顯示本人已參與的排班小組':'會員授權及志工資料由管理員管理';renderPeople();}if(page==='reports')renderReports();if(page==='map')updateMap();if(page==='volunteer')renderVolunteer()}
function assignPerson(id,a){const p=state.people.find(x=>x.id===id);if(!p||!areas.includes(a))return false;if(p.assignment===a){toast(`${p.name} 已在 ${a}`);return true}const from=p.assignment;if(from&&!confirm(`將 ${p.name} 從 ${from} 改派到 ${a}？`))return false;if(from)cleanLeader(p.id,from);p.assignment=a;p.serviceLat=null;p.serviceLon=null;for(const v of Object.values(state.plans)){for(const key of Object.keys(v.teams||{}))v.teams[key]=v.teams[key].filter(x=>x!==p.id);for(const r of Object.values(v.stops||{}))r.people=(r.people||[]).filter(x=>x!==p.id)}save();render();toast(`已將 ${p.name} 分配至 ${a}`);return true}
function removePerson(id){const p=state.people.find(x=>x.id===id);if(!p||!p.assignment)return;const from=p.assignment;cleanLeader(id,from);p.assignment='';p.serviceLat=null;p.serviceLon=null;for(const v of Object.values(state.plans)){for(const [a,ids] of Object.entries(v.teams||{}))v.teams[a]=ids.filter(x=>x!==id);for(const r of Object.values(v.stops||{}))r.people=(r.people||[]).filter(x=>x!==id)}save();render();toast('已移出服務分區及相關跟巡指派')}
function clearSelectedArea(){const members=assignedPeople(selectedArea);if(!members.length){toast(`${selectedArea} 目前沒有已分配人員`);return}if(!confirm(`只清除「${selectedArea}」的 ${members.length} 位服務分配與其跟巡排班？其他里及總名冊不變。`))return;const ids=new Set(members.map(p=>p.id));for(const p of members){p.assignment='';p.serviceLat=null;p.serviceLon=null}delete state.leaders[selectedArea];for(const entry of Object.values(state.plans)){for(const [a,people] of Object.entries(entry.teams||{}))entry.teams[a]=people.filter(id=>!ids.has(id));for(const r of Object.values(entry.stops||{}))r.people=(r.people||[]).filter(id=>!ids.has(id))}save();render();toast(`已清除 ${selectedArea} 的 ${members.length} 位服務分配`)}


function renderAreas(){const last=Math.max(0,Math.ceil(areas.length/CARD_PAGE_SIZE)-1);areaPage=Math.max(0,Math.min(areaPage,last));
const shown=areas.slice(areaPage*CARD_PAGE_SIZE,(areaPage+1)*CARD_PAGE_SIZE);$('#areaPicker').innerHTML=shown.map(a=>`<button class="area-pill ${selectedArea===a?'active':''}" data-area="${esc(a)}"><span class="area-dot" style="background:${data.colors[a]}"></span>${esc(a)} <em>${assignedPeople(a).length}</em></button>`).join('');$('#areaPrev').disabled=areaPage===0;$('#areaNext').disabled=areaPage===last;$('#areaPageNo').innerHTML=Array.from({length:last+1},(_,idx)=>`<button type="button" data-area-page="${idx}" class="page-dot ${areaPage===idx?'on':''}" aria-label="第 ${idx+1} 組里別" aria-current="${areaPage===idx?'step':'false'}"></button>`).join('')+`<span class="page-fraction">${areaPage+1} / ${last+1}</span>`;
const an=$('#areaName');an.textContent=selectedArea;an.style.color=data.colors[selectedArea]||'#176581';$('#areaAssignedCount').textContent='已分配 '+assignedPeople(selectedArea).length+' 人';const a=$('#areaMembers'),b=$('#pendingMembers'),list=sortedMembers(selectedArea);a.hidden=list.length===0;a.innerHTML=list.length?list.map(p=>{const lead=p.id===leaderId(selectedArea),leaderBtn=p.phone?`<button data-leader="${esc(p.id)}" title="指派組長" class="${lead?'leader-on':''}">${lead?'👑 組長':'☆ 設組長'}</button>`:'';return `<div class="member ${lead?'team-leader':''}" data-person="${esc(p.id)}"><div class="member-info"><strong>${lead?'👑 ':''}${esc(p.name)}</strong><small><span class="assigned-area-inline" style="--area-color:${esc(data.colors[selectedArea]||"#176581")}">服務里：${esc(selectedArea)}</span></small></div><div class="member-actions">${telLink(p,'phone-link service-phone')} ${leaderBtn}<button data-remove="${esc(p.id)}">移出</button></div></div>`}).join(''):'<div class="empty">此里尚未分配志工</div>';const waiting=state.people.filter(p=>!p.assignment);b.innerHTML=waiting.length?waiting.map(p=>`<div class="member pending"><div class="member-info"><strong>${esc(p.name)}</strong><small>待分配</small></div><div class="member-actions">${telLink(p,'phone-link service-phone')}<button data-assign="${esc(p.id)}">＋ 加入 ${esc(selectedArea)}</button></div></div>`).join(''):'<div class="empty">所有人員皆已分配</div>';$('#pendingCountValue').textContent=waiting.length}

function chooseRoute(){
 applyDayRoutes();
 const matching=data.stops.filter(r=>r['時段']===shift&&(shift!=='日間'||r['日間分類']===dayRouteCategory)&&(r['固定日間']?true:plannerArea==='all'||r['里別']===plannerArea));
 routes=uniq(matching.map(routeKey));if(!routes.includes(chosenRoute))chosenRoute=routes[0]||'';
 const holder=$('#routeButtons');
 if(routes.length){const fixedDay=shift==='日間'&&dayRouteCategory==='ab'&&matching.some(row=>row['固定日間']),scopeNote=fixedDay?(plannerArea==='all'?'全部里別僅供預覽；指派前請選擇服務里。來源未提供站點里別。':`${plannerArea} 人員會跟巡整條官方路線；來源未提供站點里別，不代表這些站點屬於 ${plannerArea}。`):'';
  const note=[fixedDay?dayCatalogStatus.notice:'',fixedDay&&dayCatalogStatus.pending?`本日另有 ${dayCatalogStatus.pending} 筆來源待確認，未列入排班。`:'',scopeNote].filter(Boolean).join('；');holder.innerHTML=routes.map(key=>{const row=matching.find(item=>routeKey(item)===key),sourceRows=matching.filter(item=>routeKey(item)===key),collection=shift==='日間'&&dayRouteCategory==='six'?` 🗑️${sourceRows.some(item=>String(item['回收日']||'').trim())?' ♻️':''}`:'';return `<button class="route-choice ${chosenRoute===key?'on':''}" type="button" data-route="${esc(key)}">${esc(routeLabel(row||{}))}${collection}</button>`}).join('')+(note?`<p class="mini-note day-route-notice">${esc(note)}</p>`:'');return}
 const noFixedDay=shift==='日間'&&dayRouteCategory==='ab'&&dayCatalogStatus.weekday&&!['星期三','星期五'].includes(dayCatalogStatus.weekday);
 holder.innerHTML=`<span class="mini-note">${dayCatalogStatus.closedReason?esc(dayCatalogStatus.closedReason):noFixedDay?'所選日期沒有週三／週五固定日間路線。':shift==='日間'&&plannerArea==='all'?'請先選擇服務里，再選擇週三／週五 A、B 路線。':'此里於所選時段暫無已核對站點，請切換里別或時段。'}</span>`;
}

function renderPlanner(){
 const gate=$('#plannerGate'),content=$('#plannerContent'),locked=liveRole==='admin'&&assignedCount()===0;
 gate.hidden=!locked;content.hidden=locked;if(locked)return;
 $('#planDate').value=date;$('#plannerAreaSelect').value=plannerArea;
 $$('[data-shift]').forEach(b=>b.classList.toggle('on',b.dataset.shift===shift));const dayPicker=$('#dayRouteCategoryPicker');if(dayPicker){dayPicker.hidden=shift!=='日間';dayPicker.querySelectorAll('[data-day-category]').forEach(b=>b.classList.toggle('on',b.dataset.dayCategory===dayRouteCategory));}
 chooseRoute();
 renderVisitTimeFilter(chosenRoute?sourceRouteRows():[]);
 const allRows=chosenRoute?routeRows():[];
 const fixedDay=allRows.some(r=>r['固定日間']),rows=fixedDay?allRows:plannerArea==='all'?allRows:allRows.filter(r=>r['里別']===plannerArea);
 const visitTitle=$('#visitRouteTitle');if(visitTitle)visitTitle.textContent=rows.length?`依車次順序拜訪・共 ${rows.length} 站點`:'依車次順序拜訪';
 const regions=plannerArea==='all'?[]:fixedDay?[plannerArea]:uniq(rows.map(r=>r['里別']));
 if(!regions.includes(teamArea))teamArea=regions[0]||'';
 if(regions.length)renderAreaTeams(regions);else $('#areaTeamPicker').innerHTML='';
 const assignBtn=$('#plannerAssignArea');if(assignBtn){assignBtn.textContent='指派跟巡'+(teamArea||'服務里');assignBtn.disabled=!teamArea;}
 const actions=$('#areaTeamPicker .team-areas'),target=$('#visitAreaButtons');target.replaceChildren();if(actions)target.appendChild(actions);const add=$('#addRouteStop'),manage=$('#manageRouteStops'),editable=liveRole==='admin'&&!!chosenRoute&&!fixedDay;if(add)add.hidden=!editable;if(manage)manage.hidden=liveRole!=='admin';
 renderStops(rows);
}

function renderAreaTeams(regions){
 const root=$('#areaTeamPicker'),crew=plan().teams[teamArea]||[],available=rosterAvailable(teamArea);
 const hasAreaTasks=routeRows().some(r=>rowArea(r)===teamArea&&(plan().stops?.[stopKey(r)]?.people||[]).length);
 const notice="";
 root.innerHTML=`<div class="team-head" hidden><button class="smallbtn" id="addTeam" ${available.length?'':'disabled'}>指派人員</button></div><div class="team-areas">${regions.map(a=>{const people=assignedPeople(a),complete=people.length>0&&people.every(p=>routeRows().some(r=>rowArea(r)===a&&matchedMemberTask(r,p.id)));return `<button class="team-area-btn ${teamArea===a?'on':''}" data-team-area="${esc(a)}">${esc(a)} ${complete?`✅ ${a}完成跟巡安排`:people.length+'人'}</button>`}).join('')}</div><div class="team-members">${crew.map(id=>{const p=state.people.find(x=>x.id===id);return p?`<span class="chip">${esc(p.name)}<button data-team-remove="${esc(id)}" aria-label="移除 ${esc(p.name)}">×</button></span>`:''}).join('')}</div>`;
}

function unassignedVisitAreas(rows){
 rows=rows.filter(row=>!sourceExcluded(row));const keys=uniq(rows.map(rowArea).filter(Boolean));const p=plan();
 return keys.filter(area=>{
   if((p.teams?.[area]||[]).some(id=>state.people.some(v=>v.id===id&&v.assignment===area)))return false;
   return !rows.some(r=>rowArea(r)===area&&(p.stops?.[stopKey(r)]?.people||[]).some(id=>state.people.some(v=>v.id===id&&v.assignment===area)));
 });
}

function renderStops(rows){
 const holder=$('#stopList');
 if(!rows.length){holder.innerHTML=`<div class="empty">${visitTimeStart||visitTimeEnd?'所選起迄時間沒有符合的站點，請調整篩選或選擇全部時段。':'此篩選條件沒有選錄站點'}</div>`;return}
 const missing=unassignedVisitAreas(rows);
 const missingNotice=missing.length?`<div class="pending-region-summary">${missing.map(esc).join(' · ')} 跟巡：<strong>尚未指派</strong></div>`:'';
 const visitHeader=document.getElementById("visitMissingNotice");if(visitHeader)visitHeader.innerHTML=missingNotice;holder.innerHTML=rows.map(r=>{
  const excluded=sourceExcluded(r),area=rowArea(r),areaLabel=r['固定日間']?'站點里別待核':area||'未指定服務里',k=stopKey(r),sp=stopPlan(r),team=(plan().teams[area]||[]).filter(id=>state.people.some(x=>x.id===id&&x.assignment===area)),stopMembers=(sp.people||[]).filter(id=>state.people.some(x=>x.id===id&&x.assignment===area)),hasPeople=team.length>0||stopMembers.length>0,status=validStatuses.includes(sp.status)?sp.status:'待訪',visibleStatus=excluded?'source-struck':!hasPeople?'stop-unassigned':status==='完成'?'status-done':status==='進行中'?'status-progress':'status-wait',available=!excluded&&area&&plannerArea!=='all'?rosterAvailable(area):[];
  const time=r['離開']?`${r['到達']}～${r['離開']}`:r['到達'],source=excluded?'原表刪除線・僅供來源追溯，不可指派':r['管理員站點']?`管理員新增・目前清單第 ${sourceOrderForTask(r)} 站・原始 PDF 160 筆保持不變`:r['固定日間']?`${r['車次']} · 來源順序 ${r['來源順序']}`:`原表第 ${r['清運次序']} 站 · ${r['車牌']} · PDF 第${r['PDF頁碼']}頁 · 選錄站點`;
  return `<article class="stop-card ${visibleStatus} ${r['管理員站點']?'admin-overlay-stop':''}" data-stop="${esc(k)}"><div class="stop-title"><span class="time">${esc(time)}</span><strong class="stop-address">${esc(r['停靠點原文'])}</strong><span class="stop-area">${esc(areaLabel)}</span></div><div class="stop-sub">${esc(source)}</div><div class="stop-members">${stopMembers.length?stopMembers.map(id=>{const p=state.people.find(x=>x.id===id);return p?`<span class="chip">${esc(p.name)}<button data-stop-remove="${esc(id)}" data-stop="${esc(k)}" aria-label="取消 ${esc(p.name)} 站點安排">×</button></span>`:''}).join(''):''}</div><div class="stop-buttons"><select class="status-select ${visibleStatus}" data-status="${esc(k)}" aria-label="${esc(r['停靠點原文'])} 拜訪狀態" ${excluded?'disabled title="原表刪除線資料僅供追溯"':!hasPeople?'disabled title="請先安排人員"':''}>${validStatuses.map(v=>`<option ${status===v?'selected':''}>${v}</option>`).join('')}</select><button class="assign-person" data-add-stop="${esc(k)}" ${available.length?'':'disabled'}>${excluded?'不可指派':'指派人員'}</button>${r.overlayId?`<button class="archive-route-stop" data-archive-route-stop="${esc(r.overlayId)}" data-stop-name="${esc(r['停靠點原文'])}">刪除站點</button>`:''}</div></article>`
 }).join('')}

function addTeam(id){const p=state.people.find(x=>x.id===id);if(!p||p.assignment!==teamArea){toast('請先把志工分配到對應里');return false}const crew=plan().teams[teamArea]||[];if(crew.includes(id))return toast('已安排此志工'),false;const prev=bookingFor(id);if(prev){toast(`${p.name} 此時段已排在 ${prev.label}，請先移除再重新指派`);return false}plan().teams[teamArea]=[...crew,id];save();renderPlanner();renderSummary();toast(`已安排 ${p.name} 跟巡 ${teamArea}`);return true}
function removeTeam(id){plan().teams[teamArea]=(plan().teams[teamArea]||[]).filter(x=>x!==id);save();renderPlanner();toast('已移出里別跟巡名單')}
function addStopVolunteer(key,id){const r=data.stops.find(x=>stopKey(x)===key),p=state.people.find(x=>x.id===id),area=rowArea(r);if(!r||!p||p.assignment!==area){toast('須先將志工分配到目前選定服務里');return false}const rec=stopPlan(r);if(rec.people.includes(id)){toast('志工已在此站');return false}const prev=bookingFor(id);if(prev){toast(`${p.name} 此時段已排在 ${prev.label}，請先移除再重新指派`);return false}rec.chosen=true;rec.status=validStatuses.includes(rec.status)?rec.status:'待訪';rec.people.push(id);save();renderPlanner();toast(`已指派 ${p.name} 到站點`);return true}
function setStatus(key,status){if(!validStatuses.includes(status)){toast('狀態僅能為待訪、進行中或完成');return}const r=data.stops.find(x=>stopKey(x)===key);if(!r)return;const rec=stopPlan(r);const team=plan().teams[rowArea(r)]||[];if(!(rec.people||[]).length&&!team.length){toast('此站尚未指派人員');return}rec.chosen=true;rec.status=status;save();renderPlanner();toast(`已更新站點為${status}`)}
function removeStopMember(key,id){const r=data.stops.find(x=>stopKey(x)===key);if(!r)return;stopPlan(r).people=stopPlan(r).people.filter(x=>x!==id);save();renderPlanner()}
function renderPeople(){if(liveRole==='volunteer'){const root=$('#peopleList');root.hidden=false;const groups=[...new Map(liveTasks.filter(t=>t.volunteer_id===liveMemberId).map(t=>[[t.visit_date,t.shift,t.area,taskRouteToken(t)].join('|'),t])).values()];root.innerHTML='<div class="surface"><strong>小組任務</strong><p>僅顯示本人已受指派的跟巡班次。其他成員聯絡資料須通過群組授權驗證。</p></div>'+(groups.length?groups.map(g=>'<div class="person-card"><strong>'+esc(g.visit_date)+' · '+esc(g.area)+'</strong><p>'+esc(g.shift)+' · '+esc(taskRouteDisplay(g))+'</p><span>本人：'+esc(liveDisplayName||'志工')+'</span></div>').join(''):'<div class="empty">目前沒有指派的跟巡班次</div>');return;}const term=$('#peopleSearch').value.toLowerCase().trim(),mode=$('#peopleFilter').value,a=$('#peopleAreaFilter').value;const digits=phoneDigits(term);const list=state.people.filter(p=>{const inMode=mode==='all'||(mode==='pending'&&!p.assignment)||(mode==='assigned'&&!!p.assignment)||(mode==='leader'&&!!p.assignment&&leaderId(p.assignment)===p.id);const inArea=a==='all'||(mode==='pending'?p.residentArea===a:p.assignment===a);const content=`${p.name} ${p.address} ${p.assignment} ${p.residentArea} ${p.phone}`.toLowerCase();return inMode&&inArea&&(content.includes(term)||(digits.length>=3&&phoneDigits(p.phone).includes(digits)))} );$('#peopleList').innerHTML=list.length?list.map(p=>{const lead=p.assignment&&leaderId(p.assignment)===p.id,home=areas.includes(p.residentArea),status=p.assignment?`<span class="assign-pill" style="--area-color:${esc(data.colors[p.assignment]||"#176581")}">分派服務里：${esc(p.assignment)}</span>`:'<span class="pending-pill">待分配</span>';return `<div class="person-card ${p.assignment?'assigned':''} ${home?'resident-priority':''}"><div class="person-heading"><div class="person-name"><strong>${lead?'👑 ':''}${esc(p.name)}</strong>${home?`<span class="residence-big">原里：${esc(residentLabel(p))}</span>`:`${residentBadge(p)}`}</div><div class="person-contact-row">${telLink(p,'phone-link roster-phone')}${status}</div></div><div class="person-detail">${esc(p.address||'地址未提供')}</div><div class="person-actions"><button data-pick-person="${esc(p.id)}">指定服務里</button><button data-edit-person="${esc(p.id)}">個資編輯</button></div></div>`}).join(''):'<div class="empty">目前沒有符合這兩個篩選條件的志工，請切換里別或分配狀態。</div>'}

let reportAreaSelected='';

function taskProgress(done,total){const pct=total?Math.round(done/total*100):0,all=total>0&&done===total;return '<span class="task-progress-status '+(all?'is-complete':'')+'"><span class="task-progress-fill" style="width:'+pct+'%"></span><span class="task-progress-label">'+(all?'✅ ':'')+done+'/'+total+' 已完成</span></span>';}
function navToStop(t){return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent('臺南市永康區'+t.stop_address)+'&travelmode=driving';}
let volunteerTaskCategory='current';
const volunteerGroupOpen=new Map();

// Isolated preview UI testing: synthetic-only, no API mutation or production credentials.
let previewDemoMode=false;
function previewOnly(){return location.hostname.startsWith('tainan-achang-pin-eipp-test-')||location.hostname==='tainan-achang-pin-eipp-test.vercel.app';}
function previewLoginButton(){
 if(!previewOnly())return;
 const anchor=document.getElementById('secureLoginForm');
 if(anchor&&!document.getElementById('previewDemoLogin')){
  const b=document.createElement('button');b.id='previewDemoLogin';b.type='button';b.className='primary wide';b.style.margin='12px 0';b.textContent='進入志工測試介面（免帳密）';b.onclick=startPreviewDemo;anchor.before(b);
  const note=document.createElement('p');note.className='mini-note';note.textContent='此預覽僅使用範例排班資料，不連線寫入正式資料庫。正式帳號登入尚未驗證。';b.after(note);
 }

}
function startPreviewDemo(){
 if(!previewOnly())return;
 previewDemoMode=true;liveRole='volunteer';liveMemberId='PREVIEW-VOL-001';liveDisplayName='測試志工';state=makeState([]);
 const d=today(),y=new Date();y.setDate(y.getDate()-1);const past=[y.getFullYear(),String(y.getMonth()+1).padStart(2,'0'),String(y.getDate()).padStart(2,'0')].join('-');
 const item=(id,date,addr,order)=>({id,volunteer_id:liveMemberId,visit_date:date,shift:'夜間8',truck:'KEN-3201',area:'復華里',eta:'00:00～23:59',stop_order:order,stop_address:addr,status:'待訪'});
 const afterDays=n=>{const x=new Date();x.setDate(x.getDate()+n);return [x.getFullYear(),String(x.getMonth()+1).padStart(2,'0'),String(x.getDate()).padStart(2,'0')].join('-')};
 const sample=(id,offset,eta,addr,area,truck='433-UG')=>({...item(id,afterDays(offset),addr,1),eta,area,truck,shift:'夜間'});
 liveTasks=[item('PREVIEW-TODAY-1',d,'中山北路125號',1),item('PREVIEW-TODAY-2',d,'中山北路498號',2),item('PREVIEW-HISTORY-1',past,'富強路二段37號',1),
 sample('PREVIEW-FUTURE-1',1,'16:22','復國二路142號','復國里'),
 sample('PREVIEW-FUTURE-2',2,'16:02','復國一路345號','復國里'),
 sample('PREVIEW-FUTURE-3',4,'19:30','復華一街24號','復華里')];
 $('#secureLogin').hidden=true;$('#app').hidden=false;updateAccessControls();volunteerTaskCategory='current';go('reports');toast('隔離測試已啟動：所有資料均為範例');
}
function myTasks(){return liveTasks.filter(t=>t.volunteer_id===liveMemberId);}
const taipeiToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function taskDateCategory(t){
 const date=String(t.visit_date||''),day=taipeiToday();
 if(date<day)return 'history';if(date>day)return 'future';return 'current';
}
function volunteerGroups(){const groups=new Map();for(const t of myTasks()){const key=[t.visit_date,t.shift,taskRouteToken(t),t.area].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t)}return [...groups.values()].sort((a,b)=>a[0].visit_date.localeCompare(b[0].visit_date));}
function renderVolunteerTaskList(root){
 const groups=volunteerGroups(),cats={history:[],current:[],future:[]};
 for(const g of groups)cats[taskDateCategory(g[0])].push(g);
 const pending=cats.history.filter(g=>g.some(t=>t.status!=='完成')).length;
 const catLabels={history:'歷史跟巡',current:'當日跟巡',future:'下次跟巡'};
 const selected=cats[volunteerTaskCategory]||[];
 let out='<section class="volunteer-task-unified"><div class="volunteer-task-heading"><h2 class="personal-task-title">跟巡任務</h2></div><div class="volunteer-categories" role="tablist" aria-label="跟巡日期分類">';
 for(const k of ['history','current','future'])
  out+='<button type="button" role="tab" aria-selected="'+(k===volunteerTaskCategory)+'" class="volunteer-category '+(k===volunteerTaskCategory?'on':'')+'" data-vol-category="'+k+'">'+catLabels[k]+(k==='history'&&pending?'<small class="history-pending-count" role="status">● 尚未確認 '+pending+' 筆</small>':'<small>'+cats[k].length+' 筆</small>')+'</button>';
 out+='</div><div class="volunteer-task-unified-body">';
 if(!selected.length){root.innerHTML=out+'<div class="empty">目前沒有'+catLabels[volunteerTaskCategory]+'跟巡任務</div></div></section>';return;}
 for(const [groupIndex,g] of selected.entries()){
  const t=g[0],stops=[...new Map(g.map(x=>[x.id,x])).values()].sort((a,b)=>Number(a.stop_order)-Number(b.stop_order));
  const completed=g.every(x=>x.status==='完成'),groupKey=[t.visit_date,t.shift,taskRouteToken(t),t.area].join('|');
  const expanded=volunteerGroupOpen.has(groupKey)?volunteerGroupOpen.get(groupKey):volunteerTaskCategory==='current',panelId='volunteer-stops-'+volunteerTaskCategory+'-'+groupIndex;
  const shiftIsNight=/夜/.test(t.shift),isHistory=volunteerTaskCategory==='history';
  const times=stops.map(s=>String(s.eta||'').match(/\d{1,2}:\d{2}/)?.[0]).filter(Boolean);
  const period=times.length>1?times[0]+'～'+times[times.length-1]:(times[0]||'時間待排定');
  const status=completed?'已完成':isHistory?'尚未確認':'待執行';
  out+='<div class="volunteer-task-pair"><article class="volunteer-task volunteer-task-summary '+(completed?'completed':'')+'" data-vol-summary="'+esc(groupKey)+'">';
  out+='<div class="task-summary-head"><strong>目前跟巡里別</strong><span class="task-area-pill" style="--area-color:'+esc(data?.colors?.[t.area]||'#b89ad5')+'">'+esc(t.area)+'</span></div>';
  out+='<div class="task-summary-details"><span class="task-summary-date">拜訪日期：<b>'+esc(t.visit_date)+'</b></span><span>清運時段：<b>'+esc(t.shift)+'</b></span></div>';
  out+='<div class="task-summary-truck">已選車次：<strong>'+esc(taskRouteDisplay(t))+'</strong><span class="task-overall-status '+(completed?'is-done':'is-open')+'">'+(completed?'<span class="task-overall-check" aria-hidden="true">✓</span>':'')+esc(status)+'</span></div>';
  out+='<div class="task-summary-strip"><button type="button" class="volunteer-expander" data-vol-expand="'+esc(groupKey)+'" aria-expanded="'+expanded+'" aria-controls="'+panelId+'" aria-label="'+(expanded?'收合':'展開')+esc(t.visit_date)+'停靠點列表"><span class="task-summary-clock" aria-hidden="true">◷</span><span class="task-summary-period">'+esc(period)+'</span><span class="task-summary-chevron" aria-hidden="true">'+(expanded?'⌃':'⌄')+'</span></button><button type="button" class="task-team-btn task-meta-team" data-vol-group="'+esc(groupKey)+'" aria-label="'+esc(t.area)+'每日小組名單">每日小組</button></div>';
  out+='</article>';
  out+='<section class="volunteer-stop-panel" id="'+panelId+'" aria-label="'+esc(t.visit_date)+'停靠點列表" '+(expanded?'':'hidden')+'><div class="volunteer-stop-panel-head"><strong>📍 停靠點列表</strong><span>共 '+stops.length+' 個停靠點</span></div><div class="volunteer-stop-cards">';
  for(const [i,stop] of stops.entries()){
   const a=String(stop.stop_address||'').trim(),hasAddress=!!a;
   const url=hasAddress?'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(a.startsWith('台')||a.startsWith('臺')?a:'臺南市永康區'+a)+'&travelmode=driving':'';
   const done=stop.status==='完成',future=taskDateCategory(stop)==='future';
   out+='<div class="volunteer-stop-item"><span class="volunteer-stop-number">'+(i+1)+'</span><div class="volunteer-stop-main"><strong>第 '+(i+1)+' 個停靠點</strong><span class="volunteer-stop-address">📍 '+esc(a||'地址尚未提供')+'</span>';
   out+='</div>';
   if(hasAddress)out+='<a class="task-navigate" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" aria-label="使用 Google Maps 導航到站點"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M21.3 2.8 2.7 10.2c-.9.35-.85 1.63.1 1.9l7.9 2.2 2.2 7.9c.28.95 1.55 1 1.9.1l7.4-18.6c.28-.7-.21-1.18-.9-.9Z"/></svg>導航到站點</a>';
   out+='<div class="volunteer-stop-result"><button type="button" class="task-complete-btn '+(done?'is-complete':future?'is-upcoming':'is-pending')+'" data-vol-complete-group="'+esc(done?'':stop.id)+'" '+(done||future?'disabled':'')+'>'+(done?'<span class="task-done-check" aria-hidden="true">✓</span> 已完成':future?'尚未開始':'未完成')+'</button></div></div>';
  }
  out+='</div></section></div>';
 }
 root.innerHTML=out+'</div></section>';
}
async function completeVolunteerGroup(ids){
 const entries=ids.split(',').filter(Boolean);if(!entries.length)return;
 const pending=entries.map(id=>liveTasks.find(t=>t.id===id&&t.volunteer_id===liveMemberId)).filter(Boolean);
 if(pending.length!==entries.length)return toast('任務身分不符，請重新整理');
 if(pending.some(t=>taskDateCategory(t)==='future'))return toast('尚未開始的任務不可提前完成');
 if(!confirm('確認這個停靠點已完成跟巡？'))return;
 if(previewDemoMode){pending.forEach(t=>t.status='完成');renderReports();toast('✓ 測試完成（僅更新畫面範例，不寫入資料庫）');return;}
 try{for(const t of pending)await onlineApi('tasks','PATCH',{id:t.id,status:'完成'});await refreshOnline(true);renderReports();toast('✓ 已回報；請核對管理端同步')}catch(e){await refreshOnline(true);renderReports();toast('部分回報未完成，請重新檢查：'+e.message)}
}
let taskSelectedDay='';
function renderReports(){const root=document.getElementById('reportsContent');if(!root)return;
 root.classList.remove('task-date-layout');
 if(liveRole==='volunteer'){renderVolunteerTaskList(root);return;}
 if(liveRole!=='admin'){root.innerHTML='<div class="access-notice"><strong>登入後查看任務</strong><p>管理員與志工請先登入帳號。</p><button class="primary" id="loginFromTasks" type="button">🔐 登入查看任務</button></div>';return;}
 const daily=new Map();for(const t of liveTasks){if(!daily.has(t.visit_date))daily.set(t.visit_date,[]);daily.get(t.visit_date).push(t)}
 const days=[...daily.keys()].sort(),dateLabels={history:'歷史跟巡',current:'當日跟巡',future:'下次跟巡'},dateGroups={history:[],current:[],future:[]};for(const day of days)dateGroups[taskDateCategory({visit_date:day})].push(day);
 const dayHtml=day=>{
 const tasks=daily.get(day),groups=new Map();for(const t of tasks){const key=[t.area,t.shift,taskRouteToken(t)].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t)}
 return '<details class="surface task-day" '+(day===taskSelectedDay||taskDateCategory({visit_date:day})==='current'?'open':'')+'><summary data-task-day="'+esc(day)+'">'+esc(day)+' · '+groups.size+' 組跟巡 · '+tasks.filter(t=>t.status==='完成').length+'/'+tasks.length+' 已完成</summary>'+
 [...groups.entries()].map(([key,entries])=>{const [area,shift]=key.split('|'),routeDisplay=taskRouteDisplay(entries[0]),shiftClass=shift==='日間'?'day':'night',shiftIcon=shift==='日間'?'☀':'☾',lead=state.people.find(p=>p.id===leaderId(area)),members=new Map();
 for(const t of entries){if(!members.has(t.volunteer_id))members.set(t.volunteer_id,[]);members.get(t.volunteer_id).push(t)}
 const done=entries.filter(t=>t.status==='完成').length;
 return '<details class="task-team"><summary class="task-team-head"><span class="task-team-row task-team-primary"><span class="task-team-identity"><strong><span class="task-leader-crown" aria-hidden="true">👑</span> '+esc(lead?.name||'未指派組長')+'</strong>'+(lead?.phone?'<a class="task-team-phone" href="tel:'+esc(canDial(lead))+'" onclick="event.stopPropagation()">☎ '+esc(prettyPhone(lead.phone))+'</a>':'')+'</span>'+taskProgress(done,entries.length)+'</span><span class="task-team-row task-team-route"><strong>'+esc(area)+'</strong><span class="task-route-separator" aria-hidden="true">・</span><span class="task-team-shift"><span class="legend-pin '+shiftClass+'" aria-hidden="true">'+shiftIcon+'</span>'+esc(shift)+'</span><span class="task-team-plate">'+esc(routeDisplay)+'</span></span></summary><div class="task-member-list">'+[...members.entries()].map(([id,jobs])=>{const p=state.people.find(x=>x.id===id),completed=jobs.filter(x=>x.status==='完成').length;return '<div class="task-member-progress"><div><strong>'+esc(p?.name||'志工')+'</strong><small>'+esc(area)+' · '+esc(shift)+' · '+esc(routeDisplay)+'</small></div>'+taskProgress(completed,jobs.length)+'</div>'}).join('')+'</div></details>';
 }).join('')+'</details>';
 };
 root.classList.toggle('task-date-layout',days.length>0);
 const categoryHtml=category=>'<details class="surface task-date-category task-date-'+category+'" '+(category==='current'?'open':'')+'><summary>'+dateLabels[category]+' · '+dateGroups[category].length+' 天</summary><div class="task-date-category-body">'+(dateGroups[category].length?dateGroups[category].map(dayHtml).join(''):'<div class="empty">目前沒有'+dateLabels[category]+'資料</div>')+'</div></details>';
 root.innerHTML=days.length?'<div class="task-date-left-stack">'+categoryHtml('history')+categoryHtml('future')+'</div>'+categoryHtml('current'):'<div class="empty">目前沒有正式排班資料</div>';
}
function phoneDigits(s){return String(s||'').replace(/\D/g,'')}
function openVolunteerLogin(){
 const demo=!!state.demo;
 showModal('志工手機登入',`<div class="volunteer-login-form"><label>手機電話號碼<input id="volunteerPhoneInput" type="tel" inputmode="tel" autocomplete="tel" placeholder="09xx xxx xxx" aria-label="志工手機號碼"></label><div class="auth-notice">${demo?'目前為匿名示範帳號，不驗證真實手機身分；正式版必須完成簡訊 OTP 與伺服器授權。':'正式電話登入尚未串接 SMS OTP。為保護志工聯絡資料，不能只輸入電話號碼就登入。'}</div>${demo?`<button class="primary wide" type="button" data-login-demo="true">使用示範電話進入</button><div class="demo-phones"><strong>示範電話</strong><button data-fill-demo-phone="0999000001">0999000001（示範志工 A）</button><button data-fill-demo-phone="0999000002">0999000002（示範志工 B）</button><button data-fill-demo-phone="0999000003">0999000003（示範志工 C）</button></div>`:`<button class="primary wide" type="button" disabled>等待簡訊驗證服務啟用</button>`}</div>`);
}
function loginDemoVolunteer(){
 if(!state.demo){toast('正式手機登入須先啟用 SMS OTP，不能略過驗證');return}
 const digits=phoneDigits($('#volunteerPhoneInput')?.value);
 const p=state.people.find(x=>phoneDigits(x.phone)===digits);
 if(!p || !/^099900000[1-6]$/.test(digits)){toast('僅接受畫面標示的匿名示範電話');return}
 volunteerId=p.id;volunteerPhone=digits;closeModal();go('volunteer');toast(`${p.name} 已進入示範跟巡工作台`);
}
function logoutVolunteer(){volunteerId='';volunteerPhone='';go('areas')}
function volunteerTasks(){
 if(!volunteerId)return [];
 const tasks=[];
 for(const [scheduleId,record] of Object.entries(state.plans||{})){
  const ix=scheduleId.indexOf('|'),route=scheduleId.slice(ix+1),day=scheduleId.slice(0,ix),routeRowsAll=data.stops.filter(r=>routeKey(r)===route);
  for(const row of routeRowsAll){
   const stopId=stopKey(row),personal=(record.stops?.[stopId]?.people||[]).includes(volunteerId),team=(record.teams?.[row['里別']]||[]).includes(volunteerId);
   if(personal||team)tasks.push({day,route,row,stopId,status:record.stops?.[stopId]?.status||'待訪',team});
  }
 }
 return tasks.sort((x,y)=>x.day.localeCompare(y.day)||x.row['時段'].localeCompare(y.row['時段'])||Number(x.row['清運次序'])-Number(y.row['清運次序']));
}
function renderVolunteer(){
 const person=state.people.find(p=>p.id===volunteerId);
 if(!person){logoutVolunteer();return}
 $('#volunteerWelcome').innerHTML=`<div class="volunteer-welcome-head"><strong>👤 ${esc(person.name)}</strong><span class="demo-label">匿名示範 · 非真實身分驗證</span></div><p>分派服務里：<b>${esc(person.assignment||'待分配')}</b> · 示範號碼：${esc(person.phone||'')}</p><small>以下完成狀態與管理者車次畫面使用同一份本機排班資料，但不會同步到其他手機。</small>`;
 const jobs=volunteerTasks();
 $('#volunteerSchedules').innerHTML=jobs.length?jobs.map(t=>`<article class="volunteer-task ${t.status==='完成'?'completed':''}"><div class="volunteer-task-top"><span class="volunteer-task-day">${esc(t.day)} · ${esc(t.row['時段'])}</span><span class="volunteer-task-status">${esc(t.status)}</span></div><strong>${esc(t.row['里別'])} · ${esc(t.row['車次'])}（${esc(t.row['車牌'])}）</strong><p>${esc(t.row['到達'])}｜${esc(t.row['停靠點原文'])}</p><div class="volunteer-task-footer"><small>${t.team?'里別跟巡小組':'個別站點指派'}</small><button data-volunteer-complete="${esc(t.stopId)}" data-volunteer-schedule="${esc(t.day+'|'+t.route)}" ${t.status==='完成'?'disabled':''}>${t.status==='完成'?'✓ 已完成':'✓ 標記已完成'}</button></div></article>`).join(''):'<div class="empty">目前尚無安排給你的站點，請先由管理者在跟巡排班指定車次或站點。</div>';
}
function completeVolunteerStop(scheduleId,stopId){
 if(!state.demo||!volunteerId){toast('請先完成志工示範登入');return false}
 const person=state.people.find(p=>p.id===volunteerId),entry=state.plans[scheduleId],route=scheduleId.slice(scheduleId.indexOf('|')+1),row=data.stops.find(r=>stopKey(r)===stopId&&routeKey(r)===route);
 if(!person||!entry||!row){toast('找不到原始跟巡指派');return false}
 const assigned=(entry.teams?.[row['里別']]||[]).includes(volunteerId)||(entry.stops?.[stopId]?.people||[]).includes(volunteerId);
 if(!assigned||person.assignment!==row['里別']){toast('此站未指派給目前志工');return false}
 entry.stops||={};entry.stops[stopId]||={chosen:false,status:'待訪',people:[],note:''};
 entry.stops[stopId].chosen=true;entry.stops[stopId].status='完成';entry.stops[stopId].completedAt=new Date().toISOString();entry.stops[stopId].completedBy=volunteerId;
 save();renderVolunteer();toast('✓ 完成狀態已更新到本機車次拜訪表');return true;
}

function showModal(title,body){document.querySelectorAll('.sheet-head .delete-person-title').forEach(button=>button.remove());$('#modalTitle').textContent=title;$('#modalBody').innerHTML=body;$('#modal').classList.toggle('settings-open',title==='設定與安裝應用程式');$('#modal').classList.toggle('member-create-open',title==='新增會員｜名冊與授權同步建立');$('#modal').classList.remove('planner-picker-open');$('#modal').hidden=false}
function closeModal(){document.querySelectorAll('.sheet-head .delete-person-title').forEach(button=>button.remove());$('#modal').hidden=true;pickerKind=''}
function pick(kind,opts){pickerKind=kind;const allowed=opts.allowed||state.people;const itemHtml=allowed.length?allowed.map(p=>`<div class="pick-row"><div><strong>${esc(p.name)}</strong><br/><small>${esc(p.assignment||'待分配')}</small></div><div class="pick-row-actions"><button data-pick-id="${esc(p.id)}">選擇</button>${kind==='area'&&p.phone?`<button class="lead-pick" data-pick-leader="${esc(p.id)}" title="加入並設為組長">👑 組長</button>`:''}</div></div>`).join(''):'<div class="empty">沒有可排班的志工。同時段已被安排的人員需先移除舊指派，或先到服務分區新增人員。</div>';showModal(opts.title,`<div class="pick-list">${itemHtml}</div>`);$('#modal').classList.toggle('planner-picker-open',kind==='team'||kind==='stop')}
function editPerson(id){const p=state.people.find(x=>x.id===id),newMode=!p;const x=p||{id:'',name:'',phone:'',address:'',residentArea:'待確認',assignment:''};showModal(newMode?'新增人員':'個資編輯',`<form id="personForm"><input type="hidden" name="id" value="${esc(x.id)}" /><input type="hidden" name="assignment" value="${esc(x.assignment||'')}" /><label>姓名 *<input name="name" maxlength="80" required value="${esc(x.name)}"></label><label>電話<input name="phone" maxlength="80" value="${esc(x.phone)}"></label><label>地址<input name="address" maxlength="300" value="${esc(x.address)}"></label><label>原居住里別<input name="residentArea" maxlength="80" value="${esc(x.residentArea&&x.residentArea!=='待確認'?x.residentArea:'')}"></label><div class="person-actions form-bottom-actions"><button class="primary save-confirm yellow-save" type="submit">${newMode?'確認新增人員':'確認儲存修改'}</button></div></form>`);if(!newMode){const title=$('#modalTitle');const del=document.createElement('button');del.type='button';del.className='delete-person-title';del.textContent='刪除人員';del.dataset.deletePerson=x.id;title.after(del)}}
function savePersonForm(f){const form=new FormData(f),id=String(form.get('id')||''),name=String(form.get('name')||'').trim(),assignment=String(form.get('assignment')||'');if(!name)return toast('請輸入姓名');if(assignment&&!areas.includes(assignment))return toast('無效里別');let p=state.people.find(x=>x.id===id);if(!p){p=personNorm({id:'P'+Date.now().toString(36)+Math.floor(Math.random()*1000),name,assignment});state.people.push(p)}const previous=p.assignment;p.name=name;p.phone=String(form.get('phone')||'');p.address=String(form.get('address')||'');p.residentArea=String(form.get('residentArea')||'待確認').trim()||'待確認';p.assignment=assignment;if(previous!==assignment){cleanLeader(p.id,previous);p.serviceLat=null;p.serviceLon=null;for(const v of Object.values(state.plans)){for(const key of Object.keys(v.teams||{}))v.teams[key]=v.teams[key].filter(x=>x!==p.id);for(const s of Object.values(v.stops||{}))s.people=(s.people||[]).filter(x=>x!==p.id)}}state.demo=false;save();closeModal();render();toast('已儲存名冊')}
function deletePerson(id){const p=state.people.find(x=>x.id===id);if(!p||!confirm(`確定永久刪除 ${p.name}？此動作會移除相關排程，請先備份。`))return;state.people=state.people.filter(x=>x.id!==id);cleanLeader(id);for(const v of Object.values(state.plans)){for(const a of Object.keys(v.teams||{}))v.teams[a]=v.teams[a].filter(x=>x!==id);for(const s of Object.values(v.stops||{}))s.people=(s.people||[]).filter(x=>x!==id)}save();closeModal();render();toast('已刪除本機名冊紀錄')}
function csvCell(x){const s=String(x??'');return '"'+(/^[\s]*[=+@\-\t\r]/.test(s)?"'"+s:s).replaceAll('"','""')+'"'}
function dl(name,body,type='application/json'){const b=new Blob([body],{type}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000)}
function exportData(type){if(type==='json'){dl('achang_private_backup_'+stamp()+'.json',JSON.stringify({format:'ACHANG_PWA_FULL_V1',exportedAt:new Date().toISOString(),data:state},null,2));toast('已下載完整私密備份');return}const areaOrder=a=>{const idx=areas.indexOf(a);return idx<0?999:idx};const head=type==='roster'?['ID','姓名','電話','地址','原居住里','分派服務里']:['日期','時段','車次','里別','停靠站','到達','志工','狀態'];let rows=[head];if(type==='roster'){const sorted=[...state.people].sort((x,y)=>areaOrder(x.assignment||'待分配')-areaOrder(y.assignment||'待分配')||(x.assignment||'待分配').localeCompare(y.assignment||'待分配','zh-Hant')||x.name.localeCompare(y.name,'zh-Hant'));rows.push(...sorted.map(p=>[p.id,p.name,p.phone,p.address,p.residentArea||'',p.assignment||'待分配']))}else{const exports=[];for(const [key,p] of Object.entries(state.plans))for(const [sid,s] of Object.entries(p.stops||{})){if(!s.chosen)continue;const r=data.stops.find(x=>stopKey(x)===sid);if(!r)continue;const ids=uniq([...(p.teams[r['里別']]||[]),...(s.people||[])]);exports.push([key.split('|')[0],r['時段'],r['車次'],r['里別'],r['停靠點原文'],r['到達'],ids.map(id=>state.people.find(x=>x.id===id)?.name).filter(Boolean).join('、'),s.status,Number(r['清運次序']||999)])}exports.sort((a,b)=>areaOrder(a[3])-areaOrder(b[3])||a[0].localeCompare(b[0])||a[1].localeCompare(b[1])||String(a[2]).localeCompare(String(b[2]))||a[8]-b[8]);rows.push(...exports.map(r=>r.slice(0,8)))}dl('achang_'+type+'_'+stamp()+'.csv','\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');toast('CSV 已下載到目前裝置')}
async function importData(file){if(!file)return;try{const obj=JSON.parse(await file.text());let source=obj.data?.people||obj.people||obj.roster?.people||null;let restoreFull=obj.format==='ACHANG_PWA_FULL_V1'&&obj.data;if(!Array.isArray(source)||source.length>2000)throw Error('不支援的 JSON 名冊格式');const norm=source.map(personNorm).filter(x=>x.id&&x.name);if(!norm.length)throw Error('找不到有效人員資料');if(new Set(norm.map(x=>x.id)).size!==norm.length)throw Error('名冊 ID 重複');if(!confirm(`匯入 ${norm.length} 位志工將取代目前本機名冊，請先備份。繼續嗎？`))return;state=restoreFull?{...makeState(),...obj.data,people:norm,demo:false}:{...makeState(),people:norm,demo:false};state.pins=state.pins||{};state.plans=state.plans||{};save();closeModal();go('areas');toast(`已匯入 ${norm.length} 筆私密名冊，未上傳伺服器`)}catch(err){toast('匯入失敗：'+err.message)}}
function openMenu(){showModal('設定與安裝應用程式',`<div class="pick-list"><div class="install-tip"><strong>安裝永康十里志工地圖</strong><button class="install-app-large" type="button" data-install-app>安裝應用程式</button><small>Google Chrome：右上角 ⋮ → 安裝並建立捷徑</small><small>iPhone Safari：分享 → 加入主畫面</small></div><div class="pick-row"><strong>服務里人員分配 CSV</strong><button data-export="roster">下載</button></div><div class="pick-row"><strong>垃圾車跟巡拜訪 CSV</strong><button data-export="schedule">下載</button></div><div class="pick-row"><div><strong>目前裝置：${state.people.length} 位志工</strong><br><small>資料經授權由雲端保存，可跨裝置讀回。</small></div></div></div>`)}
function areaCentroid(a){const feature=data.geo.features.find(f=>f.properties.name===a);if(!feature)return[120.2405,23.005];const coords=feature.geometry.coordinates[0];const lons=coords.map(c=>c[0]),lats=coords.map(c=>c[1]);return [(Math.min(...lons)+Math.max(...lons))/2,(Math.min(...lats)+Math.max(...lats))/2]}
function startPin(key){const r=data.stops.find(x=>stopKey(x)===key);if(!r)return;pinTarget=key;go('areas');toast('請於地圖點選站點實際位置')}
function applyPin(lon,lat){if(!pinTarget)return;const r=data.stops.find(x=>stopKey(x)===pinTarget);if(!r)return;const key=pinTarget;if(!confirm(`將「${r['停靠點原文']}」標記於 ${lat.toFixed(5)}, ${lon.toFixed(5)}？此座標需再核對。`))return;state.pins[key]={lon:+lon.toFixed(6),lat:+lat.toFixed(6),status:'人工標點待核對'};pinTarget=null;save();updateMap();toast('已標記站點（待現場核對）')}
function clearMapLoadTimer(){if(mapLoadTimer){clearTimeout(mapLoadTimer);mapLoadTimer=null}}
function teardownMap(){clearMapLoadTimer();markers.forEach(marker=>{try{marker.remove()}catch(e){}});markers=[];const current=map;map=null;mapLoaded=false;if(current){try{current.remove()}catch(e){console.warn('MapLibre cleanup error',e?.message||'')}}$('#mapLibre')?.replaceChildren()}
function showMapCanvas(){const canvas=$('#mapLibre'),fallback=$('#mapFallback');if(canvas)canvas.style.display='block';if(fallback){fallback.hidden=true;fallback.innerHTML='';fallback.onclick=null}mapFailed=false;mapFailureMessage='';$('#mapLegendStatus').textContent=''}
function fatalMapStartupError(message){return /worker|webgl|context lost|securityerror|content security policy|\bcsp\b|not supported|unsupported/i.test(message||'')}
function mapFailureLabel(message){if(/載入逾時/.test(message||''))return'互動地圖載入逾時';if(/webgl|context/i.test(message||''))return'此瀏覽器無法啟用互動地圖';if(/worker|security|content security policy|\bcsp\b/i.test(message||''))return'互動地圖安全元件無法啟動';return'互動地圖暫時無法載入'}
function loadMapStyles(){const current=$('#mapLibreStyles');if(current?.dataset.loaded==='true')return Promise.resolve();current?.remove();return new Promise((resolve,reject)=>{const link=document.createElement('link');link.id='mapLibreStyles';link.rel='stylesheet';link.href=MAPLIBRE_CSS;const timer=setTimeout(()=>{link.remove();reject(Error('MapLibre 樣式載入逾時'))},MAP_LOAD_TIMEOUT_MS);link.onload=()=>{clearTimeout(timer);link.dataset.loaded='true';resolve()};link.onerror=()=>{clearTimeout(timer);link.remove();reject(Error('MapLibre 樣式無法載入'))};document.head.append(link)})}
function loadMapLibrary(){const styles=loadMapStyles();if(window.maplibregl)return styles.then(()=>window.maplibregl);const library=new Promise((resolve,reject)=>{const prior=$('#mapLibreScript');if(prior)prior.remove();const script=document.createElement('script');script.id='mapLibreScript';script.src=MAPLIBRE_JS;script.async=true;const timer=setTimeout(()=>{script.remove();reject(Error('MapLibre 程式庫載入逾時'))},MAP_LOAD_TIMEOUT_MS);script.onload=()=>{clearTimeout(timer);window.maplibregl?resolve(window.maplibregl):reject(Error('MapLibre 載入後未初始化'))};script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('MapLibre 程式庫無法載入'))};document.head.append(script)});return Promise.all([library,styles]).then(([lib])=>lib)}
function failMapStartup(message,attempt=mapAttempt){if(attempt!==mapAttempt||mapLoaded)return;console.warn('MapLibre startup failed',message);teardownMap();drawFallback(mapFailureLabel(message))}
function initMap(){if(map||mapLoaded)return Promise.resolve();if(mapInitPromise)return mapInitPromise;mapInitPromise=(async()=>{showMapCanvas();let lib;try{lib=await loadMapLibrary()}catch(e){drawFallback(e?.message||'互動地圖程式庫無法載入');return}if(!(lib.supported?.()??true)){drawFallback('此瀏覽器無法啟用互動地圖');return}const attempt=++mapAttempt;try{const instance=new lib.Map({container:'mapLibre',style:'https://tiles.openfreemap.org/styles/liberty',center:[120.24,23.005],zoom:13.9,minZoom:12,maxZoom:18,maxBounds:[[120.205,22.968],[120.281,23.049]],attributionControl:false,dragRotate:false,pitchWithRotate:false});map=instance;instance.addControl(new lib.NavigationControl({showCompass:false}),'top-right');instance.addControl(new lib.AttributionControl({compact:true}),'bottom-right');mapLoadTimer=setTimeout(()=>failMapStartup('互動地圖載入逾時',attempt),MAP_LOAD_TIMEOUT_MS);instance.on('load',()=>{if(attempt!==mapAttempt||instance!==map)return;clearMapLoadTimer();mapLoaded=true;mapFailed=false;mapFailureMessage='';if(!instance.getSource('villages'))instance.addSource('villages',{type:'geojson',data:data.geo});if(!instance.getLayer('village-fill'))instance.addLayer({id:'village-fill',type:'fill',source:'villages',paint:{'fill-color':['get','color'],'fill-opacity':0.19}});if(!instance.getLayer('village-lines'))instance.addLayer({id:'village-lines',type:'line',source:'villages',paint:{'line-color':['get','color'],'line-width':2.8}});instance.on('click','village-fill',e=>{if(pinTarget){applyPin(e.lngLat.lng,e.lngLat.lat);return}const a=e.features?.[0]?.properties?.name;if(a&&visibleMapAreas().includes(a)){openAreaPreview(a);$('#mapLegendStatus').textContent='已選取 '+a}});instance.on('click',e=>{if(pinTarget)applyPin(e.lngLat.lng,e.lngLat.lat)});instance.on('move',()=>{if(!$('#areaPopup').hidden)positionAreaPopup()});updateMap();if(page==='map')requestAnimationFrame(()=>{instance.resize();centerTodayVillage()})});instance.on('error',e=>{if(attempt!==mapAttempt||instance!==map)return;const message=e?.error?.message||'';console.warn('MapLibre map error',message);if(!mapLoaded&&fatalMapStartupError(message))failMapStartup(message,attempt)})}catch(e){if(attempt===mapAttempt){const message=e?.message||'互動地圖無法啟動';console.warn('MapLibre startup exception',message);teardownMap();drawFallback(mapFailureLabel(message))}}})().finally(()=>{mapInitPromise=null});return mapInitPromise}
function retryMap(){teardownMap();mapFailed=false;mapFailureMessage='';showMapCanvas();requestAnimationFrame(()=>{initMap().then(()=>{map?.resize();updateMap()})})}
function marker(icon,lon,lat,type,title,onClick=null,count=0,leader=false){if(!map||!coord(lon)||!coord(lat))return;const outer=document.createElement('div');outer.className='marker-container';const tag=document.createElement('div');tag.className='map-marker '+type+(count?' group':'');tag.title=title;const span=document.createElement('span');if(icon==='avatar'){span.innerHTML='<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><circle cx="12" cy="7.3" r="4.1" fill="currentColor"/><path d="M3.3 22v-3.5c0-4.5 3.5-7.1 8.7-7.1s8.7 2.6 8.7 7.1V22" fill="currentColor"/></svg>'}else span.textContent=icon;tag.append(span);if(count){const b=document.createElement('small');b.textContent=count;tag.append(b)}if(leader){const crown=document.createElement('b');crown.className='marker-crown';crown.textContent='👑';tag.append(crown)}outer.append(tag);if(onClick)tag.addEventListener('click',e=>{e.stopPropagation();onClick()});const m=new window.maplibregl.Marker({element:outer,anchor:'bottom'}).setLngLat([lon,lat]).addTo(map);markers.push(m)}
/* Assigned stations are scoped to the logged-in volunteer and the local service day. */
function visibleShiftStops(area,shiftName){
 const rows=data.stops.filter(r=>r['里別']===area&&r['時段']===shiftName&&!sourceExcluded(r));
 if(liveRole!=='volunteer')return rows;
 const mine=liveTasks.filter(t=>t.volunteer_id===liveMemberId&&t.visit_date===today()&&t.area===area&&t.shift===shiftName);
 const unique=new Map();
 for(const t of mine){
  const row=rows.find(r=>r['停靠點原文']===t.stop_address&&r['車牌']===t.truck&&Number(r['清運次序'])===Number(t.stop_order))
   ||rows.find(r=>r['停靠點原文']===t.stop_address&&r['車牌']===t.truck)
   ||rows.find(r=>r['停靠點原文']===t.stop_address);
  const key=[t.truck,t.stop_order,t.stop_address].join('|');
  if(!unique.has(key))unique.set(key,{time:row?.['到達']||'',address:t.stop_address||row?.['停靠點原文']||''});
 }
 return [...unique.values()].sort((x,y)=>x.time.localeCompare(y.time));
}
function openShiftStopPopup(area,shiftName){
 const rows=visibleShiftStops(area,shiftName);
 if(!rows.length)return;
 const root=$('#areaPopup'),box=$('#mapBox');
 if(root.parentElement!==box)box.append(root);
 const items=rows.map((r,i)=>{
  const time=r.time??r['到達']??'',address=r.address??r['停靠點原文']??'';
  const destination='台南市永康區'+String(address).replace(/^台南市(?:永康區)?/,'').replace(/^永康區/,'');
  const url='https://www.google.com/maps/dir/?api=1&travelmode=driving&destination='+encodeURIComponent(destination);
  return '<div class="assigned-stop-row"><span>'+esc(time)+'</span><strong>'+esc(address)+'</strong><a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" aria-label="導航到第'+(i+1)+'站：'+esc(address)+'"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg><span>導航到站點</span></a></div>';
 }).join('');
 root.classList.remove('restored-map-popup','map-attached-popup');
 root.classList.add('owner-center-popup','assigned-stops-popup');root.classList.toggle('night-stops-popup',shiftName==='夜間');root.classList.toggle('day-stops-popup',shiftName==='日間');
 root.innerHTML='<div class="popup-top"><strong class="popup-area-name">'+esc(area)+' · '+esc(shiftName)+' '+rows.length+'站</strong><button type="button" data-close-area aria-label="關閉站點">✕</button></div><div class="assigned-stop-list">'+items+'</div>';
 root.hidden=false;requestAnimationFrame(positionAreaPopup);
}
function stopGpsRefresh(){}
function updateMapLayerNotice(){
 const node=$('#mapLayerNotice');if(!node||!data)return;
 const messages=[];
 if(layerState.day){
  const all=data.stops.filter(row=>row['時段']==='日間'&&row['日間分類']==='six'),pdf=all.filter(row=>!row['管理員站點']),overlays=all.filter(row=>row['管理員站點']),active=pdf.filter(row=>!sourceExcluded(row));
  const ab=data.stops.filter(row=>row['時段']==='日間'&&row['日間分類']==='ab'&&!sourceExcluded(row));
  const located=active.filter(row=>areas.includes(row['里別'])).length;
  messages.push(`PDF 日間：${new Set(pdf.map(routeKey)).size} 車次・原始 ${pdf.length} 筆・可用 ${active.length} 筆；管理員新增 ${overlays.length} 筆，現行共 ${active.length+overlays.length} 筆；十里圖層可依來源里別彙總 ${located+overlays.filter(row=>areas.includes(row['里別'])).length} 筆（無站點座標，不放置假站點）。`);
  messages.push(ab.length?`週三／五 A／B：${new Set(ab.map(routeKey)).size} 路線・${ab.length} 筆，獨立顯示，不併入 PDF 日間統計。`:'週三／五 A／B：所選日期無固定路線，獨立入口保留。');
 }
 if(layerState.night){
  const all=data.stops.filter(row=>row['時段']==='夜間'),pdf=all.filter(row=>!row['管理員站點']),overlays=all.filter(row=>row['管理員站點']),active=pdf.filter(row=>!sourceExcluded(row)),struck=pdf.length-active.length;
  const located=active.filter(row=>areas.includes(row['里別'])).length;
  messages.push(`PDF 夜間：${new Set(pdf.map(routeKey)).size} 車次・原始 ${pdf.length} 筆・可用 ${active.length} 筆${struck?`（另 ${struck} 筆原表刪除線，僅供追溯、不指派）`:''}${overlays.length?`；管理員新增 ${overlays.length} 筆，現行共 ${active.length+overlays.length} 筆`:''}；十里圖層可依來源里別彙總 ${located+overlays.filter(row=>areas.includes(row['里別'])).length} 筆（無站點座標，不放置假站點）。`);
 }
 node.hidden=messages.length===0;node.textContent=messages.join(' ');
}
function updateMap(){if(page!=='map')return;updateMapLayerNotice();if(mapFailed){drawFallback();return}if(!map||!map.getLayer('village-fill'))return;highlightMapSelection();markers.forEach(m=>m.remove());markers=[];
 for(const a of visibleMapAreas()){
  const c=areaCentroid(a),cnt=assignedPeople(a).length,lead=leaderOf(a);
  const areaLabel=document.createElement('div');areaLabel.className='map-area-label'+(a===selectedArea?' selected':'');areaLabel.textContent=a;
  markers.push(new window.maplibregl.Marker({element:areaLabel,anchor:'center'}).setLngLat([c[0],c[1]+0.00112]).addTo(map));
  if(layerState.volunteer){
   marker('avatar',c[0],c[1],'volunteer',a+' · 志工小組',()=>{selectedArea=a;openAreaPreview(a)},cnt,!!lead);
   if(liveRole!=='volunteer')for(const p of state.people.filter(p=>p.assignment===a&&coord(p.serviceLon)&&coord(p.serviceLat)))marker('avatar',p.serviceLon,p.serviceLat,'volunteer',p.name+' · 服務落點',()=>{selectedArea=a;openAreaPreview(a)});
  }
  for(const [shiftName,enabled,type,delta] of [['日間',layerState.day,'day',-0.0007],['夜間',layerState.night,'night',0.0007]]){
   if(!enabled)continue;
   const rows=visibleShiftStops(a,shiftName);
   if(rows.length)marker(shiftName==='日間'?'☀':'☾',c[0]+delta,c[1]-0.0008,type,a+' '+shiftName+' '+rows.length+'站',()=>openShiftStopPopup(a,shiftName),rows.length);
  }
 }
 if(liveRole!=='volunteer')for(const r of data.stops){
  const pos=state.pins[stopKey(r)];if(!pos||!coord(pos.lon)||!coord(pos.lat))continue;
  if((r['時段']==='日間'&&!layerState.day)||(r['時段']==='夜間'&&!layerState.night))continue;
  marker(r['時段']==='日間'?'☀':'☾',pos.lon,pos.lat,r['時段']==='日間'?'day':'night',r['到達']+' '+r['停靠點原文'],()=>openShiftStopPopup(r['里別'],r['時段']));
 }
}
function positionAreaPopup(){const pop=$('#areaPopup');if(pop.hidden)return;if(liveRole==='admin'&&page==='map'){pop.classList.remove('owner-center-popup');const box=$('#mapBox');if(!box||!data)return;if(window.matchMedia?.('(max-width:620px)').matches){pop.style.setProperty('left','50%','important');pop.style.setProperty('top','50%','important');pop.style.setProperty('transform','translate(-50%,-50%)','important');return}pop.style.setProperty('transform','none','important');let x=box.clientWidth/2,y=box.clientHeight/2;const c=areaCentroid(selectedArea);if(map&&!mapFailed){const p=map.project(c);x=p.x;y=p.y}else{const w=box.clientWidth,h=box.clientHeight;x=(c[0]-120.224)/(120.256-120.224)*w;y=(23.022-c[1])/(23.022-22.990)*h}const pw=Math.min(430,Math.max(210,box.clientWidth-20)),ph=Math.min(pop.scrollHeight||250,box.clientHeight-12);let left=x+32;if(left+pw>box.clientWidth-6)left=x-pw-32;left=Math.max(6,Math.min(left,box.clientWidth-pw-6));let top=Math.max(7,Math.min(y-45,box.clientHeight-ph-7));pop.style.setProperty('left',left+'px','important');pop.style.setProperty('top',top+'px','important');return;}pop.classList.add('owner-center-popup');}
function openAreaPreview(a,taskGroup=null){if(liveRole==='admin'&&page==='map'){if(!areas.includes(a))return;selectedArea=a;highlightMapSelection();const list=sortedMembers(a),visible=list.slice(0,6);const people=visible.map(p=>{const leader=p.id===leaderId(a);return '<div class="popup-contact '+(leader?'leader-row':'')+'"><strong>'+esc(p.name)+(leader?' <span class="popup-crown" aria-hidden="true">👑</span>':'')+'</strong>'+telLink(p)+'</div>'}).join('');const root=$('#areaPopup'),box=$('#mapBox');if(root.parentElement!==box)box.append(root);root.classList.remove('owner-center-popup');root.classList.add('map-attached-popup','restored-map-popup');root.style.removeProperty('left');root.style.removeProperty('top');root.innerHTML='<div class="popup-top"><div><strong class="popup-area-name">'+esc(a)+'</strong><span class="popup-count">已分配 '+list.length+' 人</span></div><button type="button" data-close-area aria-label="關閉里別名單">✕</button></div><div class="popup-contacts">'+(people||'<span class="mini-note">目前尚無服務志工</span>')+(list.length>6?'<small class="popup-more">另有 '+(list.length-6)+' 位，請至服務分區查看</small>':'')+'</div><button type="button" class="popup-detail-btn" data-view-assignment="'+esc(a)+'">前往此里分配 →</button>';root.hidden=false;requestAnimationFrame(positionAreaPopup);return;}if(taskGroup){const match=liveTasks.some(t=>t.volunteer_id===liveMemberId&&t.area===a&&[t.visit_date,t.shift,taskRouteToken(t),t.area].join('|')===taskGroup);if(!match)return;}else if(!visibleMapAreas().includes(a))return;selectedArea=a;if(page==='map')highlightMapSelection();const list=liveRole==='volunteer'?(previewDemoMode?[{id:liveMemberId,name:liveDisplayName,phone:''}]:groupContacts.filter(p=>p.area===a&&p.id!==liveMemberId)):sortedMembers(a);const people=list.map(p=>'<div class="popup-contact '+(p.isLeader?'leader-row':'')+'"><strong>'+esc(p.name)+(p.isLeader?' <span class="popup-crown" aria-hidden="true">👑</span>':'')+'</strong>'+telLink(p)+'</div>').join('');const root=$('#areaPopup');if(page!=='map'&&root.parentElement!==document.body)document.body.append(root);else if(page==='map'&&root.parentElement!==$('#mapBox'))$('#mapBox').append(root);root.innerHTML='<div class="popup-top"><div><span class="popup-eyebrow">當日小組任務</span><strong class="popup-area-name">'+esc(a)+'</strong><span class="popup-count">同組 '+list.length+' 位夥伴</span></div><button type="button" data-close-area aria-label="關閉里別名單">✕</button></div><div class="popup-contacts">'+(people||'<span class="mini-note">目前沒有其他小組成員</span>')+'</div>';root.hidden=false;root.classList.add('owner-center-popup');requestAnimationFrame(positionAreaPopup);}
function showAreaDetails(a){if(!areas.includes(a))return;const people=assignedPeople(a);const body=people.length?people.map(p=>`<div class="detail-person"><div><strong>${esc(p.name)}</strong>${residentHtml(p)?`<small>${residentHtml(p)}</small>`:''}<small>${esc(p.address||'未提供地址')}</small></div>${telLink(p)}</div>`).join(''):'<div class="empty">此里尚未分配志工</div>';showModal(`${a}｜已分配 ${people.length} 人`,`<div class="detail-person-list">${body}</div><button class="primary wide" data-view-assignment="${esc(a)}">前往此里分配</button>`)}
function drawFallback(message=mapFailureMessage){clearMapLoadTimer();mapFailed=true;mapLoaded=false;mapFailureMessage=message||'互動地圖暫時無法載入';$('#mapLibre').style.display='none';const root=$('#mapFallback');root.hidden=false;const f=data.geo.features,minX=120.224,maxX=120.256,minY=22.990,maxY=23.022,w=780,h=640;const proj=(lon,lat)=>[(lon-minX)/(maxX-minX)*w,(maxY-lat)/(maxY-minY)*h];let svg=`<svg class="offline-map-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="十里分區離線參考圖"><rect width="780" height="640" fill="#eaf2f6"/><path d="M0 130H780M0 260H780M0 420H780M0 560H780M130 0V640M320 0V640M520 0V640M680 0V640" stroke="#d1dfe8" stroke-width="11" fill="none"/>`;for(const z of f){if(liveRole==='volunteer'&&!visibleMapAreas().includes(z.properties.name))continue;const xy=z.geometry.coordinates[0].map(p=>proj(p[0],p[1])),an=z.properties.name,c=areaCentroid(an),ct=proj(c[0],c[1]),sel=an===selectedArea;svg+=`<polygon data-fallback-area="${esc(an)}" points="${xy.map(p=>p.map(n=>n.toFixed(1)).join(',')).join(' ')}" fill="${z.properties.color}" fill-opacity="${sel?.52:.25}" stroke="${sel?'#dc263b':z.properties.color}" stroke-width="${sel?9:3}"/>`;const cnt=assignedPeople(an).length,dayCount=visibleShiftStops(an,'日間').length,nightCount=visibleShiftStops(an,'夜間').length;let badges=[];if(layerState.volunteer)badges.push(['avatar',cnt,'#f28a2f',!!leaderOf(an)]);if(layerState.day&&dayCount)badges.push(['☀',dayCount,'#eab43a',false]);if(layerState.night&&nightCount)badges.push(['☾',nightCount,'#5558ad',false]);svg+=`<text data-fallback-area="${esc(an)}" x="${ct[0]}" y="${ct[1]-31}" text-anchor="middle" class="offline-map-label" fill="${sel?'#0e6374':'#25465f'}">${esc(an)}</text>`;badges.forEach((b,i)=>{const dx=(i-(badges.length-1)/2)*44;svg+=`<g data-fallback-area="${esc(an)}" class="offline-badge"><circle data-fallback-area="${esc(an)}" cx="${ct[0]+dx}" cy="${ct[1]+3}" r="21" fill="${b[2]}" stroke="#fff" stroke-width="3"/><text data-fallback-area="${esc(an)}" x="${ct[0]+dx}" y="${ct[1]+9}" text-anchor="middle" fill="white" font-size="16" font-weight="900">${b[0]==='avatar'?'👤':b[0]}${b[1]}</text>${b[3]?`<text data-fallback-area="${esc(an)}" x="${ct[0]+dx+15}" y="${ct[1]-15}" font-size="17">👑</text>`:''}</g>`})}svg+=`</svg><div class="map-recovery" role="status"><strong>${esc(mapFailureMessage)}</strong><button type="button" class="map-retry" data-retry-map>重試互動地圖</button></div>`;root.innerHTML=svg;root.onclick=e=>{if(e.target.closest('[data-retry-map]')){retryMap();return}const a=e.target?.closest('[data-fallback-area]')?.getAttribute('data-fallback-area')||e.target?.getAttribute('data-fallback-area');if(a&&!pinTarget){openAreaPreview(a);$('#mapLegendStatus').textContent='已選取 '+a;drawFallback();requestAnimationFrame(positionAreaPopup);return}if(pinTarget){const box=root.querySelector('svg').getBoundingClientRect(),xx=(e.clientX-box.left)/box.width*w,yy=(e.clientY-box.top)/box.height*h;applyPin(minX+xx/w*(maxX-minX),maxY-yy/h*(maxY-minY))}};$('#mapLegendStatus').textContent='十里分區參考地圖'}
function centerTodayVillage(){if(!map||!mapLoaded||liveRole!=='volunteer')return;const names=visibleMapAreas();if(!names.length)return;const current=myTasks().find(t=>t.visit_date===today());const area=current?.area||names[0];const feature=data?.geo?.features?.find(f=>f.properties?.name===area);if(!feature)return;const coords=(feature.geometry?.type==='MultiPolygon'?feature.geometry.coordinates.flat(2):feature.geometry.coordinates.flat(1)).filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]));if(!coords.length)return;const xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]);map.fitBounds([[Math.min(...xs),Math.min(...ys)],[Math.max(...xs),Math.max(...ys)]],{padding:65,duration:400,maxZoom:15.5});}
function mapFit(){if(map&&mapLoaded)map.fitBounds([[120.226,22.989],[120.253,23.022]],{padding:25,duration:400});else if(mapFailed)drawFallback()}
document.addEventListener('click',e=>{
 const summary=e.target.closest('[data-vol-summary]');
 if(summary&&!e.target.closest('[data-vol-group],[data-vol-complete-group],a')){
  const key=summary.dataset.volSummary;
  const open=!(volunteerGroupOpen.has(key)?volunteerGroupOpen.get(key):taskDateCategory(liveTasks.find(t=>[t.visit_date,t.shift,taskRouteToken(t),t.area].join('|')===key)||{})==='current');volunteerGroupOpen.set(key,open);
  const panel=summary.parentElement.querySelector('.volunteer-stop-panel');
  if(panel)panel.hidden=!open;
  const btn=summary.querySelector('[data-vol-expand]');
  if(btn){btn.setAttribute('aria-expanded',String(open));btn.setAttribute('aria-label',(open?'收合':'展開')+'停靠點列表');const arrow=btn.querySelector('.task-summary-chevron');if(arrow)arrow.textContent=open?'⌃':'⌄';}
  return;
 }
 const cat=e.target.closest('[data-vol-category]');if(cat&&liveRole==='volunteer'){volunteerTaskCategory=cat.dataset.volCategory;renderReports();return;}const group=e.target.closest('[data-vol-group]');if(group&&liveRole==='volunteer'){const ids=group.dataset.volGroup,related=liveTasks.filter(t=>[t.visit_date,t.shift,taskRouteToken(t),t.area].join('|')===ids);if(related.some(t=>t.volunteer_id===liveMemberId)){const area=related[0].area;openAreaPreview(area,ids);if(!previewDemoMode)onlineApi('tasks?groupArea='+encodeURIComponent(area)).then(r=>{groupContacts=groupContacts.filter(p=>p.area!==area);groupContacts.push(...(r.people||[]).map(p=>({id:p.member_id,name:p.display_name,phone:p.phone_e164,isLeader:p.is_leader,area})));if(!$('#areaPopup').hidden)openAreaPreview(area,ids)}).catch(e=>console.warn('小組人員名單讀取失敗',e.message));}return;}const done=e.target.closest('[data-vol-complete-group]');if(done&&liveRole==='volunteer')completeVolunteerGroup(done.dataset.volCompleteGroup);});
document.addEventListener('click',e=>{const p=$('#areaPopup');if(!p||p.hidden)return;if(e.target.closest('#areaPopup')||e.target.closest('[data-vol-group]')||e.target.closest('.map-area-label')||e.target.closest('.map-marker'))return;p.hidden=true;});
document.addEventListener('click',e=>{const close=e.target.closest?.('[data-close-area]'),p=$('#areaPopup');if(!close||!p||!p.contains(close))return;e.preventDefault();e.stopPropagation();p.hidden=true;},true);
function bind(){$$('[data-page]').forEach(el=>el.addEventListener('click',()=>go(el.dataset.page)));document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-go'))go(b.dataset.go);if(b.hasAttribute('data-close-area')){$('#areaPopup') && ($('#areaPopup').hidden=true)}if(b.hasAttribute('data-area-details'))showAreaDetails(b.dataset.areaDetails);if(b.hasAttribute('data-view-assignment')){selectedArea=b.dataset.viewAssignment;areaPage=Math.floor(areas.indexOf(selectedArea)/CARD_PAGE_SIZE);closeModal();$('#areaPopup') && ($('#areaPopup').hidden=true);go('areas')}if(b.hasAttribute('data-area-page')){areaPage=Math.min(Math.ceil(areas.length/CARD_PAGE_SIZE)-1,Math.max(0,Number(b.dataset.areaPage)));renderAreas()}if(b.hasAttribute('data-area')){selectedArea=b.dataset.area;areaPage=Math.floor(areas.indexOf(selectedArea)/CARD_PAGE_SIZE);go('areas')}if(b.hasAttribute('data-assign'))assignPerson(b.dataset.assign,selectedArea);if(b.hasAttribute('data-remove'))removePerson(b.dataset.remove);if(b.hasAttribute('data-leader'))assignLeader(b.dataset.leader,selectedArea);if(b.hasAttribute('data-team-area')){teamArea=b.dataset.teamArea;renderPlanner()}if(b.hasAttribute('data-route')){chosenRoute=b.dataset.route;resetVisitTime();renderPlanner()}if(b.hasAttribute('data-fill-demo-phone')){const input=$('#volunteerPhoneInput');if(input)input.value=b.dataset.fillDemoPhone}if(b.hasAttribute('data-login-demo'))loginDemoVolunteer();if(b.hasAttribute('data-volunteer-complete'))completeVolunteerStop(b.dataset.volunteerSchedule,b.dataset.volunteerComplete);if(b.id==='addTeam'){pick('team',{title:`${teamArea} 車次跟巡`,allowed:rosterAvailable(teamArea)})}if(b.hasAttribute('data-team-remove'))removeTeam(b.dataset.teamRemove);if(b.hasAttribute('data-add-stop')){const r=data.stops.find(x=>stopKey(x)===b.dataset.addStop);if(r){window.__pendingStop=b.dataset.addStop;pick('stop',{title:`指定 ${rowArea(r)} · ${r['停靠點原文']}`,allowed:rosterAvailable(rowArea(r))})}}if(b.hasAttribute('data-stop-remove')){removeStopMember(b.dataset.stop,b.dataset.stopRemove)}if(b.hasAttribute('data-edit-person'))editPerson(b.dataset.editPerson);if(b.hasAttribute('data-pick-person')){pickerKind='person-area:'+b.dataset.pickPerson;showModal('指定服務里',`<div class="pick-list person-area-picker">${areas.map(a=>`<div class="pick-row person-area-row"><strong>${esc(a)}</strong><button class="person-area-assign" data-person-area="${esc(a)}">分配</button></div>`).join('')}</div>`)}if(b.hasAttribute('data-person-area')){assignPerson(pickerKind.split(':').slice(1).join(':'),b.dataset.personArea);closeModal()}if(b.hasAttribute('data-pick-leader')){const pId=b.dataset.pickLeader;const ok=assignPerson(pId,selectedArea);if(ok)assignLeader(pId,selectedArea);closeModal()}if(b.hasAttribute('data-pick-id')){if(pickerKind==='area')assignPerson(b.dataset.pickId,selectedArea);if(pickerKind==='team')addTeam(b.dataset.pickId);if(pickerKind==='stop'){const target=window.__pendingStop;if(target)addStopVolunteer(target,b.dataset.pickId)}closeModal()}if(b.hasAttribute('data-export')){exportData(b.dataset.export);closeModal()}});
 $('#clearArea').onclick=clearSelectedArea;$('#areaPrev').onclick=()=>{areaPage=Math.max(0,areaPage-1);renderAreas()};$('#areaNext').onclick=()=>{areaPage=Math.min(Math.ceil(areas.length/CARD_PAGE_SIZE)-1,areaPage+1);renderAreas()};const pickBtn=$('#pickVolunteerBtn'); if(pickBtn) pickBtn.onclick=()=>pick('area',{title:`加入 ${selectedArea}`,allowed:state.people.filter(p=>!p.assignment)});const legacyAddPerson=$('#addPerson');if(legacyAddPerson)legacyAddPerson.onclick=()=>editPerson(null);$('#plannerAssignArea').onclick=()=>{if(teamArea)document.getElementById('addTeam')?.click()};$('#planDate').onchange=e=>{date=e.target.value||today();chosenRoute='';resetVisitTime();applyDayRoutes();renderPlanner();renderSummary()};$('#plannerAreaSelect').onchange=e=>{plannerArea=e.target.value;chosenRoute='';resetVisitTime();renderPlanner();renderSummary()};$$('[data-shift]').forEach(b=>b.onclick=()=>{shift=b.dataset.shift;chosenRoute='';resetVisitTime();renderPlanner();renderSummary()});$$('[data-day-category]').forEach(b=>b.onclick=()=>{dayRouteCategory=b.dataset.dayCategory;chosenRoute='';resetVisitTime();renderPlanner();renderSummary()});$('#visitStartTime').onchange=e=>{visitTimeCustomized=true;visitTimeStart=e.target.value;renderPlanner()};$('#visitEndTime').onchange=e=>{visitTimeCustomized=true;visitTimeEnd=e.target.value;renderPlanner()};$('#stopList').onchange=e=>{const sel=e.target.closest('[data-status]');if(sel)setStatus(sel.dataset.status,sel.value)};$('#peopleSearch').oninput=renderPeople;$('#peopleFilter').onchange=renderPeople;$('#peopleAreaFilter').onchange=renderPeople;$('#menuBtn').onclick=openMenu;document.addEventListener('click',e=>{if(e.target.closest('#loginFromTasks'))openSecureLogin()});$('#adminHeaderAction').onclick=()=>openMemberAdmin();document.addEventListener('click',async e=>{if(!e.target.closest('[data-install-app]'))return;if(installPrompt){const p=installPrompt;installPrompt=null;await p.prompt();await p.userChoice.catch(()=>{});}else{toast('目前瀏覽器未提供直接安裝提示，請使用瀏覽器選單「安裝應用程式」或 iPhone 分享→加入主畫面')}});document.addEventListener('click',async e=>{if(!e.target.closest('[data-run-install]'))return;if(installPrompt){await installPrompt.prompt();installPrompt=null}else toast('請從瀏覽器選單安裝或加入主畫面')});$('#volunteerLoginBtn').onclick=openSecureLogin;$('#installBtn').onclick=()=>installPrompt?.prompt();$('#installBtn').hidden=true;$('#closeModal').onclick=closeModal;$('#modal').onclick=e=>{if(e.target===$('#modal'))closeModal()};$('#modalBody').onclick=e=>{if(e.target.id==='importButton')$('#fileInput').click();const b=e.target.closest('button[data-add-stop]');if(b)window.__pendingStop=b.dataset.addStop};$('#modalBody').onchange=e=>{if(e.target.id==='fileInput')importData(e.target.files?.[0])};$('#modalBody').onsubmit=e=>{if(e.target.matches('form#personForm')){e.preventDefault();savePersonForm(e.target)}};const mapFitButton=$('#mapFit');if(mapFitButton)mapFitButton.onclick=mapFit;for(const [selector,k] of [['#layerVolunteer','volunteer'],['#layerDay','day'],['#layerNight','night']])if($(selector))$(selector).onchange=e=>{layerState[k]=e.target.checked;updateMap()};window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#installBtn').hidden=false});window.addEventListener('appinstalled',()=>{$('#installBtn').hidden=true;toast('已安裝到裝置')});}

// Online authenticated adapter: v0.4-style UI, server-authoritative roster & dispatch.
const LIVE_KEY='achang-v10-device-id';
// A device approval is bound to the browser/PWA storage origin; switching browsers requires separate approval.
let liveRole='',liveMemberId='',liveDisplayName='',liveTasks=[],liveBusy=false,liveTimer=null;
// Preserve a previously approved device ID in both localStorage and IndexedDB.
// Restoring the original ID must never bypass a revoked device's server-side status.
let groupContacts=[];
let deviceId='';
const deviceReady=(async()=>{
 let cached='';try{cached=localStorage.getItem(LIVE_KEY)||''}catch{}
 const backup=await new Promise(resolve=>{
  if(!('indexedDB' in window))return resolve('');
  try{
   const open=indexedDB.open('achang-device-identity',1);
   open.onupgradeneeded=()=>open.result.createObjectStore('identity');
   open.onerror=()=>resolve('');
   open.onsuccess=()=>{
    const db=open.result,tx=db.transaction('identity','readonly'),q=tx.objectStore('identity').get('deviceId');
    q.onsuccess=()=>{resolve(typeof q.result==='string'?q.result:'');db.close()};
    q.onerror=()=>{resolve('');db.close()};
   };
  }catch{resolve('')}
 });
 deviceId=cached||backup||crypto.randomUUID();
 try{localStorage.setItem(LIVE_KEY,deviceId)}catch{}
 if(backup!==deviceId&&'indexedDB' in window)try{
  const open=indexedDB.open('achang-device-identity',1);
  open.onupgradeneeded=()=>open.result.createObjectStore('identity');
  open.onsuccess=()=>{const db=open.result;const tx=db.transaction('identity','readwrite');tx.objectStore('identity').put(deviceId,'deviceId');tx.oncomplete=()=>db.close();tx.onerror=()=>db.close()};
 }catch{}
 return deviceId;
})();
async function onlineApi(endpoint,method='GET',body){
 await deviceReady;
 const r=await fetch('/api/'+endpoint,{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-AChang-Device':deviceId},body:body===undefined?undefined:JSON.stringify(body)});
 let doc;try{doc=await r.json()}catch{doc={error:'資料伺服器回傳格式錯誤'}};
 if(!r.ok)throw Object.assign(new Error(doc.error||`HTTP ${r.status}`),{status:r.status});
 return doc;
}
function assertAdmin(){if(liveRole!=='admin'){toast('只有管理員可編輯名冊與排班');return false}return true}
function showAuth(){
 document.body.classList.remove('volunteer-session');
 liveRole='';liveMemberId='';liveDisplayName='';state=makeState([]);liveTasks=[];
 for(const selector of ['#peopleList','#pendingMembers','#areaMembers','#volunteerSchedules','#areaPopup','#modalBody']){const el=$(selector);if(el)el.innerHTML=''}
 $('#modal').hidden=true;
 $('#secureLogin').hidden=true;$('#app').hidden=false;
 $$('.bottom-nav,.desktop-nav').forEach(x=>x.hidden=false);
 $('#volunteerLoginBtn').hidden=false;$('#volunteerLoginBtn').textContent='🔐 登入';$('#secureLogout').hidden=true;$$('[data-page]').forEach(b=>b.hidden=false);const adminTop=$('#adminHeaderAction');if(adminTop)adminTop.hidden=true;
 document.getElementById('addPerson') && ($('#addPerson').hidden=true);$('#addMember').hidden=true;$('#openRosterAuthorization').hidden=true;
 $('#rosterLocked').hidden=false;$('#peopleList').hidden=true;
 $('#clearArea').hidden=true;
 const z=$('#authStatus');z.textContent='首次登入或裝置授權失效時，請輸入已核准的帳號與密碼';
 render();go('areas');previewLoginButton();
}
function openSecureLogin(){if(liveRole==='admin')return openMemberAdmin();previewLoginButton();$('#secureLogin').hidden=false;$('#secureLoginForm input[name="login"]').focus()}
function updateAccessControls(){
 document.body.classList.toggle('volunteer-session',liveRole==='volunteer');
 const admin=liveRole==='admin';
 for(const b of $$('[data-page]')){const pg=b.dataset.page;if(liveRole==='volunteer'){b.hidden=pg==='areas'||pg==='planner'||pg==='people';b.querySelector('span')&&(b.querySelector('span').textContent=pg==='people'?'小組任務':pg==='reports'?'任務':'地圖');}else{b.hidden=false;if(pg==='people'&&b.querySelector('span'))b.querySelector('span').textContent='名冊';}}
 for(const id of ['addPerson','addMember','openRosterAuthorization','clearArea']){const control=document.getElementById(id);if(control)control.hidden=!admin;}
 $('#rosterLocked').hidden=admin||liveRole==='volunteer';const rosterFilters=$('#peopleSearch')?.closest('.filter-bar');if(rosterFilters)rosterFilters.hidden=liveRole==='volunteer';$('#peopleList').hidden=!(admin||liveRole==='volunteer');
 $('#volunteerLoginBtn').hidden=!!liveRole;
 $('#volunteerLoginBtn').textContent='🔐 登入';const adminTop=$('#adminHeaderAction');if(adminTop)adminTop.hidden=!admin;$('#secureLogout').hidden=!liveRole;const nameNode=$('#signedInName');if(nameNode){nameNode.hidden=!liveRole;nameNode.textContent=liveDisplayName||'登入者';}
}

async function secureSignOut(){stopGpsRefresh();if(previewDemoMode){previewDemoMode=false;clearInterval(liveTimer);liveTimer=null;showAuth();return;}try{await onlineApi('session','DELETE')}catch{}clearInterval(liveTimer);liveTimer=null;liveTasks=[];state=makeState([]);showAuth()}
async function authStart(){try{
 const session=await onlineApi('session');liveRole=session.role;liveMemberId=session.memberId;liveDisplayName=session.displayName||'';
 $('#secureLogin').hidden=true;$('#app').hidden=false;$('#accountBadge')?.remove();const adminTop=$('#adminHeaderAction');if(adminTop){adminTop.hidden=liveRole!=='admin';}updateAccessControls();
 if(liveRole==='admin'){
  $('#volunteerLoginBtn').hidden=true;
  $$('.bottom-nav,.desktop-nav').forEach(x=>x.hidden=false);
  await refreshOnline();go('areas');
 }else{
  $('#volunteerLoginBtn').hidden=true;
  $$('.bottom-nav,.desktop-nav').forEach(x=>x.hidden=false);
  await refreshOnline();go('map');
 }
 clearInterval(liveTimer);liveTimer=setInterval(()=>refreshOnline(true),20000);
}catch(e){stopGpsRefresh();showAuth();$('#authStatus').textContent=e.status===403?'此瀏覽環境尚未核准。請回到原先申請的 Chrome／PWA 登入，或請管理員核准此瀏覽環境。':(e.message||'無法完成登入，請稍後重試');console.warn('Session authorization failed',e.status||'network')}}
function syncTaskProjection(){
 state.plans={};const byGroup=new Map();
 for(const t of liveTasks){
  const exact=data.stops.find(r=>(r['路線ID']||r['車牌'])===taskRouteToken(t)&&r['時段']===t.shift&&(r['固定日間']||r['里別']===t.area)&&r['停靠點原文']===t.stop_address&&Number(r['清運次序'])===Number(t.stop_order));
  const row=exact||data.stops.find(r=>(r['路線ID']||r['車牌'])===taskRouteToken(t)&&r['時段']===t.shift&&(r['固定日間']||r['里別']===t.area)&&r['停靠點原文']===t.stop_address);
  if(!row)continue;
  const route=routeKey(row), k=t.visit_date+'|'+route;
  state.plans[k]??={teams:{},stops:{}};
  const sk=stopKey(row),stop=state.plans[k].stops[sk]??={chosen:true,status:'待訪',people:[],note:''};
  if(!stop.people.includes(t.volunteer_id))stop.people.push(t.volunteer_id);
  stop.chosen=true;
  stop._statuses??=[];stop._statuses.push(t.status);
  const bucket=t.visit_date+'|'+route+'|'+t.volunteer_id+'|'+t.area;
  if(!byGroup.has(bucket))byGroup.set(bucket,[]);byGroup.get(bucket).push(t);
 }
 for(const entry of Object.values(state.plans))for(const stop of Object.values(entry.stops)){const ss=stop._statuses||[];stop.status=ss.length&&ss.every(x=>x==='完成')?'完成':ss.some(x=>x==='進行中'||x==='完成')?'進行中':'待訪';delete stop._statuses;}
 for(const [key,ts] of byGroup){const parts=key.split('|');const area=parts.at(-1),mid=parts.at(-2),route=parts.slice(1,4).join('|'),dateKey=parts[0];const all=data.stops.filter(x=>routeKey(x)===route&&(x['固定日間']||x['里別']===area));
  if(all.length>1&&ts.length>=all.length){const plan=state.plans[dateKey+'|'+route];if(plan){plan.teams[area]??=[];if(!plan.teams[area].includes(mid))plan.teams[area].push(mid)}}
 }
}
async function refreshOnline(quiet=false){if(!liveRole||liveBusy)return;
 liveBusy=true;
 try{
  const tasks=await onlineApi('tasks');liveTasks=tasks.tasks||[];
  if(liveRole==='volunteer'){const names=[...new Set(liveTasks.filter(t=>t.volunteer_id===liveMemberId&&t.visit_date===today()).map(t=>t.area))];groupContacts=[];for(const area of names){try{const r=await onlineApi('tasks?groupArea='+encodeURIComponent(area));groupContacts.push(...(r.people||[]).map(p=>({id:p.member_id,name:p.display_name,phone:p.phone_e164,isLeader:p.is_leader,area})));}catch(err){console.warn('小組成員查詢失敗',err.message)}}}
  if(liveRole==='admin'){
   const overlay=await onlineApi('route-stops');routeStopOverlays=overlay.stops||[];applyDayRoutes();
   const roster=await onlineApi('roster');state.people=(roster.people||[]).map(p=>personNorm({id:p.id,name:p.name,phone:p.phone,address:p.address,residentArea:p.resident_area,assignment:p.assignment}));
   state.leaders={};for(const p of roster.people||[])if(p.is_leader&&p.assignment)state.leaders[p.assignment]=p.id;
   syncTaskProjection();render();
  }else{if(page==='reports')renderReports();}
  if(!quiet)toast('線上資料已更新');
 }catch(e){if(e.status===401||e.status===403){showAuth()}else toast('雲端同步失敗：'+e.message)}finally{liveBusy=false}}
function openRouteStopEditor(){if(!assertAdmin()||!chosenRoute)return;const row=sourceRouteRows()[0];if(!row||row['固定日間'])return toast('週三／週五固定路線暫不新增自訂站點');const next=sourceRouteRows().length+1;showModal('新增路線站點',`<form id="routeStopForm"><p class="mini-note">新增於 ${esc(routeLabel(row))}。原始 PDF 資料不會被修改；此站可日後封存並恢復。</p><label>站點名稱<input name="stopName" required maxlength="240"></label><label>站點里別<input name="area" required maxlength="30" value="${esc(plannerArea==='all'?'':plannerArea)}" placeholder="例如：勝利里"></label><div class="route-stop-time-row"><label>開始時間<input name="startTime" type="time" required></label><label>結束時間<input name="endTime" type="time" required></label></div><label>清單次序<input name="displayOrder" type="number" min="1" max="9999" value="${next}" required></label><button class="primary wide" type="submit">新增站點卡片</button></form>`)}
function openArchivedRouteStops(){const archived=routeStopOverlays.filter(x=>x.status==='archived');showModal('已封存路線站點',archived.length?`<div class="pick-list">${archived.map(x=>`<div class="pick-row"><div><strong>${esc(x.stop_name)}</strong><small>${esc(x.shift)}・${esc(x.route_token)}・${esc(String(x.start_time).slice(0,5))}～${esc(String(x.end_time).slice(0,5))}</small></div><button data-restore-route-stop="${esc(x.id)}">恢復</button></div>`).join('')}</div>`:'<p class="mini-note">目前沒有已封存站點。</p>')}
async function mutateRouteStop(method,payload){await onlineApi('route-stops',method,payload);const overlay=await onlineApi('route-stops');routeStopOverlays=overlay.stops||[];applyDayRoutes();renderPlanner()}
function matchedTasks(row){return liveTasks.filter(t=>t.visit_date===date&&t.shift===row['時段']&&taskRouteToken(t)===(row['路線ID']||row['車牌'])&&t.area===rowArea(row)&&t.stop_address===row['停靠點原文']);}
function matchedMemberTask(row,id){return matchedTasks(row).find(t=>t.volunteer_id===id)}
async function doLive(op){if(!assertAdmin())return false;try{await op();await refreshOnline();return true}catch(e){toast('未儲存：'+e.message);return false}}
assignPerson=async function(id,a){if(!areas.includes(a))return false;return doLive(()=>onlineApi('roster','PATCH',{id,assignment:a}))};
removePerson=async function(id){return doLive(()=>onlineApi('roster','PATCH',{id,assignment:null}))};
clearSelectedArea=async function(){const members=assignedPeople(selectedArea);if(!members.length)return toast('此里沒有分派人員');if(!assertAdmin())return;if(!confirm(`清除 ${selectedArea} 的 ${members.length} 位志工分派？`))return;for(const p of members){const ok=await doLive(()=>onlineApi('roster','PATCH',{id:p.id,assignment:null}));if(!ok)break}};
assignLeader=async function(id,a){const p=state.people.find(x=>x.id===id);if(!assertAdmin()||!p||p.assignment!==a)return;if(!canDial(p))return toast('沒有電話不能指定組長');if(!confirm(`將 ${p.name} 設為 ${a} 組長？`))return;
 const existing=leaderOf(a);if(existing&&existing.id!==id){const cleared=await doLive(()=>onlineApi('roster','PATCH',{id:existing.id,isLeader:false}));if(!cleared)return}
 await doLive(()=>onlineApi('roster','PATCH',{id,isLeader:true}));};
addTeam=async function(id){const p=state.people.find(x=>x.id===id);if(!assertAdmin()||!p||p.assignment!==teamArea)return toast('請先分派到對應服務里');if(bookingFor(id))return toast('同一天同時段已安排其他工作');const rows=schedulableRouteRows().filter(r=>rowArea(r)===teamArea);if(!rows.length)return toast('目前里別沒有選錄停靠點');const first=rows[0],last=rows.at(-1);await doLive(()=>onlineApi('tasks','POST',{volunteerId:id,area:teamArea,date,shift,routeId:first['路線ID']||first['車牌']||first['車次'],truck:first['車牌']||'',routeEnd:last['離開']||'',stops:rows.map(r=>({address:r['停靠點原文'],time:r['到達'],stopOrder:sourceOrderForTask(r)}))}));};
addStopVolunteer=async function(key,id){const row=data.stops.find(r=>stopKey(r)===key),p=state.people.find(x=>x.id===id),area=rowArea(row);if(!assertAdmin()||!row||sourceExcluded(row)||!p||p.assignment!==area)return toast('請先分派服務里');if(bookingFor(id))return toast('同一天同時段不可重複排班');await doLive(()=>onlineApi('tasks','POST',{volunteerId:id,area,date,shift:row['時段'],routeId:row['路線ID']||row['車牌']||row['車次'],truck:row['車牌']||'',routeEnd:row['離開']||'',address:row['停靠點原文'],time:row['到達'],stopOrder:sourceOrderForTask(row)}));};
removeTeam=async function(id){const rows=routeRows().filter(r=>rowArea(r)===teamArea);const related=rows.flatMap(r=>matchedTasks(r).filter(x=>x.volunteer_id===id));if(!related.length)return;await doLive(()=>onlineApi('tasks','DELETE',{id:related[0].id}));};
removeStopMember=async function(key,id){const row=data.stops.find(x=>stopKey(x)===key);if(!row)return;const task=matchedMemberTask(row,id);if(!task)return;const related=liveTasks.filter(x=>x.volunteer_id===id&&x.visit_date===date&&x.shift===shift&&taskRouteToken(x)===(row['路線ID']||row['車牌']));if(related.length>1)return toast('這是整段跟巡指派，請從里別跟巡人員移除');await doLive(()=>onlineApi('tasks','DELETE',{id:task.id}));};
setStatus=async function(key,status){const row=data.stops.find(x=>stopKey(x)===key);if(!row||sourceExcluded(row)||!validStatuses.includes(status))return;const ts=matchedTasks(row);if(!ts.length)return toast('請先指派人員');await doLive(async()=>{for(const t of ts)await onlineApi('tasks','PATCH',{id:t.id,status})});};
savePersonForm=async function(f){if(!assertAdmin())return;const d=Object.fromEntries(new FormData(f));const pay={name:d.name,phone:d.phone,address:d.address,residentArea:d.residentArea,assignment:d.assignment||null};if(d.id)pay.id=d.id;const good=await doLive(()=>onlineApi('roster',d.id?'PATCH':'POST',pay));if(good){closeModal();toast('個人名冊已更新至雲端')}};
// Update worker's own tasks through authenticated backend, not localStorage.
async function completeOnlineTask(id){if(liveRole!=='volunteer')return toast('請由志工帳號完成本人任務');try{await onlineApi('tasks','PATCH',{id,status:'完成'});await refreshOnline();toast('✓ 已傳送完成回報')}catch(e){toast('回報失敗：'+e.message)}}
async function openMemberAdmin(preselectId=''){
 if(!assertAdmin())return;
 try{
  const x=await onlineApi('member-admin-v2');
  const known=new Set((x.members||[]).map(m=>m.member_id));
  const active=(x.members||[]).filter(m=>m.enabled||m.status==='active');
  const list=(x.members||[]).map(m=>{
    const approvedDevicesForMember=(x.devices||[]).filter(d=>d.account_id===m.id&&d.status==='approved');
    const deviceIcons=approvedDevicesForMember.map(d=>{
      const kind=String(d.device_type||'').toLowerCase();
      const icon=kind==='phone'?'📱':kind==='tablet'?'▣':kind==='computer'?'💻':'🖥️';
      const label=(kind==='phone'?'手機':kind==='tablet'?'平板':kind==='computer'?'桌機':'其他裝置')+' · '+String(d.operating_system||'系統未知')+' · '+String(d.browser_name||'瀏覽器未知')+' · 已核准';
      return '<span class="device-marker device-approved" role="img" aria-label="'+esc(label)+'" title="'+esc(label)+'">'+icon+'</span>';
    }).join('');
    const name=m.name||state.people.find(p=>p.id===m.member_id)?.name||'姓名待補';
    const approved=m.status==='active'||m.enabled===true;
    let actions='';
    if(m.protected)actions='<span class="auth-pending-label">主要管理員</span>';
    else{
      const buttons=[];
      if(m.status==='pending')buttons.push(`<button type="button" class="smallbtn" data-member-action="approve" data-account-id="${esc(m.id)}">核准開通</button>`);
      else if(approved){if(m.role==='volunteer')buttons.push(`<button type="button" class="smallbtn" data-member-action="promote_admin" data-account-id="${esc(m.id)}" data-member-name="${esc(name)}">設為管理員</button>`);buttons.push(`<button type="button" class="smallbtn" data-member-action="suspend" data-account-id="${esc(m.id)}">停用帳號</button>`)}
      else if(m.status==='suspended'&&m.approved_at)buttons.push(`<button type="button" class="smallbtn member-restore-btn" data-member-action="reactivate" data-account-id="${esc(m.id)}">恢復帳號</button>`);
      buttons.push(`<button type="button" class="smallbtn member-archive-btn" data-member-action="archive" data-account-id="${esc(m.id)}">刪除會員</button>`);
      actions=buttons.join('');
    }
    return `<div class="pick-row approved-member-row ${m.role==='admin'?'admin-member-row':'volunteer-member-row'}"><div class="member-label"><strong class="approved-member-name">${esc(name)}</strong><span class="approved-member-phone">${esc(prettyPhone(m.phone))}</span><small>${esc(m.role==='admin'?'管理員':'志工')}</small></div><span class="member-device-icons" aria-label="已核准設備">${deviceIcons||'<span class="device-none" title="尚無核准設備">尚無核准設備</span>'}</span>${approved?'<span class="auth-success-check" role="img" aria-label="已完成授權" title="已完成授權">✓</span>':`<span class="auth-pending-label" aria-label="尚未啟用">${esc(m.status==='suspended'?'已停用':'待核准')}</span>`}<div class="member-auth-actions">${actions}</div></div>`;
  }).join('');
  const eligible=state.people.filter(p=>p.phone&&!known.has(p.id));
  const selected=eligible.find(p=>p.id===preselectId)||eligible[0];
  const byAccount=new Map((x.members||[]).map(m=>[m.id,m]));
  const pendingDevices=(x.devices||[]).filter(d=>d.status==='pending');
  const approvedDevices=(x.devices||[]).filter(d=>d.status==='approved');
  const deviceLabel=d=>{const kind=({phone:'📱 手機',tablet:'📱 平板',computer:'💻 電腦',unknown:'❔ 未知設備'})[d.device_type]||'❔ 未知設備';return kind+' · '+esc(d.operating_system||'系統未知')+' · '+esc(d.browser_name||'瀏覽器未知')};
  const approvalDate=d=>{if(!d.approved_at)return '核准時間未記錄';const time=new Date(d.approved_at);return Number.isNaN(time.getTime())?'核准時間無效':'核准：'+new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(time)};
  approvedDevices.sort((a,b)=>String(a.approved_at||a.created_at||'').localeCompare(String(b.approved_at||b.created_at||'')));
  const deviceRows=approvedDevices.map(d=>{const m=byAccount.get(d.account_id),protectedAdmin=m?.role==='admin';return '<div class="pick-row device-detail-row"><div class="member-label"><strong>'+esc(m?.name||'志工')+'</strong><small>'+deviceLabel(d)+' · 已核准</small><small class="device-approved-time">'+esc(approvalDate(d))+'</small></div>'+(protectedAdmin?'<span class="auth-success-check">✓ 管理員裝置已授權 · 受保護</span>':'<button type="button" class="smallbtn" data-revoke-device="'+esc(d.id)+'">撤銷此設備</button>')+'</div>'}).join('');
  const phoneLabel=(m)=>prettyPhone(m?.phone||'');
  const deviceQueue=pendingDevices.map(d=>{const m=byAccount.get(d.account_id),name=m?.name||state.people.find(p=>p.id===m?.member_id)?.name||'待核對志工';return `<div class="pick-row device-approval-row"><div class="member-label"><strong>${esc(name)}</strong><small>${esc(phoneLabel(m))} · ${deviceLabel(d)} · 新裝置待核准</small></div><button type="button" class="approve-device-btn" data-approve-device="${esc(d.id)}">✓ 核准此手機</button></div>`}).join('');
  const deviceSection=`<section class="device-approval-section"><h3>待核准手機（${pendingDevices.length}）</h3>${deviceQueue||'<p class="mini-note">目前沒有待核准手機</p>'}<p class="mini-note">志工第一次用手機與 PIN 登入後會送出裝置申請。管理員核准後，志工即可重新開啟 PWA 直接進入。</p><p class="mini-note">已核准裝置：${approvedDevices.length}</p>${deviceRows}</section>`;
  showModal('管理員｜會員授權',`<form id="memberAdminForm"><label>新增帳號類型<select id="newAccountRole" name="role"><option value="volunteer">志工帳號</option><option value="admin">管理員帳號</option></select></label><p class="mini-note" id="accountRoleWarning">建立後會列為待核准；只有已登入且啟用中的管理員可以核准。</p><label>選擇名冊人員<select name="volunteerId" id="authorizationVolunteer" required>${eligible.map(p=>`<option value="${esc(p.id)}" ${selected?.id===p.id?'selected':''}>${esc(p.name)}｜${esc(prettyPhone(p.phone))}</option>`).join('')}</select></label><label>手機號碼（須與名冊一致）<input name="phone" id="authorizationPhone" required inputmode="tel" value="${esc(selected?prettyPhone(selected.phone):'')}" placeholder="09xx-xxx-xxx"></label><label>登入 PIN（6 位數字）<input type="password" name="password" required minlength="6" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" autocomplete="new-password" placeholder="請設定 6 碼數字"></label><button class="primary wide" id="approveAccountBtn" type="submit" ${eligible.length?'':'disabled'}>建立待核准志工帳號</button></form><div class="member-admin-existing"><strong>已完成授權：${active.length} 位</strong>${list||'<p>尚未建立會員帳號</p>'}</div>${deviceSection}`);
  $('#authorizationVolunteer').onchange=e=>{const person=state.people.find(p=>p.id===e.target.value);$('#authorizationPhone').value=person?prettyPhone(person.phone):''};
  $('#newAccountRole').onchange=e=>{const admin=e.target.value==='admin';$('#approveAccountBtn').textContent=admin?'建立待核准管理員帳號':'建立待核准志工帳號';$('#accountRoleWarning').textContent=admin?'高權限操作：建立後仍須由已登入且啟用中的管理員核准；不以裝置核准取代管理員身分驗證。':'志工帳號建立後須再核准，才能登入服務與任務功能。'};
 }catch(e){toast('會員授權資料讀取失敗：'+e.message)}
}
function openNewMemberForm(){
 if(!assertAdmin())return;
 showModal('新增會員｜名冊與授權同步建立',`<form id="newMemberForm" class="member-create-form">
 <div class="member-create-fields">
 <p class="form-hint">第一步先新增志工至正式名冊。儲存後會自動開啟會員授權，選定剛新增的志工，再設定 6 碼 PIN 並核准開通。</p>
 <label>姓名 *<input name="name" required maxlength="80" autocomplete="off"></label>
 <label>手機號碼 *<input name="phone" required type="tel" inputmode="tel" placeholder="0989-098-468"></label>
 <label>原居住里<input name="residentArea" maxlength="40" placeholder="選填，不需重複加「里」"></label>
 <label>地址<input name="address" maxlength="300"></label>
 </div>
 <div class="member-create-footer">
 <button type="submit" class="primary wide" id="saveNewMember">新增至名冊，下一步設定授權 PIN</button>
 <p id="memberCreateStatus" class="form-progress" role="status" aria-live="polite"></p>
 </div>
 </form>`);
}
async function submitNewMemberForm(form){
 if(!assertAdmin())return;
 const b=Object.fromEntries(new FormData(form));
 let p;
 const info=$('#memberCreateStatus'), btn=$('#saveNewMember'); btn.disabled=true;
 try{
  const n=phoneDigits(b.phone);if(!/^09\d{8}$/.test(n))throw new Error('請輸入有效的台灣手機號碼');
  info.textContent='正在建立正式名冊…';
  const r=await onlineApi('roster','POST',{name:b.name,phone:b.phone,address:b.address,residentArea:b.residentArea,assignment:null});
  p=r.person;
  if(!p?.id)throw new Error('人員已建立，但伺服器未回傳 ID，請至名冊查核');
  // Save first. The six-digit PIN is entered only in the subsequent approval form.
  await refreshOnline();
  closeModal();
  toast('✓ 已新增至正式名冊，請選擇志工並設定 6 碼 PIN');
  await openMemberAdmin(p.id);
 }catch(e){
  info.textContent='新增失敗：'+e.message;
  btn.disabled=false;
 }
}

const originalBind=bind;
bind=function(){originalBind();
 $('#secureLogout').onclick=secureSignOut;
 const closeSecureLogin=$('#closeSecureLogin');if(closeSecureLogin)closeSecureLogin.onclick=()=>{$('#secureLogin').hidden=true};
 $('#loginFromRoster').onclick=openSecureLogin;
 $('#addMember').onclick=openNewMemberForm;
 $('#addRouteStop').onclick=openRouteStopEditor;$('#manageRouteStops').onclick=openArchivedRouteStops;
 document.addEventListener('click',async e=>{const archive=e.target.closest('[data-archive-route-stop]');if(archive){if(!assertAdmin()||!confirm(`刪除「${archive.dataset.stopName}」站點？\n\n此操作會可恢復封存，不會刪除既有排班與任務快照。`))return;archive.disabled=true;try{await mutateRouteStop('PATCH',{action:'archive',id:archive.dataset.archiveRouteStop});toast('站點已封存，可從「管理封存站點」恢復')}catch(err){archive.disabled=false;toast('站點封存失敗：'+err.message)}return}const restore=e.target.closest('[data-restore-route-stop]');if(restore){if(!assertAdmin())return;restore.disabled=true;try{await mutateRouteStop('PATCH',{action:'restore',id:restore.dataset.restoreRouteStop});closeModal();toast('站點已恢復')}catch(err){restore.disabled=false;toast('站點恢復失敗：'+err.message)}}});
 $('#openRosterAuthorization').onclick=()=>openMemberAdmin();
 document.addEventListener('click',async e=>{const del=e.target.closest('[data-delete-person]');if(del){if(!assertAdmin())return;const id=del.dataset.deletePerson;const person=state.people.find(p=>p.id===id);if(!person)return;showModal('確認封存人員',`<div class="delete-warning"><p>確定將「<strong>${esc(person.name)}</strong>」從目前志工名冊移除？</p><small>這是可恢復的封存，不會永久清除歷史資料。若仍有會員帳號，系統會停止操作，請改由「會員授權」執行受保護的會員封存。</small></div><div class="delete-confirm-actions"><button type="button" class="smallbtn" data-cancel-person-delete>取消</button><button type="button" class="delete-person-confirm" data-confirm-delete-person="${esc(id)}">確認封存</button></div>`);return;}if(e.target.closest('[data-cancel-person-delete]')){closeModal();return;}const confirm=e.target.closest('[data-confirm-delete-person]');if(!confirm)return;if(!assertAdmin())return;const id=confirm.dataset.confirmDeletePerson;confirm.disabled=true;confirm.textContent='封存處理中…';try{await onlineApi('roster','DELETE',{id});await refreshOnline(true);closeModal();toast('人員已封存並從目前名冊移除')}catch(err){confirm.disabled=false;confirm.textContent='確認封存';toast('封存未完成：'+err.message)}});
 $('#secureLoginForm').onsubmit=async e=>{e.preventDefault();$('#authStatus').textContent='登入驗證中…';const d=Object.fromEntries(new FormData(e.target));try{await onlineApi('session','POST',d);await authStart()}catch(err){$('#authStatus').textContent=err.message}};
 document.addEventListener('click',e=>{const b=e.target.closest('button[data-live-complete]');if(b)completeOnlineTask(b.dataset.liveComplete)});
 document.addEventListener('click',async e=>{const btn=e.target.closest('button[data-member-action]');if(!btn)return;if(!assertAdmin())return;const action=btn.dataset.memberAction,name=btn.dataset.memberName||'此會員',labels={approve:'核准此會員帳號？',suspend:'停用此會員帳號？既有裝置會一併撤銷。',reactivate:'恢復此會員帳號？既有裝置不會自動恢復。',promote_admin:'確認將「'+name+'」設為管理員？\n\n原帳號與核准狀態會保留，之後可管理名冊與會員授權。',archive:'刪除這位會員？\n\n會從目前名冊、服務里與會員授權清單移除，並停用登入、撤銷所有裝置。既有排班、任務、完成紀錄、稽核紀錄與 Auth 身分會保留，不會永久清除。'};if(!labels[action]||!confirm(labels[action]))return;btn.disabled=true;try{const payload={action,accountId:btn.dataset.accountId};if(action==='archive')payload.reason='管理員由會員授權介面封存會員';await onlineApi('member-admin-v2','PATCH',payload);if(action==='archive'){await refreshOnline(true);toast('會員已封存並從目前名冊移除')}else toast(action==='approve'?'✓ 會員帳號已核准':action==='suspend'?'會員帳號已停用':action==='promote_admin'?'✓ 已設為管理員':'會員帳號已恢復');await openMemberAdmin()}catch(err){toast('操作失敗：'+err.message);btn.disabled=false}});
 document.addEventListener('click',async e=>{const btn=e.target.closest('button[data-revoke-device]');if(!btn)return;if(!assertAdmin())return;if(!confirm('確定撤銷這台設備？'))return;btn.disabled=true;try{await onlineApi('members','PATCH',{deviceId:btn.dataset.revokeDevice,approved:false});toast('已撤銷指定設備');await openMemberAdmin()}catch(err){toast('撤銷設備失敗：'+err.message);btn.disabled=false}});
 document.addEventListener('click',async e=>{const btn=e.target.closest('button[data-approve-device]');if(!btn)return;if(!assertAdmin())return;btn.disabled=true;try{await onlineApi('members','PATCH',{deviceId:btn.dataset.approveDevice,approved:true});toast('✓ 手機已核准，志工可重新開啟 PWA');await openMemberAdmin()}catch(err){toast('核准手機失敗：'+err.message);btn.disabled=false}});
 $('#modalBody').addEventListener('submit',async e=>{if(e.target.id==='newMemberForm'){e.preventDefault();await submitNewMemberForm(e.target);return}if(e.target.id!=='memberAdminForm')return;e.preventDefault();if(!assertAdmin())return;const d=Object.fromEntries(new FormData(e.target));const x=state.people.find(p=>p.id===d.volunteerId);const normalizePhone=p=>{let n=phoneDigits(p);if(n.startsWith('8869'))n='0'+n.slice(3);return n};if(!x||normalizePhone(x.phone)!==normalizePhone(d.phone)){toast('手機號碼和人員名冊不符');return}if(d.role==='admin'&&!confirm('確認建立「'+x.name+'」的待核准管理員帳號？此帳號核准後可管理名冊與會員授權。'))return;try{await onlineApi('member-admin-v2','POST',{action:'create',memberId:d.volunteerId,phone:d.phone,pin:d.password,role:d.role});toast('✓ 帳號已建立並列入待核准清單');await openMemberAdmin()}catch(err){toast('建立會員失敗：'+err.message)}});
 $('#modalBody').addEventListener('submit',async e=>{if(e.target.id!=='routeStopForm')return;e.preventDefault();if(!assertAdmin())return;const row=sourceRouteRows()[0],d=Object.fromEntries(new FormData(e.target)),button=e.target.querySelector('button[type="submit"]');button.disabled=true;try{await mutateRouteStop('POST',{action:'create',shift:row['時段'],routeToken:row['車次'],vehicle:row['車牌']||'',area:d.area,stopName:d.stopName,startTime:d.startTime,endTime:d.endTime,displayOrder:Number(d.displayOrder)});closeModal();toast('站點已新增並同步到正式路線')}catch(err){button.disabled=false;toast('新增站點失敗：'+err.message)}});
};
save=function(){renderSummary()}; // never persist authenticated personal data to public browser storage

// Installed PWA quick-enter: re-check the HttpOnly session when the approved device resumes.
// The phone, password and refresh token are NEVER written to JavaScript storage.
let lastSessionCheck=0, checkingSavedSession=false;
async function restoreSavedSessionOnResume(){
 if(document.visibilityState==='hidden'||checkingSavedSession||!data)return;
 const now=Date.now();if(now-lastSessionCheck<120000)return;lastSessionCheck=now;
 checkingSavedSession=true;
 try {
   const session=await onlineApi('session');
   if(session.role!==liveRole||session.memberId!==liveMemberId){await authStart();return}
   if(liveRole)await refreshOnline(true);
 }catch(e){
   if(e.status===401||e.status===403){
     clearInterval(liveTimer);liveTimer=null;showAuth();
   }
 }finally{checkingSavedSession=false}
}

async function boot(){try{
 const [pub,dayRoutes,shiftWindows,officialDay,officialNight]=await Promise.all([fetch('./data-public.json',{cache:'no-store'}),fetch('./data-day-routes-20250402.json',{cache:'no-store'}),fetch('./data-day-shift-windows-20261029.json',{cache:'no-store'}),fetch('./data-official-day-20261030.source.json',{cache:'no-store'}),fetch('./data-official-night-20261030.source.json',{cache:'no-store'})]);if(!pub.ok||!dayRoutes.ok||!shiftWindows.ok||!officialDay.ok||!officialNight.ok)throw Error('地圖資料無法讀取');data=await pub.json();areas=data.areas;baseStops=[...(data.stops||[])];dayRouteDocument=await dayRoutes.json();dayShiftWindows=await shiftWindows.json();officialRouteDocument={day:await officialDay.json(),night:await officialNight.json()};applyDayRoutes();
 state=makeState([]);state.demo=false;areaPage=Math.floor(areas.indexOf(selectedArea)/CARD_PAGE_SIZE);const pa=$('#plannerAreaSelect');pa.innerHTML=areas.map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join('')+'<option value="all">全部</option>';
 const sel=$('#peopleAreaFilter');sel.innerHTML='<option value="all">全部里別</option>'+areas.map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join('');
 $('#peopleFilter').value='pending';bind();showAuth();const googleHandled=await completeGoogleOAuth();if(!googleHandled&&!previewOnly())await authStart();if(previewOnly())previewLoginButton();lastSessionCheck=Date.now();document.addEventListener('visibilitychange',()=>{restoreSavedSessionOnResume();if(document.visibilityState==='hidden')stopGpsRefresh()});window.addEventListener('pageshow',e=>{if(e.persisted)restoreSavedSessionOnResume()});
 if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
}catch(e){console.error(e);openSecureLogin();$('#authStatus').textContent='網站暫時無法完成登入，請重新整理後再試'}
}

// Production Google OAuth: validated by Supabase and membership authorization API.
const GOOGLE_AUTH_URL='https://ctskglmglevronvnkpmm.supabase.co/auth/v1/authorize?provider=google&redirect_to=';
document.addEventListener('click',event=>{
 const button=event.target.closest('#googleOAuthLogin');if(!button)return;
 const redirect=location.origin+location.pathname;
 location.assign(GOOGLE_AUTH_URL+encodeURIComponent(redirect));
});
async function completeGoogleOAuth(){
 const parsed=new URLSearchParams(location.hash.slice(1));
 if(!parsed.has('access_token')&&!parsed.has('error'))return false;
 const status=$('#authStatus');
 const token=parsed.get('access_token'),refresh=parsed.get('refresh_token');
 history.replaceState(null,'',location.pathname+location.search);
 if(!token||!refresh){openSecureLogin();status.textContent='Google 登入未取得可用授權，請重試';return true}
 try{await onlineApi('oauth-session','POST',{access_token:token,refresh_token:refresh});await authStart()}
 catch(err){openSecureLogin();status.textContent='Google 身分驗證完成，但帳號尚未授權或裝置待核准：'+err.message}
 return true;
}

boot();
})();
