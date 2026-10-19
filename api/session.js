'use strict';
const L=require('../lib/server');
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET','POST','DELETE']);
 if(req.method==='DELETE'){L.clearCookies(res);return L.json(res,200,{ok:true})}
 if(req.method==='GET'){const p=await L.session(req,res);return L.json(res,200,{role:p.role,memberId:p.member_id,accountId:p.id,canEditProfile:p.role==='volunteer'&&!!p.can_edit_profile,offlineAuthorizedUntil:p.device?.offline_authorized_until||null})}
 const b=L.body(req),identity=L.checkText(String(b.login||b.phone||''),'登入帳號',254),password=L.checkText(b.password,'密碼',250);
 const credentials=identity.includes('@')
  ? (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity) ? {email:identity.toLowerCase(),password} : L.problem(400,'電子郵件格式不正確'))
  : {phone:L.phone(identity),password};
 const r=await L.request('/auth/v1/token?grant_type=password',{method:'POST',body:credentials});
 if(!r.ok||!r.data?.access_token)L.problem(401,'帳號或密碼錯誤');
 const p=await L.accountFromToken(r.data.access_token);const device=await L.deviceCheck(req,p,p.token,true);L.setSession(res,r.data);
 L.json(res,200,{role:p.role,memberId:p.member_id,accountId:p.id,canEditProfile:p.role==='volunteer'&&!!p.can_edit_profile,offlineAuthorizedUntil:device?.offline_authorized_until||null});
});
