'use strict';
// Read-only GPS adapter. Configure TAINAN_GPS_FEED_URL only after official JSON endpoint verified.
const ALLOWED_HOSTS = new Set(['soa.tainan.gov.tw']);
module.exports = async (req, res) => {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='GET'){res.statusCode=405;return res.end(JSON.stringify({status:'error',reason:'method_not_allowed'}));}
  const url='https://soa.tainan.gov.tw/Api/Service/Get/2c8a70d5-06f2-4353-9e92-c40d33bcd969';
  
  let target;
  try {target=new URL(url); if(target.protocol!=='https:'||!ALLOWED_HOSTS.has(target.hostname)||target.username||target.password)throw Error('invalid upstream');}
  catch {res.statusCode=503;return res.end(JSON.stringify({status:'unavailable',reason:'upstream_configuration_invalid',vehicles:[]}));}
  try{
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),7000);
    let response;
    try{response=await fetch(target,{headers:{accept:'application/json'},signal:controller.signal,redirect:'error'});}
    finally{clearTimeout(timeout);}
    if(!response.ok)throw Error('upstream_http_'+response.status);
    const raw=await response.json();
    const records=Array.isArray(raw)?raw:(Array.isArray(raw.data)?raw.data:(Array.isArray(raw.result)?raw.result:(Array.isArray(raw.result?.records)?raw.result.records:(Array.isArray(raw.data?.records)?raw.data.records:null))));
    if(!records)throw Error('upstream_not_json_array');
    const now=Date.now();
    const vehicles=records.map(r=>{
      const lng=Number(r.x),lat=Number(r.y);
      const timeText=String(r.time||'').trim(); const iso=/[zZ]$|[+-]\\d{2}:?\\d{2}$/.test(timeText)?timeText:timeText.replace(' ','T')+'+08:00';const ts=Date.parse(iso);
      if(!Number.isFinite(lng)||!Number.isFinite(lat)||lng<119||lng>122||lat<21||lat>25||!Number.isFinite(ts))return null;
      const ageSeconds=Math.round((now-ts)/1000);
      return {linid:String(r.linid||''),car:String(r.car||''),time:String(r.time||''),location:String(r.location||''),longitude:lng,latitude:lat,ageSeconds,live:ageSeconds>=0&&ageSeconds<=180};
    }).filter(Boolean).filter(v=>/永康|鹽行|鹽洲|大灣|復國|復華/.test(v.location));
    res.statusCode=200;return res.end(JSON.stringify({status:'ok',retrievedAt:new Date(now).toISOString(),vehicles,liveCount:vehicles.filter(v=>v.live).length,warning:'linid_not_verified_as_routeid'}));
  }catch(e){res.statusCode=502;return res.end(JSON.stringify({status:'unavailable',reason:String(e.message).slice(0,90),vehicles:[]}));}
};