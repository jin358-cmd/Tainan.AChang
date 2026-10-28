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

module.exports={normalizePayload,parseReportedAt,inYongkangDistrict};
