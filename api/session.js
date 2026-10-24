'use strict';
const L=require('../lib/server');
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET','POST','DELETE']);
 if(req.method==='DELETE'){L.clearCookies(res);return L.json(res,200,{ok:true})}
 if(req.method==='GET'){const p=await L.session(req,res);let displayName='';if(p.member_id){try{const q=await L.rest('members?id=eq.'+encodeURIComponent(p.member_id)+'&select=display_name&limit=1',p.token);if(q.ok)displayName=String(q.data?.[0]?.display_name||'')}catch{}}return L.json(res,200,{role:p.role,memberId:p.member_id,accountId:p.id,displayName})}
 const b=L.body(req),identity=L.checkText(String(b.login||''),'登入帳號',254),password=L.checkText(b.password,'密碼',250);
 let response;
 if(identity.includes('@')){
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity))L.problem(400,'Email 格式不正確');
  response=await L.request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:identity.toLowerCase(),password}});
 }else{
  if(!/^[0-9]{6}$/.test(password))L.problem(400,'志工請輸入六位數字 PIN');
  response=await L.request('/functions/v1/achang-pin-login',{method:'POST',body:{loginId:L.loginId(identity),pin:password}});
 }
 if(!response.ok||!response.data?.access_token)L.problem(response.status===429?429:response.status===503?503:response.status===403?403:401,response.status===429?'PIN 嘗試次數過多，請 15 分鐘後再試':response.status===503?'登入安全服務暫時無法使用':response.status===403&&response.data?.code==='ACCOUNT_PENDING'?'會員申請已送出，請等待管理員核准':'登入代碼或 PIN 不正確');
 const r=response;
 const p=await L.accountFromToken(r.data.access_token);L.setSession(res,r.data);
 try{await L.deviceCheck(req,p,p.token,true)}catch(e){if(e.appCode==='DEVICE_PENDING')return L.json(res,202,{authorization:'device_pending',message:e.message,role:p.role,memberId:p.member_id,accountId:p.id});throw e}
 L.json(res,200,{authorization:'approved',role:p.role,memberId:p.member_id,accountId:p.id});
});
