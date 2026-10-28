'use strict';
const L=require('../lib/server');
const {normalizePayload}=require('../lib/gps-vehicles');
const OFFICIAL_URL='https://soa.tainan.gov.tw/Api/Service/Get/2c8a70d5-06f2-4353-9e92-c40d33bcd969';
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET']);
 await L.authorized(req,res,['admin','volunteer']);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 let upstream;
 try{upstream=await fetch(OFFICIAL_URL,{method:'GET',redirect:'error',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal})}
 catch(error){L.problem(503,error?.name==='AbortError'?'官方 GPS 服務逾時':'官方 GPS 服務目前無法連線')}
 finally{clearTimeout(timer)}
 if(!upstream.ok)L.problem(upstream.status>=500?503:502,'官方 GPS 服務回應異常');
 const contentType=String(upstream.headers.get('content-type')||'').toLowerCase();if(!contentType.includes('json'))L.problem(502,'官方 GPS 服務未回傳 JSON');
 const raw=await upstream.text();if(raw.length>2_000_000)L.problem(502,'官方 GPS 資料量超出安全限制');
 let payload;try{payload=JSON.parse(raw)}catch{L.problem(502,'官方 GPS JSON 無法解析')}
 let vehicles;try{vehicles=normalizePayload(payload)}catch(error){L.problem(error?.status||502,error?.message||'官方 GPS 資料格式不符')}
 const fetchedAt=new Date().toISOString(),latestReportedAt=vehicles.reduce((latest,item)=>item.reported_at>latest?item.reported_at:latest,'')||null;
 L.json(res,200,{source:'臺南市政府資料開放平台',source_url:OFFICIAL_URL,scope:'臺南市永康區（官方區名或既有十里服務範圍）',live:true,fetched_at:fetchedAt,latest_reported_at:latestReportedAt,count:vehicles.length,vehicles});
});
