(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.AChangRoutePrint=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const WIDTH=1200,HEIGHT=800,PIXEL_RATIO=2;
 function commonCrew(stations){
  if(!stations.length||!stations[0].length)return [];
  const first=[...new Map(stations[0].map(p=>[p.id,p])).values()],signature=first.map(p=>p.id).sort().join('|');
  return stations.every(people=>[...new Set(people.map(p=>p.id))].sort().join('|')===signature)?first:[];
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
   make('text',{x:x+16,y:y-16,'font-size':36,'font-family':'Arial, sans-serif','font-weight':800,fill:'#17384f',stroke:'#fff','stroke-width':7,'paint-order':'stroke','data-stop-number':stop.order}).textContent=String(stop.order);
  }
  make('text',{x:12,y:HEIGHT-12,'font-size':14,fill:'#17384f',stroke:'#fff','stroke-width':3,'paint-order':'stroke'}).textContent='© OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors · 依站序連線';
  return svg;
 }
 return {filterByIds,baseStyle,buildSvg,commonCrew};
});
