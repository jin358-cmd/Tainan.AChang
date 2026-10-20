'use strict';
const L=require('../lib/server');
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET','POST','DELETE']);
 if(req.method==='DELETE'){L.clearCookies(res);return L.json(res,200,{ok:true})}
 if(req.method==='GET'){const p=await L.session(req,res);return L.json(res,200,{role:p.role,memberId:p.member_id,accountId:p.id})}
 const b=L.body(req),identity=L.checkText(String(b.login||b.phone||''),'登入帳號',254),password=L.checkText(b.password,'密碼',250);
 let r;
 if(identity.includes('@')){
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity))L.problem(400,'電子郵件格式不正確');
  r=await L.request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:identity.toLowerCase(),password}});
 }else{
  // This server calls an isolated Supabase function that rate-limits a 6-digit PIN.
  // Supabase Auth uses an internal verified email alias: no Phone Provider or SMS.
  if(!/^[0-9]{6}$/.test(password))L.problem(400,'志工請輸入 6 碼數字 PIN');
  r=await L.request('/functions/v1/achang-pin-login',{method:'POST',body:{phone:L.phone(identity),pin:password}});
 }
 if(!r.ok||!r.data?.access_token)L.problem(r.status===429?429:r.status===503?503:401,r.status===429?'PIN 嘗試次數過多，請稍後再試':r.status===503?'安全驗證服務暫時無法使用':'帳號或 PIN 不正確，或尚未完成會員核准');
 const p=await L.accountFromToken(r.data.access_token);L.setSession(res,r.data);await L.deviceCheck(req,p,p.token,true);
 L.json(res,200,{role:p.role,memberId:p.member_id,accountId:p.id});
});