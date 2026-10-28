'use strict';
const L=require('../lib/server');
const {normalizePayload,extractOfficialResourcePayload}=require('../lib/gps-vehicles');
const OFFICIAL_SOURCES=[
 {url:'https://soa.tainan.gov.tw/Api/Service/Get/2c8a70d5-06f2-4353-9e92-c40d33bcd969',mode:'official_json_api',accept:'application/json'},
 {url:'https://data.tainan.gov.tw/Resource/2c8a70d5-06f2-4353-9e92-c40d33bcd969',mode:'official_resource_page_fallback',accept:'text/html,application/json;q=0.9'}
];
const UPSTREAM_TIMEOUT_MS=12000;
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET']);
 await L.authorized(req,res,['admin','volunteer']);
 const startedAt=Date.now();let selected=null,vehicles=null,upstreamStatus=null;
 for(const source of OFFICIAL_SOURCES){
  const attemptStarted=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),UPSTREAM_TIMEOUT_MS);let stage='connect',status=null,contentType='';
  try{
   const upstream=await fetch(source.url,{method:'GET',redirect:'error',cache:'no-store',headers:{Accept:source.accept},signal:controller.signal});
   stage='status';status=upstream.status;upstreamStatus=upstream.status;if(!upstream.ok)throw Object.assign(new Error('upstream status'),{status:upstream.status});
   stage='body';contentType=String(upstream.headers.get('content-type')||'').toLowerCase();const raw=await upstream.text();
   if(raw.length>5_000_000)throw Object.assign(new Error('upstream body too large'),{status:502});
   stage='parse';let payload;
   if(contentType.includes('json')){try{payload=JSON.parse(raw)}catch{throw Object.assign(new Error('invalid upstream json'),{status:502})}}
   else if(source.mode==='official_resource_page_fallback'&&contentType.includes('html'))payload=extractOfficialResourcePayload(raw);
   else throw Object.assign(new Error('unexpected upstream content type'),{status:502});
   stage='normalize';vehicles=normalizePayload(payload);selected=source;
   console.info('GPS upstream source completed',{source_mode:source.mode,elapsed_ms:Date.now()-attemptStarted,upstream_status:upstream.status,normalized_count:vehicles.length});
   break;
  }catch(error){
   const cause=error?.cause||{};
   console.warn('GPS upstream source failed',{source_mode:source.mode,error_stage:stage,elapsed_ms:Date.now()-attemptStarted,upstream_status:status,content_type:contentType.slice(0,80),error_name:String(error?.name||'Error').slice(0,80),cause_code:String(cause?.code||'').slice(0,80),cause_name:String(cause?.name||'').slice(0,80),cause_syscall:String(cause?.syscall||'').slice(0,80),timed_out:error?.name==='AbortError'});
  }finally{clearTimeout(timer)}
 }
 if(!selected||!vehicles)L.problem(503,'官方 GPS 服務目前無法連線');
 const fetchedAt=new Date().toISOString(),latestReportedAt=vehicles.reduce((latest,item)=>item.reported_at>latest?item.reported_at:latest,'')||null;
 console.info('GPS upstream fetch completed',{source_mode:selected.mode,elapsed_ms:Date.now()-startedAt,upstream_status:upstreamStatus,normalized_count:vehicles.length});
 L.json(res,200,{source:'臺南市政府資料開放平台',source_url:selected.url,source_mode:selected.mode,scope:'臺南市永康區（行政區代碼 67000310 約略區界）',live:true,fetched_at:fetchedAt,latest_reported_at:latestReportedAt,count:vehicles.length,vehicles});
});
