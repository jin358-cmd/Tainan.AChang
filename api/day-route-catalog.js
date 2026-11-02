'use strict';
const L=require('../lib/server');
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET']);
 const result=await L.rest('achang_day_route_catalogs?catalog_id=eq.wed_fri&select=payload&limit=1');
 if(!result.ok)return L.json(res,502,{error:'跟巡路線資料讀取失敗',upstreamStatus:result.status,upstreamCode:String(result.data?.code||'unknown')});
 const rows=result.data;
 if(!Array.isArray(rows)||rows.length!==1||!Array.isArray(rows[0]?.payload?.routes))L.problem(503,'跟巡路線資料不完整');
 return L.json(res,200,rows[0].payload);
});
