'use strict';const crypto=require('node:crypto'),L=require('../lib/server');
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET','POST','PATCH','DELETE']);const p=await L.authorized(req,res,['admin']);
 if(req.method==='GET'){const [r,m,dev]=await Promise.all([L.rest('member_accounts?select=id,member_id,auth_user_id,login_id,role,status,requested_at,approved_at,rejected_at,rejection_reason,created_at&order=created_at.asc',p.token),L.rest('members?select=id,phone_e164,display_name,deleted_at',p.token),L.rest('member_devices?select=id,account_id,status,requested_at,created_at,device_type,operating_system,browser_name,approved_at,revoked_at,rejection_reason,last_seen_at&order=created_at.asc',p.token)]);const by=new Map(L.need(m,'會員資料讀取失敗').map(x=>[x.id,x]));return L.json(res,200,{members:L.need(r,'會員名單讀取失敗').filter(x=>x.role==='volunteer').map(x=>({...x,name:by.get(x.member_id)?.display_name||'',phone:by.get(x.member_id)?.phone_e164||'',deleted_at:by.get(x.member_id)?.deleted_at||null,enabled:x.status==='active'})),devices:L.need(dev,'裝置名單讀取失敗')})}
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
  const invitationCode=crypto.randomBytes(8).toString('hex').toUpperCase(),application_code_hash=crypto.createHash('sha256').update(invitationCode).digest('hex'),expires=new Date(Date.now()+24*60*60*1000).toISOString();
  const saved=await L.rest('members?id=eq.'+memberId+'&deleted_at=is.null&select=id',p.token,{method:'PATCH',headers:{Prefer:'return=representation'},body:{application_code_hash,application_code_expires_at:expires}});
  if(!L.need(saved,'申請邀請碼建立失敗')?.length)L.problem(409,'會員已封存或不存在');
  return L.json(res,201,{invitationCode,expiresAt:expires});
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
  if(b.action==='approve'){status='active';patch={status,approved_at:now,approved_by:p.auth_user_id,rejected_at:null,rejection_reason:null}}
  else if(b.action==='reject'){status='suspended';patch={status,rejected_at:now,rejection_reason:L.checkText(b.reason,'拒絕原因',500)}}
  else{if(typeof b.enabled!=='boolean')L.problem(400,'啟用狀態錯誤');status=b.enabled?'active':'suspended';patch={status,...(!b.enabled?{rejection_reason:L.checkText(b.reason||'管理員停用帳號','停用原因',500)}:{})}}
  const r=await L.rest('member_accounts?auth_user_id=eq.'+id+'&role=eq.volunteer&select=id,status,login_id',p.token,{method:'PATCH',headers:{Prefer:'return=representation'},body:patch});const updated=L.need(r,'會員權限更新失敗')?.[0];if(!updated)L.problem(404,'志工會員不存在');if(status==='suspended')await L.rest('member_devices?account_id=eq.'+updated.id+'&status=neq.revoked',p.token,{method:'PATCH',body:{status:'revoked',revoked_at:now,rejection_reason:patch.rejection_reason}});return L.json(res,200,{member:updated})
 }
 if(b.role!=='volunteer')L.problem(400,'此版本由管理員管理志工會員');const memberId=L.uuid(b.volunteerId),phone=L.phone(b.phone),password=L.checkText(b.password,'初始密碼',180);if(!(/^[0-9]{6}$/.test(password)||(password.length>=12&&password.length<=180)))L.problem(400,'志工登入 PIN 須為 6 位數字');
 const mem=await L.getOne('members',memberId,p.token);if(!mem||mem.phone_e164!==phone)L.problem(400,'手機號碼與已核對名冊不符');
 const token=p.token,r=await L.request('/functions/v1/achang-admin-provision',{method:'POST',token,body:{memberId,phone,password}});if(!r.ok)L.problem(r.status===409?409:502,r.data?.error||'會員申請建立失敗');return L.json(res,201,{member:r.data?.member||{member_id:memberId,role:'volunteer',status:'pending',enabled:false}})
});
