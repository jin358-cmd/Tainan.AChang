'use strict';
const L=require('../lib/server');

function createPhone(value){
 const input=String(value||'').trim();
 if(/^09\d{8}$/.test(input))return '+886'+input.slice(1);
 if(/^09\d{2}-\d{3}-\d{3}$/.test(input))return '+886'+input.replaceAll('-','').slice(1);
 if(/^\+8869\d{8}$/.test(input))return input;
 L.problem(400,'請輸入有效台灣手機號碼（09xx-xxx-xxx）');
}

module.exports=L.run(async(req,res)=>{
 L.method(req,['GET','POST','PATCH']);
 const actor=await L.authorized(req,res,['admin']);
 const input=req.method==='GET'?{action:'list'}:L.body(req);
 const body=req.method==='POST'&&input.action==='create'?{...input,phone:createPhone(input.phone)}:input;
 const allowed=req.method==='POST'?['create']:req.method==='PATCH'?['approve','suspend','reactivate','archive','promote_admin']:['list'];
 if(!allowed.includes(String(body.action||'')))L.problem(400,'不支援的會員操作');
 const result=await L.request('/functions/v1/achang-member-admin-v2',{method:'POST',token:actor.token,body});
 if(!result.ok){
  const status=[400,401,403,404,409,429,503].includes(result.status)?result.status:502;
  L.problem(status,String(result.data?.error||'會員管理服務暫時無法使用'),result.data?.code);
 }
 L.json(res,result.status===201?201:200,result.data);
});

