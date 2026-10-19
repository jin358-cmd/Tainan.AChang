'use strict';
const L=require('../lib/server');
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET','PATCH']);const p=await L.authorized(req,res,['admin']);
 if(req.method==='GET'){
  const [accounts,members]=await Promise.all([
   L.rest('member_accounts?role=eq.volunteer&select=id,member_id,status,can_edit_profile,profile_edit_granted_at&order=created_at.asc',p.token),
   L.rest('members?select=id,display_name,phone_e164,source_member_id&limit=2000',p.token)
  ]);
  const byMember=new Map(L.need(accounts,'人員授權讀取失敗').map(x=>[x.member_id,x]));
  return L.json(res,200,{people:L.need(members,'志工資料讀取失敗').filter(x=>!L.internalMember(x)).map(x=>{const account=byMember.get(x.id);return {accountId:account?.id||null,memberId:x.id,name:x.display_name,phone:x.phone_e164||'',status:account?.status||'no_account',canEdit:!!account?.can_edit_profile,grantedAt:account?.profile_edit_granted_at||null}})});
 }
 const b=L.body(req),accountId=L.uuid(b.accountId);if(typeof b.canEdit!=='boolean')L.problem(400,'編輯授權格式錯誤');
 const found=await L.rest(`member_accounts?id=eq.${accountId}&role=eq.volunteer&select=id,member_id,role,status&limit=1`,p.token),account=L.need(found,'帳號查核失敗')?.[0];
 if(!account)L.problem(404,'找不到可授權的志工帳號');
 const member=await L.getOne('members',account.member_id,p.token);if(!member||L.internalMember(member))L.problem(403,'管理員內部身分不得取得志工編輯授權');
 if(b.canEdit&&(account.status!=='active'||!member.phone_e164))L.problem(400,'只有具已核對電話的 active 志工帳號可以取得編輯授權');
 const patch={can_edit_profile:b.canEdit,profile_edit_granted_at:b.canEdit?new Date().toISOString():null,profile_edit_granted_by:b.canEdit?p.auth_user_id:null};
 const updated=await L.rest(`member_accounts?id=eq.${accountId}&role=eq.volunteer&select=id,can_edit_profile,profile_edit_granted_at`,p.token,{method:'PATCH',headers:{Prefer:'return=representation'},body:patch});
 const row=L.need(updated,'人員授權更新失敗')?.[0];if(!row)L.problem(409,'人員授權未更新');
 return L.json(res,200,{accountId:row.id,canEdit:!!row.can_edit_profile,grantedAt:row.profile_edit_granted_at||null});
});
