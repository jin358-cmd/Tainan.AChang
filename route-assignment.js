(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.AChangRouteAssignment=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const eligible=person=>!!person?.id&&!!person.name&&!/^[@＠]/.test(person.name.trim())&&!['陳中原','陳中新','露西','PMOS管理員'].includes(person.name.trim());
const legalTime=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value||'');
const key=item=>[item.volunteerId,item.date,item.stopId].join('|');
function createDraft(){
 let items=[],removals=[],batchId=null;
 const group=item=>[item.date,item.shift,item.routeId].join('|');
 return {
  items:()=>items.map(x=>({...x})),
  removals:()=>removals.map(x=>({...x})),
  size:()=>items.length+removals.length,
  clear(){items=[];removals=[];batchId=null;},
  cancelRemoval(id){removals=removals.filter(x=>x.taskId!==id);batchId=null;},
  removeSaved(task,name){if(!removals.some(x=>x.taskId===task.id))removals.push({taskId:task.id,name,date:task.visit_date,routeId:task.route_id||task.truck,order:task.stop_order});batchId=null;},
  remove(id){items=items.filter(x=>key(x)!==id);batchId=null;},
  removePersonAt(person,stop,date,tasks=[]){
   for(const item of this.items().filter(x=>x.volunteerId===person.id&&x.stopId===stop.站點ID&&x.date===date))this.remove(key(item));
   for(const task of tasks.filter(t=>t.volunteer_id===person.id&&t.visit_date===date&&t.shift===stop.時段&&(t.route_id||t.truck)===stop.路線ID&&t.stop_address===stop.停靠點原文&&Number(t.stop_order)===stop._taskOrder))this.removeSaved(task,person.name);
  },
  stage(person,stop,date,area,tasks=[]){
   if(!eligible(person))throw Error('此人員不在可分配名冊');
   if(!legalTime(stop.到達)||stop.來源刪除線)throw Error('此站時間待核對或已停用，無法分配');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('請選擇有效分配日期');
   if(typeof area!=='string'||!area.trim()||area.length>30)throw Error('站點里別待核對，暫無法分配未分區人員');
   const same=tasks.filter(t=>t.volunteer_id===person.id&&t.visit_date===date&&t.shift===stop.時段);
   area=person.assignment||same.find(t=>(t.route_id||t.truck)===stop.路線ID)?.area||items.find(x=>x.volunteerId===person.id&&x.date===date&&x.routeId===stop.路線ID)?.area||area;
   if(same.some(t=>(t.route_id||t.truck)!==stop.路線ID||t.area!==area)||items.some(x=>x.volunteerId===person.id&&x.date===date&&x.shift===stop.時段&&(x.routeId!==stop.路線ID||x.area!==area)))throw Error('此人同日同時段已安排其他車次，請先調整分配');
   if(items.length+removals.length>=1000&&!items.some(x=>x.volunteerId===person.id&&x.date===date&&x.stopId===stop.站點ID))throw Error('一次最多確認1000筆，請先確認目前草稿');
   const item={volunteerId:person.id,name:person.name,stopId:stop.站點ID,date,area,route:stop.車次,routeId:stop.路線ID,shift:stop.時段,order:stop._taskOrder,address:stop.停靠點原文,time:stop.到達};
   if(!items.some(x=>key(x)===key(item)))items.push(item);batchId=null;return item;
  },
  stageRoute(person,stops,date,tasks=[]){const before=items.map(x=>({...x})),previousBatch=batchId;try{for(const stop of stops)this.stage(person,stop,date,person.assignment||stop.里別,tasks);}catch(error){items=before;batchId=previousBatch;throw error;}},
  chooseLeader(person,stop,date,tasks=[]){
   this.stage(person,stop,date,person.assignment||stop.里別,tasks);
   const chosen=items.find(x=>x.volunteerId===person.id&&x.date===date&&x.stopId===stop.站點ID),scope=group(chosen);
   for(const item of items)if(group(item)===scope)delete item.isRouteLeader;
   chosen.isRouteLeader=true;batchId=null;
  },
  payload(uuid){if(!batchId)batchId=uuid();return {action:'batch',batchId,items:[...removals.map(x=>({action:'remove',taskId:x.taskId})),...items.map(x=>({volunteerId:x.volunteerId,stopId:x.stopId,date:x.date,...(x.isRouteLeader?{isRouteLeader:true}:{})}))]};}
 };
}
function create({getContext,getRows,submit}){
 const draft=createDraft(),$=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let selected=null,routeScope=null,session='',serviceDate='',message='',busy=false,opened=false;
 const panel=document.createElement('aside');panel.id='routeAssignmentPanel';panel.className='route-assignment-panel';panel.setAttribute('aria-label','站點人員分配');panel.hidden=true;
 const launcher=document.createElement('button');launcher.id='routeAssignmentOpen';launcher.type='button';launcher.hidden=true;launcher.className='route-assignment-launcher';document.body.append(launcher);
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const context=()=>getContext();
 const rows=()=>{const orders=new Map();return getRows().map(row=>{const route=row.路線ID,order=(orders.get(route)||0)+1;orders.set(route,order);return {...row,_taskOrder:order};});};
 const target=()=>rows().find(row=>row.站點ID===selected);
 const targets=()=>routeScope?rows().filter(row=>routeScope.ids.includes(row.站點ID)&&legalTime(row.到達)&&!row.來源刪除線):target()?[target()]:[];
 const activeTasks=()=>context().tasks.filter(t=>!draft.removals().some(x=>x.taskId===t.id));
 const personTasks=(id)=>activeTasks().filter(t=>t.volunteer_id===id&&t.visit_date===serviceDate);
 const tasksAt=(row)=>activeTasks().filter(t=>t.visit_date===serviceDate&&t.shift===row.時段&&(t.route_id||t.truck)===row.路線ID&&t.stop_address===row.停靠點原文&&Number(t.stop_order)===row._taskOrder);
 function mount(){const detail=$('detail');if(detail&&panel.parentElement!==detail)detail.append(panel);}
 function placePanel(){
  if(panel.hidden)return;const diagram=$('detail')?.getBoundingClientRect();if(!diagram)return;
  const width=Math.min(460,document.documentElement.clientWidth-24),desktop=document.body.classList.contains('map-route-desktop');
  const top=Math.max(74,Math.min(diagram.top,document.documentElement.clientHeight-360));
  panel.style.width=width+'px';panel.style.left=(desktop?Math.max(12,diagram.left-width+2):12)+'px';panel.style.top=top+'px';const height=Math.max(300,document.documentElement.clientHeight-top-24);panel.style.maxHeight=height+'px';panel.style.height=Math.min(800,height)+'px';$('detail')?.classList.add('has-allocation-extension');
 }
 const allSelected=()=>{const all=rows().filter(r=>r.車次===routeScope?.route&&legalTime(r.到達)&&!r.來源刪除線);return all.length>0&&all.every(r=>routeScope?.ids.includes(r.站點ID));};
 function paintStops(){
  const all=rows(),ctx=context(),currentDraft=draft.items();$('routeTitle')?.classList.toggle('assignment-route-selected',Boolean(routeScope?.ids.length&&ctx.role==='admin'));$('routeTitle')?.setAttribute('aria-pressed',String(Boolean(routeScope?.ids.length&&ctx.role==='admin')));
  $('routeTitle')?.querySelector('.route-all-selected')?.remove();if(context().role==='admin'&&allSelected()){const badge=document.createElement('span');badge.className='route-all-selected';badge.textContent='（站點已全選）';$('routeTitle')?.append(badge);}if($('routeSelectAll')){$('routeSelectAll').textContent=allSelected()?'取消站點全選':'站點全選（整個車次）';$('routeSelectAll').setAttribute('aria-pressed',String(allSelected()));}
  document.querySelectorAll('#routeDiagram [data-focus-stop],#routeFullDiagram [data-focus-stop]').forEach(button=>{
   const row=all.find(r=>r.站點ID===button.dataset.focusStop);if(!row)return;
   const picked=Boolean((selected===row.站點ID||routeScope?.ids.includes(row.站點ID))&&ctx.role==='admin');button.classList.toggle('assignment-selected',picked);button.setAttribute('aria-pressed',String(picked));
   const card=button.closest('.route-stop');if(!card)return;card.classList.toggle('assignment-target',picked);card.setAttribute('aria-pressed',String(picked));card.querySelector('.route-assigned-people')?.remove();
   if(ctx.role!=='admin')return;
   const box=document.createElement('div');box.className='route-assigned-people';
   const chosen=currentDraft.find(x=>x.date===serviceDate&&x.routeId===row.路線ID&&x.isRouteLeader);
   const isLeader=id=>chosen?chosen.volunteerId===id:activeTasks().some(t=>t.volunteer_id===id&&t.visit_date===serviceDate&&(t.route_id||t.truck)===row.路線ID&&t.is_route_leader);
   const identity=(chip,id,name)=>{chip.dataset.memberId=id;chip.dataset.memberName=name;chip.dataset.routeLeader=String(isLeader(id));};
   const addRemove=(chip,person)=>{const remove=document.createElement('button');remove.type='button';remove.className='route-person-remove';remove.textContent='×';remove.setAttribute('aria-label','移除'+person.name+'的本站分配');remove.title='僅移除此人於本站的分配，確認後儲存';remove.disabled=busy;remove.onclick=event=>{event.preventDefault();event.stopPropagation();if(busy||context().role!=='admin')return;draft.removePersonAt(person,row,serviceDate,activeTasks());if(!routeScope||!routeScope.ids.includes(row.站點ID))routeScope={route:row.車次,ids:[row.站點ID],mode:'selection'};opened=true;message=`已暫列移除 ${person.name} 於 ${row.車次} 第${row._taskOrder}站的配員；確認後儲存`;render();};chip.append(remove);};
   const existing=tasksAt(row);for(const task of existing){const person=ctx.people.find(p=>p.id===task.volunteer_id);if(!person)continue;const chip=document.createElement('span');chip.className='route-person-chip saved';identity(chip,person.id,person.name);chip.textContent=(isLeader(person.id)?'👑 ':'')+person.name+' · 已分配';addRemove(chip,person);box.append(chip);}
   for(const item of currentDraft.filter(x=>x.stopId===row.站點ID&&x.date===serviceDate&&!existing.some(t=>t.volunteer_id===x.volunteerId))){const person=ctx.people.find(p=>p.id===item.volunteerId);if(!person)continue;const chip=document.createElement('span');chip.className='route-person-chip draft';identity(chip,item.volunteerId,item.name);chip.textContent=(isLeader(item.volunteerId)?'👑 ':'')+item.name+' · 暫排';addRemove(chip,person);box.append(chip);}
   card.append(box);
  });
 }
 function render(){
  const ctx=context();if(!serviceDate)serviceDate=ctx.date||today();if(ctx.role!=='admin'||ctx.subject!==session){if(session&&ctx.subject!==session||ctx.role!=='admin'){draft.clear();selected=null;routeScope=null;opened=false;message='';}session=ctx.role==='admin'?ctx.subject:'';}
  const scopeCount=targets().length,toolbar=$('routeSelectionToolbar');if(toolbar)toolbar.hidden=ctx.role!=='admin';if($('routeSelectionStatus'))$('routeSelectionStatus').textContent=scopeCount?`${routeScope?.route||''} · 已選 ${scopeCount} 站`:'尚未選取站點';for(const id of ['routePickPeople','routeClearSelection'])if($(id))$(id).disabled=busy||!scopeCount;if($('routeSelectAll'))$('routeSelectAll').disabled=busy||!window.AChangRouteDirectory?.activeRoute?.();
  const inMap=$('page-map')?.classList.contains('active');panel.hidden=ctx.role!=='admin'||!opened||!inMap;if(ctx.role!=='admin')panel.replaceChildren();launcher.hidden=ctx.role!=='admin'||opened||draft.size()===0||!inMap;launcher.textContent=`開啟分配草稿（${draft.size()}）`;paintStops();document.dispatchEvent(new CustomEvent('achang:route-crew-view'));document.dispatchEvent(new CustomEvent('achang:route-card-layout'));$('detail')?.classList.toggle('has-allocation-extension',!panel.hidden);if(panel.hidden)return;
  mount();const row=target(),scope=targets(),route=routeScope?.route||row?.車次;if(!serviceDate)serviceDate=ctx.date||today();
  const records=draft.items(),removals=draft.removals(),changeCount=draft.size(),people=ctx.people.filter(eligible);
  const count=new Set(records.map(x=>x.volunteerId)).size;
  const atRoute=(person)=>records.some(x=>x.volunteerId===person.id&&x.date===serviceDate&&x.route===route)||personTasks(person.id).some(t=>scope.some(stop=>stop.路線ID===(t.route_id||t.truck)));
  const assigned=people.filter(atRoute),waiting=people.filter(person=>!atRoute(person));
  const cardFor=person=>{
   const staged=records.filter(x=>x.volunteerId===person.id&&x.date===serviceDate),saved=personTasks(person.id);
   const here=routeScope?scope.length>0&&scope.every(stop=>staged.some(x=>x.stopId===stop.站點ID)):staged.some(x=>x.stopId===selected);
   const already=scope.length>0&&scope.every(stop=>tasksAt(stop).some(t=>t.volunteer_id===person.id));
   const blocked=scope.some(stop=>saved.some(t=>t.shift===stop.時段&&(t.route_id||t.truck)!==stop.路線ID)||staged.some(x=>x.shift===stop.時段&&x.routeId!==stop.路線ID));
   let labels=[...staged.map(x=>`暫排：${x.route} 第${x.order}站 ${x.time}`),...saved.map(t=>`已分配：${String(t.route_id||t.truck).replace(/^PDF:(日間|夜間):([^:]+):.*$/,'$2')} 第${t.stop_order}站 ${t.eta}`)];
   if(labels.length>8){const summarize=(entries,label)=>{const groups=new Map();for(const entry of entries){const token=entry.route||String(entry.route_id||entry.truck).replace(/^PDF:(日間|夜間):([^:]+):.*$/,'$2');if(!groups.has(token))groups.set(token,[]);groups.get(token).push(Number(entry.order||entry.stop_order));}return [...groups].map(([route,orders])=>`${label}：${route} · ${orders.length} 站（第${Math.min(...orders)}～${Math.max(...orders)}站）`);};labels=[...summarize(staged,'暫排'),...summarize(saved,'已分配')];}
   const routeId=scope[0]?.路線ID,chosen=records.find(x=>x.date===serviceDate&&x.routeId===routeId&&x.isRouteLeader);
   const leader=chosen?chosen.volunteerId===person.id:saved.some(t=>(t.route_id||t.truck)===routeId&&t.is_route_leader);
   const crown=atRoute(person)?`<button type="button" data-route-person-leader="${esc(person.id)}" class="${leader?'leader-on':''}" ${busy?'disabled':''} title="選擇本車次組長，確認分配後儲存">${leader?'👑 組長':'♛ 設組長'}</button>`:'';
   const removable=scope.some(stop=>tasksAt(stop).some(t=>t.volunteer_id===person.id))||staged.some(x=>scope.some(stop=>stop.站點ID===x.stopId));
   const removeButton=atRoute(person)?`<button type="button" class="route-person-delete" data-remove-person="${esc(person.id)}" ${busy||!removable?'disabled':''} title="移除目前所選站點的配員，確認後儲存">移除配員</button>`:'';
   return window.AChangMemberCards.renderCard(person,{area:person.assignment||'',leader,allocations:labels,className:`route-assignment-person ${atRoute(person)?'has-assignment':''}`,actions:`${crown}${removeButton}<button type="button" data-stage-person="${esc(person.id)}" ${busy||!scope.length||already||blocked?'disabled':''}>${already?'已分配':here?'移出暫排':blocked?'其他車次':scope.length>1?'＋ 加入所選站點':'＋ 加入本站'}</button>`});
  };
  panel.innerHTML=`<div class="route-assignment-heading"><h3>${routeScope?.mode==='window'||routeScope?.mode==='all'?'車次人員分配':'站點人員分配'}</h3><button type="button" data-assignment-close aria-label="收合人員分配">×</button></div><label>分配日期<input id="routeAssignmentDate" type="date" value="${esc(serviceDate)}" ${busy?'disabled':''}></label><p class="route-assignment-target">${routeScope?`${esc(routeScope.route)} · ${routeScope.mode==='all'?'全路線':routeScope.mode==='window'?'目前時段':'已複選'} ${scope.length} 站${scope.length===1?`<br>第${scope[0]._taskOrder}站 · ${esc(scope[0].到達)} · ${esc(scope[0].停靠點原文)}`:''}`:row?`${esc(row.車次)} · 第${row._taskOrder}站 · ${esc(row.到達)}<br>${esc(row.停靠點原文)}`:'請點選站點卡片或車次標題'}</p><div class="route-assignment-candidates"><section class="assigned-route-people" aria-label="本車次已分配人員"><h4>本車次已分配（${assigned.length}人）</h4>${assigned.map(cardFor).join('')||'<p class="assignment-empty">此車次尚未分配人員</p>'}</section><section class="waiting-route-people" aria-label="本車次未分配人員"><h4>未分配（${waiting.length}人）</h4>${waiting.map(cardFor).join('')||'<p class="assignment-empty">全部人員已分配</p>'}</section></div><details class="route-assignment-review"><summary>草稿：${count}人／新增 ${records.length} 筆／移除 ${removals.length} 筆</summary>${records.map(x=>`<p>${esc(x.date)} ${esc(x.name)} → ${esc(x.route)} 第${x.order}站 <button type="button" data-remove-draft="${esc(key(x))}" ${busy?'disabled':''}>移除</button></p>`).join('')}${removals.map(x=>`<p>${esc(x.date)} ${esc(x.name)} 第${x.order}站 → 待移除 <button type="button" data-undo-removal="${esc(x.taskId)}" ${busy?'disabled':''}>復原</button></p>`).join('')}</details><p id="routeAssignmentStatus" role="status" aria-live="polite">${esc(message||'可切換車次繼續選人，最後一次確認儲存。')}</p><div class="route-assignment-actions"><button type="button" data-clear-draft ${busy||!changeCount?'disabled':''}>清空草稿</button><button type="button" class="primary" data-confirm-draft ${busy||!changeCount?'disabled':''}>${busy?'儲存中…':`確認分配（${changeCount}筆）`}</button></div>`;
  $('routeAssignmentDate').onchange=event=>{serviceDate=event.target.value||today();message='';render();};
  placePanel();
 }
 panel.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||busy)return;
  if(button.hasAttribute('data-assignment-close')){opened=false;render();return;}
  if(button.hasAttribute('data-clear-draft')){draft.clear();message='草稿已清空';render();return;}
  if(button.hasAttribute('data-remove-draft')){draft.remove(button.dataset.removeDraft);message='';render();return;}
  if(button.hasAttribute('data-undo-removal')){draft.cancelRemoval(button.dataset.undoRemoval);message='已復原移除';render();return;}
  if(button.hasAttribute('data-remove-person')){
   const person=context().people.find(p=>p.id===button.dataset.removePerson),scope=targets();
   if(context().role!=='admin'||!person)return;
   for(const item of draft.items().filter(x=>x.volunteerId===person.id&&x.date===serviceDate&&scope.some(stop=>stop.站點ID===x.stopId)))draft.remove(key(item));
   for(const stop of scope)for(const task of tasksAt(stop).filter(t=>t.volunteer_id===person.id))draft.removeSaved(task,person.name);
   message='已暫列移除 '+person.name+' 的所選站點配員；確認後儲存';render();return;
  }
  if(button.hasAttribute('data-route-person-leader')){
   try{
    const ctx=context(),person=ctx.people.find(p=>p.id===button.dataset.routePersonLeader),routeId=targets()[0]?.路線ID;
    if(ctx.role!=='admin')throw Error('請以管理員登入');
    const staged=draft.items().find(x=>x.volunteerId===person?.id&&x.date===serviceDate&&x.routeId===routeId);
    const stop=staged?rows().find(x=>x.站點ID===staged.stopId):rows().find(x=>x.路線ID===routeId&&tasksAt(x).some(t=>t.volunteer_id===person?.id));
    if(!stop)throw Error('請先將此人加入本車次');
    draft.chooseLeader(person,stop,serviceDate,activeTasks());message='已暫選 '+person.name+' 為本車次組長；確認分配後儲存';
   }catch(error){message=error.message;}render();return;
  }
  if(button.hasAttribute('data-stage-person')){
   const ctx=context(),person=ctx.people.find(p=>p.id===button.dataset.stagePerson),scope=targets(),records=draft.items();
   const here=scope.length>0&&scope.every(stop=>records.some(x=>x.volunteerId===person?.id&&x.stopId===stop.站點ID&&x.date===serviceDate));
   try{if(ctx.role!=='admin')throw Error('請以管理員登入');if(!scope.length)throw Error('請先選擇站點');if(here){for(const item of records.filter(x=>x.volunteerId===person.id&&x.date===serviceDate&&scope.some(stop=>stop.站點ID===x.stopId)))draft.remove(key(item));}else draft.stageRoute(person,scope,serviceDate,activeTasks());message=here?'已移出暫排':'已暫排 '+person.name+'；尚未儲存';}catch(error){message=error.message;}render();return;
  }
  if(button.hasAttribute('data-confirm-draft')){
   if(context().role!=='admin'||!draft.size())return;
   busy=true;message='正在確認全部分配…';render();
   try{const result=await submit(draft.payload(()=>crypto.randomUUID()));draft.clear();message=`已確認分配：新增${result.createdCount}筆、原已存在${result.reusedCount}筆、移除${result.removedCount||0}筆。`;}catch(error){message='未儲存：'+error.message+'。草稿已保留。';}finally{busy=false;render();}
  }
 });
 launcher.onclick=()=>{opened=true;render();};
 document.addEventListener('achang:focus-route-stop',event=>{
  if(context().role!=='admin'||busy)return;const detail=event.detail||{},same=routeScope?.route===detail.route;
  if(detail.all&&same&&detail.stopIds?.length&&detail.stopIds.every(id=>routeScope.ids.includes(id))&&routeScope.ids.length===detail.stopIds.length){clearSelection();return;}
  const ids=detail.all?detail.stopIds||[]:same?(routeScope.ids.includes(detail.id)?routeScope.ids.filter(id=>id!==detail.id):[...routeScope.ids,detail.id]):[detail.id];
  selected=null;routeScope={route:detail.route,ids,mode:detail.all?'all':'selection'};opened=false;message='已選定站點，請按「人員選擇」安排同一人或同組人員';render();
 });
 document.addEventListener('achang:assign-route',event=>{if(context().role!=='admin'||busy)return;selected=null;routeScope={route:event.detail.route,ids:event.detail.stopIds,mode:'window'};opened=false;message='已選定目前時段站點，請按「人員選擇」';render();});
 document.addEventListener('achang:directory-route',event=>{if(routeScope){routeScope=routeScope.route===event.detail?.route?{...routeScope,ids:routeScope.mode==='window'?(window.AChangRouteDirectory?.activeStopIds?.()||routeScope.ids):routeScope.ids.filter(id=>rows().some(row=>row.站點ID===id))}:null;}render();});
 const clearSelection=()=>{if(busy)return;selected=null;routeScope=null;opened=false;message='已取消站點選取，分配草稿仍保留';render();};
 document.addEventListener('achang:clear-route-selection',clearSelection);
 document.addEventListener('achang:open-route-people',()=>{if(context().role!=='admin'||busy||!targets().length)return;opened=true;render();});
 document.addEventListener('click',event=>{if(!routeScope||busy||!$('page-map')?.classList.contains('active'))return;if(event.target.closest('#routePrintPreview,#routeAssignmentPanel,.route-assignment-launcher,.route-selection-toolbar,.route-stop,button,input,select,textarea,label,a,summary,[role=button],[data-open],.day-route-point-detail,#mapLayerSettings'))return;clearSelection();});
 document.addEventListener('keydown',event=>{if(!routeScope||busy||event.target.closest('#routePrintPreview'))return;const editable=event.target.closest('button,input,select,textarea,a,summary,[role=button],[contenteditable=true]');if(event.key==='Escape'||event.key===' '&&!editable){event.preventDefault();clearSelection();}});
 document.addEventListener('achang:route-view',()=>render());document.addEventListener('achang:assignment-context',()=>render());window.addEventListener('resize',()=>{mount();render();});document.addEventListener('scroll',placePanel,true);document.addEventListener('click',event=>{const nav=event.target.closest('[data-page]');if(nav){if(nav.dataset.page!=='map')opened=false;render();}});
 window.addEventListener('beforeunload',event=>{if(draft.size()){event.preventDefault();event.returnValue='';}});
 render();return {refresh:render,draft,staffing:stopId=>{if(context().role!=='admin')return {date:serviceDate,people:[]};const row=rows().find(r=>r.站點ID===stopId);if(!row)return {date:serviceDate,people:[]};const staged=draft.items().filter(x=>x.stopId===stopId&&x.date===serviceDate),saved=tasksAt(row),chosen=draft.items().find(x=>x.date===serviceDate&&x.routeId===row.路線ID&&x.isRouteLeader),ids=new Set([...saved.map(x=>x.volunteer_id),...staged.map(x=>x.volunteerId)]);return {date:serviceDate,people:context().people.filter(p=>eligible(p)&&ids.has(p.id)).map(p=>({id:p.id,name:p.name,phone:p.phone,leader:chosen?chosen.volunteerId===p.id:personTasks(p.id).some(t=>(t.route_id||t.truck)===row.路線ID&&t.is_route_leader),staged:staged.some(x=>x.volunteerId===p.id)}))};}};
}
return {createDraft,create,eligible};
});
