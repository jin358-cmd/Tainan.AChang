'use strict';
const L=require('../lib/server');
const snapshot=require('../data-gps-snapshot-20261028.json');
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET']);
 await L.authorized(req,res,['admin','volunteer']);
 const vehicles=snapshot.vehicles.filter(v=>Number.isFinite(v.x)&&Number.isFinite(v.y)&&Math.abs(v.x)<=180&&Math.abs(v.y)<=90).map(v=>({id:String(v.linid),plate:String(v.car),reported_at:String(v.time),location:String(v.location),longitude:v.x,latitude:v.y}));
 L.json(res,200,{source:'owner_snapshot',live:false,captured_at:snapshot.captured_at,count:vehicles.length,vehicles});
});
