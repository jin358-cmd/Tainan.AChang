'use strict';
const L=require('../lib/server');
module.exports=L.run(async(req,res)=>{
 L.method(req,['POST']);
 if(req.headers['content-length']&&Number(req.headers['content-length'])>9000)L.problem(413,'登入資料過大');
 const body=L.body(req);
 const access=String(body.access_token||''),refresh=String(body.refresh_token||'');
 if(access.length<30||access.length>5000||refresh.length<20||refresh.length>3000)L.problem(400,'OAuth 憑證格式錯誤');
 // Supabase validates JWT and member role; do not auto-provision or link by email.
 const auth=await L.request('/auth/v1/user',{token:access});
 if(!auth.ok||!auth.data?.id)L.problem(401,'Google 登入驗證失敗');
 if(!auth.data.app_metadata?.providers?.includes('google'))L.problem(403,'請使用 Google 登入');
 const p=await L.accountFromToken(access);
 L.setSession(res,{access_token:access,refresh_token:refresh,expires_in:3600});
 await L.deviceCheck(req,p,p.token,true);
 L.json(res,200,{role:p.role,memberId:p.member_id,accountId:p.id});
});