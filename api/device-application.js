'use strict';
const L=require('../lib/server');
module.exports=L.run(async(req,res)=>{
 L.method(req,['POST']);
 const p=await L.identitySession(req,res);
 try{
  await L.deviceCheck(req,p,p.token,true);
  return L.json(res,200,{authorization:'approved',message:'此裝置已完成授權'});
 }catch(e){
  if(e.appCode==='DEVICE_PENDING')return L.json(res,202,{authorization:'device_pending',message:e.message});
  throw e;
 }
});
