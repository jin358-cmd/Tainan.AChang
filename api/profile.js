'use strict';
const L=require('../lib/server');
const fields='id,source_member_id,display_name,phone_e164,address,resident_area,updated_at';
const view=m=>({id:m.id,name:m.display_name,phone:m.phone_e164,address:m.address||'',residentArea:m.resident_area||'',updatedAt:m.updated_at});
module.exports=L.run(async(req,res)=>{
 L.method(req,['GET','PATCH']);const p=await L.authorized(req,res,['volunteer']);
 if(!p.member_id)L.problem(403,'此帳號沒有對應的志工資料');
 const current=await L.rest(`members?id=eq.${L.uuid(p.member_id)}&select=${fields}&limit=1`,p.token),member=L.need(current,'個人資料讀取失敗')?.[0];
 if(!member||L.internalMember(member))L.problem(403,'此帳號不是可編輯的志工身分');
 if(req.method==='GET')return L.json(res,200,{profile:view(member),canEdit:!!p.can_edit_profile});
 if(!p.can_edit_profile)L.problem(403,'此帳號僅供檢視，尚未取得個人資料編輯授權');
 const b=L.body(req),payload={p_display_name:L.checkText(b.name,'姓名',80),p_address:L.checkText(b.address||'','地址',300,true),p_resident_area:L.checkText(b.residentArea||'','原居住里',40,true)};
 const updated=await L.rest('rpc/update_own_profile',p.token,{method:'POST',body:payload});
 return L.json(res,200,{profile:view(L.need(updated,'個人資料更新失敗')?.[0])});
});
