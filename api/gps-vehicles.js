'use strict';
const L=require('../lib/server');
const fallback=require('../data-gps-snapshot-20261028.json');
const OFFICIAL='https://soa.tainan.gov.tw/Api/Service/Get/2c8a70d5-06f2-4353-9e92-c40d33bcd969';
const CACHE_MS=30000;
let cache=null,cacheAt=0;
function normalize(payload){
 const rows=Array.isArray(payload)?payload:Array.isArray(payload?.data)?payload.data:Array.isArray(payload?.result)?payload.result:null;
 if(!rows||payload?.success===false)throw new Error('Unexpected official GPS payload');
 return rows.filter(v=>v&&v.linid&&v.car).map(v=>({
 id:String(v.linid),plate:String(v.car),reported_at:String(v.time||''),
 location:String(v.location||''),longitude:Number(v.x),latitude:Number(v.y)
 })).filter(v=>Number.isFinite(v.longitude)&&Number.isFinite(v.latitude)&&v.longitude>119&&v.longitude<123&&v.latitude>21&&v.latitude<26);
}
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET']);
 await L.authorized(req,res,['admin','volunteer']);
 if(cache&&Date.now()-cacheAt<CACHE_MS)return L.json(res,200,cache);
 let answer;
 try{
  const controller=new AbortController();
  const t=setTimeout(()=>controller.abort(),6500);
  let response;
  try{response=await fetch(OFFICIAL,{signal:controller.signal,headers:{Accept:'application/json'},cache:'no-store'})}finally{clearTimeout(t)}
  if(!response.ok)throw new Error('Official feed HTTP '+response.status);
  const vehicles=normalize(await response.json()).filter(v=>v.location.includes('永康區')||v.location.includes('永康清潔隊'));
  if(!vehicles.length)throw new Error('Official feed empty');
  answer={source:'tainan_city_open_data',live:true,scope:'臺南市永康區',upstream:OFFICIAL,fetched_at:new Date().toISOString(),count:vehicles.length,vehicles};
 }catch(e){
  const vehicles=normalize(fallback.vehicles.map(v=>({linid:v.linid,car:v.car,time:v.time,location:v.location,x:v.x,y:v.y}))).filter(v=>v.location.includes('永康區')||v.location==='永康區清潔隊');
  answer={source:'owner_snapshot',live:false,warning:'官方 GPS 來源無法驗證，目前僅顯示歷史快照',captured_at:fallback.captured_at,count:vehicles.length,vehicles};
 }
 cache=answer;cacheAt=Date.now();
 return L.json(res,200,answer);
});
