'use strict';
const L=require('../lib/server');
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET','POST','DELETE']);
 if(req.method==='DELETE'){L.clearCookies(res);return L.json(res,200,{ok:true})}
 if(req.method==='GET'){const p=await L.session(req,res);return L.json(res,200,{role:p.role,memberId:p.member_id,accountId:p.id})}
 const b=L.body(req),number=L.phone(b.phone),password=L.checkText(b.password,'密碼',250);
 const r=await L.request('/auth/v1/token?grant_type=password',{method:'POST',body:{phone:number,password}});
 if(!r.ok||!r.data?.access_token)L.problem(401,'手機號碼或密碼錯誤');
 const p=await L.accountFromToken(r.data.access_token);L.setSession(res,r.data);await L.deviceCheck(req,p,p.token,true);
 L.json(res,200,{role:p.role,memberId:p.member_id,accountId:p.id});
});