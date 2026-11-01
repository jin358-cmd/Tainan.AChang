'use strict';
const cache=new Map();let last=0;let queue=Promise.resolve();
module.exports=async(req,res)=>{
res.setHeader('Content-Type','application/json; charset=utf-8');
if(req.method!=='GET'){res.statusCode=405;return res.end('{}');}
const address=String(req.query.address||'').trim();
if(!address||address.length>100||!/[路街巷]/.test(address)||!/[0-9０-９]+(?:之[0-9]+)?號/.test(address)){res.statusCode=422;return res.end(JSON.stringify({error:'Address requires a street and house number'}));}
if(cache.has(address))return res.end(JSON.stringify(cache.get(address)));
const job=queue.then(async()=>{await new Promise(r=>setTimeout(r,Math.max(0,1100-(Date.now()-last))));last=Date.now();const query=address.includes('永康區')?address:'臺南市永康區'+address;const url='https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=tw&addressdetails=1&limit=3&q='+encodeURIComponent(query);const response=await fetch(url,{headers:{'User-Agent':'AChangVolunteerMap/1.0 (public stop address lookup)'},signal:AbortSignal.timeout(7000)});if(!response.ok)throw Error('Geocoder HTTP '+response.status);const rows=await response.json();const number=address.match(/([0-9０-９]+(?:之[0-9]+)?)號/)[1];const row=rows.find(r=>r.address?.house_number===number&&Number(r.lon)>120.20&&Number(r.lon)<120.30&&Number(r.lat)>22.96&&Number(r.lat)<23.07);return row?{coordinates:[Number(row.lon),Number(row.lat)],source:'OpenStreetMap Nominatim address match'}:{coordinates:null,error:'Exact house number not found'};});
queue=job.catch(()=>{});
try{const result=await job;if(cache.size>500)cache.clear();cache.set(address,result);res.end(JSON.stringify(result));}catch(error){res.statusCode=502;res.end(JSON.stringify({error:error.message}));}
};