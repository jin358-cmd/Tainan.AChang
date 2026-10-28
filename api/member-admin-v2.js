'use strict';
const L=require('../lib/server');

module.exports=L.run(async(req,res)=>{
 L.method(req,['GET','POST','PATCH']);
 const actor=await L.authorized(req,res,['admin']);
 const body=req.method==='GET'?{action:'list'}:L.body(req);
 const allowed=req.method==='POST'?['create']:req.method==='PATCH'?['approve','suspend','reactivate']:['list'];
 if(!allowed.includes(String(body.action||'')))L.problem(400,'不支援的會員操作');
 const result=await L.request('/functions/v1/achang-member-admin-v2',{method:'POST',token:actor.token,body});
 if(!result.ok){
  const status=[400,401,403,404,409,429,503].includes(result.status)?result.status:502;
  L.problem(status,String(result.data?.error||'會員管理服務暫時無法使用'),result.data?.code);
 }
 L.json(res,result.status===201?201:200,result.data);
});
