(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.AChangRoutePrint=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const WIDTH=1200,HEIGHT=800,PIXEL_RATIO=2;
 function paperScale(height,width){const available=width*274/190;return height>0&&width>0?Math.min(1,available/height):1;}
 function borderlessA4Scale(height,width){return height>0&&width>0?Math.min(1,Math.max(0,width*297/210-2)/height):1;}
 const A4={width:210,height:297,inset:.95};
 function a4Metrics(){return {width:A4.width,height:A4.height,contentWidth:A4.width*A4.inset,contentHeight:A4.height*A4.inset,marginX:A4.width*(1-A4.inset)/2,marginY:A4.height*(1-A4.inset)/2};}
 function a4FitScale(height,width){const box=a4Metrics();return height>0&&width>0?Math.min(1,Math.max(0,width*box.contentHeight/box.contentWidth-2)/height):1;}
 function chooseA4Layout(candidates){return [...candidates].sort((a,b)=>a.pages.length-b.pages.length||a.columns-b.columns)[0];}
 function layoutA4(content,{host,document:doc,singlePage,connectDiagram=()=>{}}){
  const header=[...content.children].filter(node=>node.tagName==='H1'||node.classList.contains('route-print-window'));
  const makePage=()=>{const page=doc.createElement('section');page.className='route-print-page';const body=doc.createElement('div');body.className='route-print-page-body';const inner=doc.createElement('div');inner.className='route-print-content';body.append(inner);page.append(body);host.append(page);return {page,body,inner};};
  const finish=pages=>{pages.forEach((page,index)=>{const number=doc.createElement('span');number.className='route-print-page-number';number.textContent=`${index+1}／${pages.length}`;page.append(number);});return pages;};
  if(singlePage){const {page,body,inner}=makePage();inner.replaceWith(content.cloneNode(true));const copy=body.firstElementChild;copy.style.width='199.5mm';connectDiagram(copy.querySelector('.diagram'));const scale=a4FitScale(copy.scrollHeight,body.getBoundingClientRect().width);copy.style.transform=`scale(${scale})`;copy.style.transformOrigin='top left';copy.style.position='absolute';copy.style.left=`${body.getBoundingClientRect().width*(1-scale)/2}px`;copy.style.top='0';copy.style.setProperty('--day-fit-transform',`scale(${scale})`);copy.style.setProperty('--day-fit-left',copy.style.left);page.dataset.fitScale=String(scale);return {pages:finish([page]),columns:Math.min(6,content.querySelectorAll('.route-stop').length)};}
  const cards=[...content.querySelectorAll('.diagram .route-stop')],table=content.querySelector('table'),visual=content.querySelector('.route-print-visuals'),mapNodes=visual?[...visual.children].filter(node=>node.tagName!=='H2'&&!node.classList.contains('diagram')):[];
  const diagramHeading=visual?.querySelector('h2'),tableHeading=[...content.children].find(node=>node.tagName==='H2'),candidates=[];
  for(const columns of [3,4,5,6]){
   const pages=[];let current,diagram,diagramTitle,tableSection,tbody;
   const nextPage=()=>{current=makePage();pages.push(current.page);header.forEach(node=>current.inner.append(node.cloneNode(true)));diagram=null;tableSection=null;return current;};
   const fits=()=>current.inner.getBoundingClientRect().height<=current.body.clientHeight-2;
   const addDiagram=()=>{diagramTitle=diagramHeading.cloneNode(true);diagram=doc.createElement('div');diagram.className='diagram';diagram.style.setProperty('--print-columns',columns);current.inner.append(diagramTitle,diagram);};
   const addTable=()=>{tableSection=doc.createElement('div');tableSection.className='route-print-table-section';tableSection.append(tableHeading.cloneNode(true));const copy=table.cloneNode(false);if(table.tHead)copy.append(table.tHead.cloneNode(true));tbody=doc.createElement('tbody');copy.append(tbody);tableSection.append(copy);current.inner.append(tableSection);};
   nextPage();mapNodes.forEach(node=>{const copy=node.cloneNode(true);copy.classList.add('route-print-map');current.inner.append(copy);});
   for(let index=0;index<cards.length;index+=columns){if(!diagram)addDiagram();const row=cards.slice(index,index+columns).map(node=>node.cloneNode(true));diagram.append(...row);if(!fits()){row.forEach(node=>node.remove());if(!diagram.children.length){diagram.remove();diagramTitle.remove();}nextPage();addDiagram();diagram.append(...row);}if(!fits())throw Error('單張站點卡片內容超出 A4 範圍，請縮小列印時段後重試。');}
   for(const original of table?.tBodies[0]?.rows||[]){if(!tableSection)addTable();const row=original.cloneNode(true);tbody.append(row);if(!fits()){row.remove();if(!tbody.children.length)tableSection.remove();nextPage();addTable();tbody.append(row);}if(!fits())throw Error('單筆站點資料超出 A4 範圍，請檢查站點內容。');}
   candidates.push({pages,columns});pages.forEach(page=>page.remove());
  }
  const best=chooseA4Layout(candidates);best.pages.forEach(page=>host.append(page));best.pages.forEach(page=>page.querySelectorAll('.diagram').forEach(connectDiagram));finish(best.pages);return best;
 }
 function commonCrew(stations){
  if(!stations.length||!stations[0].length)return [];
  const first=[...new Map(stations[0].map(p=>[p.id,p])).values()],signature=first.map(p=>p.id).sort().join('|');
  return stations.every(people=>[...new Set(people.map(p=>p.id))].sort().join('|')===signature)?first:[];
 }
 async function printDocument(sheet,{window:host,document:source}){
  const target=host.open('','_blank','popup,width=1000,height=800');
  if(!target)throw Error('瀏覽器阻擋列印視窗，請允許此網站開啟彈出視窗後再試。');
  const doc=target.document;doc.title='路線列印';
  const base=doc.createElement('base');base.href=source.baseURI;doc.head.append(base);
  const meta=doc.createElement('meta');meta.name='viewport';meta.content='width=device-width,initial-scale=1';doc.head.append(meta);
  const styles=[...source.querySelectorAll('link[rel="stylesheet"]')].map(link=>new Promise(resolve=>{const copy=doc.createElement('link');copy.rel='stylesheet';copy.href=link.href;copy.onload=copy.onerror=resolve;doc.head.append(copy);}));
  const style=doc.createElement('style');style.textContent='html,body{height:auto!important;min-height:0!important;overflow:visible!important;background:white!important}body{margin:0;padding:18px}#routePrintSurface{display:block!important;position:static!important;inset:auto!important;width:190mm!important;max-width:100%;height:auto!important;max-height:none!important;overflow:visible!important;margin:0 auto;box-shadow:none}#routePrintSurface .route-print-content{position:static!important;inset:auto!important;transform:none!important;width:100%!important}#routePrintSurface table,#routePrintSurface th,#routePrintSurface td{font-size:18px!important;line-height:1.6}#routePrintSurface th,#routePrintSurface td{padding:10px 8px!important}.route-document-actions{display:flex;gap:12px;margin:0 auto 20px;max-width:190mm}.route-document-actions button{font:700 18px Arial;padding:10px 16px;border:1px solid #aac1cf;border-radius:8px;background:white;color:#244c64}@media print{@page{size:A4 portrait;margin:10mm}body{padding:0!important}.route-document-actions{display:none!important}#routePrintSurface{break-inside:auto!important;page-break-inside:auto!important}}';doc.head.append(style);
  const actions=doc.createElement('div');actions.className='route-document-actions';const print=doc.createElement('button');print.type='button';print.textContent='列印／另存 PDF';print.onclick=()=>{target.focus();target.print();};const close=doc.createElement('button');close.type='button';close.textContent='關閉';close.onclick=()=>target.close();actions.append(print,close);
  const paged=sheet.dataset?.printMode==='full'&&sheet.classList?.contains('route-print-a4');const copy=doc.importNode(sheet,true);copy.className='route-print-compact truck-directory-host'+(paged?' route-print-a4'+(sheet.classList.contains('route-print-night')?' route-print-night':' route-print-day-a4'):'');if(paged){const pageStyle=doc.createElement('style');pageStyle.textContent='@page achang-route-a4{size:A4 portrait;margin:0}#routePrintSurface.route-print-a4{page:achang-route-a4;position:static!important;width:210mm!important;max-width:none!important;height:auto!important;max-height:none!important;padding:0!important;margin:0!important;overflow:visible!important}#routePrintSurface.route-print-a4 .route-print-content{position:relative!important;inset:auto!important;width:199.5mm!important;transform:inherit}#routePrintSurface.route-print-a4.route-print-day-a4 .route-print-content{position:absolute!important;inset:0 auto auto!important;transform:var(--day-fit-transform)!important;left:var(--day-fit-left)!important}#routePrintSurface.route-print-a4.route-print-night th,#routePrintSurface.route-print-a4.route-print-night td{padding:6px 8px!important;line-height:1.4}';doc.head.append(pageStyle);}else{copy.style.height='auto';delete copy.dataset.printPages;}doc.body.replaceChildren(actions,copy);target.opener=null;
  await Promise.all(styles);await doc.fonts?.ready;await Promise.all([...doc.querySelectorAll('img')].map(img=>img.decode?.().catch(()=>{})));
  await new Promise(resolve=>target.requestAnimationFrame(()=>target.requestAnimationFrame(resolve)));
  target.focus();target.print();return target;
 }
 const mercator=([lon,lat])=>[lon*Math.PI/180,Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];
 function filterByIds(full,stopIds){
  const ids=new Set(stopIds),stops=full.stops.filter(stop=>ids.has(stop.id)),orders=new Set(stops.map(stop=>`${stop.route}|${stop.order}`));
  return {
   groups:new Map([...full.groups].map(([route,items])=>[route,items.filter(stop=>ids.has(stop.id))])),stops,
   pending:full.pending.filter(stop=>ids.has(stop.id)),
   points:{type:'FeatureCollection',features:full.points.features.filter(feature=>ids.has(feature.properties.id))},
   lines:{type:'FeatureCollection',features:full.lines.features.filter(feature=>orders.has(`${feature.properties.route}|${feature.properties.from}`)&&orders.has(`${feature.properties.route}|${feature.properties.to}`))},
   total:stops.length,located:stops.filter(stop=>stop.position).length
  };
 }
 function baseStyle(style){
  const result=JSON.parse(JSON.stringify(style));
  const overlay=id=>id==='villages'||String(id).startsWith('achang-day-routes');
  result.layers=result.layers.filter(layer=>!overlay(layer.source));
  for(const id of Object.keys(result.sources))if(overlay(id))delete result.sources[id];
  return result;
 }
 async function captureBaseMap(model,{map,lib,document}){
  if(!map||!lib?.Map)throw Error('地圖尚未載入，請待地圖顯示後再列印。');
  const positions=model.stops.filter(stop=>stop.position).map(stop=>stop.position);
  if(!positions.length)return null;
  const bounds=[[Math.min(...positions.map(p=>p[0])),Math.min(...positions.map(p=>p[1]))],[Math.max(...positions.map(p=>p[0])),Math.max(...positions.map(p=>p[1]))]];
  const holder=document.createElement('div');holder.className='route-print-map-renderer';holder.setAttribute('aria-hidden','true');document.body.append(holder);
  let exportMap,timer;
  try{
   exportMap=new lib.Map({container:holder,style:baseStyle(map.getStyle()),bounds,fitBoundsOptions:{padding:65,maxZoom:16.5},bearing:0,pitch:0,interactive:false,attributionControl:false,pixelRatio:PIXEL_RATIO,canvasContextAttributes:{preserveDrawingBuffer:true,antialias:true}});
   await new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('列印底圖載入逾時，請稍後重試。')),20000);
    exportMap.once('idle',()=>{clearTimeout(timer);resolve();});
    exportMap.on('error',event=>{if(/webgl|context lost|securityerror/i.test(event.error?.message||'')){clearTimeout(timer);reject(event.error);}});
   });
   const canvas=exportMap.getCanvas(),extent=exportMap.getBounds(),sw=extent.getSouthWest(),ne=extent.getNorthEast();
   if(canvas.width<WIDTH*PIXEL_RATIO||canvas.height<HEIGHT*PIXEL_RATIO)throw Error('無法建立高解析度列印底圖，請稍後重試。');
   return {dataUrl:canvas.toDataURL('image/png'),extent:[sw.lng,sw.lat,ne.lng,ne.lat],pixelWidth:canvas.width,pixelHeight:canvas.height};
  }finally{clearTimeout(timer);exportMap?.remove();holder.remove();}
 }
 async function buildSvg(model,options){
  const {document}=options,base=await captureBaseMap(model,options);
  if(!base)return null;
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox',`0 0 ${WIDTH} ${HEIGHT}`);svg.setAttribute('width',WIDTH);svg.setAttribute('height',HEIGHT);svg.setAttribute('role','img');svg.setAttribute('aria-label','選定時段路線地圖');svg.setAttribute('data-station-count',model.total);
  const make=(tag,attrs,parent=svg)=>{const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));parent.append(node);return node;};
  const [west,south,east,north]=base.extent,sw=mercator([west,south]),ne=mercator([east,north]);
  const project=coord=>{const p=mercator(coord);return [(p[0]-sw[0])/(ne[0]-sw[0])*WIDTH,(ne[1]-p[1])/(ne[1]-sw[1])*HEIGHT];};
  make('image',{href:base.dataUrl,x:0,y:0,width:WIDTH,height:HEIGHT,'data-pixel-width':base.pixelWidth,'data-pixel-height':base.pixelHeight});
  const defs=make('defs',{}),colors=[...new Set(model.stops.map(stop=>stop.color))];
  colors.forEach((color,index)=>{const marker=make('marker',{id:`print-route-arrow-${index}`,viewBox:'0 0 10 10',refX:5,refY:5,markerWidth:4,markerHeight:4,orient:'auto'},defs);make('path',{d:'M0 0 L10 5 L0 10 z',fill:color},marker);});
  for(const feature of model.lines.features){
   const [p,q]=feature.geometry.coordinates.map(project),mid=[(p[0]+q[0])/2,(p[1]+q[1])/2];
   make('path',{d:`M${p}L${mid}L${q}`,fill:'none',stroke:feature.properties.color,'stroke-width':5,'stroke-linecap':'round','marker-mid':`url(#print-route-arrow-${colors.indexOf(feature.properties.color)})`,'data-route-from':feature.properties.from,'data-route-to':feature.properties.to});
  }
  for(const stop of model.stops){
   if(!stop.position)continue;const [x,y]=project(stop.position);
   make('circle',{cx:x,cy:y,r:10,fill:stop.color,stroke:'#fff','stroke-width':3,'data-route-stop':stop.id});
   make('text',{x:x+16,y:y-16,'font-size':48,'font-family':'Arial, sans-serif','font-weight':800,fill:'#17384f',stroke:'#fff','stroke-width':7,'paint-order':'stroke','data-stop-number':stop.order}).textContent=String(stop.order);
  }
  make('text',{x:12,y:HEIGHT-12,'font-size':14,fill:'#17384f',stroke:'#fff','stroke-width':3,'paint-order':'stroke'}).textContent='© OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors · 依站序連線';
  return svg;
 }
 return {filterByIds,baseStyle,buildSvg,commonCrew,paperScale,borderlessA4Scale,a4Metrics,a4FitScale,chooseA4Layout,layoutA4,printDocument};
});
