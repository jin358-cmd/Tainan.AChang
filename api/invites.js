'use strict';
const L=require('../lib/server');
const {hashToken}=require('../lib/invite-state');

module.exports=L.run(async(req,res)=>{
 L.method(req,['GET','POST','PATCH']);
 if(process.env.INVITES_ENABLED!=='true')L.problem(503,'邀請申請後端尚未經 Owner 核准啟用');
 const body=req.method==='GET'?{}:L.body(req),action=req.method==='GET'?'list':String(body.action||'');
 let principal=null;
 if(['list','create','revoke','review'].includes(action))principal=await L.authorized(req,res,['admin']);
 if(!['list','create','revoke','review','validate','submit'].includes(action))L.problem(400,'不支援的邀請操作');
 const payload={...body,action};
 if(typeof payload.token==='string')payload.tokenHash=hashToken(payload.token);
 delete payload.token;
 const result=await L.request('/functions/v1/achang-invites',{method:'POST',token:principal?.token,body:payload});
 if(!result.ok)L.problem(result.status===409?409:result.status===429?429:502,result.data?.error||'邀請服務目前無法完成操作');
 return L.json(res,action==='create'||action==='submit'?201:200,result.data||{});
});
