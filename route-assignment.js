(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.AChangRouteAssignment=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const eligible=person=>!!person?.id&&!!person.name&&!/^[@＠]/.test(person.name.trim())&&!['陳中原','陳中新','露西','PMOS管理員'].includes(person.name.trim());
const legalTime=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value||'');
const key=item=>[item.volunteerId,item.date,item.stopId].join('|');
function createDraft(){
 let items=[],batchId=null;
 return {
  items:()=>items.map(x=>({...x})),
  clear(){items=[];batchId=null;},
  remove(id){items=items.filter(x=>key(x)!==id);batchId=null;},
  stage(person,stop,date,area,tasks=[]){
   if(!eligible(person))throw Error('此人員不在可分配名冊');
   if(!legalTime(stop.到達)||stop.來源刪除線)throw Error('此站時間待核對或已停用，無法分配');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('請選擇有效分配日期');
   if(typeof area!=='string'||!area.trim()||area.length>30)throw Error('站點里別待核對，暫無法分配未分區人員');
   const same=tasks.filter(t=>t.volunteer_id===person.id&&t.visit_date===date&&t.shift===stop.時段);
   if(same.some(t=>(t.route_id||t.truck)!==stop.路線ID||t.area!==area)||items.some(x=>x.volunteerId===person.id&&x.date===date&&x.shift===stop.時段&&(x.routeId!==stop.路線ID||x.area!==area)))throw Error('此人同日同時段已安排其他車次，請先調整分配');
   const item={volunteerId:person.id,name:person.name,stopId:stop.站點ID,date,area,route:stop.車次,routeId:stop.路線ID,shift:stop.時段,order:stop._taskOrder,address:stop.停靠點原文,time:stop.到達};
   if(!items.some(x=>key(x)===key(item)))items.push(item);batchId=null;return item;
  },
  payload(uuid){if(!batchId)batchId=uuid();return {action:'batch',batchId,items:items.map(x=>({volunteerId:x.volunteerId,stopId:x.stopId,date:x.date}))};}
 };
}
function create({getContext,getRows,submit}){
 const draft=createDraft(),$=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let selected=null,session='',serviceDate='',message='',busy=false,opened=false;
 const panel=document.createElement('aside');panel.id='routeAssignmentPanel';panel.className='route-assignment-panel';panel.setAttribute('aria-label','站點人員分配');panel.hidden=true;
 const launcher=document.createElement('button');launcher.id='routeAssignmentOpen';launcher.type='button';launcher.hidden=true;launcher.className='route-assignment-launcher';document.body.append(launcher);
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const context=()=>getContext();
 const rows=()=>{const orders=new Map();return getRows().map(row=>{const route=row.路線ID,order=(orders.get(route)||0)+1;orders.set(route,order);return {...row,_taskOrder:order};});};
 const target=()=>rows().find(row=>row.站點ID===selected);
 const personTasks=(id)=>context().tasks.filter(t=>t.volunteer_id===id&&t.visit_date===serviceDate);
 const tasksAt=(row)=>context().tasks.filter(t=>t.visit_date===serviceDate&&t.shift===row.時段&&(t.route_id||t.truck)===row.路線ID&&t.stop_address===row.停靠點原文&&Number(t.stop_order)===row._taskOrder);
 function mount(){if(panel.parentElement!==document.body)document.body.append(panel);}
 function placePanel(){
  if(panel.hidden)return;const diagram=$('routeDiagram')?.getBoundingClientRect();if(!diagram)return;
  const width=Math.min(340,document.documentElement.clientWidth-24),desktop=document.body.classList.contains('map-route-desktop');
  const top=Math.max(74,Math.min(diagram.top,document.documentElement.clientHeight-360));
  panel.style.width=width+'px';panel.style.left=(desktop?Math.max(12,diagram.left-width-14):12)+'px';panel.style.top=top+'px';panel.style.maxHeight=Math.max(260,document.documentElement.clientHeight-top-24)+'px';
 }
 function paintStops(){
  const all=rows(),ctx=context(),currentDraft=draft.items();
  document.querySelectorAll('#routeDiagram [data-focus-stop]').forEach(button=>{
   const row=all.find(r=>r.站點ID===button.dataset.focusStop);if(!row)return;
   const picked=selected===row.站點ID&&ctx.role==='admin';button.classList.toggle('assignment-selected',picked);button.setAttribute('aria-pressed',String(picked));
   const card=button.closest('.route-stop');if(!card)return;card.classList.toggle('assignment-target',picked);card.querySelector('.route-assigned-people')?.remove();
   if(ctx.role!=='admin')return;
   const box=document.createElement('div');box.className='route-assigned-people';
   const existing=tasksAt(row);for(const task of existing){const person=ctx.people.find(p=>p.id===task.volunteer_id);if(!person)continue;const chip=document.createElement('span');chip.className='route-person-chip saved';chip.textContent=person.name+' · 已分配';box.append(chip);}
   for(const item of currentDraft.filter(x=>x.stopId===row.站點ID&&x.date===serviceDate)){const chip=document.createElement('span');chip.className='route-person-chip draft';chip.textContent=item.name+' · 暫排';const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','移除'+item.name+'的本站暫排');remove.disabled=busy;remove.onclick=()=>{draft.remove(key(item));message='';render();};chip.append(remove);box.append(chip);}
   card.append(box);
  });
 }
 function render(){
  const ctx=context();if(ctx.role!=='admin'||ctx.subject!==session){if(session&&ctx.subject!==session||ctx.role!=='admin'){draft.clear();selected=null;opened=false;message='';}session=ctx.role==='admin'?ctx.subject:'';}
  const inMap=$('page-map')?.classList.contains('active');panel.hidden=ctx.role!=='admin'||!opened||!inMap;launcher.hidden=ctx.role!=='admin'||opened||draft.items().length===0||!inMap;launcher.textContent=`開啟分配草稿（${draft.items().length}）`;paintStops();if(panel.hidden)return;
  mount();const row=target();if(!serviceDate)serviceDate=ctx.date||today();
  const records=draft.items(),people=ctx.people.filter(eligible);
  const count=new Set(records.map(x=>x.volunteerId)).size;
  panel.innerHTML=`<div class="route-assignment-heading"><h3>站點人員分配</h3><button type="button" data-assignment-close aria-label="收合人員分配">×</button></div><label>分配日期<input id="routeAssignmentDate" type="date" value="${esc(serviceDate)}" ${busy?'disabled':''}></label><p class="route-assignment-target">${row?`${esc(row.車次)} · 第${row._taskOrder}站 · ${esc(row.到達)}<br>${esc(row.停靠點原文)}`:'請點選完整路線圖的站點號碼'}</p><div class="route-assignment-candidates" aria-label="待分配人員清單">${people.map(person=>{
   const staged=records.filter(x=>x.volunteerId===person.id&&x.date===serviceDate),saved=personTasks(person.id),here=staged.find(x=>x.stopId===selected),already=row&&tasksAt(row).some(t=>t.volunteer_id===person.id),blocked=!!row&&(saved.some(t=>t.shift===row.時段&&(t.route_id||t.truck)!==row.路線ID)||staged.some(x=>x.shift===row.時段&&x.routeId!==row.路線ID));
   const labels=[...staged.map(x=>`暫排：${x.route} 第${x.order}站 ${x.time}`),...saved.map(t=>`已分配：${String(t.route_id||t.truck).replace(/^PDF:(日間|夜間):([^:]+):.*$/,'$2')} 第${t.stop_order}站 ${t.eta}`)];
   return window.AChangMemberCards.renderCard(person,{area:person.assignment||'',leader:ctx.leaders?.[person.assignment]===person.id,allocations:labels,className:`route-assignment-person ${labels.length?'has-assignment':''}`,actions:`<button type="button" data-stage-person="${esc(person.id)}" ${busy||!row||already||blocked?'disabled':''}>${already?'本站已分配':here?'移出本站':blocked?'其他車次':'＋ 加入本站'}</button>`});
  }).join('')||'<p>沒有符合的人員</p>'}</div><details class="route-assignment-review" ${records.length?'open':''}><summary>草稿：${count}人／${records.length}筆站點分配</summary>${records.map(x=>`<p>${esc(x.date)} ${esc(x.name)} → ${esc(x.route)} 第${x.order}站 <button type="button" data-remove-draft="${esc(key(x))}" ${busy?'disabled':''}>移除</button></p>`).join('')}</details><p id="routeAssignmentStatus" role="status" aria-live="polite">${esc(message||'可切換車次繼續選人，最後一次確認儲存。')}</p><div class="route-assignment-actions"><button type="button" data-clear-draft ${busy||!records.length?'disabled':''}>清空草稿</button><button type="button" class="primary" data-confirm-draft ${busy||!records.length?'disabled':''}>${busy?'儲存中…':`確認分配（${records.length}筆）`}</button></div>`;
  $('routeAssignmentDate').onchange=event=>{serviceDate=event.target.value||today();message='';render();};
  placePanel();
 }
 panel.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||busy)return;
  if(button.hasAttribute('data-assignment-close')){opened=false;render();return;}
  if(button.hasAttribute('data-clear-draft')){draft.clear();message='草稿已清空';render();return;}
  if(button.hasAttribute('data-remove-draft')){draft.remove(button.dataset.removeDraft);message='';render();return;}
  if(button.hasAttribute('data-stage-person')){
   const ctx=context(),person=ctx.people.find(p=>p.id===button.dataset.stagePerson),row=target(),existing=draft.items().find(x=>x.volunteerId===person?.id&&x.stopId===selected&&x.date===serviceDate);
   try{if(ctx.role!=='admin')throw Error('請以管理員登入');if(!row)throw Error('請先選擇站點');if(existing)draft.remove(key(existing));else draft.stage(person,row,serviceDate,person.assignment||row.里別,ctx.tasks);message=existing?'已移出本站草稿':'已暫排 '+person.name+'；尚未儲存';}catch(error){message=error.message;}render();return;
  }
  if(button.hasAttribute('data-confirm-draft')){
   if(context().role!=='admin'||!draft.items().length)return;
   busy=true;message='正在確認全部分配…';render();
   try{const result=await submit(draft.payload(()=>crypto.randomUUID()));draft.clear();message=`已確認分配：新增${result.createdCount}筆、原已存在${result.reusedCount}筆。`;}catch(error){message='未儲存：'+error.message+'。草稿已保留。';}finally{busy=false;render();}
  }
 });
 launcher.onclick=()=>{opened=true;render();};
 document.addEventListener('achang:focus-route-stop',event=>{if(context().role!=='admin'||busy)return;selected=event.detail?.id;opened=true;message='';render();if(!document.body.classList.contains('map-route-desktop'))$('routeAssignmentDate')?.focus();});
 document.addEventListener('achang:directory-route',()=>{if(selected&&![...document.querySelectorAll('#routeDiagram [data-focus-stop]')].some(button=>button.dataset.focusStop===selected))selected=null;render();});
 document.addEventListener('achang:assignment-context',()=>render());window.addEventListener('resize',()=>{mount();render();});document.addEventListener('scroll',placePanel,true);document.addEventListener('click',event=>{const nav=event.target.closest('[data-page]');if(nav){if(nav.dataset.page!=='map')opened=false;render();}});
 window.addEventListener('beforeunload',event=>{if(draft.items().length){event.preventDefault();event.returnValue='';}});
 render();return {refresh:render,draft};
}
return {createDraft,create,eligible};
});
