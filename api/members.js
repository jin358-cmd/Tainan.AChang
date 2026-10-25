'use strict';const crypto=require('node:crypto'),L=require('../lib/server');
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET','POST','PATCH','DELETE']);const p=await L.authorized(req,res,['admin']);
 if(req.method==='GET'){const [r,m,dev]=await Promise.all([L.rest('member_accounts?select=id,member_id,auth_user_id,login_id,role,status,requested_at,approved_at,rejected_at,rejection_reason,suspended_at,suspended_by,reactivated_at,reactivated_by,created_at&order=created_at.asc',p.token),L.rest('members?select=id,phone_e164,display_name,deleted_at',p.token),L.rest('member_devices?select=id,account_id,status,requested_at,created_at,device_type,operating_system,browser_name,approved_at,revoked_at,rejection_reason,last_seen_at&order=created_at.asc',p.token)]);const by=new Map(L.need(m,'會員資料讀取失敗').map(x=>[x.id,x]));return L.json(res,200,{members:L.need(r,'會員名單讀取失敗').filter(x=>x.role==='volunteer').map(x=>({...x,name:by.get(x.member_id)?.display_name||'',phone:by.get(x.member_id)?.phone_e164||'',deleted_at:by.get(x.member_id)?.deleted_at||null,enabled:x.status==='active'})),devices:L.need(dev,'裝置名單讀取失敗')})}
 const b=L.body(req);
 if(req.method==='PATCH'&&b.deviceId){
  const id=L.uuid(b.deviceId),found=L.need(await L.rest('member_devices?id=eq.'+id+'&select=id,status&limit=1',p.token),'裝置授權查詢失敗')?.[0];if(!found)L.problem(404,'找不到裝置申請');
  if(b.approved&&found.status!=='pending')L.problem(409,'只能核准待審核裝置，不得直接恢復已撤銷裝置');
  const reason=b.approved?null:L.checkText(b.reason||'管理員撤銷裝置','撤銷原因',500);
  const status=b.approved?'approved':'revoked',now=new Date().toISOString();const r=await L.rest('member_devices?id=eq.'+id+'&select=id,status',p.token,{method:'PATCH',headers:{Prefer:'return=representation'},body:{status,approved_at:b.approved?now:null,approved_by:b.approved?p.auth_user_id:null,revoked_at:b.approved?null:now,rejection_reason:reason}});return L.json(res,200,{device:L.need(r,'裝置授權修改失敗')[0]})
 }
 if(req.method==='POST'&&b.action==='issue-invite'){
  const memberId=L.uuid(b.volunteerId),contact=L.phone(b.phone),mem=await L.getOne('members',memberId,p.token);
  if(!mem||mem.deleted_at||mem.phone_e164!==contact)L.problem(400,'會員與聯絡電話不符');
  const existing=L.need(await L.rest('member_accounts?member_id=eq.'+memberId+'&select=id&limit=1',p.token),'會員帳號查詢失敗');if(existing.length)L.problem(409,'這位會員已有帳號或待核准申請');
  let invitationCode='',expires='',saved=false;
  // The four-digit namespace is intentionally small. Retry a bounded number of
  // cryptographically-random candidates when another active/expired row still
  // occupies the same unique hash; never weaken the database uniqueness guard.
  for(let attempt=0;attempt<8;attempt++){
   invitationCode=String(crypto.randomInt(0,10000)).padStart(4,'0');
   const application_code_hash=crypto.createHash('sha256').update(invitationCode).digest('hex');
   expires=new Date(Date.now()+24*60*60*1000).toISOString();
   const result=await L.rest('members?id=eq.'+memberId+'&deleted_at=is.null&select=id',p.token,{method:'PATCH',headers:{Prefer:'return=representation'},body:{application_code_hash,application_code_expires_at:expires}});
   if(result.ok&&result.data?.length){saved=true;break}
   if(result.status!==409)L.need(result,'申請邀請碼建立失敗');
  }
  if(!saved)L.problem(503,'邀請碼暫時無法建立，請稍後再試');
  return L.json(res,201,{invitationCode,expiresAt:expires});
 }
 if(req.method==='POST'&&b.action==='direct-provision'){
  // Only an authenticated administrator can provision a named member, in person.
  // The volunteer chooses their own 6-digit PIN without any invitation code.
  const memberId=L.uuid(b.volunteerId),phone=L.phone(b.phone),pin=String(b.pin||'');
  if(!/^[0-9]{6}$/.test(pin))L.problem(400,'請由志工本人設定六碼 PIN');
  const mem=await L.getOne('members',memberId,p.token);
  if(!mem||mem.deleted_at||mem.phone_e164!==phone)L.problem(400,'志工身分或聯絡電話不符');
  const existing=L.need(await L.rest('member_accounts?member_id=eq.'+memberId+'&select=id&limit=1',p.token),'會員帳號查詢失敗');
  if(existing.length)L.problem(409,'會員已有帳號，請改由待核准清單處理');
  const provision=await L.request('/functions/v1/achang-admin-provision',{method:'POST',token:p.token,body:{memberId,phone,password:pin,directApproval:true}});
  if(!provision.ok)L.problem(provision.status===409?409:502,provision.data?.error||'管理員開通失敗');
  return L.json(res,201,{member:provision.data?.member,action:'direct-provision'});
 }
 if(req.method==='DELETE'){
  const id=L.uuid(b.authUserId);
  const found=await L.rest('member_accounts?auth_user_id=eq.'+id+'&role=eq.volunteer&select=id,member_id&limit=1',p.token);
  const account=L.need(found,'會員查詢失敗')?.[0];if(!account)L.problem(404,'志工會員不存在');
  const reason=L.checkText(b.reason||'管理員封存會員帳號','封存原因',500),now=new Date().toISOString();
  const mark=await L.rest('members?id=eq.'+account.member_id+'&deleted_at=is.null&select=id,deleted_at',p.token,{method:'PATCH',headers:{Prefer:'return=representation'},body:{deleted_at:now,deleted_by:p.auth_user_id,deletion_reason:reason}});
  if(!L.need(mark,'會員封存失敗')?.length)L.problem(409,'會員已封存或不存在');
  return L.json(res,200,{deleted:true,archived:true,retainedHistory:true});
 }
 if(req.method==='PATCH'){
  const id=L.uuid(b.authUserId),now=new Date().toISOString();let status,patch;
  const found=L.need(await L.rest('member_accounts?auth_user_id=eq.'+id+'&role=eq.volunteer&select=id,member_id,status,approved_at&limit=1',p.token),'會員狀態查詢失敗')?.[0];
  if(!found)L.problem(404,'志工會員不存在');const member=await L.getOne('members',found.member_id,p.token);
  if(!member||member.deleted_at)L.problem(409,'會員名冊已封存，須先完成封存原因與恢復資格審核');
  if(b.action==='approve'){if(found.status!=='pending')L.problem(409,'只有待核准會員可以執行首次核准');status='active';patch={status,approved_at:now,approved_by:p.auth_user_id,rejected_at:null,rejection_reason:null}}
  else if(b.action==='reject'){if(found.status!=='pending')L.problem(409,'只有待核准會員可以拒絕申請');status='suspended';patch={status,rejected_at:now,rejection_reason:L.checkText(b.reason,'拒絕原因',500)}}
  else if(b.action==='reactivate'){
   if(found.status!=='suspended'||!found.approved_at)L.problem(409,'只有曾核准後停用的會員可以恢復啟用');
   status='active';patch={status,reactivated_at:now,reactivated_by:p.auth_user_id,rejection_reason:null,rejected_at:null};
  }
  else{if(b.enabled!==false)L.problem(400,'恢復帳號必須使用受控的重新啟用流程');if(found.status!=='active')L.problem(409,'只有已啟用會員可以停用');status='suspended';patch={status,suspended_at:now,suspended_by:p.auth_user_id,rejection_reason:L.checkText(b.reason||'管理員停用帳號','停用原因',500)}}
  const r=await L.rest('member_accounts?auth_user_id=eq.'+id+'&role=eq.volunteer&select=id,status,login_id,suspended_at,reactivated_at',p.token,{method:'PATCH',headers:{Prefer:'return=representation'},body:patch});const updated=L.need(r,'會員權限更新失敗')?.[0];if(!updated)L.problem(404,'志工會員不存在');return L.json(res,200,{member:updated})
 }
 if(b.role!=='volunteer')L.problem(400,'此版本由管理員管理志工會員');const memberId=L.uuid(b.volunteerId),phone=L.phone(b.phone),password=L.checkText(b.password,'初始密碼',180);if(!(/^[0-9]{6}$/.test(password)||(password.length>=12&&password.length<=180)))L.problem(400,'志工登入 PIN 須為 6 位數字');
 const mem=await L.getOne('members',memberId,p.token);if(!mem||mem.phone_e164!==phone)L.problem(400,'手機號碼與已核對名冊不符');
 const token=p.token,r=await L.request('/functions/v1/achang-admin-provision',{method:'POST',token,body:{memberId,phone,password}});if(!r.ok)L.problem(r.status===409?409:502,r.data?.error||'會員申請建立失敗');return L.json(res,201,{member:r.data?.member||{member_id:memberId,role:'volunteer',status:'pending',enabled:false}})
});
