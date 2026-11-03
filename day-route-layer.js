(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.AChangDayRouteLayer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const COLORS=['#1678bd','#d67612','#258848','#b83e68','#7953b4','#827115'];
 const SOURCE='achang-day-routes';
 const LAYERS=['day-route-lines','day-route-arrows','day-route-points','day-route-numbers'];
 const norm=value=>String(value??'').replace(/[\s()（）]/g,'').replace(/臺/g,'台');
 const empty=()=>({type:'FeatureCollection',features:[]});
 function build(rows,catalog,route='all'){
  const positions=new Map((catalog?.stops||[]).map(stop=>[stop.source_id,stop]));
  const groups=new Map(),pending=[],stops=[],points=empty(),lines=empty();
  for(const row of rows||[]){
   const token=String(row['車次']||'');
   if(row['時段']!=='日間'||!/^日間[1-6]$/.test(token)||row['來源刪除線']===true||route!=='all'&&route!==token)continue;
   if(!groups.has(token))groups.set(token,[]);
   const group=groups.get(token),location=positions.get(row['站點ID']);
   const matched=location&&norm(location.source_name)===norm(row['停靠點原文']);
   const valid=matched&&location.status==='official_stop'&&Number.isFinite(location.longitude)&&Number.isFinite(location.latitude)&&location.longitude>120&&location.longitude<121&&location.latitude>22&&location.latitude<24;
   const stop={id:row['站點ID'],route:token,plate:row['車牌']||'',order:group.length+1,name:row['停靠點原文']||'',time:row['到達']||'',end:row['離開']||'',village:row['里別']||'',color:COLORS[Number(token.slice(-1))-1],position:valid?[location.longitude,location.latitude]:null,notes:matched?(location.notes||[]):['尚無可核對的官方清運點座標'],status:valid?'官方清運點（門牌精準度待驗證）':matched&&location.address_confirmed?'地址已確認；座標待定位':'待確認'};
   group.push(stop);stops.push(stop);
   if(!valid){pending.push(stop);continue;}
   points.features.push({type:'Feature',geometry:{type:'Point',coordinates:stop.position},properties:{id:stop.id,route:stop.route,order:stop.order,color:stop.color}});
  }
  for(const group of groups.values())for(let i=1;i<group.length;i++){
   const before=group[i-1],after=group[i];
   // Missing or conflicting positions are a real gap; never connect across them.
   if(before.position&&after.position)lines.features.push({type:'Feature',geometry:{type:'LineString',coordinates:[before.position,after.position]},properties:{route:after.route,color:after.color,from:before.order,to:after.order}});
  }
  return {groups,stops,pending,points,lines,total:stops.length,located:points.features.length};
 }
 function bounds(model){
  const coords=model.points.features.map(f=>f.geometry.coordinates);
  if(!coords.length)return null;
  return [[Math.min(...coords.map(c=>c[0])),Math.min(...coords.map(c=>c[1]))],[Math.max(...coords.map(c=>c[0])),Math.max(...coords.map(c=>c[1]))]];
 }
 function filterModelWindow(full,start='',end=''){
  if(!start&&!end)return full;
  const within=stop=>/^([01]\d|2[0-3]):[0-5]\d$/.test(stop.time)&&(start&&end&&start>end?stop.time>=start||stop.time<=end:(!start||stop.time>=start)&&(!end||stop.time<=end));
  const stops=full.stops.filter(within),ids=new Set(stops.map(s=>s.id)),orders=new Set(stops.map(s=>`${s.route}|${s.order}`));
  const groups=new Map([...full.groups].map(([route,items])=>[route,items.filter(s=>ids.has(s.id))]));
  const points={type:'FeatureCollection',features:full.points.features.filter(f=>ids.has(f.properties.id))},lines={type:'FeatureCollection',features:full.lines.features.filter(f=>orders.has(`${f.properties.route}|${f.properties.from}`)&&orders.has(`${f.properties.route}|${f.properties.to}`))};
  return {groups,stops,pending:full.pending.filter(s=>ids.has(s.id)),points,lines,total:stops.length,located:points.features.length};
 }
 function nextStopIds(model,rows,progress,now=new Date()){
  const ids=new Set();if(!progress)return ids;
  const originals=new Map(rows.map(r=>[r['站點ID'],r]));
  for(const stops of model.groups.values()){
   const source=stops.map(s=>({...originals.get(s.id),'到達時間':s.time,_extras:{'刪除線':false}}));
   const eligible=source.map((r,i)=>progress.runsToday(r,now)?i:-1).filter(i=>i>=0),result=progress.routeProgress(eligible.map(i=>source[i]),now);
   if(result.nextIndex>=0)ids.add(stops[eligible[result.nextIndex]].id);
  }return ids;
 }
 function create({getRows,onChange,onSelect}){
  const toggle=document.getElementById('layerRoutes'),select=document.getElementById('mapRouteLayerSelect'),status=document.getElementById('mapRouteLayerStatus'),legend=document.getElementById('mapRouteLayerLegend'),pending=document.getElementById('mapRoutePending'),pendingList=document.getElementById('mapRoutePendingList'),mapBox=document.getElementById('mapBox');
  if(!toggle||!select||!status||!mapBox)return null;
  let catalog=null,map=null,attachedMap=null,model=build([],null),fitRequested=true,failed=false,detail=null,focusId=null,rangeStart='',rangeEnd='',fullModel=model;
  const byId=id=>model.stops.find(stop=>stop.id===id);
  const closeDetail=()=>{detail?.remove();detail=null;};
  function showStop(id){
   const stop=byId(id);if(!stop)return;
   onSelect?.();closeDetail();
   detail=document.createElement('aside');detail.className='day-route-point-detail';detail.setAttribute('aria-label','路線站點資訊');
   const close=document.createElement('button');close.type='button';close.className='day-route-detail-close';close.setAttribute('aria-label','關閉站點資訊');close.textContent='✕';close.onclick=closeDetail;
   const title=document.createElement('strong');title.textContent=`${stop.route} · 第${stop.order}站 · ${stop.plate}`;
   const name=document.createElement('p');name.textContent=stop.name;
   const time=document.createElement('p');time.textContent=[stop.time+(/^\d\d:\d\d$/.test(stop.end)?'～'+stop.end:''),stop.village].filter(Boolean).join(' · ');
   const note=document.createElement('small');note.textContent=[stop.status,...stop.notes].join('；');
   detail.append(close,title,name,time,note);mapBox.append(detail);
  }
  function renderControls(){
   select.disabled=!toggle.checked;
   legend.hidden=!toggle.checked;
   if(!toggle.checked){status.textContent='車次路線已關閉';pending.hidden=true;return;}
   if(!catalog){status.textContent=failed?'路線座標載入失敗，重新整理後可再試':'正在載入路線座標…';pending.hidden=true;return;}
   const count=String(model.total).replace(/\d/g,digit=>String.fromCharCode(digit.charCodeAt(0)+0xfee0));
   status.textContent=`${select.value==='all'?'全部6車次':select.value}．共${count}站點`;
   pending.hidden=true;
   const summary=pending.querySelector('summary');summary.textContent=`待定位 ${model.pending.length} 站`;
   pendingList.replaceChildren();
   for(const stop of model.pending){const li=document.createElement('li');li.textContent=`${stop.route} 第${stop.order}站 ${stop.time} ${stop.name}：${stop.notes.join('；')}`;pendingList.append(li);}
  }
  function attachEvents(instance){
   if(instance===attachedMap)return;attachedMap=instance;
   instance.on('click','day-route-points',event=>showStop(event.features?.[0]?.properties?.id));
   instance.on('mouseenter','day-route-points',()=>{instance.getCanvas().style.cursor='pointer';});
   instance.on('mouseleave','day-route-points',()=>{instance.getCanvas().style.cursor='';});
  }
  function nextIds(){return nextStopIds(fullModel,getRows(),globalThis.AChangDispatchView);}
  function nextFeatures(){const ids=nextIds();return {type:'FeatureCollection',features:model.points.features.filter(f=>ids.has(f.properties.id))};}
  function refreshGlow(){
   if(map?.getSource(SOURCE+'-next'))map.getSource(SOURCE+'-next').setData(toggle.checked?nextFeatures():empty());
   const fallback=document.getElementById('mapFallback');if(fallback&&!fallback.hidden)renderFallback(fallback);
  }
  function focusStop({id,route}){
   if(!catalog)return;
   if(!/^日間[1-6]$/.test(route||'')){closeDetail();detail=document.createElement('aside');detail.className='day-route-point-detail';detail.textContent='此車次尚無已核對的站點座標，暫無法定位。';mapBox.append(detail);return;}
   toggle.checked=true;select.value=route;focusId=id;fitRequested=false;sync(map);
   const stop=byId(id);if(!stop)return;
   showStop(id);
   if(!stop.position)return;
   if(map){map.flyTo({center:stop.position,zoom:Math.max(map.getZoom?.()||13,16),duration:650});}
   else{const fallback=document.getElementById('mapFallback');if(fallback)renderFallback(fallback);}
  }
  document.addEventListener('achang:route-time-filter',event=>{
   const next=event.detail||{};if(rangeStart===(next.start||'')&&rangeEnd===(next.end||''))return;
   rangeStart=next.start||'';rangeEnd=next.end||'';focusId=null;fitRequested=true;closeDetail();sync(map);onChange?.();
  });
  document.addEventListener('achang:focus-route-stop',event=>focusStop(event.detail||{}));
  function renderMap(){
   if(!map||!catalog)return;
   if(!map.getSource(SOURCE)){
    map.addSource(SOURCE,{type:'geojson',data:model.lines});
    map.addSource(SOURCE+'-points',{type:'geojson',data:model.points});
    map.addLayer({id:LAYERS[0],type:'line',source:SOURCE,paint:{'line-color':['get','color'],'line-width':6,'line-opacity':.9}});
    map.addLayer({id:LAYERS[1],type:'symbol',source:SOURCE,layout:{'symbol-placement':'line','symbol-spacing':90,'text-field':'›','text-font':['Noto Sans Regular'],'text-size':23,'text-keep-upright':false,'text-rotation-alignment':'map','text-allow-overlap':false},paint:{'text-color':['get','color'],'text-halo-color':'#ffffff','text-halo-width':1}});
    map.addLayer({id:LAYERS[2],type:'circle',source:SOURCE+'-points',paint:{'circle-radius':6,'circle-color':['get','color'],'circle-stroke-color':'#ffffff','circle-stroke-width':2}});
    map.addLayer({id:LAYERS[3],type:'symbol',source:SOURCE+'-points',layout:{'text-field':['to-string',['get','order']],'text-font':['Noto Sans Regular'],'text-size':12,'text-offset':[0,-1.1],'text-allow-overlap':false},paint:{'text-color':'#18384f','text-halo-color':'#ffffff','text-halo-width':2}});
   }else{
    map.getSource(SOURCE).setData(model.lines);map.getSource(SOURCE+'-points').setData(model.points);
   }
   if(!map.getSource(SOURCE+'-next')){
    map.addSource(SOURCE+'-next',{type:'geojson',data:nextFeatures()});
    map.addLayer({id:'day-route-next-glow',type:'circle',source:SOURCE+'-next',paint:{'circle-radius':16,'circle-color':'#4dff98','circle-opacity':.45,'circle-blur':.35}});
    map.addLayer({id:'day-route-next-core',type:'circle',source:SOURCE+'-next',paint:{'circle-radius':7,'circle-color':'#34f58b','circle-stroke-color':'#ffffff','circle-stroke-width':2}});
   }else map.getSource(SOURCE+'-next').setData(nextFeatures());
   for(const id of ['day-route-next-glow','day-route-next-core'])map.setLayoutProperty(id,'visibility',toggle.checked?'visible':'none');
   attachEvents(map);
   for(const id of LAYERS)if(map.getLayer(id))map.setLayoutProperty(id,'visibility',toggle.checked?'visible':'none');
   if(toggle.checked&&fitRequested){
    const extent=bounds(model);
    if(extent){map.setMaxBounds?.([[120.195,22.968],[120.300,23.075]]);map.fitBounds(extent,{padding:45,duration:350,maxZoom:15.5});fitRequested=false;}
   }
  }
  function sync(instance){
   map=instance||null;fullModel=build(getRows(),catalog,select.value);model=filterModelWindow(fullModel,rangeStart,rangeEnd);renderControls();renderMap();
  }
  function renderFallback(container){
   if(!toggle.checked||!catalog||!model.located)return;
   const prior=container.querySelector('svg');if(!prior)return;
   const width=container.clientWidth||780,height=container.clientHeight||640;
   const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('class','offline-map-svg day-route-offline-map');svg.setAttribute('role','img');svg.setAttribute('aria-label','永康日間路線官方站點地圖');
   const make=(tag,attrs,parent=svg)=>{const el=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));parent.append(el);return el;};
   const mercator=([lon,lat])=>[lon*Math.PI/180,Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];
   const extent=bounds(model),a=mercator(extent[0]),b=mercator(extent[1]),scale=Math.min((width-50)/Math.max(b[0]-a[0],.0001),(height-70)/Math.max(b[1]-a[1],.0001)),cx=(a[0]+b[0])/2,cy=(a[1]+b[1])/2;
   const project=c=>{const p=mercator(c);return [width/2+(p[0]-cx)*scale,height/2-(p[1]-cy)*scale];};
   const [west,south,east,north]=catalog.basemap.extent,sw=project([west,south]),ne=project([east,north]);
   make('image',{href:catalog.basemap.path,x:sw[0],y:ne[1],width:ne[0]-sw[0],height:sw[1]-ne[1]});
   const defs=make('defs',{});
   COLORS.forEach((color,index)=>{const marker=make('marker',{id:`day-route-arrow-${index}`,viewBox:'0 0 10 10',refX:5,refY:5,markerWidth:4,markerHeight:4,orient:'auto-start-reverse'},defs);make('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:color},marker);});
   for(const feature of model.lines.features){
    const [p,q]=feature.geometry.coordinates.map(project),mid=[(p[0]+q[0])/2,(p[1]+q[1])/2],index=Number(feature.properties.route.slice(-1))-1;
    make('path',{d:`M${p}L${mid}L${q}`,fill:'none',stroke:feature.properties.color,'stroke-width':6,'stroke-linecap':'round','stroke-linejoin':'round','marker-mid':`url(#day-route-arrow-${index})`});
   }
   const upcoming=nextIds();
   for(const stop of model.stops){
    if(!stop.position)continue;const p=project(stop.position);
    if(upcoming.has(stop.id)){const halo=make('circle',{cx:p[0],cy:p[1],r:15,fill:'#41ff91',opacity:.5,'pointer-events':'none','data-next-stop':stop.id});make('animate',{attributeName:'r',values:'10;22;10',dur:'1.6s',repeatCount:'indefinite'},halo);make('animate',{attributeName:'opacity',values:'.7;.18;.7',dur:'1.6s',repeatCount:'indefinite'},halo);}
    const circle=make('circle',{cx:p[0],cy:p[1],r:select.value==='all'?5:7,fill:upcoming.has(stop.id)?'#29e782':stop.color,stroke:'#fff','stroke-width':2,'data-route-stop':stop.id,tabindex:0,role:'button','aria-label':`${stop.route}第${stop.order}站 ${stop.time} ${stop.name}`});
    circle.onclick=event=>{event.stopPropagation();showStop(stop.id);};circle.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();showStop(stop.id);}};
    if(select.value!=='all'&&(stop.order===1||stop.order%Math.max(1,Math.ceil(model.located/(width<500?15:24)))===0))make('text',{x:p[0]+9,y:p[1]-8,'font-size':13,fill:'#18384f',stroke:'#fff','stroke-width':3,'paint-order':'stroke','pointer-events':'none'}).textContent=String(stop.order);
   }
   make('text',{x:10,y:height-12,'font-size':11,fill:'#18384f',stroke:'#fff','stroke-width':3,'paint-order':'stroke'}).textContent='© Esri · 官方清運點 · 依站序連線';
   const focused=byId(focusId);if(focused?.position){const p=project(focused.position),w=width*.48,h=height*.48;svg.setAttribute('viewBox',`${p[0]-w/2} ${p[1]-h/2} ${w} ${h}`);make('circle',{cx:p[0],cy:p[1],r:12,fill:'none',stroke:'#ff7c25','stroke-width':3,'pointer-events':'none'});}
   prior.replaceWith(svg);
  }
  function changed(){focusId=null;fitRequested=true;closeDetail();onChange?.();}
  toggle.addEventListener('change',changed);select.addEventListener('change',changed);
  legend.replaceChildren();
  COLORS.forEach((color,index)=>{const key=document.createElement('button'),swatch=document.createElement('i');key.type='button';key.className='route-color-choice';key.setAttribute('aria-label',`切換日間${index+1}`);key.onclick=()=>{toggle.checked=true;select.value=`日間${index+1}`;select.dispatchEvent(new Event('change',{bubbles:true}));};swatch.style.backgroundColor=color;key.append(swatch,document.createTextNode(`日間${index+1}`));legend.append(key);});
  const note=document.createElement('span');note.className='route-sequence-note';note.textContent='→ 依站序連線';legend.append(note);
  fetch('./data-day-route-locations-20261103.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error('route locations unavailable');return response.json();}).then(value=>{
   if(value.version!==1||value.stops?.filter(stop=>String(stop.source_id||'').startsWith('PDF:DAY:')).length!==160)throw Error('invalid route location catalog');catalog=value;onChange?.();
  }).catch(error=>{failed=true;renderControls();console.warn('日間路線座標未能載入',error.message);});
  window.AChangRouteMapPrint=async(route,selection={})=>{
   if(!catalog||!/^日間[1-6]$/.test(route))return null;
   const renderer=window.AChangRoutePrint;
   if(!renderer)throw Error('列印功能尚未載入，請重新整理後再試。');
   let snapshot=filterModelWindow(build(getRows(),catalog,route),selection.start??rangeStart,selection.end??rangeEnd);
   if(Array.isArray(selection.stopIds))snapshot=renderer.filterByIds(snapshot,selection.stopIds);
   return renderer.buildSvg(snapshot,{map,lib:window.maplibregl,document});
  };
  setInterval(()=>{if(!document.hidden)refreshGlow();},30000);
  setInterval(()=>{if(document.hidden||!toggle.checked||!map?.getLayer('day-route-next-glow'))return;const phase=(Date.now()%1600)/1600;map.setPaintProperty('day-route-next-glow','circle-radius',11+11*Math.sin(phase*Math.PI)**2);map.setPaintProperty('day-route-next-glow','circle-opacity',.25+.35*Math.cos(phase*Math.PI)**2);},100);
  return {sync,renderFallback,closeDetail,focusStop};
 }
 return {build,bounds,create,nextStopIds,filterModelWindow};
});


