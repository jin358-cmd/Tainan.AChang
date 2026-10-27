'use strict';
const L=require('../lib/server');
module.exports=L.run(async(req,res)=>{
 L.method(req,['POST']);
 const b=L.body(req),access=String(b.access_token||''),refresh=String(b.refresh_token||'');
 if(access.length<30||access.length>5000||refresh.length<8||refresh.length>3000)L.problem(400,'OAuth 憑證格式錯誤');
 const auth=await L.request('/auth/v1/user',{token:access});
 if(!auth.ok||!auth.data?.id)L.problem(401,'OAuth 身分驗證失敗');
 if(!(auth.data.app_metadata?.providers||[]).includes('google'))L.problem(403,'請使用 Google 登入');
 const p=await L.accountFromToken(access);
 const needsDeviceApproval=!(p.role==='admin'&&p.device_approval_required===false);
 await L.deviceCheck(req,p,p.token,needsDeviceApproval);
 L.setSession(res,{access_token:access,refresh_token:refresh,expires_in:3500});
 L.json(res,200,{role:p.role,memberId:p.member_id,accountId:p.id});
});
