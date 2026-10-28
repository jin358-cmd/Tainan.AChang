'use strict';

const districtBoundary=require('../data-yongkang-district-boundary.json');
const TAIWAN_BOUNDS={minLon:119.9,maxLon:122.1,minLat:21.8,maxLat:25.4};

function pointInRing(lon,lat,ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const xi=Number(ring[i][0]),yi=Number(ring[i][1]),xj=Number(ring[j][0]),yj=Number(ring[j][1]);
  if((yi>lat)!==(yj>lat)&&lon<(xj-xi)*(lat-yi)/(yj-yi)+xi)inside=!inside;
 }
 return inside;
}

function inYongkangDistrict(lon,lat){
 const polygons=districtBoundary.geometry.type==='MultiPolygon'?districtBoundary.geometry.coordinates:[districtBoundary.geometry.coordinates];
 return polygons.some(polygon=>pointInRing(lon,lat,polygon[0])&&!polygon.slice(1).some(hole=>pointInRing(lon,lat,hole)));
}

function parseReportedAt(value){
 const raw=String(value||'').trim();if(!raw)return null;
 const candidate=/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(raw)?raw.replace(' ','T')+'+08:00':raw;
 const date=new Date(candidate);return Number.isNaN(date.getTime())?null:date.toISOString();
}

function rowsFromPayload(payload){
 if(Array.isArray(payload))return payload;
 for(const key of ['data','Data','records','Records','result','Result'])if(Array.isArray(payload?.[key]))return payload[key];
 throw Object.assign(new Error('官方 GPS JSON 結構不符'),{status:502});
}

function findGpsRows(value,depth=0){
 if(depth>6)return null;
 if(Array.isArray(value)){
  if(value.some(row=>row&&typeof row==='object'&&('car' in row||'CAR' in row)&&('time' in row||'TIME' in row)&&('x' in row||'X' in row)&&('y' in row||'Y' in row)))return value;
  for(const item of value){const found=findGpsRows(item,depth+1);if(found)return found}
  return null;
 }
 if(value&&typeof value==='object')for(const item of Object.values(value)){const found=findGpsRows(item,depth+1);if(found)return found}
 if(typeof value==='string'&&value.length<2_000_000&&/["'](?:car|CAR)["']/.test(value))try{return findGpsRows(JSON.parse(value),depth+1)}catch{}
 return null;
}

function decodeHtmlEntities(value){return String(value).replace(/&quot;/gi,'"').replace(/&#34;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')}

function balancedJson(text,start){
 const open=text[start],close=open==='['?']':'}';let depth=0,inString=false,escaped=false;
 for(let i=start;i<text.length;i++){
  const char=text[i];
  if(inString){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')inString=false;continue}
  if(char==='"'){inString=true;continue}
  if(char===open)depth++;else if(char===close&&--depth===0)return text.slice(start,i+1);
 }
 return '';
}

function extractOfficialResourcePayload(html){
 const source=decodeHtmlEntities(html);if(source.length>5_000_000)throw Object.assign(new Error('官方 GPS Resource 頁面資料量超出安全限制'),{status:502});
 const starts=[];for(let i=0;i<source.length&&starts.length<2000;i++)if(source[i]==='['||source[i]==='{')starts.push(i);
 for(const start of starts){
  const candidate=balancedJson(source,start);if(!candidate||!/["'](?:car|CAR)["']/.test(candidate))continue;
  try{const rows=findGpsRows(JSON.parse(candidate));if(rows)return rows}catch{}
 }
 throw Object.assign(new Error('官方 GPS Resource 頁面未包含可驗證的車輛 JSON'),{status:502});
}

function normalizePayload(payload){
 const latest=new Map();
 for(const row of rowsFromPayload(payload)){
  const plate=String(row?.car??row?.CAR??'').trim().toUpperCase(),linid=String(row?.linid??row?.LINID??'').trim(),location=String(row?.location??row?.LOCATION??'').trim();
  const longitude=Number(row?.x??row?.X),latitude=Number(row?.y??row?.Y),reported_at=parseReportedAt(row?.time??row?.TIME);
  if(!plate||!linid||!reported_at||!Number.isFinite(longitude)||!Number.isFinite(latitude))continue;
  if(longitude<TAIWAN_BOUNDS.minLon||longitude>TAIWAN_BOUNDS.maxLon||latitude<TAIWAN_BOUNDS.minLat||latitude>TAIWAN_BOUNDS.maxLat)continue;
  // Filter by the published full Yongkang District boundary (town code
  // 67000310), not the app's simplified ten service-village illustration.
  if(!/永康/.test(location)&&!inYongkangDistrict(longitude,latitude))continue;
  const item={id:plate,plate,linid,reported_at,location,longitude,latitude};
  const previous=latest.get(plate);if(!previous||item.reported_at>previous.reported_at)latest.set(plate,item);
 }
 return [...latest.values()].sort((a,b)=>a.plate.localeCompare(b.plate,'zh-Hant'));
}

module.exports={normalizePayload,parseReportedAt,inYongkangDistrict,extractOfficialResourcePayload};
