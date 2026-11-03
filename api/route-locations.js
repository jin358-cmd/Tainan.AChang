'use strict';
const L=require('../lib/server');
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET']);
 const rows=L.need(await L.rest('achang_day_route_catalogs?catalog_id=eq.map_location_overrides&select=payload&limit=1'),'站點座標讀取失敗');
 const payload=rows?.[0]?.payload;
 if(payload?.version!==1||!Array.isArray(payload.stops))L.problem(503,'站點座標資料不完整');
 return L.json(res,200,payload);
});
