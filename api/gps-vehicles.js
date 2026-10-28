'use strict';
const L=require('../lib/server');
const {normalizePayload}=require('../lib/gps-vehicles');
const OFFICIAL_URL='https://soa.tainan.gov.tw/Api/Service/Get/2c8a70d5-06f2-4353-9e92-c40d33bcd969';
const UPSTREAM_TIMEOUT_MS=20000;
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET']);
 await L.authorized(req,res,['admin','volunteer']);
 const startedAt=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),UPSTREAM_TIMEOUT_MS);
 let upstream,raw;
 try{
  upstream=await fetch(OFFICIAL_URL,{method:'GET',redirect:'error',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});
  if(!upstream.ok)L.problem(upstream.status>=500?503:502,'官方 GPS 服務回應異常');
  const contentType=String(upstream.headers.get('content-type')||'').toLowerCase();if(!contentType.includes('json'))L.problem(502,'官方 GPS 服務未回傳 JSON');
  raw=await upstream.text();
 }catch(error){
  if(error?.status)throw error;
  console.warn('GPS upstream fetch failed',{elapsed_ms:Date.now()-startedAt,error_name:String(error?.name||'Error').slice(0,80),timed_out:error?.name==='AbortError'});
  L.problem(503,error?.name==='AbortError'?'官方 GPS 服務逾時':'官方 GPS 服務目前無法連線');
 }
 finally{clearTimeout(timer)}
 if(raw.length>2_000_000)L.problem(502,'官方 GPS 資料量超出安全限制');
 let payload;try{payload=JSON.parse(raw)}catch{L.problem(502,'官方 GPS JSON 無法解析')}
 let vehicles;try{vehicles=normalizePayload(payload)}catch(error){L.problem(error?.status||502,error?.message||'官方 GPS 資料格式不符')}
 const fetchedAt=new Date().toISOString(),latestReportedAt=vehicles.reduce((latest,item)=>item.reported_at>latest?item.reported_at:latest,'')||null;
 console.info('GPS upstream fetch completed',{elapsed_ms:Date.now()-startedAt,upstream_status:upstream.status,normalized_count:vehicles.length});
 L.json(res,200,{source:'臺南市政府資料開放平台',source_url:OFFICIAL_URL,scope:'臺南市永康區（行政區代碼 67000310 完整區界）',live:true,fetched_at:fetchedAt,latest_reported_at:latestReportedAt,count:vehicles.length,vehicles});
});
