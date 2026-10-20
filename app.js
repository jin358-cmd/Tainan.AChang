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
const stopKey=r=>[r['時段'],r['車次'],r['車牌'],r['清運次序'],r['里別'],r['停靠點原文']].join('|');
const routeKey=r=>[r['時段'],r['車次'],r['車牌']].join('|');
const uniq=arr=>[...new Set(arr)];
const coord=n=>typeof n==='number'&&Number.isFinite(n);
const makeState=(seed=[])=>({schema:1,people:seed,plans:{},pins:{},leaders:{},demo:false,homePreassigned:true,updated:Date.now()});
function loadState(){for(const k of [KEY,PRIOR_KEY,LEGACY_KEY]){try{const raw=localStorage.getItem(k);if(!raw)continue;const x=JSON.parse(raw);if(x&&x.schema===1&&Array.isArray(x.people)&&x.plans&&x.pins)return x}catch(e){}}return null}
let state=loadState(),data=null,areas=[],routes=[],page='map',selectedArea='復華里',shift='日間',date=today(),chosenRoute='',plannerArea='all',areaPage=0,teamArea='',toastTimer=null,installPrompt=null,map=null,markers=[],mapFailed=false,pinTarget=null,layerState={volunteer:true,day:false,night:false},pickerKind='',volunteerId='',volunteerPhone='';
const personNorm=p=>({id:String(p.id||`P${Date.now()}`),name:String(p.name||'').trim().slice(0,80),phone:String(p.phone||'').slice(0,80),address:String(p.address||'').slice(0,300),residentArea:String(p.residentArea||'待確認'),assignment:areas.includes(p.assignment)?p.assignment:'',serviceLat:coord(p.serviceLat)?p.serviceLat:null,serviceLon:coord(p.serviceLon)?p.serviceLon:null});
const residentLabel=p=>{const s=String(p?.residentArea||'').trim().replace(/里里$/,'里');return s&&s!=='待確認'&&s!=='未填寫'?s:''};
const residentHtml=p=>residentLabel(p)?`原居住里：${esc(residentLabel(p))} · `:'';
const residentBadge=p=>residentLabel(p)?`<span class="original-area">原居住里：${esc(residentLabel(p))}</span>`:'';
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
function routeRows(){return data.stops.filter(x=>routeKey(x)===chosenRoute).sort((a,b)=>Number(a['清運次序'])-Number(b['清運次序']))}
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
function highlightMapSelection(){if(!map||!map.getLayer('village-fill'))return;map.setPaintProperty('village-fill','fill-opacity',['case',['==',['get','name'],selectedArea],0.46,0.19]);map.setPaintProperty('village-lines','line-width',['case',['==',['get','name'],selectedArea],7,2.6]);map.setPaintProperty('village-lines','line-color',['case',['==',['get','name'],selectedArea],'#d62436',['get','color']]);}

function renderSummary(){const planCurrent=state.plans[planId()];$('#statTotal').textContent=state.people.length;$('#statAssigned').textContent=assignedCount();$('#statPending').textContent=state.people.length-assignedCount();$('#statStops').textContent=Object.values(planCurrent?.stops||{}).filter(v=>v.chosen).length;const banner=$('#modeBanner');banner.hidden=true;banner.textContent=''}
function go(next){page=next;if(next!=='map')$('#areaPopup').hidden=true;$$('.page').forEach(el=>el.classList.toggle('active',el.id==='page-'+next));$$('[data-page]').forEach(el=>{el.classList.toggle('on',el.dataset.page===next);el.setAttribute('aria-current',el.dataset.page===next?'page':'false')});render();window.scrollTo({top:0,behavior:'auto'});if(next==='map')requestAnimationFrame(()=>{initMap();map?.resize();updateMap()})}
function render(){document.body.classList.toggle('read-only-visitor',!liveRole);renderSummary();if(page==='areas')renderAreas();if(page==='planner')renderPlanner();if(page==='people')renderPeople();if(page==='map')updateMap();if(page==='volunteer')renderVolunteer()}
function assignPerson(id,a){const p=state.people.find(x=>x.id===id);if(!p||!areas.includes(a))return false;if(p.assignment===a){toast(`${p.name} 已在 ${a}`);return true}const from=p.assignment;if(from&&!confirm(`將 ${p.name} 從 ${from} 改派到 ${a}？`))return false;if(from)cleanLeader(p.id,from);p.assignment=a;p.serviceLat=null;p.serviceLon=null;for(const v of Object.values(state.plans)){for(const key of Object.keys(v.teams||{}))v.teams[key]=v.teams[key].filter(x=>x!==p.id);for(const r of Object.values(v.stops||{}))r.people=(r.people||[]).filter(x=>x!==p.id)}save();render();toast(`已將 ${p.name} 分配至 ${a}`);return true}
function removePerson(id){const p=state.people.find(x=>x.id===id);if(!p||!p.assignment)return;const from=p.assignment;cleanLeader(id,from);p.assignment='';p.serviceLat=null;p.serviceLon=null;for(const v of Object.values(state.plans)){for(const [a,ids] of Object.entries(v.teams||{}))v.teams[a]=ids.filter(x=>x!==id);for(const r of Object.values(v.stops||{}))r.people=(r.people||[]).filter(x=>x!==id)}save();render();toast('已移出服務分區及相關跟巡指派')}
function clearSelectedArea(){const members=assignedPeople(selectedArea);if(!members.length){toast(`${selectedArea} 目前沒有已分配人員`);return}if(!confirm(`只清除「${selectedArea}」的 ${members.length} 位服務分配與其跟巡排班？其他里及總名冊不變。`))return;const ids=new Set(members.map(p=>p.id));for(const p of members){p.assignment='';p.serviceLat=null;p.serviceLon=null}delete state.leaders[selectedArea];for(const entry of Object.values(state.plans)){for(const [a,people] of Object.entries(entry.teams||{}))entry.teams[a]=people.filter(id=>!ids.has(id));for(const r of Object.values(entry.stops||{}))r.people=(r.people||[]).filter(id=>!ids.has(id))}save();render();toast(`已清除 ${selectedArea} 的 ${members.length} 位服務分配`)}


function renderAreas(){const last=Math.max(0,Math.ceil(areas.length/CARD_PAGE_SIZE)-1);areaPage=Math.max(0,Math.min(areaPage,last));
const shown=areas.slice(areaPage*CARD_PAGE_SIZE,(areaPage+1)*CARD_PAGE_SIZE);$('#areaPicker').innerHTML=shown.map(a=>`<button class="area-pill ${selectedArea===a?'active':''}" data-area="${esc(a)}"><span class="area-dot" style="background:${data.colors[a]}"></span>${esc(a)} <em>${assignedPeople(a).length}</em></button>`).join('');$('#areaPrev').disabled=areaPage===0;$('#areaNext').disabled=areaPage===last;$('#areaPageNo').innerHTML=Array.from({length:last+1},(_,idx)=>`<button type="button" data-area-page="${idx}" class="page-dot ${areaPage===idx?'on':''}" aria-label="第 ${idx+1} 組里別" aria-current="${areaPage===idx?'step':'false'}"></button>`).join('')+`<span class="page-fraction">${areaPage+1} / ${last+1}</span>`;
const an=$('#areaName');an.textContent=selectedArea;an.style.color=data.colors[selectedArea]||'#176581';$('#areaAssignedCount').textContent='已分配 '+assignedPeople(selectedArea).length+' 人';const a=$('#areaMembers'),b=$('#pendingMembers'),list=sortedMembers(selectedArea);a.hidden=list.length===0;a.innerHTML=list.length?list.map(p=>{const lead=p.id===leaderId(selectedArea),leaderBtn=p.phone?`<button data-leader="${esc(p.id)}" title="指派組長" class="${lead?'leader-on':''}">${lead?'👑 組長':'☆ 設組長'}</button>`:'';return `<div class="member ${lead?'team-leader':''}" data-person="${esc(p.id)}"><div class="member-info"><strong>${lead?'👑 ':''}${esc(p.name)}</strong><small>${residentHtml(p)}分派服務里：${esc(selectedArea)}${lead?' · 組長':''}</small></div><div class="member-actions">${telLink(p,'phone-link service-phone')} ${leaderBtn}<button data-remove="${esc(p.id)}">移出</button></div></div>`}).join(''):'<div class="empty">此里尚未分配志工</div>';const waiting=state.people.filter(p=>!p.assignment);b.innerHTML=waiting.length?waiting.map(p=>`<div class="member pending"><div class="member-info"><strong>${esc(p.name)}</strong><small>${residentHtml(p)}待分配</small></div><div class="member-actions">${telLink(p,'phone-link service-phone')}<button data-assign="${esc(p.id)}">＋ 加入 ${esc(selectedArea)}</button></div></div>`).join(''):'<div class="empty">所有人員皆已分配</div>';$('#pendingCount').textContent=waiting.length}

function chooseRoute(){const matching=data.stops.filter(r=>r['時段']===shift&&(plannerArea==='all'||r['里別']===plannerArea));routes=uniq(matching.map(routeKey));if(!routes.includes(chosenRoute))chosenRoute=routes[0]||'';const holder=$('#routeButtons');holder.innerHTML=routes.length?routes.map(k=>`<button class="route-choice ${chosenRoute===k?'on':''}" type="button" data-route="${esc(k)}">${esc(k.split('|')[1])} · ${esc(k.split('|')[2])}</button>`).join(''):'<span class="mini-note">此里於所選時段暫無已選錄車次，請切換里別或時段。</span>'}

function renderPlanner(){const gate=$('#plannerGate'),content=$('#plannerContent'),locked=liveRole==='admin'&&assignedCount()===0;gate.hidden=!locked;content.hidden=locked;if(locked)return;$('#planDate').value=date;$('#plannerAreaSelect').value=plannerArea;$$('[data-shift]').forEach(b=>b.classList.toggle('on',b.dataset.shift===shift));chooseRoute();const allRows=chosenRoute?routeRows():[];const rows=plannerArea==='all'?allRows:allRows.filter(r=>r['里別']===plannerArea),regions=uniq(rows.map(r=>r['里別']));if(!regions.includes(teamArea))teamArea=regions[0]||'';const focusArea=plannerArea==='all'?'全部十里':plannerArea;const times=rows.map(x=>x['到達']).filter(Boolean).sort();$('#plannerFocus').innerHTML=`<div class="planner-focus-head"><strong>目前跟巡里別</strong><span class="planner-focus-badge">${esc(focusArea)}</span></div><div class="planner-focus-meta"><span>拜訪日期：<b>${esc(date)}</b></span><span>清運時段：<b>${esc(shift)}</b></span><span>已選車次：<b>${esc(chosenRoute?chosenRoute.split('|')[1]+' · '+chosenRoute.split('|')[2]:'未選擇')}</b></span><div class="planner-route-inline" id="plannerRouteInline"></div></div>`;$('#plannerRouteInline').textContent=chosenRoute?`${rows.length} 個停靠點 · ${regions.length} 里 · ${times[0]||'--:--'}～${times.at(-1)||'--:--'}`:'請先選擇有清運車次的時段／里別';if(regions.length)renderAreaTeams(regions);else $('#areaTeamPicker').innerHTML='';const actions=$('#areaTeamPicker .team-areas');const target=$('#visitAreaButtons');target.replaceChildren();if(actions)target.appendChild(actions);renderStops(rows)}

function renderAreaTeams(regions){
 const root=$('#areaTeamPicker'),crew=plan().teams[teamArea]||[],available=rosterAvailable(teamArea);
 const hasAreaTasks=routeRows().some(r=>r['里別']===teamArea&&(plan().stops?.[stopKey(r)]?.people||[]).length);
 const notice=crew.length||hasAreaTasks?'':`<span class="crew-alert">${esc(teamArea)} 尚未安排跟巡人員</span>`;
 root.innerHTML=`<div class="team-head"><div class="team-heading"><strong>里別跟巡人員｜${esc(teamArea||'未選定里別')}</strong>${notice}</div><button class="smallbtn" id="addTeam" ${available.length?'':'disabled'}>指派人員</button></div><div class="team-areas">${regions.map(a=>`<button class="team-area-btn ${teamArea===a?'on':''}" data-team-area="${esc(a)}">${esc(a)} ${assignedPeople(a).length}人</button>`).join('')}</div><div class="team-members">${crew.map(id=>{const p=state.people.find(x=>x.id===id);return p?`<span class="chip">${esc(p.name)}<button data-team-remove="${esc(id)}" aria-label="移除 ${esc(p.name)}">×</button></span>`:''}).join('')}</div>`;
}

function unassignedVisitAreas(rows){
 const keys=uniq(rows.map(r=>r['里別']));const p=plan();
 return keys.filter(area=>{
   if((p.teams?.[area]||[]).some(id=>state.people.some(v=>v.id===id&&v.assignment===area)))return false;
   return !rows.some(r=>r['里別']===area&&(p.stops?.[stopKey(r)]?.people||[]).some(id=>state.people.some(v=>v.id===id&&v.assignment===area)));
 });
}

function renderStops(rows){
 const holder=$('#stopList');
 if(!rows.length){holder.innerHTML='<div class="empty">此篩選條件沒有選錄站點</div>';return}
 const missing=unassignedVisitAreas(rows);
 const missingNotice=missing.length?`<div class="pending-region-summary">${missing.map(esc).join(' · ')} 跟巡：<strong>尚未指派</strong></div>`:'';
 holder.innerHTML=missingNotice+rows.map(r=>{
  const k=stopKey(r),sp=stopPlan(r),team=(plan().teams[r['里別']]||[]).filter(id=>state.people.some(x=>x.id===id&&x.assignment===r['里別'])),stopMembers=(sp.people||[]).filter(id=>state.people.some(x=>x.id===id&&x.assignment===r['里別'])),hasPeople=team.length>0||stopMembers.length>0,status=validStatuses.includes(sp.status)?sp.status:'待訪',visibleStatus=!hasPeople?'stop-unassigned':status==='完成'?'status-done':status==='進行中'?'status-progress':'status-wait',available=rosterAvailable(r['里別']);
  return `<article class="stop-card ${visibleStatus}" data-stop="${esc(k)}"><div class="stop-title"><span class="time">${esc(r['到達'])}</span><strong class="stop-address">${esc(r['停靠點原文'])}</strong><span class="stop-area">${esc(r['里別'])}</span></div><div class="stop-sub">原表第 ${esc(r['清運次序'])} 站 · ${esc(r['車牌'])} · PDF 第${esc(r['PDF頁碼'])}頁 · 選錄站點</div><div class="stop-members">${stopMembers.length?stopMembers.map(id=>{const p=state.people.find(x=>x.id===id);return p?`<span class="chip">${esc(p.name)}<button data-stop-remove="${esc(id)}" data-stop="${esc(k)}" aria-label="取消 ${esc(p.name)} 站點安排">×</button></span>`:''}).join(''):''}</div><div class="stop-buttons"><select class="status-select ${visibleStatus}" data-status="${esc(k)}" aria-label="${esc(r['停靠點原文'])} 拜訪狀態" ${!hasPeople?'disabled title="請先安排人員"':''}>${validStatuses.map(v=>`<option ${status===v?'selected':''}>${v}</option>`).join('')}</select><button class="assign-person" data-add-stop="${esc(k)}" ${available.length?'':'disabled'}>指派人員</button></div></article>`
 }).join('')}

function addTeam(id){const p=state.people.find(x=>x.id===id);if(!p||p.assignment!==teamArea){toast('請先把志工分配到對應里');return false}const crew=plan().teams[teamArea]||[];if(crew.includes(id))return toast('已安排此志工'),false;const prev=bookingFor(id);if(prev){toast(`${p.name} 此時段已排在 ${prev.label}，請先移除再重新指派`);return false}plan().teams[teamArea]=[...crew,id];save();renderPlanner();renderSummary();toast(`已安排 ${p.name} 跟巡 ${teamArea}`);return true}
function removeTeam(id){plan().teams[teamArea]=(plan().teams[teamArea]||[]).filter(x=>x!==id);save();renderPlanner();toast('已移出里別跟巡名單')}
function addStopVolunteer(key,id){const r=data.stops.find(x=>stopKey(x)===key),p=state.people.find(x=>x.id===id);if(!r||!p||p.assignment!==r['里別']){toast('須先將志工分配到此站所屬里');return false}const rec=stopPlan(r);if(rec.people.includes(id)){toast('志工已在此站');return false}const prev=bookingFor(id);if(prev){toast(`${p.name} 此時段已排在 ${prev.label}，請先移除再重新指派`);return false}rec.chosen=true;rec.status=validStatuses.includes(rec.status)?rec.status:'待訪';rec.people.push(id);save();renderPlanner();toast(`已指派 ${p.name} 到站點`);return true}
function setStatus(key,status){if(!validStatuses.includes(status)){toast('狀態僅能為待訪、進行中或完成');return}const r=data.stops.find(x=>stopKey(x)===key);if(!r)return;const rec=stopPlan(r);const team=plan().teams[r['里別']]||[];if(!(rec.people||[]).length&&!team.length){toast('此站尚未指派人員');return}rec.chosen=true;rec.status=status;save();renderPlanner();toast(`已更新站點為${status}`)}
function removeStopMember(key,id){const r=data.stops.find(x=>stopKey(x)===key);if(!r)return;stopPlan(r).people=stopPlan(r).people.filter(x=>x!==id);save();renderPlanner()}
function renderPeople(){const term=$('#peopleSearch').value.toLowerCase().trim(),mode=$('#peopleFilter').value,a=$('#peopleAreaFilter').value;const digits=phoneDigits(term);const list=state.people.filter(p=>{const inMode=mode==='all'||(mode==='pending'&&!p.assignment)||(mode==='assigned'&&!!p.assignment);const inArea=a==='all'||(mode==='pending'?p.residentArea===a:p.assignment===a);const content=`${p.name} ${p.address} ${p.assignment} ${p.residentArea} ${p.phone}`.toLowerCase();return inMode&&inArea&&(content.includes(term)||(digits.length>=3&&phoneDigits(p.phone).includes(digits)))} );$('#peopleList').innerHTML=list.length?list.map(p=>{const lead=p.assignment&&leaderId(p.assignment)===p.id,home=areas.includes(p.residentArea),status=p.assignment?`<span class="assign-pill">已分派｜${esc(p.assignment)}${lead?' · 組長':''}</span>`:'<span class="pending-pill">待分配</span>';return `<div class="person-card ${p.assignment?'assigned':''} ${home?'resident-priority':''}"><div class="person-heading"><div class="person-name"><strong>${lead?'👑 ':''}${esc(p.name)}</strong>${home?`<span class="residence-big">原居住里：${esc(p.residentArea)}</span>`:`${residentBadge(p)}`}</div>${telLink(p,'phone-link roster-phone')}</div><div class="person-status">${status}</div><div class="person-detail">${esc(p.address||'地址未提供')}</div><div class="person-actions"><button data-pick-person="${esc(p.id)}">指定服務里</button><button data-edit-person="${esc(p.id)}">個資編輯</button></div></div>`}).join(''):'<div class="empty">目前沒有符合這兩個篩選條件的志工，請切換里別或分配狀態。</div>'}

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
function logoutVolunteer(){volunteerId='';volunteerPhone='';go('map')}
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

function showModal(title,body){$('#modalTitle').textContent=title;$('#modalBody').innerHTML=body;$('#modal').hidden=false}
function closeModal(){$('#modal').hidden=true;pickerKind=''}
function pick(kind,opts){pickerKind=kind;const allowed=opts.allowed||state.people;const itemHtml=allowed.length?allowed.map(p=>`<div class="pick-row"><div><strong>${esc(p.name)}</strong><br/><small>${esc(p.assignment||'待分配')}</small></div><div class="pick-row-actions"><button data-pick-id="${esc(p.id)}">選擇</button>${kind==='area'&&p.phone?`<button class="lead-pick" data-pick-leader="${esc(p.id)}" title="加入並設為組長">👑 組長</button>`:''}</div></div>`).join(''):'<div class="empty">沒有可排班的志工。同時段已被安排的人員需先移除舊指派，或先到服務分區新增人員。</div>';showModal(opts.title,`<div class="pick-list">${itemHtml}</div>`)}
function editPerson(id){const p=state.people.find(x=>x.id===id),newMode=!p;const x=p||{id:'',name:'',phone:'',address:'',residentArea:'待確認',assignment:''};showModal(newMode?'新增人員':'個資編輯',`<form id="personForm"><input type="hidden" name="id" value="${esc(x.id)}" /><label>分派服務里<select name="assignment"><option value="">待分配</option>${areas.map(a=>`<option value="${esc(a)}" ${x.assignment===a?'selected':''}>${esc(a)}</option>`).join('')}</select></label><label>姓名 *<input name="name" maxlength="80" required value="${esc(x.name)}"></label><label>電話<input name="phone" maxlength="80" value="${esc(x.phone)}"></label><label>地址<input name="address" maxlength="300" value="${esc(x.address)}"></label><label>原居住里別<input name="residentArea" maxlength="80" value="${esc(x.residentArea&&x.residentArea!=='待確認'?x.residentArea:'')}"></label><div class="person-actions form-bottom-actions"><button class="primary save-confirm yellow-save" type="submit">${newMode?'確認新增人員':'確認儲存修改'}</button></div></form>`)}
function savePersonForm(f){const form=new FormData(f),id=String(form.get('id')||''),name=String(form.get('name')||'').trim(),assignment=String(form.get('assignment')||'');if(!name)return toast('請輸入姓名');if(assignment&&!areas.includes(assignment))return toast('無效里別');let p=state.people.find(x=>x.id===id);if(!p){p=personNorm({id:'P'+Date.now().toString(36)+Math.floor(Math.random()*1000),name,assignment});state.people.push(p)}const previous=p.assignment;p.name=name;p.phone=String(form.get('phone')||'');p.address=String(form.get('address')||'');p.residentArea=String(form.get('residentArea')||'待確認').trim()||'待確認';p.assignment=assignment;if(previous!==assignment){cleanLeader(p.id,previous);p.serviceLat=null;p.serviceLon=null;for(const v of Object.values(state.plans)){for(const key of Object.keys(v.teams||{}))v.teams[key]=v.teams[key].filter(x=>x!==p.id);for(const s of Object.values(v.stops||{}))s.people=(s.people||[]).filter(x=>x!==p.id)}}state.demo=false;save();closeModal();render();toast('已儲存名冊')}
function deletePerson(id){const p=state.people.find(x=>x.id===id);if(!p||!confirm(`確定永久刪除 ${p.name}？此動作會移除相關排程，請先備份。`))return;state.people=state.people.filter(x=>x.id!==id);cleanLeader(id);for(const v of Object.values(state.plans)){for(const a of Object.keys(v.teams||{}))v.teams[a]=v.teams[a].filter(x=>x!==id);for(const s of Object.values(v.stops||{}))s.people=(s.people||[]).filter(x=>x!==id)}save();closeModal();render();toast('已刪除本機名冊紀錄')}
function csvCell(x){const s=String(x??'');return '"'+(/^[\s]*[=+@\-\t\r]/.test(s)?"'"+s:s).replaceAll('"','""')+'"'}
function dl(name,body,type='application/json'){const b=new Blob([body],{type}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000)}
function exportData(type){if(type==='json'){dl('achang_private_backup_'+stamp()+'.json',JSON.stringify({format:'ACHANG_PWA_FULL_V1',exportedAt:new Date().toISOString(),data:state},null,2));toast('已下載完整私密備份');return}const areaOrder=a=>{const idx=areas.indexOf(a);return idx<0?999:idx};const head=type==='roster'?['ID','姓名','電話','地址','原居住里','分派服務里']:['日期','時段','車次','里別','停靠站','到達','志工','狀態'];let rows=[head];if(type==='roster'){const sorted=[...state.people].sort((x,y)=>areaOrder(x.assignment||'待分配')-areaOrder(y.assignment||'待分配')||(x.assignment||'待分配').localeCompare(y.assignment||'待分配','zh-Hant')||x.name.localeCompare(y.name,'zh-Hant'));rows.push(...sorted.map(p=>[p.id,p.name,p.phone,p.address,p.residentArea||'',p.assignment||'待分配']))}else{const exports=[];for(const [key,p] of Object.entries(state.plans))for(const [sid,s] of Object.entries(p.stops||{})){if(!s.chosen)continue;const r=data.stops.find(x=>stopKey(x)===sid);if(!r)continue;const ids=uniq([...(p.teams[r['里別']]||[]),...(s.people||[])]);exports.push([key.split('|')[0],r['時段'],r['車次'],r['里別'],r['停靠點原文'],r['到達'],ids.map(id=>state.people.find(x=>x.id===id)?.name).filter(Boolean).join('、'),s.status,Number(r['清運次序']||999)])}exports.sort((a,b)=>areaOrder(a[3])-areaOrder(b[3])||a[0].localeCompare(b[0])||a[1].localeCompare(b[1])||String(a[2]).localeCompare(String(b[2]))||a[8]-b[8]);rows.push(...exports.map(r=>r.slice(0,8)))}dl('achang_'+type+'_'+stamp()+'.csv','\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');toast('CSV 已下載到目前裝置')}
async function importData(file){if(!file)return;try{const obj=JSON.parse(await file.text());let source=obj.data?.people||obj.people||obj.roster?.people||null;let restoreFull=obj.format==='ACHANG_PWA_FULL_V1'&&obj.data;if(!Array.isArray(source)||source.length>2000)throw Error('不支援的 JSON 名冊格式');const norm=source.map(personNorm).filter(x=>x.id&&x.name);if(!norm.length)throw Error('找不到有效人員資料');if(new Set(norm.map(x=>x.id)).size!==norm.length)throw Error('名冊 ID 重複');if(!confirm(`匯入 ${norm.length} 位志工將取代目前本機名冊，請先備份。繼續嗎？`))return;state=restoreFull?{...makeState(),...obj.data,people:norm,demo:false}:{...makeState(),people:norm,demo:false};state.pins=state.pins||{};state.plans=state.plans||{};save();closeModal();go('areas');toast(`已匯入 ${norm.length} 筆私密名冊，未上傳伺服器`)}catch(err){toast('匯入失敗：'+err.message)}}
function openMenu(){showModal('裝置資料與 PWA',`<div class="pick-list"><div class="pick-row"><div><strong>目前裝置：${state.people.length} 位志工</strong><br><small>資料經授權由雲端保存，可跨裝置讀回。</small></div></div><div class="pick-row"><strong>服務里人員分配 CSV</strong><button data-export="roster">下載</button></div><div class="pick-row"><strong>垃圾車跟巡拜訪 CSV</strong><button data-export="schedule">下載</button></div><div class="install-tip"><strong>安裝到手機主畫面</strong><small>Google Chrome：右上角 ⋮ → 安裝並建立捷徑</small><small>iPhone Safari：分享 → 加入主畫面</small></div></div>`)}
function areaCentroid(a){const feature=data.geo.features.find(f=>f.properties.name===a);if(!feature)return[120.2405,23.005];const coords=feature.geometry.coordinates[0];const lons=coords.map(c=>c[0]),lats=coords.map(c=>c[1]);return [(Math.min(...lons)+Math.max(...lons))/2,(Math.min(...lats)+Math.max(...lats))/2]}
function startPin(key){const r=data.stops.find(x=>stopKey(x)===key);if(!r)return;pinTarget=key;go('map');toast('請於地圖點選站點實際位置')}
function applyPin(lon,lat){if(!pinTarget)return;const r=data.stops.find(x=>stopKey(x)===pinTarget);if(!r)return;const key=pinTarget;if(!confirm(`將「${r['停靠點原文']}」標記於 ${lat.toFixed(5)}, ${lon.toFixed(5)}？此座標需再核對。`))return;state.pins[key]={lon:+lon.toFixed(6),lat:+lat.toFixed(6),status:'人工標點待核對'};pinTarget=null;save();updateMap();toast('已標記站點（待現場核對）')}
function initMap(){if(map||mapFailed)return;const lib=window.maplibregl;if(!lib||!(lib.supported?.()??true)){mapFailed=true;drawFallback();return}try{map=new lib.Map({container:'mapLibre',style:'https://tiles.openfreemap.org/styles/liberty',center:[120.24,23.005],zoom:13.9,minZoom:12,maxZoom:18,maxBounds:[[120.205,22.968],[120.281,23.049]],attributionControl:false,dragRotate:false,pitchWithRotate:false});map.addControl(new lib.NavigationControl({showCompass:false}),'top-right');map.addControl(new lib.AttributionControl({compact:true}),'bottom-right');map.on('load',()=>{map.addSource('villages',{type:'geojson',data:data.geo});map.addLayer({id:'village-fill',type:'fill',source:'villages',paint:{'fill-color':['get','color'],'fill-opacity':0.19}});map.addLayer({id:'village-lines',type:'line',source:'villages',paint:{'line-color':['get','color'],'line-width':2.8}});map.on('click','village-fill',e=>{if(pinTarget){applyPin(e.lngLat.lng,e.lngLat.lat);return}const a=e.features?.[0]?.properties?.name;if(a){openAreaPreview(a);$('#mapLegendStatus').textContent='已選取 '+a}});map.on('click',e=>{if(pinTarget)applyPin(e.lngLat.lng,e.lngLat.lat)});updateMap();map.on('move',()=>{if(!$('#areaPopup').hidden)positionAreaPopup()})});let hadLoad=false;map.on('load',()=>hadLoad=true);map.on('error',e=>{if(!hadLoad){console.warn('MapLibre map basemap unavailable, use offline geometry',e?.error?.message||'');drawFallback()}})}catch(e){mapFailed=true;drawFallback()}}
function marker(icon,lon,lat,type,title,onClick=null,count=0,leader=false){if(!map||!coord(lon)||!coord(lat))return;const outer=document.createElement('div');outer.className='marker-container';const tag=document.createElement('div');tag.className='map-marker '+type+(count?' group':'');tag.title=title;const span=document.createElement('span');if(icon==='avatar'){span.innerHTML='<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><circle cx="12" cy="7.3" r="4.1" fill="currentColor"/><path d="M3.3 22v-3.5c0-4.5 3.5-7.1 8.7-7.1s8.7 2.6 8.7 7.1V22" fill="currentColor"/></svg>'}else span.textContent=icon;tag.append(span);if(count){const b=document.createElement('small');b.textContent=count;tag.append(b)}if(leader){const crown=document.createElement('b');crown.className='marker-crown';crown.textContent='👑';tag.append(crown)}outer.append(tag);if(onClick)tag.addEventListener('click',e=>{e.stopPropagation();onClick()});const m=new window.maplibregl.Marker({element:outer,anchor:'bottom'}).setLngLat([lon,lat]).addTo(map);markers.push(m)}
function updateMap(){if(page!=='map')return;if(mapFailed){drawFallback();return}if(!map||!map.getLayer('village-fill'))return;highlightMapSelection();markers.forEach(m=>m.remove());markers=[];for(const a of areas){const c=areaCentroid(a),cnt=assignedPeople(a).length,lead=leaderOf(a);const areaLabel=document.createElement('div');areaLabel.className='map-area-label'+(a===selectedArea?' selected':'');areaLabel.textContent=a;markers.push(new window.maplibregl.Marker({element:areaLabel,anchor:'center'}).setLngLat([c[0],c[1]+0.00112]).addTo(map));if(layerState.volunteer){marker('avatar',c[0],c[1],'volunteer',`${a} · 已分配 ${cnt} 人`,()=>{selectedArea=a;openAreaPreview(a)},cnt,!!lead);const loc=state.people.filter(p=>p.assignment===a&&coord(p.serviceLon)&&coord(p.serviceLat));for(const p of loc)marker('avatar',p.serviceLon,p.serviceLat,'volunteer',`${p.name} · 服務落點（非住址）`,()=>{selectedArea=a;openAreaPreview(a)})}for(const [shiftName,enabled,type,delta] of [['日間',layerState.day,'day',-0.0007],['夜間',layerState.night,'night',0.0007]]){if(!enabled)continue;const rows=data.stops.filter(r=>r['里別']===a&&r['時段']===shiftName&&!state.pins[stopKey(r)]);if(rows.length)marker(shiftName==='日間'?'☀':'☾',c[0]+delta,c[1]-0.0008,type,`${a}｜${shiftName}選錄 ${rows.length} 站（里別彙總）`,()=>toast(`${a} ${shiftName} ${rows.length} 個選錄站，請至跟巡頁安排`),rows.length)}}for(const r of data.stops){const pos=state.pins[stopKey(r)];if(!pos||!coord(pos.lon)||!coord(pos.lat))continue;if((r['時段']==='日間'&&!layerState.day)||(r['時段']==='夜間'&&!layerState.night))continue;marker(r['時段']==='日間'?'☀':'☾',pos.lon,pos.lat,r['時段']==='日間'?'day':'night',`${r['到達']} ${r['停靠點原文']}｜人工標點待核對`,()=>toast('人工標點：'+r['停靠點原文']))}}
function positionAreaPopup(){const pop=$('#areaPopup'),box=$('#mapBox');if(pop.hidden||!box||!data)return;let x=box.clientWidth/2,y=box.clientHeight/2;const c=areaCentroid(selectedArea);if(map&&!mapFailed){const p=map.project(c);x=p.x;y=p.y}else{const w=box.clientWidth,h=box.clientHeight;x=(c[0]-120.224)/(120.256-120.224)*w;y=(23.022-c[1])/(23.022-22.990)*h}const pw=Math.min(320,Math.max(210,box.clientWidth-20)),ph=Math.min(pop.scrollHeight||250,box.clientHeight-12);let left=x+32;if(left+pw>box.clientWidth-6)left=x-pw-32;left=Math.max(6,Math.min(left,box.clientWidth-pw-6));let top=Math.max(7,Math.min(y-45,box.clientHeight-ph-7));pop.style.setProperty('left',left+'px','important');pop.style.setProperty('top',top+'px','important');}
function openAreaPreview(a){if(!areas.includes(a))return;selectedArea=a;highlightMapSelection();const list=sortedMembers(a);const people=list.map(p=>{const leader=p.id===leaderId(a);return `<div class="popup-contact ${leader?'leader-row':''}"><strong>${leader?'👑 ':''}${esc(p.name)}</strong>${telLink(p)}</div>`}).join('');const root=$('#areaPopup');root.innerHTML=`<div class="popup-top"><div><span class="popup-eyebrow">已選取里別</span><strong class="popup-area-name">${esc(a)}</strong><span class="popup-count">已分配 ${list.length} 人</span></div><button type="button" data-close-area aria-label="關閉里別名單">✕</button></div><div class="popup-contacts">${people||'<span class="mini-note">目前尚無服務志工</span>'}</div><button type="button" class="popup-detail-btn" data-view-assignment="${esc(a)}">前往此里分配 →</button>`;root.hidden=false;requestAnimationFrame(positionAreaPopup)}
function showAreaDetails(a){if(!areas.includes(a))return;const people=assignedPeople(a);const body=people.length?people.map(p=>`<div class="detail-person"><div><strong>${esc(p.name)}</strong>${residentHtml(p)?`<small>${residentHtml(p)}</small>`:''}<small>${esc(p.address||'未提供地址')}</small></div>${telLink(p)}</div>`).join(''):'<div class="empty">此里尚未分配志工</div>';showModal(`${a}｜已分配 ${people.length} 人`,`<div class="detail-person-list">${body}</div><button class="primary wide" data-view-assignment="${esc(a)}">前往此里分配</button>`)}
function drawFallback(){mapFailed=true;$('#mapLibre').style.display='none';const root=$('#mapFallback');root.hidden=false;const f=data.geo.features,minX=120.224,maxX=120.256,minY=22.990,maxY=23.022,w=780,h=640;const proj=(lon,lat)=>[(lon-minX)/(maxX-minX)*w,(maxY-lat)/(maxY-minY)*h];let svg=`<svg class="offline-map-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="十里分區離線參考圖"><rect width="780" height="640" fill="#eaf2f6"/><path d="M0 130H780M0 260H780M0 420H780M0 560H780M130 0V640M320 0V640M520 0V640M680 0V640" stroke="#d1dfe8" stroke-width="11" fill="none"/>`;for(const z of f){const xy=z.geometry.coordinates[0].map(p=>proj(p[0],p[1])),an=z.properties.name,c=areaCentroid(an),ct=proj(c[0],c[1]),sel=an===selectedArea;svg+=`<polygon data-fallback-area="${esc(an)}" points="${xy.map(p=>p.map(n=>n.toFixed(1)).join(',')).join(' ')}" fill="${z.properties.color}" fill-opacity="${sel?.52:.25}" stroke="${sel?'#dc263b':z.properties.color}" stroke-width="${sel?9:3}"/>`;const cnt=assignedPeople(an).length,dayCount=data.stops.filter(r=>r['里別']===an&&r['時段']==='日間').length,nightCount=data.stops.filter(r=>r['里別']===an&&r['時段']==='夜間').length;let badges=[];if(layerState.volunteer)badges.push(['avatar',cnt,'#f28a2f',!!leaderOf(an)]);if(layerState.day&&dayCount)badges.push(['☀',dayCount,'#eab43a',false]);if(layerState.night&&nightCount)badges.push(['☾',nightCount,'#5558ad',false]);svg+=`<text data-fallback-area="${esc(an)}" x="${ct[0]}" y="${ct[1]-31}" text-anchor="middle" class="offline-map-label" fill="${sel?'#0e6374':'#25465f'}">${esc(an)}</text>`;badges.forEach((b,i)=>{const dx=(i-(badges.length-1)/2)*44;svg+=`<g data-fallback-area="${esc(an)}" class="offline-badge"><circle data-fallback-area="${esc(an)}" cx="${ct[0]+dx}" cy="${ct[1]+3}" r="21" fill="${b[2]}" stroke="#fff" stroke-width="3"/><text data-fallback-area="${esc(an)}" x="${ct[0]+dx}" y="${ct[1]+9}" text-anchor="middle" fill="white" font-size="16" font-weight="900">${b[0]==='avatar'?'👤':b[0]}${b[1]}</text>${b[3]?`<text data-fallback-area="${esc(an)}" x="${ct[0]+dx+15}" y="${ct[1]-15}" font-size="17">👑</text>`:''}</g>`})}svg+='</svg>';root.innerHTML=svg;root.onclick=e=>{const a=e.target?.closest('[data-fallback-area]')?.getAttribute('data-fallback-area')||e.target?.getAttribute('data-fallback-area');if(a&&!pinTarget){openAreaPreview(a);$('#mapLegendStatus').textContent='已選取 '+a;drawFallback();requestAnimationFrame(positionAreaPopup);return}if(pinTarget){const box=root.querySelector('svg').getBoundingClientRect(),xx=(e.clientX-box.left)/box.width*w,yy=(e.clientY-box.top)/box.height*h;applyPin(minX+xx/w*(maxX-minX),maxY-yy/h*(maxY-minY))}};$('#mapLegendStatus').textContent='十里分區參考地圖'}
function mapFit(){if(map){map.fitBounds([[120.226,22.989],[120.253,23.022]],{padding:25,duration:400})}else drawFallback()}
function bind(){$$('[data-page]').forEach(el=>el.addEventListener('click',()=>go(el.dataset.page)));document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-go'))go(b.dataset.go);if(b.hasAttribute('data-close-area')){$('#areaPopup').hidden=true}if(b.hasAttribute('data-area-details'))showAreaDetails(b.dataset.areaDetails);if(b.hasAttribute('data-view-assignment')){selectedArea=b.dataset.viewAssignment;areaPage=Math.floor(areas.indexOf(selectedArea)/CARD_PAGE_SIZE);closeModal();$('#areaPopup').hidden=true;go('areas')}if(b.hasAttribute('data-area-page')){areaPage=Math.min(Math.ceil(areas.length/CARD_PAGE_SIZE)-1,Math.max(0,Number(b.dataset.areaPage)));renderAreas()}if(b.hasAttribute('data-area')){selectedArea=b.dataset.area;areaPage=Math.floor(areas.indexOf(selectedArea)/CARD_PAGE_SIZE);go('areas')}if(b.hasAttribute('data-assign'))assignPerson(b.dataset.assign,selectedArea);if(b.hasAttribute('data-remove'))removePerson(b.dataset.remove);if(b.hasAttribute('data-leader'))assignLeader(b.dataset.leader,selectedArea);if(b.hasAttribute('data-team-area')){teamArea=b.dataset.teamArea;renderPlanner()}if(b.hasAttribute('data-route')){chosenRoute=b.dataset.route;renderPlanner()}if(b.hasAttribute('data-fill-demo-phone')){const input=$('#volunteerPhoneInput');if(input)input.value=b.dataset.fillDemoPhone}if(b.hasAttribute('data-login-demo'))loginDemoVolunteer();if(b.hasAttribute('data-volunteer-complete'))completeVolunteerStop(b.dataset.volunteerSchedule,b.dataset.volunteerComplete);if(b.id==='addTeam'){pick('team',{title:`${teamArea} 車次跟巡`,allowed:rosterAvailable(teamArea)})}if(b.hasAttribute('data-team-remove'))removeTeam(b.dataset.teamRemove);if(b.hasAttribute('data-add-stop')){const r=data.stops.find(x=>stopKey(x)===b.dataset.addStop);if(r){window.__pendingStop=b.dataset.addStop;pick('stop',{title:`指定 ${r['里別']} · ${r['停靠點原文']}`,allowed:rosterAvailable(r['里別'])})}}if(b.hasAttribute('data-stop-remove')){removeStopMember(b.dataset.stop,b.dataset.stopRemove)}if(b.hasAttribute('data-edit-person'))editPerson(b.dataset.editPerson);if(b.hasAttribute('data-pick-person')){pickerKind='person-area:'+b.dataset.pickPerson;showModal('指定服務里',`<div class="pick-list">${areas.map(a=>`<div class="pick-row"><strong>${esc(a)}</strong><button data-person-area="${esc(a)}">分配</button></div>`).join('')}</div>`)}if(b.hasAttribute('data-person-area')){assignPerson(pickerKind.split(':').slice(1).join(':'),b.dataset.personArea);closeModal()}if(b.hasAttribute('data-pick-leader')){const pId=b.dataset.pickLeader;const ok=assignPerson(pId,selectedArea);if(ok)assignLeader(pId,selectedArea);closeModal()}if(b.hasAttribute('data-pick-id')){if(pickerKind==='area')assignPerson(b.dataset.pickId,selectedArea);if(pickerKind==='team')addTeam(b.dataset.pickId);if(pickerKind==='stop'){const target=window.__pendingStop;if(target)addStopVolunteer(target,b.dataset.pickId)}closeModal()}if(b.hasAttribute('data-export')){exportData(b.dataset.export);closeModal()}});
 $('#clearArea').onclick=clearSelectedArea;$('#areaPrev').onclick=()=>{areaPage=Math.max(0,areaPage-1);renderAreas()};$('#areaNext').onclick=()=>{areaPage=Math.min(Math.ceil(areas.length/CARD_PAGE_SIZE)-1,areaPage+1);renderAreas()};const pickBtn=$('#pickVolunteerBtn'); if(pickBtn) pickBtn.onclick=()=>pick('area',{title:`加入 ${selectedArea}`,allowed:state.people.filter(p=>!p.assignment)});$('#addPerson').onclick=()=>editPerson(null);$('#planDate').onchange=e=>{date=e.target.value||today();renderPlanner();renderSummary()};$('#plannerAreaSelect').onchange=e=>{plannerArea=e.target.value;chosenRoute='';renderPlanner();renderSummary()};$$('[data-shift]').forEach(b=>b.onclick=()=>{shift=b.dataset.shift;chosenRoute='';renderPlanner();renderSummary()});$('#stopList').onchange=e=>{const sel=e.target.closest('[data-status]');if(sel)setStatus(sel.dataset.status,sel.value)};$('#peopleSearch').oninput=renderPeople;$('#peopleFilter').onchange=renderPeople;$('#peopleAreaFilter').onchange=renderPeople;$('#menuBtn').onclick=openMenu;$('#volunteerLoginBtn').onclick=()=>liveRole==='admin'?openMemberAdmin():openSecureLogin();$('#volunteerLogout').onclick=secureSignOut;$('#installBtn').onclick=()=>installPrompt?.prompt();$('#closeModal').onclick=closeModal;$('#modal').onclick=e=>{if(e.target===$('#modal'))closeModal()};$('#modalBody').onclick=e=>{if(e.target.id==='importButton')$('#fileInput').click();const b=e.target.closest('button[data-add-stop]');if(b)window.__pendingStop=b.dataset.addStop};$('#modalBody').onchange=e=>{if(e.target.id==='fileInput')importData(e.target.files?.[0])};$('#modalBody').onsubmit=e=>{if(e.target.matches('form#personForm')){e.preventDefault();savePersonForm(e.target)}};$('#mapFit').onclick=mapFit;for(const [selector,k] of [['#layerVolunteer','volunteer'],['#layerDay','day'],['#layerNight','night']])$(selector).onchange=e=>{layerState[k]=e.target.checked;updateMap()};window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#installBtn').hidden=false});window.addEventListener('appinstalled',()=>{$('#installBtn').hidden=true;toast('已安裝到裝置')});}

// Online authenticated adapter: v0.4-style UI, server-authoritative roster & dispatch.
const LIVE_KEY='achang-v10-device-id';
let liveRole='',liveMemberId='',liveTasks=[],liveBusy=false,liveTimer=null;
let deviceId=localStorage.getItem(LIVE_KEY);
if(!deviceId){deviceId=crypto.randomUUID();localStorage.setItem(LIVE_KEY,deviceId)}
async function onlineApi(endpoint,method='GET',body){
 const r=await fetch('/api/'+endpoint,{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-AChang-Device':deviceId},body:body===undefined?undefined:JSON.stringify(body)});
 let doc;try{doc=await r.json()}catch{doc={error:'資料伺服器回傳格式錯誤'}};
 if(!r.ok)throw Object.assign(new Error(doc.error||`HTTP ${r.status}`),{status:r.status});
 return doc;
}
function assertAdmin(){if(liveRole!=='admin'){toast('只有管理員可編輯名冊與排班');return false}return true}
function showAuth(){
 liveRole='';liveMemberId='';state=makeState([]);liveTasks=[];
 for(const selector of ['#peopleList','#pendingMembers','#areaMembers','#volunteerSchedules','#areaPopup','#modalBody']){const el=$(selector);if(el)el.innerHTML=''}
 $('#modal').hidden=true;
 $('#secureLogin').hidden=true;$('#app').hidden=false;
 $$('.bottom-nav,.desktop-nav').forEach(x=>x.hidden=false);
 $('#volunteerLoginBtn').hidden=false;$('#volunteerLoginBtn').textContent='🔐 登入';$('#secureLogout').hidden=true;
 $('#addPerson').hidden=true;$('#addMember').hidden=true;$('#openRosterAuthorization').hidden=true;
 $('#rosterLocked').hidden=false;$('#peopleList').hidden=true;
 $('#clearArea').hidden=true;
 const z=$('#authStatus');z.textContent='首次登入或裝置授權失效時，請輸入已核准的帳號與密碼';
 render();go('map');
}
function openSecureLogin(){if(liveRole==='admin')return openMemberAdmin();$('#secureLogin').hidden=false;$('#secureLoginForm input[name="login"]').focus()}
function updateAccessControls(){
 const admin=liveRole==='admin';
 for(const id of ['addPerson','addMember','openRosterAuthorization','clearArea'])$( '#'+id).hidden=!admin;
 $('#rosterLocked').hidden=admin;$('#peopleList').hidden=!admin;
 $('#volunteerLoginBtn').hidden=liveRole==='volunteer';
 $('#volunteerLoginBtn').textContent=admin?'🔐 會員授權':'🔐 登入';
 $('#secureLogout').hidden=!liveRole;
}

async function secureSignOut(){try{await onlineApi('session','DELETE')}catch{}clearInterval(liveTimer);liveTimer=null;liveTasks=[];state=makeState([]);showAuth()}
async function authStart(){try{
 const session=await onlineApi('session');liveRole=session.role;liveMemberId=session.memberId;
 $('#secureLogin').hidden=true;$('#app').hidden=false;$('#accountBadge')?.remove();updateAccessControls();
 if(liveRole==='admin'){
  $('#volunteerLoginBtn').hidden=false;
  $$('.bottom-nav,.desktop-nav').forEach(x=>x.hidden=false);
  await refreshOnline();go('map');
 }else{
  $('#volunteerLoginBtn').hidden=true;
  $$('.bottom-nav,.desktop-nav').forEach(x=>x.hidden=true);
  await refreshOnline();go('volunteer');
 }
 clearInterval(liveTimer);liveTimer=setInterval(()=>refreshOnline(true),20000);
}catch(e){showAuth();$('#authStatus').textContent=e.status===403?'帳號或裝置尚未獲管理員核准':e.status===401?'請使用正確的帳號與密碼登入':'連線尚未完成，請稍後重新整理'}}
function syncTaskProjection(){
 state.plans={};const byGroup=new Map();
 for(const t of liveTasks){
  const exact=data.stops.find(r=>r['車牌']===t.truck&&r['時段']===t.shift&&r['里別']===t.area&&r['停靠點原文']===t.stop_address&&Number(r['清運次序'])===Number(t.stop_order));
  const row=exact||data.stops.find(r=>r['車牌']===t.truck&&r['時段']===t.shift&&r['里別']===t.area&&r['停靠點原文']===t.stop_address);
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
 for(const [key,ts] of byGroup){const parts=key.split('|');const area=parts.at(-1),mid=parts.at(-2),route=parts.slice(1,4).join('|'),dateKey=parts[0];const all=data.stops.filter(x=>routeKey(x)===route&&x['里別']===area);
  if(all.length>1&&ts.length>=all.length){const plan=state.plans[dateKey+'|'+route];if(plan){plan.teams[area]??=[];if(!plan.teams[area].includes(mid))plan.teams[area].push(mid)}}
 }
}
async function refreshOnline(quiet=false){if(!liveRole||liveBusy)return;
 liveBusy=true;
 try{
  const tasks=await onlineApi('tasks');liveTasks=tasks.tasks||[];
  if(liveRole==='admin'){
   const roster=await onlineApi('roster');state.people=(roster.people||[]).map(p=>personNorm({id:p.id,name:p.name,phone:p.phone,address:p.address,residentArea:p.resident_area,assignment:p.assignment}));
   state.leaders={};for(const p of roster.people||[])if(p.is_leader&&p.assignment)state.leaders[p.assignment]=p.id;
   syncTaskProjection();render();
  }else{renderVolunteer()}
  if(!quiet)toast('線上資料已更新');
 }catch(e){if(e.status===401||e.status===403){showAuth()}else toast('雲端同步失敗：'+e.message)}finally{liveBusy=false}}
function matchedTasks(row){return liveTasks.filter(t=>t.visit_date===date&&t.shift===row['時段']&&t.truck===row['車牌']&&t.area===row['里別']&&t.stop_address===row['停靠點原文']);}
function matchedMemberTask(row,id){return matchedTasks(row).find(t=>t.volunteer_id===id)}
async function doLive(op){if(!assertAdmin())return false;try{await op();await refreshOnline();return true}catch(e){toast('未儲存：'+e.message);return false}}
assignPerson=async function(id,a){if(!areas.includes(a))return false;return doLive(()=>onlineApi('roster','PATCH',{id,assignment:a}))};
removePerson=async function(id){return doLive(()=>onlineApi('roster','PATCH',{id,assignment:null}))};
clearSelectedArea=async function(){const members=assignedPeople(selectedArea);if(!members.length)return toast('此里沒有分派人員');if(!assertAdmin())return;if(!confirm(`清除 ${selectedArea} 的 ${members.length} 位志工分派？`))return;for(const p of members){const ok=await doLive(()=>onlineApi('roster','PATCH',{id:p.id,assignment:null}));if(!ok)break}};
assignLeader=async function(id,a){const p=state.people.find(x=>x.id===id);if(!assertAdmin()||!p||p.assignment!==a)return;if(!canDial(p))return toast('沒有電話不能指定組長');if(!confirm(`將 ${p.name} 設為 ${a} 組長？`))return;
 const existing=leaderOf(a);if(existing&&existing.id!==id){const cleared=await doLive(()=>onlineApi('roster','PATCH',{id:existing.id,isLeader:false}));if(!cleared)return}
 await doLive(()=>onlineApi('roster','PATCH',{id,isLeader:true}));};
addTeam=async function(id){const p=state.people.find(x=>x.id===id);if(!assertAdmin()||!p||p.assignment!==teamArea)return toast('請先分派到對應服務里');if(bookingFor(id))return toast('同一天同時段已安排其他工作');const rows=routeRows().filter(r=>r['里別']===teamArea);if(!rows.length)return toast('目前里別沒有選錄停靠點');await doLive(()=>onlineApi('tasks','POST',{volunteerId:id,area:teamArea,date,shift,truck:rows[0]['車牌'],stops:rows.map(r=>({address:r['停靠點原文'],time:r['到達'],stopOrder:Number(r['清運次序'])}))}));};
addStopVolunteer=async function(key,id){const row=data.stops.find(r=>stopKey(r)===key),p=state.people.find(x=>x.id===id);if(!assertAdmin()||!row||!p||p.assignment!==row['里別'])return toast('請先分派服務里');if(bookingFor(id))return toast('同一天同時段不可重複排班');await doLive(()=>onlineApi('tasks','POST',{volunteerId:id,area:row['里別'],date,shift:row['時段'],truck:row['車牌'],address:row['停靠點原文'],time:row['到達'],stopOrder:Number(row['清運次序'])}));};
removeTeam=async function(id){const rows=routeRows().filter(r=>r['里別']===teamArea);const related=rows.flatMap(r=>matchedTasks(r).filter(x=>x.volunteer_id===id));if(!related.length)return;await doLive(()=>onlineApi('tasks','DELETE',{id:related[0].id}));};
removeStopMember=async function(key,id){const row=data.stops.find(x=>stopKey(x)===key);if(!row)return;const task=matchedMemberTask(row,id);if(!task)return;const related=liveTasks.filter(x=>x.volunteer_id===id&&x.visit_date===date&&x.shift===shift&&x.truck===row['車牌']);if(related.length>1)return toast('這是整段跟巡指派，請從里別跟巡人員移除');await doLive(()=>onlineApi('tasks','DELETE',{id:task.id}));};
setStatus=async function(key,status){const row=data.stops.find(x=>stopKey(x)===key);if(!row||!validStatuses.includes(status))return;const ts=matchedTasks(row);if(!ts.length)return toast('請先指派人員');await doLive(async()=>{for(const t of ts)await onlineApi('tasks','PATCH',{id:t.id,status})});};
savePersonForm=async function(f){if(!assertAdmin())return;const d=Object.fromEntries(new FormData(f));const pay={name:d.name,phone:d.phone,address:d.address,residentArea:d.residentArea,assignment:d.assignment||null};if(d.id)pay.id=d.id;const good=await doLive(()=>onlineApi('roster',d.id?'PATCH':'POST',pay));if(good){closeModal();toast('個人名冊已更新至雲端')}};
// Update worker's own tasks through authenticated backend, not localStorage.
renderVolunteer=function(){
 const jobs=liveTasks.filter(x=>x.volunteer_id===liveMemberId).sort((a,b)=>a.visit_date.localeCompare(b.visit_date)||a.shift.localeCompare(b.shift)||a.stop_order-b.stop_order);
 $('#volunteerWelcome').innerHTML=`<div class="volunteer-welcome-head"><strong>👤 我的跟巡工作</strong><span class="demo-label">已驗證身分</span></div><p>只顯示本人被指派的工作；完成狀態上傳後，管理員可同步查看。</p>`;
 $('#volunteerSchedules').innerHTML=jobs.length?jobs.map(t=>`<article class="volunteer-task ${t.status==='完成'?'completed':''}"><div class="volunteer-task-top"><span class="volunteer-task-day">${esc(t.visit_date)} · ${esc(t.shift)} ${esc(t.eta||'')}</span><span class="volunteer-task-status">${esc(t.status)}</span></div><strong>${esc(t.area)} · 車牌 ${esc(t.truck)}</strong><p>${esc(t.stop_address)}</p><div class="volunteer-task-footer"><small>${t.status==='完成'?'已完成回報':'任務尚未完成'}</small><button type="button" data-live-complete="${esc(t.id)}" ${t.status==='完成'?'disabled':''}>${t.status==='完成'?'✓ 已完成':'✓ 回報已完成'}</button></div></article>`).join(''):'<div class="empty">目前沒有指派給你的跟巡巡點</div>';
};
async function completeOnlineTask(id){if(liveRole!=='volunteer')return toast('請由志工帳號完成本人任務');try{await onlineApi('tasks','PATCH',{id,status:'完成'});await refreshOnline();toast('✓ 已傳送完成回報')}catch(e){toast('回報失敗：'+e.message)}}
async function openMemberAdmin(preselectId=''){
 if(!assertAdmin())return;
 try{
  const x=await onlineApi('members');
  const known=new Set((x.members||[]).map(m=>m.member_id));
  const active=(x.members||[]).filter(m=>m.enabled||m.status==='active');
  const list=(x.members||[]).map(m=>{const name=m.name||state.people.find(p=>p.id===m.member_id)?.name||'姓名待補';const approved=m.status==='active'||m.enabled===true;return `<div class="pick-row approved-member-row"><div class="member-label"><strong class="approved-member-name">${esc(name)}</strong><span class="approved-member-phone">${esc(prettyPhone(m.phone))}</span></div>${approved?'<span class="auth-success-check" role="img" aria-label="已完成授權" title="已完成授權">✓</span>':`<span class="auth-pending-label" aria-label="尚未啟用">${esc(m.status==='suspended'?'已停用':'待核准')}</span>`}<div class="member-auth-actions">${approved?`<button type="button" class="smallbtn" data-member-revoke="${esc(m.auth_user_id)}">解除授權</button>`:''}<button type="button" class="smallbtn danger" data-member-remove="${esc(m.auth_user_id)}">刪除會員</button></div></div>`}).join('');
  const eligible=state.people.filter(p=>p.phone&&!known.has(p.id));
  const selected=eligible.find(p=>p.id===preselectId)||eligible[0];
  const byAccount=new Map((x.members||[]).map(m=>[m.id,m]));
  const pendingDevices=(x.devices||[]).filter(d=>d.status==='pending');
  const approvedDevices=(x.devices||[]).filter(d=>d.status==='approved');
  const phoneLabel=(m)=>prettyPhone(m?.phone||'');
  const deviceQueue=pendingDevices.map(d=>{const m=byAccount.get(d.account_id),name=m?.name||state.people.find(p=>p.id===m?.member_id)?.name||'待核對志工';return `<div class="pick-row device-approval-row"><div class="member-label"><strong>${esc(name)}</strong><small>${esc(phoneLabel(m))} · 新裝置待核准</small></div><button type="button" class="approve-device-btn" data-approve-device="${esc(d.id)}">✓ 核准此手機</button></div>`}).join('');
  const deviceSection=`<section class="device-approval-section"><h3>待核准手機（${pendingDevices.length}）</h3>${deviceQueue||'<p class="mini-note">目前沒有待核准手機</p>'}<p class="mini-note">志工第一次用手機與 PIN 登入後會送出裝置申請。管理員核准後，志工即可重新開啟 PWA 直接進入。</p><p class="mini-note">已核准裝置：${approvedDevices.length}</p></section>`;
  showModal('管理員｜會員授權',`<form id="memberAdminForm"><label>選擇志工<select name="volunteerId" id="authorizationVolunteer" required>${eligible.map(p=>`<option value="${esc(p.id)}" ${selected?.id===p.id?'selected':''}>${esc(p.name)}｜${esc(prettyPhone(p.phone))}</option>`).join('')}</select></label><label>手機號碼（須與名冊一致）<input name="phone" id="authorizationPhone" required inputmode="tel" value="${esc(selected?prettyPhone(selected.phone):'')}" placeholder="09xx-xxx-xxx"></label><label>志工登入 PIN（6 位數字）<input type="password" name="password" required minlength="6" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" autocomplete="new-password" placeholder="請設定 6 碼數字"></label><input type="hidden" name="role" value="volunteer"><button class="primary wide" type="submit" ${eligible.length?'':'disabled'}>核准開通志工帳號</button></form><div class="member-admin-existing"><strong>已完成授權：${active.length} 位</strong>${list||'<p>尚未核准會員</p>'}</div>${deviceSection}`);
  $('#authorizationVolunteer').onchange=e=>{const person=state.people.find(p=>p.id===e.target.value);$('#authorizationPhone').value=person?prettyPhone(person.phone):''};
 }catch(e){toast('會員授權資料讀取失敗：'+e.message)}
}
function openNewMemberForm(){
 if(!assertAdmin())return;
 showModal('新增會員｜名冊與授權同步建立',`<form id="newMemberForm" class="member-create-form">
 <p class="form-hint">此操作將先建立志工名冊，再以管理員權限開通同一人的會員帳號。電話請先向本人核對，初始密碼請以安全方式告知。</p>
 <label>分派服務里<select name="assignment"><option value="">待分配</option>${areas.map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join('')}</select></label>
 <label>姓名 *<input name="name" required maxlength="80" autocomplete="off"></label>
 <label>手機號碼 *<input name="phone" required type="tel" inputmode="tel" placeholder="0989-098-468"></label>
 <label>原居住里<input name="residentArea" maxlength="40" placeholder="選填，不需重複加「里」"></label>
 <label>地址<input name="address" maxlength="300"></label>
 <label>志工登入 PIN（6 位數字）*<input name="password" required type="password" inputmode="numeric" minlength="6" maxlength="6" pattern="[0-9]{6}" autocomplete="new-password" placeholder="6 碼數字"><small>管理員核對電話後開通；首次登入還需申請裝置授權。勿將 PIN 寫在公開名冊。</small></label>
 <button type="submit" class="primary wide" id="saveNewMember">確認新增並同步會員授權</button>
 <p id="memberCreateStatus" class="form-progress" role="status" aria-live="polite"></p>
 </form>`);
}
async function submitNewMemberForm(form){
 if(!assertAdmin())return;
 const b=Object.fromEntries(new FormData(form));
 let p;
 const info=$('#memberCreateStatus'), btn=$('#saveNewMember'); btn.disabled=true;
 try{
  const n=phoneDigits(b.phone);if(!/^09\d{8}$/.test(n))throw new Error('請輸入有效的台灣手機號碼');
  if(!/^[0-9]{6}$/.test(String(b.password||'')))throw new Error('志工登入 PIN 必須是 6 位數字');
  info.textContent='正在建立正式名冊…';
  const r=await onlineApi('roster','POST',{name:b.name,phone:b.phone,address:b.address,residentArea:b.residentArea,assignment:b.assignment||null});
  p=r.person;
  if(!p?.id)throw new Error('人員已建立，但伺服器未回傳 ID，請至名冊查核');
  info.textContent='名冊已建立，正在核准會員…';
  await onlineApi('members','POST',{volunteerId:p.id,phone:b.phone,password:b.password,role:'volunteer'});
  // Never retain the password in state, logs or local storage.
  form.reset(); closeModal(); await refreshOnline();
  toast('✓ 名冊與會員授權同步建立成功');
  await openMemberAdmin();
 }catch(e){
  if(p?.id){
   info.textContent='名冊已新增，但會員開通未完成：'+e.message+'。請至「會員授權」重試；原名冊已保留。';
   await refreshOnline();
   btn.hidden=true;
   const retry=document.createElement('button');retry.type='button';retry.className='primary wide';retry.textContent='前往會員授權補辦';retry.onclick=()=>openMemberAdmin(p.id);info.after(retry);
  }else{info.textContent='新增失敗：'+e.message;btn.disabled=false}
 }
}

const originalBind=bind;
bind=function(){originalBind();
 $('#secureLogout').onclick=secureSignOut;
 $('#closeSecureLogin').onclick=()=>{$('#secureLogin').hidden=true};
 $('#loginFromRoster').onclick=openSecureLogin;
 $('#addMember').onclick=openNewMemberForm;
 $('#openRosterAuthorization').onclick=()=>openMemberAdmin();
 $('#secureLoginForm').onsubmit=async e=>{e.preventDefault();$('#authStatus').textContent='登入驗證中…';const d=Object.fromEntries(new FormData(e.target));try{await onlineApi('session','POST',d);await authStart()}catch(err){$('#authStatus').textContent=err.message}};
 document.addEventListener('click',e=>{const b=e.target.closest('button[data-live-complete]');if(b)completeOnlineTask(b.dataset.liveComplete)});
 document.addEventListener('click',async e=>{const btn=e.target.closest('button[data-member-revoke],button[data-member-remove]');if(!btn)return;if(!assertAdmin())return;const remove=btn.hasAttribute('data-member-remove');if(!confirm(remove?'確定刪除此會員帳號？帳號將停用並自授權清單移除，歷史排班紀錄保留。':'確定解除此會員授權？此帳號將無法再登入。'))return;btn.disabled=true;try{await onlineApi('members',remove?'DELETE':'PATCH',{authUserId:remove?btn.dataset.memberRemove:btn.dataset.memberRevoke,...(remove?{}:{enabled:false})});toast(remove?'會員已自授權名單移除（歷史紀錄保留）':'會員授權已解除');await openMemberAdmin()}catch(err){toast('操作失敗：'+err.message);btn.disabled=false}});
 document.addEventListener('click',async e=>{const btn=e.target.closest('button[data-approve-device]');if(!btn)return;if(!assertAdmin())return;btn.disabled=true;try{await onlineApi('members','PATCH',{deviceId:btn.dataset.approveDevice,approved:true});toast('✓ 手機已核准，志工可重新開啟 PWA');await openMemberAdmin()}catch(err){toast('核准手機失敗：'+err.message);btn.disabled=false}});
 $('#modalBody').addEventListener('submit',async e=>{if(e.target.id==='newMemberForm'){e.preventDefault();await submitNewMemberForm(e.target);return}if(e.target.id!=='memberAdminForm')return;e.preventDefault();if(!assertAdmin())return;const d=Object.fromEntries(new FormData(e.target));const x=state.people.find(p=>p.id===d.volunteerId);const normalizePhone=p=>{let n=phoneDigits(p);if(n.startsWith('8869'))n='0'+n.slice(3);return n};if(!x||normalizePhone(x.phone)!==normalizePhone(d.phone)){toast('手機號碼和人員名冊不符');return}try{await onlineApi('members','POST',d);toast('✓ 會員已授權，請透過安全管道通知密碼');await openMemberAdmin()}catch(err){toast('建立會員失敗：'+err.message)}});
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
 const pub=await fetch('./data-public.json',{cache:'no-store'});if(!pub.ok)throw Error('地圖資料無法讀取');data=await pub.json();areas=data.areas;
 state=makeState([]);state.demo=false;areaPage=Math.floor(areas.indexOf(selectedArea)/CARD_PAGE_SIZE);const pa=$('#plannerAreaSelect');pa.innerHTML='<option value="all">全部十里</option>'+areas.map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join('');
 const sel=$('#peopleAreaFilter');sel.innerHTML='<option value="all">全部里別</option>'+areas.map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join('');
 $('#peopleFilter').value='assigned';bind();showAuth();await authStart();lastSessionCheck=Date.now();document.addEventListener('visibilitychange',restoreSavedSessionOnResume);window.addEventListener('pageshow',e=>{if(e.persisted)restoreSavedSessionOnResume()});
 if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
}catch(e){console.error(e);$('#authStatus').textContent='網站載入失敗：'+e.message}
}
boot();
})();